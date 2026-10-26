import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { aiNumberText, useAiFields } from '../../ai/useAiFields';
import { decideWorkoutAutoLog } from '../../ai/workoutAutoLog';
import { useAiErrorText, useConfidenceText, usePhotoAnalysis } from '../../ai/usePhotoAnalysis';
import { useGameText } from '../../game/strings';
import { useTranslation } from '../../i18n/useTranslation';
import type { PhotoAnalysisResult } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { DateOffsetPicker } from '../DateOffsetPicker';
import { FoodPhotoPicker } from './FoodPhoto';
import { HudText } from './HudText';
import { LoggedFromPhotoCard } from './LoggedFromPhotoCard';
import { QuestButton } from './QuestButton';
import { QuestField } from './QuestField';

export interface WorkoutFormValues {
  label: string;
  durationMin: number;
  caloriesBurned: number;
}

/** What the user did to the photo in this form. */
export type PhotoChange = { kind: 'none' } | { kind: 'replace'; uri: string } | { kind: 'remove' };

interface WorkoutEntryFormProps {
  /** Prefilled values (editing an entry); omitted for a new one. */
  initial?: { label: string; durationMin: number; caloriesBurned: number };
  /** The photo already attached to the entry being edited (a persisted file), if any. */
  existingPhotoUri?: string | null;
  /** Editing only: the date of the entry and how it is changed. */
  date?: Date;
  onDateChange?: (date: Date) => void;
  submitLabel: string;
  /** Saves. Throw to say it failed: the form keeps everything as typed and shows the photo error. */
  onSubmit: (values: WorkoutFormValues, photo: PhotoChange) => Promise<void> | void;
  onCancel?: () => void;
  /** Empty the form after a successful save (logging a new workout). */
  clearOnSuccess?: boolean;
  /** Prefix for the inputs' testIDs, so two forms on one screen can be told apart. */
  testIdPrefix: string;
  /** Put the photo section above the inputs (the logging form: the photo is the main way in). */
  photoFirst?: boolean;
  /** Photo-first flow for logging: the analysis starts by itself as soon as a photo is chosen, and when the AI is sure
   *  enough the workout is logged with that photo right away (see `decideWorkoutAutoLog`); otherwise the form is just
   *  filled for the user to check. `onLog` saves and returns the new entry's id; it may throw (the photo stays). */
  autoLog?: {
    onLog: (values: WorkoutFormValues, photoUri: string) => Promise<{ id: string }>;
    onEdit: (entryId: string) => void;
    onUndo: (entryId: string) => void;
  };
}

type Field = 'label' | 'duration' | 'calories';

const toText = (n: number | undefined) => (n === undefined ? '' : String(n));

/** The workout form used both for logging a new workout and for editing a logged one: name, minutes, calories burned,
 *  and a photo of the result. With a photo attached, "Analyze with AI" sends it to the vision API (together with the
 *  user's body data) and fills the inputs as suggestions: anything the user has typed in this form is kept, nothing is
 *  saved until the user taps the save button. */
