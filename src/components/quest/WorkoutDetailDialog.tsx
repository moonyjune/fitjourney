import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { deleteWorkoutWithUndo } from '../../food/mealActions';
import { useGameText, type GameKey } from '../../game/strings';
import { EXERCISE_BY_ID, type ExerciseId } from '../../game/training/exercises';
import { useProofStore } from '../../store/useProofStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { quest, questRadius } from '../../theme/quest';
import type { WorkoutExerciseResult, WorkoutLogEntry } from '../../types';
import { toDateKey } from '../../utils/date';
import { detachWorkoutPhoto, replaceWorkoutPhoto, workoutProofFor } from '../../utils/workoutPhotos';
import { BottomSheet } from './BottomSheet';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';
import { PhotoViewer } from './PhotoViewer';
import { QuestIcon, type QuestIconName } from './QuestIcon';
import { WorkoutEntryForm, type PhotoChange, type WorkoutFormValues } from './WorkoutEntryForm';

interface Props {
  /** The workouts of one journal row, in time order; null when closed. */
  entries: WorkoutLogEntry[] | null;
  lang: 'vi' | 'en';
  onClose: () => void;
  /** Own diary: each workout gets "Sửa", "Ảnh" and "Xoá" (with Hoàn tác). Off for a coach. */
  editable?: boolean;
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "17:20–17:45" for a workout that starts at dateISO and lasts durationMin. */
export function workoutRange(entry: Pick<WorkoutLogEntry, 'dateISO' | 'durationMin'>): string {
  const start = new Date(entry.dateISO);
  return `${clock(start)}–${clock(new Date(start.getTime() + entry.durationMin * 60_000))}`;
}

function ExerciseResult({ x, lang }: { x: WorkoutExerciseResult; lang: 'vi' | 'en' }) {
  const g = useGameText();
  const ex = EXERCISE_BY_ID[x.id as ExerciseId];
  const name = ex ? (lang === 'en' ? ex.nameEn : ex.nameVi) : x.id;
  const unit = x.unit === 'seconds' ? g('journal.wo.sec') : x.perSide ? g('journal.wo.repsSide') : g('journal.wo.reps');
  const full = x.results.length >= x.sets && x.results.every((r) => r >= x.amount);
  return (
    <View style={styles.exercise} accessible accessibilityLabel={`${name}. ${g('journal.wo.sets', { done: x.results.length, sets: x.sets })}. ${x.results.join(', ')} ${unit}`}>
      <View style={styles.row}>
        <HudText size={14} style={styles.flex}>
          {name}
        </HudText>
        <HudText size={12} color={full ? quest.xp : quest.manaText}>
          {g('journal.wo.sets', { done: x.results.length, sets: x.sets })}
        </HudText>
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('journal.wo.plan', { level: x.level, sets: x.sets, amount: x.amount, unit, rest: x.restSec })}
      </HudText>
      {x.results.length > 0 && (
        <HudText size={12} weight="medium" color={quest.textTertiary}>
          {g('journal.wo.results', { list: x.results.map((r, i) => `${i + 1}: ${r}`).join(' · '), unit })}
        </HudText>
      )}
      {x.rating && (
        <HudText size={12} weight="medium" color={quest.gold}>
          {g('journal.wo.rating', { r: g(`train.d.${x.rating}` as GameKey) })}
        </HudText>
      )}
    </View>
  );
}

interface EntryActions {
  onEdit: (entry: WorkoutLogEntry) => void;
  onDelete: (entry: WorkoutLogEntry) => void;
  onPhoto: (uri: string, entry: WorkoutLogEntry) => void;
}

function EntryCard({ e, lang, actions }: { e: WorkoutLogEntry; lang: 'vi' | 'en'; actions?: EntryActions }) {
  const g = useGameText();
  const proof = useProofStore((s) => workoutProofFor(s.photos, e.id));
  return (
    <View style={styles.entry}>
      <View style={styles.row}>
        <QuestIcon name="dumbbell" size={16} color={quest.hpText} />
        <HudText size={15} style={styles.flex}>
          {e.label}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {workoutRange(e)}
        </HudText>
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('journal.workoutMeta', { min: e.durationMin, kcal: Math.round(e.caloriesBurned) })}
      </HudText>
      {e.details?.exercises.length ? (
        e.details.exercises.map((x) => <ExerciseResult key={x.id} x={x} lang={lang} />)
      ) : (
        <HudText size={12} weight="medium" color={quest.textTertiary}>
          {g('journal.wo.noDetails')}
        </HudText>
      )}
      {actions && proof && (
        <Pressable accessibilityRole="button" accessibilityLabel={g('photo.zoom')} onPress={() => actions.onPhoto(proof.photoUri, e)} style={styles.thumb}>
          <DishThumb name={e.label} photoUri={proof.photoUri} size={64} radius={12} off />
        </Pressable>
      )}
      {actions && (
        <View style={styles.actions}>
          <ActionChip icon="edit" label={g('wkp.edit')} a11y={g('wkp.editEntry', { name: e.label })} onPress={() => actions.onEdit(e)} />
          <ActionChip icon="camera" label={g('journal.wo.photo')} a11y={g('journal.wo.photoLabel', { name: e.label })} onPress={() => actions.onEdit(e)} />
          {proof && <ActionChip icon="x" label={g('wkp.removePhoto')} a11y={`${g('wkp.removePhoto')}: ${e.label}`} onPress={() => detachWorkoutPhoto(e.id)} />}
          <ActionChip icon="trash" danger label={g('journal.wo.delete')} a11y={g('journal.wo.deleteLabel', { name: e.label })} onPress={() => actions.onDelete(e)} />
        </View>
      )}
    </View>
  );
}

