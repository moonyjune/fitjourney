import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../types';
import { getDayType } from '../constants/plan';
import { toDateKey } from './date';
import { actualDailyDeficitKcal } from './tdee';

/** A day counts toward the streak once its actual calorie deficit reaches this fraction of the
 *  user's target daily deficit — not the full target, so a day that's merely a bit short of the
 *  goal doesn't wipe out an otherwise-good streak (e.g. target 1100 kcal -> counts from ~880). */
export const STREAK_DEFICIT_RATIO = 0.8;

/** Calories eaten and burned for one day, from the same data history.tsx's day summaries use. */
function dayCaloriesInOut(
  dateKey: string,
  log: DailyNutritionLog | undefined,
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>,
  workoutEntries: WorkoutLogEntry[]
): { eatenKcal: number; burnedKcal: number } {
  const meals = mealTemplatesByDayType[getDayType(new Date(dateKey))];
  const eatenKcal = meals.filter((m) => log?.mealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0) + (log?.extraCalories ?? 0);
  const burnedKcal = workoutEntries
    .filter((e) => toDateKey(new Date(e.dateISO)) === dateKey)
    .reduce((s, w) => s + w.caloriesBurned, 0);
  return { eatenKcal, burnedKcal };
}

/**
 * Counts consecutive days that hit the calorie-deficit goal, walking backward from today. A day
 * needs at least one logged entry (otherwise "eating nothing" would trivially look like a huge
 * deficit) AND an actual deficit (TDEE + exercise - intake) of at least
 * targetDailyDeficitKcal * STREAK_DEFICIT_RATIO. Today only counts if already complete; otherwise
 * the streak is measured through yesterday so an in-progress day doesn't reset it early.
 */
export function computeCurrentStreak(
  logs: Record<string, DailyNutritionLog>,
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>,
  workoutEntries: WorkoutLogEntry[],
  tdeeKcal: number,
  targetDailyDeficitKcal: number,
  now: Date = new Date()
): number {
  const thresholdKcal = targetDailyDeficitKcal * STREAK_DEFICIT_RATIO;

  function isDayComplete(dateKey: string): boolean {
    const log = logs[dateKey];
    if (!log) return false;
    const { eatenKcal, burnedKcal } = dayCaloriesInOut(dateKey, log, mealTemplatesByDayType, workoutEntries);
    return actualDailyDeficitKcal(tdeeKcal, burnedKcal, eatenKcal) >= thresholdKcal;
  }

  let streak = 0;
  const cursor = new Date(now);
  const todayKey = toDateKey(cursor);
  if (!isDayComplete(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (isDayComplete(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export const STREAK_BADGE_THRESHOLDS = [3, 7, 14, 30, 60, 90];

export function unlockedStreakBadges(streak: number): number[] {
  return STREAK_BADGE_THRESHOLDS.filter((t) => streak >= t);
}