export function WorkoutEntryForm({
  initial,
  existingPhotoUri = null,
  date,
  onDateChange,
  submitLabel,
  onSubmit,
  onCancel,
  clearOnSuccess,
  testIdPrefix,
  photoFirst,
  autoLog,
}: WorkoutEntryFormProps) {
  const { t } = useTranslation();
  const g = useGameText();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [duration, setDuration] = useState(toText(initial?.durationMin));
  const [calories, setCalories] = useState(toText(initial?.caloriesBurned));
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [aiNote, setAiNote] = useState<{ confidence: string | null; reasoning: string; summary: string | null; kept: boolean } | null>(null);
  // Photo-first flow state: working (analysing / auto-logging), "AI wasn't sure, please check", and the confirmation card.
  const [working, setWorking] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);
  const [logged, setLogged] = useState<{ id: string; confidence: string | null; reasoning: string } | null>(null);
  const busy = useRef(false);

  const shownPhoto = newPhoto ?? (photoRemoved ? null : existingPhotoUri);

  const ai = usePhotoAnalysis('workout', { label: label.trim() || undefined });
  const aiErrorText = useAiErrorText();
  const confidenceText = useConfidenceText();
  const aiFields = useAiFields<Field>();
  // A field counts as the user's own only once they typed in it during THIS form: values loaded from the entry being
  // edited are fair game for a new analysis (that is what "refill from the new photo" means).
  const touched = useRef<Partial<Record<Field, boolean>>>({});
  const latest = useRef({ label, duration, calories });
  latest.current = { label, duration, calories };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function type(key: Field, set: (v: string) => void) {
    const wrapped = aiFields.typed(key, set);
    return (value: string) => {
      touched.current[key] = true;
      wrapped(value);
    };
  }

  function applyAi(result: PhotoAnalysisResult) {
    const cur = latest.current;
    const seen = (key: Field, value: string) => (touched.current[key] ? value : '');
    const outcomes = [
      aiFields.fill('label', seen('label', cur.label), result.activityName?.trim() || undefined, setLabel),
      aiFields.fill('duration', seen('duration', cur.duration), aiNumberText(result.durationMin, 1), setDuration),
      aiFields.fill('calories', seen('calories', cur.calories), aiNumberText(result.estimatedCaloriesBurned), setCalories),
    ];
    setAiNote({
      confidence: confidenceText(result.confidence),
      reasoning: result.reasoning,
      summary:
        result.activityName && result.durationMin
          ? g('ai.workoutSummary', { activity: result.activityName, min: Math.round(result.durationMin) })
          : null,
      kept: outcomes.includes('kept'),
    });
  }

  async function analyze() {
    if (!shownPhoto || ai.analyzing || saving) return;
    const result = await ai.analyze(shownPhoto);
    if (result && alive.current) applyAi(result);
  }

  function changePhoto(uri: string | null) {
    // A second photo while one is being analysed (or logged) is ignored.
    if (busy.current) return;
    setSaveFailed(false);
    setNeedsCheck(false);
    setAutoFailed(false);
    ai.reset();
    setAiNote(null);
    if (uri === null) {
      setNewPhoto(null);
      setPhotoRemoved(existingPhotoUri !== null);
    } else {
      setNewPhoto(uri);
      setPhotoRemoved(false);
      setLogged(null);
      if (autoLog) void analyzeAuto(uri);
    }
  }

  /** Photo-first flow: analyse, fill the inputs, and log by itself when the AI is sure enough. */
  async function analyzeAuto(uri: string) {
    if (!autoLog || busy.current) return;
    busy.current = true;
    setWorking(true);
    setNeedsCheck(false);
    setAutoFailed(false);
    try {
      const result = await ai.analyze(uri);
      if (!alive.current) return;
      if (!result) {
        setAutoFailed(true); // the error text is shown by the shared AI error line; the photo and inputs stay
        return;
      }
      const cur = latest.current;
      const typedNumber = (key: Field, text: string) => (touched.current[key] && parseFloat(text.replace(',', '.')) > 0 ? parseFloat(text.replace(',', '.')) : undefined);
      const decision = decideWorkoutAutoLog(
        result,
        {
          label: touched.current.label ? cur.label : undefined,
          durationMin: typedNumber('duration', cur.duration),
          caloriesBurned: typedNumber('calories', cur.calories),
        },
        g('wkp.defaultLabel')
      );
      applyAi(result);
      if (!decision.ok) {
        setNeedsCheck(true);
        return;
      }
      try {
        const created = await autoLog.onLog(decision.values, uri);
        if (!alive.current) return;
        setLogged({ id: created.id, confidence: confidenceText(result.confidence), reasoning: result.reasoning });
        reset(); // ready for the next photo; the card keeps the result
      } catch {
        if (alive.current) setSaveFailed(true); // not logged: the photo and the filled inputs stay for a manual Log
      }
    } finally {
      busy.current = false;
      if (alive.current) setWorking(false);
    }
  }

  function reset() {
    setLabel('');
    setDuration('');
    setCalories('');
    setNewPhoto(null);
    setPhotoRemoved(false);
    setAiNote(null);
    setNeedsCheck(false);
    setAutoFailed(false);
    ai.reset();
    aiFields.clear();
    touched.current = {};
  }

  async function submit() {
    if (saving) return;
    const durationMin = parseFloat(duration.replace(',', '.'));
    const caloriesBurned = parseFloat(calories.replace(',', '.'));
    if (!label.trim() || !(durationMin > 0) || !(caloriesBurned > 0)) {
      Alert.alert(t('common.error'), t('workout.errorMissingFields'));
      return;
    }
    const photo: PhotoChange = newPhoto ? { kind: 'replace', uri: newPhoto } : photoRemoved ? { kind: 'remove' } : { kind: 'none' };
    setSaving(true);
    setSaveFailed(false);
    setLogged(null);
    try {
      await onSubmit({ label: label.trim(), durationMin, caloriesBurned }, photo);
      if (alive.current && clearOnSuccess) reset();
    } catch {
      if (alive.current) setSaveFailed(true);
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const photoLabels = { title: g('wkp.title'), hint: autoLog ? g('wkp.hintAuto') : g('wkp.hint'), preview: g('wkp.preview') };
  const locked = saving || working;

  const photoBlock = (
    <View style={styles.group}>
      <FoodPhotoPicker uri={shownPhoto} onChange={changePhoto} disabled={locked} labels={photoLabels} />
      {working && (
        <HudText size={12} weight="medium" color={quest.manaText} accessibilityLiveRegion="polite">
          {g('ai.analyzing')}
        </HudText>
      )}
      {shownPhoto && (
        <QuestButton
          variant="ghost"
          icon="chart"
          title={ai.analyzing ? g('ai.analyzing') : autoLog ? g('wkp.reanalyze') : g('ai.analyze')}
          onPress={() => {
            void (autoLog ? analyzeAuto(shownPhoto) : analyze());
          }}
          loading={ai.analyzing}
          disabled={saving || working}
        />
      )}
      {shownPhoto && ai.error && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {aiErrorText(ai.error.kind, ai.error.message)}
          {autoLog && autoFailed ? ` ${g('wkp.autoFailedKeep')}` : ''}
        </HudText>
      )}
      {shownPhoto && aiNote && !ai.error && (
        <View style={styles.aiNote} accessibilityLiveRegion="polite">
          <HudText size={12} color={quest.manaText}>
            {g('ai.suggested')}
            {aiNote.confidence ? ` · ${aiNote.confidence}` : ''}
          </HudText>
          {aiNote.summary ? (
            <HudText size={12} color={quest.text}>
              {aiNote.summary}
            </HudText>
          ) : null}
          {aiNote.reasoning ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {aiNote.reasoning}
            </HudText>
          ) : null}
          {aiNote.kept ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('ai.keptYours')}
            </HudText>
          ) : null}
          {needsCheck ? (
            <HudText size={12} color={quest.goldLight} accessibilityRole="alert">
              {g('wkp.checkAndLog')}
            </HudText>
          ) : null}
        </View>
      )}
      {saveFailed && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {g('wkp.saveFailed')}
        </HudText>
      )}
      {autoLog && logged && (
        <LoggedFromPhotoCard entryId={logged.id} confidence={logged.confidence} reasoning={logged.reasoning} onEdit={autoLog.onEdit} onUndo={autoLog.onUndo} />
      )}
    </View>
  );

  const fieldsBlock = (
    <>
      <QuestField label={t('workout.namePlaceholder')} value={label} onChangeText={type('label', setLabel)} testID={`${testIdPrefix}-label`} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <QuestField
            label={t('workout.durationPlaceholder')}
            keyboardType="decimal-pad"
            value={duration}
            onChangeText={type('duration', setDuration)}
            testID={`${testIdPrefix}-duration`}
          />
        </View>
        <View style={styles.flex}>
          <QuestField
            label={t('workout.caloriesPlaceholder')}
            keyboardType="decimal-pad"
            value={calories}
            onChangeText={type('calories', setCalories)}
            testID={`${testIdPrefix}-calories`}
          />
        </View>
      </View>
      {date && onDateChange && <DateOffsetPicker selectedDate={date} onChange={onDateChange} dark />}
    </>
  );

  return (
    <View style={styles.form}>
      {photoFirst ? photoBlock : null}
      {fieldsBlock}
      {photoFirst ? null : photoBlock}
      <QuestButton
        icon={clearOnSuccess ? 'plus' : 'check'}
        title={submitLabel}
        onPress={() => {
          void submit();
        }}
        loading={saving}
        disabled={working}
      />
      {onCancel && <QuestButton variant="ghost" title={t('common.cancel')} onPress={onCancel} disabled={saving} />}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  group: { gap: 8 },
  aiNote: { gap: 4, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
});