function ActionChip({ icon, label, a11y, onPress, danger }: { icon: QuestIconName; label: string; a11y: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, danger && { borderColor: quest.bossBorder }, pressed && { opacity: 0.8 }]}
    >
      <QuestIcon name={icon} size={15} color={danger ? quest.hpText : quest.gold} strokeWidth={2.2} />
      <HudText size={12} color={danger ? quest.hpText : quest.text}>
        {label}
      </HudText>
    </Pressable>
  );
}

/** Workouts one under the other: each with its time range, length and calories and, for a guided session, each
 *  exercise with its plan and what every set reached. Used by the journal sheet and History's day cards. */
export function WorkoutEntries({ entries, lang, actions }: { entries: WorkoutLogEntry[]; lang: 'vi' | 'en'; actions?: EntryActions }) {
  return (
    <>
      {entries.map((e) => (
        <EntryCard key={e.id} e={e} lang={lang} actions={actions} />
      ))}
    </>
  );
}

/** The edit form of one workout inside the sheet (moved here from the old workout screen): name, minutes, kcal, day and photo. */
function EntryEditor({ entry, onDone }: { entry: WorkoutLogEntry; onDone: () => void }) {
  const g = useGameText();
  const proof = useProofStore((s) => workoutProofFor(s.photos, entry.id));
  const [editDate, setEditDate] = useState(() => new Date(entry.dateISO));

  async function save(values: WorkoutFormValues, photo: PhotoChange) {
    // Keep the original time unless the day itself was changed.
    const dateISO = toDateKey(editDate) === toDateKey(new Date(entry.dateISO)) ? entry.dateISO : editDate.toISOString();
    // The photo goes first: if it can't be saved the form reports it and nothing else has changed.
    if (photo.kind === 'replace') await replaceWorkoutPhoto({ id: entry.id, dateISO }, photo.uri);
    else if (photo.kind === 'remove') detachWorkoutPhoto(entry.id);
    useWorkoutStore.getState().updateEntry(entry.id, { label: values.label, durationMin: values.durationMin, caloriesBurned: values.caloriesBurned, dateISO });
    onDone();
  }

  return (
    <View style={styles.entry}>
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
        onCancel={onDone}
      />
    </View>
  );
}

/** Every workout of a journal row as a bottom sheet (dialog 12): its time range, length and calories and, for a guided session, each
 *  exercise with the planned sets and what every set reached. On the own diary each workout can be edited, given a photo or deleted
 *  (with "Hoàn tác" instead of a confirm). */
export function WorkoutDetailDialog({ entries, lang, onClose, editable }: Props) {
  const g = useGameText();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ uri: string; label: string } | null>(null);
  if (!entries || entries.length === 0) return null;
  const first = entries[0];
  const endMs = Math.max(...entries.map((e) => Date.parse(e.dateISO) + e.durationMin * 60_000));
  const totalMin = entries.reduce((s, e) => s + e.durationMin, 0);
  const totalKcal = Math.round(entries.reduce((s, e) => s + e.caloriesBurned, 0));
  const editing = editingId ? entries.find((e) => e.id === editingId) : undefined;

  const close = () => {
    setEditingId(null);
    setViewing(null);
    onClose();
  };
  const actions: EntryActions | undefined = editable
    ? {
        onEdit: (e) => setEditingId(e.id),
        onPhoto: (uri, e) => setViewing({ uri, label: e.label }),
        onDelete: (e) => {
          deleteWorkoutWithUndo(e.id, g('journal.wo.deleted', { name: e.label }));
          close();
        },
      }
    : undefined;

  return (
    <BottomSheet
      visible
      onClose={close}
      title={g('journal.wo.title')}
      subtitle={`${clock(new Date(first.dateISO))}–${clock(new Date(endMs))} · ${g('journal.workoutMeta', { min: totalMin, kcal: totalKcal })}`}
      closeLabel={g('journal.detailClose')}
      testID="workout-detail-sheet"
    >
      <View style={styles.content}>
        {editing ? <EntryEditor key={editing.id} entry={editing} onDone={() => setEditingId(null)} /> : <WorkoutEntries entries={entries} lang={lang} actions={actions} />}
      </View>
      <PhotoViewer photos={viewing ? [{ uri: viewing.uri, label: viewing.label }] : null} title={viewing?.label} onClose={() => setViewing(null)} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10 },
  entry: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
  exercise: { gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: quest.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  thumb: { alignSelf: 'flex-start', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
});
