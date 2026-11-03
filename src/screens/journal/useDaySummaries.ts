import { useMemo } from 'react';
import { getDayType } from '../../constants/plan';
import { shownDeficit, type ShownDeficit } from '../../game/deficitView';
import type { DayMeal } from '../../game/missions';
import { mealsLogged } from '../../food/mealCount';
import type { ExtraFoodItem, MealSlot, MealTemplate, ProofPhoto, WorkoutLogEntry } from '../../types';
import { toDateKey } from '../../utils/date';
import { dayHasFood, extraIntake } from '../../utils/dayIntake';
import { actualDailyDeficitKcal } from '../../utils/tdee';
import { weekStartKey } from '../../utils/weekKey';
import { dayWaterTargetMl } from '../../water/schedule';
import type { JournalSubject } from './useJournalSubject';

/** One logged day as the Month tab's day list and calendar show it (moved from the old History screen). */
export interface DaySummary {
  dateKey: string;
  calories: number;
  proteinG: number;
  waterMl: number;
  /** The day's own water target (stored on its log), else the current setting. */
  waterTargetMl: number;
  /** Meal times with food logged (see `mealsLogged`), shown against the plan's 3. */
  mealsEatenCount: number;
  workoutsCount: number;
  workouts: WorkoutLogEntry[];
  caloriesBurned: number;
  proofsCount: number;
  proofs: ProofPhoto[];
  weightKg: number | null;
  meals: MealTemplate[];
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraItems: ExtraFoodItem[];
  legacyTotals: { kcal: number; proteinG: number };
  removedMealSlots: MealSlot[];
  /** Deficit with today's TDEE; null with no food logged or on a cheat day. */
  deficitKcal: number | null;
  /** A cheat day: its food is shown, but its kcal are not counted (deficitKcal is null). */
  cheat: boolean;
  /** The deficit as every screen shows it (see `shownDeficit`): today's end-of-day estimate while meals are still to come, and a
   *  settled day with a meal not logged marked incomplete (no level colour, ⚠). */
  shown: ShownDeficit;
  /** That incomplete day's meals with nothing logged. */
  missingMeals: DayMeal[];
}

export interface WeekSummary {
  weekKey: string;
  days: DaySummary[];
  avgCalories: number;
  totalWorkouts: number;
  weightChange: number | null;
}

/** Every day with something logged (food, water, a workout, a weigh-in, a photo), newest first, and the same grouped by week. */
export function useDaySummaries(subject: JournalSubject): { days: DaySummary[]; byKey: Map<string, DaySummary>; weeks: WeekSummary[] } {
  const { logs, workouts, weights, proofs, mealTemplates, tdeeKcal, settings, cheatDays, evaluate } = subject;
  const days = useMemo<DaySummary[]>(() => {
    const dateKeys = new Set<string>();
    Object.keys(logs).forEach((k) => dateKeys.add(k));
    workouts.forEach((e) => dateKeys.add(toDateKey(new Date(e.dateISO))));
    weights.forEach((e) => dateKeys.add(toDateKey(new Date(e.dateISO))));
    proofs.forEach((p) => dateKeys.add(toDateKey(new Date(p.dateISO))));

    return [...dateKeys]
      .sort()
      .reverse()
      .map((dateKey) => {
        const meals = mealTemplates[getDayType(new Date(dateKey))];
        const log = logs[dateKey];
        const eatenMeals = meals.filter((m) => log?.mealsEaten[m.slot]);
        const extra = extraIntake(log);
        const calories = Math.round(eatenMeals.reduce((s, m) => s + m.calories, 0) + extra.kcal);
        const proteinG = Math.round((eatenMeals.reduce((s, m) => s + m.proteinG, 0) + extra.proteinG) * 10) / 10;
        const dayWorkouts = workouts.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey);
        const dayWeight = weights.find((e) => toDateKey(new Date(e.dateISO)) === dateKey);
        const dayProofs = proofs.filter((p) => toDateKey(new Date(p.dateISO)) === dateKey);
        const cheat = cheatDays.includes(dateKey);
        const evaluation = evaluate(dateKey);
        const burned = dayWorkouts.reduce((s, w) => s + w.caloriesBurned, 0);
        return {
          dateKey,
          calories,
          proteinG,
          waterMl: log?.waterMl ?? 0,
          waterTargetMl: dayWaterTargetMl(log, settings.waterTargetMl),
          mealsEatenCount: mealsLogged(log),
          workoutsCount: dayWorkouts.length,
          workouts: [...dayWorkouts].sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO)),
          caloriesBurned: burned,
          proofsCount: dayProofs.length,
          proofs: dayProofs,
          weightKg: dayWeight?.weightKg ?? null,
          deficitKcal: dayHasFood(log) && !cheat ? actualDailyDeficitKcal(tdeeKcal, burned, calories) : null,
          meals,
          mealsEaten: log?.mealsEaten ?? {},
          extraItems: log?.extraItems ?? [],
          legacyTotals: { kcal: log?.extraCalories ?? 0, proteinG: log?.extraProteinG ?? 0 },
          removedMealSlots: log?.removedMealSlots ?? [],
          cheat,
          shown: shownDeficit(evaluation),
          missingMeals: evaluation.missingMeals,
        };
      });
  }, [logs, workouts, weights, proofs, mealTemplates, tdeeKcal, settings.waterTargetMl, cheatDays, evaluate]);

  const byKey = useMemo(() => new Map(days.map((d) => [d.dateKey, d])), [days]);

  const weeks = useMemo<WeekSummary[]>(() => {
    const groups = new Map<string, DaySummary[]>();
    for (const day of days) {
      const week = weekStartKey(new Date(day.dateKey));
      if (!groups.has(week)) groups.set(week, []);
      groups.get(week)!.push(day);
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([weekKey, ds]) => {
        // Cheat days are not counted in the calorie average (their food is still listed).
        const counted = ds.filter((d) => !d.cheat);
        const avgCalories = counted.length > 0 ? counted.reduce((s, d) => s + d.calories, 0) / counted.length : 0;
        const totalWorkouts = ds.reduce((s, d) => s + d.workoutsCount, 0);
        const weightsLogged = ds.map((d) => d.weightKg).filter((w): w is number => w !== null);
        // Newest first: the change is the latest weigh-in of the week minus the earliest.
        const weightChange = weightsLogged.length >= 2 ? weightsLogged[0] - weightsLogged[weightsLogged.length - 1] : null;
        return { weekKey, days: ds, avgCalories, totalWorkouts, weightChange };
      });
  }, [days]);

  return { days, byKey, weeks };
}
