import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { mealNames } from '../../game/deficitView';
import { shownDeficit } from '../../game/deficitView';
import type { DayEvaluation, DayMeal } from '../../game/missions';
import { useGameText } from '../../game/strings';
import { useSkippedMealStore } from '../../store/useSkippedMealStore';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';

interface DayDeficitNotesProps {
  day: DayEvaluation;
  dateKey: string;
  /** "T6 23/10": the day as the buttons' accessible names say it. */
  dayLabel: string;
  /** A coach's read-only view: the lines, no buttons. */
  readOnly?: boolean;
  /** Leave out the "estimate until the meals still to come are eaten" line (a screen that says it elsewhere). */
  hidePendingLine?: boolean;
}

/** The lines under a day's deficit (0.23–0.25 rules): today with meals still to come, the estimate and "Bỏ bữa" chips; a settled
 *  day with a meal not logged, "⚠ Chưa ghi …" + "Ghi bổ sung" + "Bỏ bữa"; meals skipped on purpose, with their undo. */
export function DayDeficitNotes({ day, dateKey, dayLabel, readOnly, hidePendingLine }: DayDeficitNotesProps) {
  const g = useGameText();
  const toggleSkippedMeal = useSkippedMealStore((s) => s.toggle);
  const shown = shownDeficit(day);

  const skipChips = (meals: DayMeal[], named: boolean) =>
    meals.length === 0 ? null : (
      <View style={styles.skipRow}>
        {meals.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={g('deficit.skipLabel', { meal: mealNames([m], g), day: dayLabel })}
            onPress={() => toggleSkippedMeal(dateKey, m.id)}
            style={[styles.chip, { borderColor: quest.border }]}
          >
            <HudText size={12} color={quest.textSecondary}>
              {named ? g('deficit.skipNamed', { meal: mealNames([m], g) }) : g('deficit.skip')}
            </HudText>
          </Pressable>
        ))}
      </View>
    );

  return (
    <>
      {shown.projected && !hidePendingLine && (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('deficit.pendingLine', {
            eaten: Math.round(day.eatenKcal).toLocaleString('en-US'),
            rest: day.pendingMeals.reduce((sum, m) => sum + m.kcal, 0).toLocaleString('en-US'),
            meals: mealNames(day.pendingMeals, g),
          })}
        </HudText>
      )}
      {shown.projected && !readOnly && skipChips(day.pendingMeals, true)}
      {shown.incomplete && (
        <View style={styles.missingRow}>
          <HudText size={12} weight="medium" color={quest.goldLight} style={styles.flex}>
            {g('deficit.missingLine', { meals: mealNames(day.missingMeals, g) })}
          </HudText>
          {!readOnly && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g('deficit.addMissingLabel', { day: dayLabel })}
              onPress={() => router.push('/quick-add')}
              style={[styles.chip, { borderColor: quest.gold }]}
            >
              <HudText size={12} color={quest.gold}>
                {g('deficit.addMissing')}
              </HudText>
            </Pressable>
          )}
        </View>
      )}
      {shown.incomplete && !readOnly && skipChips(day.missingMeals, day.missingMeals.length > 1)}
      {!readOnly && day.skippedMeals.length > 0 && (
        <View style={styles.missingRow}>
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {g('deficit.skippedLine', { meals: mealNames(day.skippedMeals, g) })}
          </HudText>
          {day.skippedMeals.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={g('deficit.skipUndoLabel', { meal: mealNames([m], g), day: dayLabel })}
              onPress={() => toggleSkippedMeal(dateKey, m.id)}
              style={[styles.chip, { borderColor: quest.border }]}
            >
              <HudText size={12} color={quest.textSecondary}>
                {day.skippedMeals.length > 1 ? `${g('deficit.skipUndo')}: ${mealNames([m], g)}` : g('deficit.skipUndo')}
              </HudText>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5 },
});
