import type { DailyNutritionLog, MealTemplate } from '../types';
import { toDateKey } from './date';

/**
 * Counts consecutive fully-completed days (all 3 meals logged + water target hit),
 * walking backward from today. Today only counts if already complete; otherwise the
 * streak is measured through yesterday so an in-progress day doesn't reset it early.
 */
export function computeCurrentStreak(
  logs: Record<string, DailyNutritionLog>,
  mealSlotsCount: number,
  waterTargetMl: number,
  now: Date = new Date()
): number {
  function isDayComplete(dateKey: string): boolean {
    const log = logs[dateKey];
    if (!log) return false;
    const mealsDone = Object.values(log.mealsEaten).filter(Boolean).length;
    return mealsDone >= mealSlotsCount && log.waterMl >= waterTargetMl;
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

// Only used as a stable reference for MEAL_SLOTS_COUNT where a MealTemplate[] is available.
export function mealSlotsCount(meals: MealTemplate[]): number {
  return meals.length;
}
