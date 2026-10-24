import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../types';
import { getDayType } from '../constants/plan';
import { toDateKey } from './date';
import { actualDailyDeficitKcal } from './tdee';

/** A day counts toward the streak once its actual calorie deficit reaches this fixed threshold —
 *  a flat number rather than a fraction of the user's own (editable) target deficit, so the
 *  streak rule stays the same regardless of what someone sets their personal target to. */
export const STREAK_MIN_DEFICIT_KCAL = 500;

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
 * deficit) AND an actual deficit (TDEE + exercise - intake) of at least STREAK_MIN_DEFICIT_KCAL.
 * Today only counts if already complete; otherwise the streak is measured through yesterday so an
 * in-progress day doesn't reset it early.
 */
export function computeCurrentStreak(
  logs: Record<string, DailyNutritionLog>,
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>,
  workoutEntries: WorkoutLogEntry[],
  tdeeKcal: number,
  now: Date = new Date()
): number {
  function isDayComplete(dateKey: string): boolean {
    const log = logs[dateKey];
    if (!log) return false;
    const { eatenKcal, burnedKcal } = dayCaloriesInOut(dateKey, log, mealTemplatesByDayType, workoutEntries);
    return actualDailyDeficitKcal(tdeeKcal, burnedKcal, eatenKcal) >= STREAK_MIN_DEFICIT_KCAL;
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

/** The longest run of consecutive days (anywhere in the logs) that hit the streak deficit — the same
 *  per-day rule as `computeCurrentStreak`, used so an earned fire badge survives a later break. */
export function computeLongestStreak(
  logs: Record<string, DailyNutritionLog>,
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>,
  workoutEntries: WorkoutLogEntry[],
  tdeeKcal: number
): number {
  const keys = Object.keys(logs).sort();
  if (keys.length === 0) return 0;
  let best = 0;
  let run = 0;
  const cursor = new Date(`${keys[0]}T12:00:00`);
  const last = new Date(`${keys[keys.length - 1]}T12:00:00`);
  while (cursor.getTime() <= last.getTime()) {
    const dateKey = toDateKey(cursor);
    const log = logs[dateKey];
    let complete = false;
    if (log) {
      const { eatenKcal, burnedKcal } = dayCaloriesInOut(dateKey, log, mealTemplatesByDayType, workoutEntries);
      complete = actualDailyDeficitKcal(tdeeKcal, burnedKcal, eatenKcal) >= STREAK_MIN_DEFICIT_KCAL;
    }
    run = complete ? run + 1 : 0;
    if (run > best) best = run;
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}

export const STREAK_BADGE_THRESHOLDS = [3, 7, 14, 30, 60, 90];

export function unlockedStreakBadges(streak: number): number[] {
  return STREAK_BADGE_THRESHOLDS.filter((t) => streak >= t);
}
