import type { DailyNutritionLog, ExtraFoodItem } from '../types';

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Calories and protein of a day's off-plan food, summed from the items themselves and rounded once at the end (kcal to a whole
 *  number, protein to one decimal), so every screen shows the same figure and no float drift builds up. The stored running counters
 *  are only used for a log that has no items. */
export function extraIntake(log: Pick<DailyNutritionLog, 'extraItems' | 'extraCalories' | 'extraProteinG'> | undefined): { kcal: number; proteinG: number } {
  if (!log) return { kcal: 0, proteinG: 0 };
  const items: ExtraFoodItem[] = log.extraItems ?? [];
  if (items.length === 0) return { kcal: Math.round(num(log.extraCalories)), proteinG: r1(num(log.extraProteinG)) };
  return {
    kcal: Math.round(items.reduce((s, i) => s + num(i.calories), 0)),
    proteinG: r1(items.reduce((s, i) => s + num(i.proteinG), 0)),
  };
}

/** The running counters a log should carry for its items (kept equal to {@link extraIntake}). */
export function withIntakeCounters(log: DailyNutritionLog): DailyNutritionLog {
  const { kcal, proteinG } = extraIntake(log);
  return { ...log, extraCalories: kcal, extraProteinG: proteinG };
}

/** The log after an edit, with its counters following the items. When the edit took away the last item the counters go to zero: `extraIntake`
 *  falls back to the stored counters for a log without items (older days that only ever had a total), and without this the deleted food's
 *  calories would stay on the day, and be saved to the cloud, with nothing left to delete. `clearTotals` zeroes them on purpose (the user removed
 *  that leftover total). */
export function withCountersAfterEdit(before: DailyNutritionLog, after: DailyNutritionLog, clearTotals = false): DailyNutritionLog {
  const emptied = (before.extraItems?.length ?? 0) > 0 && (after.extraItems?.length ?? 0) === 0;
  if (emptied || (clearTotals && (after.extraItems?.length ?? 0) === 0)) return { ...after, extraCalories: 0, extraProteinG: 0 };
  return withIntakeCounters(after);
}

/** Does this day hold any logged food? A day with only water is not a day of eating. */
export function dayHasFood(log: DailyNutritionLog | undefined): boolean {
  if (!log) return false;
  return Object.values(log.mealsEaten ?? {}).some(Boolean) || (log.extraItems?.length ?? 0) > 0 || num(log.extraCalories) > 0;
}
