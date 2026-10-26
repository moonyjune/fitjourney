import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stepsOrImplicit } from '../../src/components/PlanPreview';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { FoodThumb } from '../../src/components/quest/FoodPhoto';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { QuestWorkoutSteps } from '../../src/components/quest/QuestPlanPreview';
import { WorkoutEntryForm, type PhotoChange, type WorkoutFormValues } from '../../src/components/quest/WorkoutEntryForm';
import { FadeInUp } from '../../src/components/quest/motion';
import { useProofStore } from '../../src/store/useProofStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { addWorkoutWithPhoto, detachWorkoutPhoto, replaceWorkoutPhoto, workoutProofFor } from '../../src/utils/workoutPhotos';
import type { WorkoutLogEntry } from '../../src/types';
import { todayKey } from '../../src/store/useNutritionStore';
import { getDayType } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { iconForWorkoutLabel, workoutIntensity, type WorkoutIntensity } from '../../src/utils/workoutIntensity';
import { useGameText } from '../../src/game/strings';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

const INTENSITY_COLOR: Record<WorkoutIntensity, { fg: string; bg: string; border: string }> = {
  light: { fg: quest.xp, bg: '#17301F', border: '#2E6A3B' },
  medium: { fg: quest.gold, bg: '#33280F', border: '#7A5E12' },
  high: { fg: quest.hpText, bg: '#3A1424', border: quest.bossBorder },
};
const INTENSITY_LABEL_KEY: Record<WorkoutIntensity, StringKey> = {
  light: 'workout.intensityLight',
  medium: 'workout.intensityMedium',
  high: 'workout.intensityHigh',
};

function IntensityBadge({ caloriesBurned, durationMin }: { caloriesBurned: number; durationMin: number }) {
  const { t } = useTranslation();
  const intensity = workoutIntensity(caloriesBurned, durationMin);
  const c = INTENSITY_COLOR[intensity];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <HudText size={11} color={c.fg}>
        {t(INTENSITY_LABEL_KEY[intensity])}
      </HudText>
    </View>
  );
}

