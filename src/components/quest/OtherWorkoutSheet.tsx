import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useGameText } from '../../game/strings';
import { useNow } from '../../game/useGameState';
import { usePlanStore } from '../../store/usePlanStore';
import { useSelectedDayStore, workingDayKey } from '../../store/useSelectedDayStore';
import { showToast } from '../../store/useToastStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useTranslation } from '../../i18n/useTranslation';
import { quest } from '../../theme/quest';
import { momentOnDay } from '../../utils/logDate';
import { addWorkoutWithPhoto } from '../../utils/workoutPhotos';
import { BottomSheet } from './BottomSheet';
import { DateChip } from './DateChip';
import { HudText } from './HudText';
import { QuestChip } from './QuestChip';
import { WorkoutEntryForm, type PhotoChange, type WorkoutFormValues } from './WorkoutEntryForm';

/** What the sheet was opened for: a kind of workout picked on the Train tab fills the name in. */
export type OtherWorkoutPreset = 'run' | 'swim' | 'cycle' | 'photo' | 'ai' | null;

interface Props {
  visible: boolean;
  onClose: () => void;
  preset?: OtherWorkoutPreset;
}

interface Prefill {
  label: string;
  durationMin?: number;
  caloriesBurned?: number;
  /** A plan workout: logged with its template id, so the journal shows its steps. */
  templateId?: string;
}

/** "Tập khác" (Design/uiux-proposal/html/dialogs/13-other-workout-sheet.html): what the old workout-classic screen did, as a sheet.
 *  The day comes from the shared date chip; quick picks (run, swim, cycling, the plan's own workouts) fill the form; the form is the
 *  same `WorkoutEntryForm` (photo first: the AI reads a watch / machine photo and logs it by itself with "Hoàn tác", "Phân tích lại",
 *  "✨ AI ước tính kcal" from the description). A typed workout is logged with a toast that can undo it. */
export function OtherWorkoutSheet({ visible, onClose, preset = null }: Props) {
  const g = useGameText();
  const { t } = useTranslation();
  const now = useNow(60_000);
  const templates = usePlanStore((s) => s.plan.workoutTemplates);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  // A new key remounts the form with the quick pick's values.
  const [formKey, setFormKey] = useState(0);

  const quick: { id: Exclude<OtherWorkoutPreset, 'photo' | 'ai' | null>; label: string }[] = [
    { id: 'run', label: g('train.otherRun') },
    { id: 'swim', label: g('train.otherSwim') },
    { id: 'cycle', label: g('train.otherCycle') },
  ];

  function pick(next: Prefill | null) {
    setPrefill(next);
    setFormKey((k) => k + 1);
  }

  // Each opening starts clean, with the kind picked on the Train tab already filled in.
  useEffect(() => {
    if (!visible) return;
    const q = quick.find((x) => x.id === preset);
    pick(q ? { label: q.label } : null);
  }, [visible, preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const logISO = () => momentOnDay(workingDayKey(useSelectedDayStore.getState().selectedKey, new Date()), new Date()).toISOString();

  async function log(values: WorkoutFormValues, photo: PhotoChange) {
    // A plan workout keeps its template (and its steps in the journal) while its name is unchanged.
    const templateId = prefill?.templateId && values.label === prefill.label ? prefill.templateId : null;
    const created = await addWorkoutWithPhoto(
      { templateId, label: values.label, durationMin: values.durationMin, caloriesBurned: values.caloriesBurned },
      logISO(),
      photo.kind === 'replace' ? photo.uri : null
    );
    onClose();
    showToast({
      text: g('other.logged', { name: values.label, min: values.durationMin, kcal: Math.round(values.caloriesBurned) }),
      undo: () => useWorkoutStore.getState().removeEntry(created.id),
    });
  }

  /** Photo first: the AI was sure enough, so the workout is logged with its photo; the form shows the card with "Hoàn tác". */
  async function autoLog(values: WorkoutFormValues, photoUri: string) {
    const created = await addWorkoutWithPhoto(
      { templateId: null, label: values.label, durationMin: values.durationMin, caloriesBurned: values.caloriesBurned },
      logISO(),
      photoUri
    );
    return { id: created.id };
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      eyebrow={g('other.eyebrow')}
      title={g('other.title')}
      headerRight={<DateChip size="small" now={now} hint={g('quick.dateHintAll')} />}
      testID="other-workout-sheet"
    >
      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.label}>
        {g('other.quick')}
      </HudText>
      <View style={styles.chips}>
        {quick.map((q) => (
          <QuestChip key={q.id} label={q.label} selected={prefill?.label === q.label && !prefill.templateId} onPress={() => pick({ label: q.label })} />
        ))}
        {templates.map((tpl) => (
          <QuestChip
            key={tpl.id}
            label={g('other.planChip', { name: tpl.label })}
            selected={prefill?.templateId === tpl.id}
            onPress={() => pick({ label: tpl.label, durationMin: tpl.durationMin, caloriesBurned: tpl.caloriesBurned, templateId: tpl.id })}
          />
        ))}
      </View>
      <View style={styles.form}>
        <WorkoutEntryForm
          key={formKey}
          testIdPrefix="other"
          initial={prefill ? { label: prefill.label, durationMin: prefill.durationMin, caloriesBurned: prefill.caloriesBurned } : undefined}
          submitLabel={t('workout.logButton')}
          onSubmit={log}
          photoFirst
          autoLog={{
            onLog: autoLog,
            onEdit: (id) => {
              onClose();
              router.push({ pathname: '/workout-classic', params: { edit: id } });
            },
            onUndo: (id) => useWorkoutStore.getState().removeEntry(id),
          }}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          onClose();
          router.push('/workout-classic');
        }}
        style={styles.link}
      >
        <HudText size={13} color={quest.manaText}>
          {g('train.weekManage')}
        </HudText>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { marginTop: 12 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
