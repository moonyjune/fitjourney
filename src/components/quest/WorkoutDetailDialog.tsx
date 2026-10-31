import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGameText, type GameKey } from '../../game/strings';
import { EXERCISE_BY_ID, type ExerciseId } from '../../game/training/exercises';
import { quest, questRadius } from '../../theme/quest';
import type { WorkoutExerciseResult, WorkoutLogEntry } from '../../types';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';

interface Props {
  /** The workouts of one journal row, in time order; null when closed. */
  entries: WorkoutLogEntry[] | null;
  lang: 'vi' | 'en';
  onClose: () => void;
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

/** Every workout of a journal row: its time range, length and calories and, for a guided session, each exercise with
 *  the planned sets and what every set reached. */
export function WorkoutDetailDialog({ entries, lang, onClose }: Props) {
  const g = useGameText();
  if (!entries || entries.length === 0) return null;
  const first = entries[0];
  const endMs = Math.max(...entries.map((e) => Date.parse(e.dateISO) + e.durationMin * 60_000));
  const totalMin = entries.reduce((s, e) => s + e.durationMin, 0);
  const totalKcal = Math.round(entries.reduce((s, e) => s + e.caloriesBurned, 0));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <HudText size={17} accessibilityRole="header">
              {g('journal.wo.title')}
            </HudText>
            <HudText size={13} color={quest.goldLight}>
              {`${clock(new Date(first.dateISO))}–${clock(new Date(endMs))} · ${g('journal.workoutMeta', { min: totalMin, kcal: totalKcal })}`}
            </HudText>
            {entries.map((e) => (
              <View key={e.id} style={styles.entry}>
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
              </View>
            ))}
          </ScrollView>
          <QuestButton title={g('journal.detailClose')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { maxHeight: '90%', maxWidth: 520, width: '100%', alignSelf: 'center', gap: 12, padding: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  content: { gap: 10 },
  entry: { gap: 6, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
  exercise: { gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: quest.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
});