function Emoji({ label, size }: { label: string; size: number }) {
  return (
    <View style={[styles.icon, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <HudText size={Math.round(size * 0.5)}>{iconForWorkoutLabel(label)}</HudText>
    </View>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

interface EntryBlockProps {
  entry: WorkoutLogEntry;
  /** Older entries: a single compact row instead of a full card. */
  compact?: boolean;
  sourceTemplate?: Parameters<typeof stepsOrImplicit>[0];
  editing: boolean;
  onEdit: () => void;
  onStopEditing: () => void;
}

/** One logged workout: its numbers, photo and actions, or - while editing - the same form used for logging. */
function EntryBlock({ entry, compact, sourceTemplate, editing, onEdit, onStopEditing }: EntryBlockProps) {
  const { t } = useTranslation();
  const g = useGameText();
  const removeEntry = useWorkoutStore((s) => s.removeEntry);
  const updateEntry = useWorkoutStore((s) => s.updateEntry);
  const proof = useProofStore((s) => workoutProofFor(s.photos, entry.id));
  const [editDate, setEditDate] = useState(() => new Date(entry.dateISO));

  async function save(values: WorkoutFormValues, photo: PhotoChange) {
    // Keep the original timestamp unless the day itself was changed.
    const dateISO = sameDay(editDate, new Date(entry.dateISO)) ? entry.dateISO : editDate.toISOString();
    // The photo goes first: if it can't be saved the form reports it and nothing else has changed.
    if (photo.kind === 'replace') await replaceWorkoutPhoto({ id: entry.id, dateISO }, photo.uri);
    else if (photo.kind === 'remove') detachWorkoutPhoto(entry.id);
    updateEntry(entry.id, { label: values.label, durationMin: values.durationMin, caloriesBurned: values.caloriesBurned, dateISO });
    onStopEditing();
  }

  if (editing) {
    return (
      <View style={styles.panel}>
        <HudText size={16} accessibilityRole="header">
          {g('wkp.editTitle')}
        </HudText>
        <WorkoutEntryForm
          testIdPrefix={`edit-${entry.id}`}
          initial={{ label: entry.label, durationMin: entry.durationMin, caloriesBurned: entry.caloriesBurned }}
          existingPhotoUri={proof?.photoUri ?? null}
          date={editDate}
          onDateChange={setEditDate}
          submitLabel={g('wkp.save')}
          onSubmit={save}
          onCancel={onStopEditing}
        />
      </View>
    );
  }

  const macro = t('workout.templateMacro', { min: entry.durationMin, kcal: entry.caloriesBurned });
  const actions = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g('wkp.editEntry', { name: entry.label })}
        onPress={onEdit}
        style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
      >
        <HudText size={13} color={quest.manaText}>
          {g('wkp.edit')}
        </HudText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('common.delete')}: ${entry.label}`}
        onPress={() => removeEntry(entry.id)}
        style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
      >
        <HudText size={13} color={quest.hpText}>
          {t('common.delete')}
        </HudText>
      </Pressable>
    </>
  );

  if (compact) {
    return (
      <View style={styles.recentRow}>
        {proof && <FoodThumb uri={proof.photoUri} name={entry.label} size={40} />}
        <View style={styles.flex}>
          <HudText size={14}>
            {iconForWorkoutLabel(entry.label)} {entry.label}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {formatDateVi(toDateKey(new Date(entry.dateISO)))} · {macro}
          </HudText>
        </View>
        {actions}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Emoji label={entry.label} size={38} />
        <View style={styles.flex}>
          <HudText size={15}>{entry.label}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {macro}
          </HudText>
        </View>
        <IntensityBadge caloriesBurned={entry.caloriesBurned} durationMin={entry.durationMin} />
      </View>
      {sourceTemplate && <QuestWorkoutSteps steps={stepsOrImplicit(sourceTemplate)} />}
      <View style={styles.photoRow}>
        {proof ? <FoodThumb uri={proof.photoUri} name={entry.label} size={64} /> : null}
        <View style={styles.photoActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${proof ? g('wkp.changePhoto') : g('wkp.addPhoto')}: ${entry.label}`}
            onPress={onEdit}
            style={({ pressed }) => [styles.chipButton, pressed && { opacity: 0.85 }]}
          >
            <HudText size={13} color={quest.gold}>
              {proof ? g('wkp.changePhoto') : g('wkp.addPhoto')}
            </HudText>
          </Pressable>
          {proof && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${g('wkp.removePhoto')}: ${entry.label}`}
              onPress={() => detachWorkoutPhoto(entry.id)}
              style={({ pressed }) => [styles.chipButton, pressed && { opacity: 0.85 }]}
            >
              <HudText size={13} color={quest.hpText}>
                {g('wkp.removePhoto')}
              </HudText>
            </Pressable>
          )}
        </View>
        <View style={styles.entryActions}>{actions}</View>
      </View>
    </View>
  );
}

export default function WorkoutScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const dateKey = todayKey();
  const dayType = useMemo(() => getDayType(new Date()), []);
  const workoutTemplates = usePlanStore((s) => s.plan.workoutTemplates);
  const entries = useWorkoutStore((s) => s.entries);
  const addEntry = useWorkoutStore((s) => s.addEntry);

  const todayEntries = useMemo(
    () => entries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey).reverse(),
    [entries, dateKey]
  );
  const recentEntries = useMemo(
    () => entries.filter((e) => toDateKey(new Date(e.dateISO)) !== dateKey).slice(-10).reverse(),
    [entries, dateKey]
  );

  const [logDate, setLogDate] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const removeEntry = useWorkoutStore((s) => s.removeEntry);

  function logTemplate(templateId: string, label: string, durationMin: number, caloriesBurned: number) {
    addEntry({ templateId, label, durationMin, caloriesBurned }, logDate.toISOString());
  }

  async function logCustom(values: WorkoutFormValues, photo: PhotoChange) {
    // With a photo the workout and its picture are saved together, or neither is (the form then shows the error).
    await addWorkoutWithPhoto(
      { templateId: null, label: values.label, durationMin: values.durationMin, caloriesBurned: values.caloriesBurned },
      logDate.toISOString(),
      photo.kind === 'replace' ? photo.uri : null
    );
  }

  /** The photo-first flow: log the AI-read workout together with its photo and hand back the new entry's id. */
  async function autoLogFromPhoto(values: WorkoutFormValues, photoUri: string) {
    const created = await addWorkoutWithPhoto(
      { templateId: null, label: values.label, durationMin: values.durationMin, caloriesBurned: values.caloriesBurned },
      logDate.toISOString(),
      photoUri
    );
    return { id: created.id };
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}
      keyboardShouldPersistTaps="handled"
    >
      <QuestHeader
        title={t('tab.workout')}
        eyebrow={dayType === 'training' ? t('workout.dayTraining') : t('workout.dayRest')}
        backLabel={g('planScreen.back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/workout'))}
      />

      <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
        {t('common.logDateTitle')}
      </HudText>
      <View style={styles.panel}>
        <DateOffsetPicker selectedDate={logDate} onChange={setLogDate} dark />
      </View>

      <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
        {t('workout.suggestedTitle')}
      </HudText>
      {workoutTemplates.map((template, i) => (
        <FadeInUp key={template.id} index={i} animate={i < 6}>
          <View style={styles.panel}>
            <View style={styles.headerRow}>
              <Emoji label={template.label} size={44} />
              <View style={styles.flex}>
                <HudText size={15}>{template.label}</HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {template.timeRange}
                </HudText>
              </View>
              <IntensityBadge caloriesBurned={template.caloriesBurned} durationMin={template.durationMin} />
            </View>
            <QuestWorkoutSteps steps={stepsOrImplicit(template)} />
            <View style={styles.footerRow}>
              <HudText size={13} color={quest.gold} style={styles.flex}>
                {t('workout.templateMacro', { min: template.durationMin, kcal: template.caloriesBurned })}
              </HudText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('workout.editWithAiButton')}
                onPress={() => router.push(`/(tabs)/plan?editWorkout=${encodeURIComponent(template.label)}`)}
                style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}
              >
                <HudText size={13} color={quest.manaText}>
                  {t('workout.editWithAiButton')}
                </HudText>
              </Pressable>
            </View>
            <QuestButton
              title={t('workout.logTemplateButton')}
              icon="check"
              onPress={() => logTemplate(template.id, template.label, template.durationMin, template.caloriesBurned)}
            />
          </View>
        </FadeInUp>
      ))}

      <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
        {t('workout.customTitle')}
      </HudText>
      <View style={styles.panel}>
        <WorkoutEntryForm
          testIdPrefix="log"
          submitLabel={t('workout.logButton')}
          onSubmit={logCustom}
          clearOnSuccess
          photoFirst
          autoLog={{ onLog: autoLogFromPhoto, onEdit: (id) => setEditingId(id), onUndo: (id) => removeEntry(id) }}
        />
      </View>

      <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
        {t('workout.todayTitle', { n: todayEntries.length })}
      </HudText>
      {todayEntries.length === 0 && (
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
          {t('workout.emptyToday')}
        </HudText>
      )}
      {todayEntries.map((e) => (
        // A logged entry from a suggested template shows the same numbered step breakdown as the template itself.
        <EntryBlock
          key={e.id}
          entry={e}
          sourceTemplate={e.templateId ? workoutTemplates.find((wt) => wt.id === e.templateId) : undefined}
          editing={editingId === e.id}
          onEdit={() => setEditingId(e.id)}
          onStopEditing={() => setEditingId(null)}
        />
      ))}

      {recentEntries.length > 0 && (
        <>
          <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
            {t('workout.recentTitle')}
          </HudText>
          {recentEntries.map((e) => (
            <EntryBlock
              key={e.id}
              entry={e}
              compact
              editing={editingId === e.id}
              onEdit={() => setEditingId(e.id)}
              onStopEditing={() => setEditingId(null)}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16 },
  flex: { flex: 1, minWidth: 0 },
  sectionTitle: { marginTop: 22, marginBottom: 8 },
  panel: {
    backgroundColor: quest.panel,
    borderColor: quest.border,
    borderWidth: 1.5,
    borderRadius: questRadius.panel,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { borderRadius: questRadius.row, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  deleteButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  photoActions: { flex: 1, minWidth: 140, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entryActions: { flexDirection: 'row', alignItems: 'center' },
  chipButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  empty: { textAlign: 'center', marginBottom: 12 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: quest.panel,
    borderColor: quest.border,
    borderWidth: 1.5,
    borderRadius: questRadius.row,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 8,
  },
});
