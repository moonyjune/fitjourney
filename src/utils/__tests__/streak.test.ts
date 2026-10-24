import { describe, expect, it } from '@jest/globals';
import { computeCurrentStreak, STREAK_MIN_DEFICIT_KCAL, unlockedStreakBadges } from '../streak';
import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../../types';

const NOW = new Date('2026-09-30T12:00:00.000Z'); // a Wednesday
const TDEE_KCAL = 3000;

const MEALS: MealTemplate[] = [
  { slot: 'meal1', label: 'Meal 1', timeRange: '', startHour: 12, startMinute: 0, items: [], calories: 700, proteinG: 50 },
  { slot: 'meal2', label: 'Meal 2', timeRange: '', startHour: 15, startMinute: 0, items: [], calories: 500, proteinG: 60 },
  { slot: 'meal3', label: 'Meal 3', timeRange: '', startHour: 19, startMinute: 0, items: [], calories: 700, proteinG: 80 },
];
const MEAL_TEMPLATES: Record<DayType, MealTemplate[]> = { training: MEALS, rest: MEALS };
// Total if all 3 meals eaten: 1900 kcal. Deficit at TDEE 3000, 0 exercise: 3000 - 1900 = 1100 (passes).

function dateKeyDaysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fullDayLog(): DailyNutritionLog {
  return {
    dateISO: new Date().toISOString(),
    mealsEaten: { meal1: true, meal2: true, meal3: true },
    extraCalories: 0,
    extraProteinG: 0,
    extraItems: [],
    waterMl: 0,
  };
}

function lightDayLog(): DailyNutritionLog {
  // Only meal1 eaten (700 kcal) -> deficit 3000-700=2300, still passes easily; used to prove a day
  // with sparse logging isn't automatically excluded (unlike the old "3 meals required" rule).
  return { dateISO: new Date().toISOString(), mealsEaten: { meal1: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 };
}

function overeatingDayLog(): DailyNutritionLog {
  // All 3 meals + 2000 extra kcal -> total 3900, deficit = 3000-3900 = -900 (a surplus, fails).
  return {
    dateISO: new Date().toISOString(),
    mealsEaten: { meal1: true, meal2: true, meal3: true },
    extraCalories: 2000,
    extraProteinG: 0,
    extraItems: [],
    waterMl: 0,
  };
}

describe('STREAK_MIN_DEFICIT_KCAL', () => {
  it('is a flat 500 kcal, independent of the user editable target deficit', () => {
    expect(STREAK_MIN_DEFICIT_KCAL).toBe(500);
  });
});

describe('computeCurrentStreak (deficit-based)', () => {
  const noWorkouts: WorkoutLogEntry[] = [];

  it('counts a day with no logged extras as complete when the plan-meal deficit alone clears the threshold', () => {
    const logs = { [dateKeyDaysAgo(0)]: fullDayLog() };
    const streak = computeCurrentStreak(logs, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    expect(streak).toBe(1);
  });

  it('does not count a day with no log entry at all, even though "eating nothing" would trivially clear the deficit', () => {
    const streak = computeCurrentStreak({}, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    expect(streak).toBe(0);
  });

  it('does not require all 3 meals — a sparsely-logged day can still pass on deficit alone', () => {
    const logs = { [dateKeyDaysAgo(0)]: lightDayLog() };
    const streak = computeCurrentStreak(logs, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    expect(streak).toBe(1);
  });

  it('breaks the streak on a day with a calorie surplus', () => {
    const logs = { [dateKeyDaysAgo(0)]: overeatingDayLog(), [dateKeyDaysAgo(1)]: fullDayLog() };
    const streak = computeCurrentStreak(logs, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    // Today fails, so the streak is measured through yesterday only.
    expect(streak).toBe(1);
  });

  it('counts multiple consecutive complete days', () => {
    const logs = {
      [dateKeyDaysAgo(0)]: fullDayLog(),
      [dateKeyDaysAgo(1)]: fullDayLog(),
      [dateKeyDaysAgo(2)]: fullDayLog(),
    };
    const streak = computeCurrentStreak(logs, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    expect(streak).toBe(3);
  });

  it('fails a day whose deficit falls just short of the flat 500 kcal threshold', () => {
    // All 3 meals (1900 kcal) + 650 extra kcal -> total 2550, deficit = 3000-2550 = 450 (< 500, fails).
    const log: DailyNutritionLog = {
      dateISO: new Date().toISOString(),
      mealsEaten: { meal1: true, meal2: true, meal3: true },
      extraCalories: 650,
      extraProteinG: 0,
      extraItems: [],
      waterMl: 0,
    };
    const streak = computeCurrentStreak({ [dateKeyDaysAgo(0)]: log }, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    expect(streak).toBe(0);
  });

  it('passes a day whose deficit clears exactly the flat 500 kcal threshold', () => {
    // All 3 meals (1900 kcal) + 600 extra kcal -> total 2500, deficit = 3000-2500 = 500 (passes).
    const log: DailyNutritionLog = {
      dateISO: new Date().toISOString(),
      mealsEaten: { meal1: true, meal2: true, meal3: true },
      extraCalories: 600,
      extraProteinG: 0,
      extraItems: [],
      waterMl: 0,
    };
    const streak = computeCurrentStreak({ [dateKeyDaysAgo(0)]: log }, MEAL_TEMPLATES, noWorkouts, TDEE_KCAL, NOW);
    expect(streak).toBe(1);
  });

  it('adds logged exercise burn toward the deficit', () => {
    // Marginal day: eating exactly at TDEE (3000 kcal via 700+500+700+ extra 1100) fails on its own
    // (deficit 0), but 600 kcal of exercise pushes it over the flat 500 threshold.
    const marginalLog: DailyNutritionLog = {
      dateISO: new Date().toISOString(),
      mealsEaten: { meal1: true, meal2: true, meal3: true },
      extraCalories: 1100,
      extraProteinG: 0,
      extraItems: [],
      waterMl: 0,
    };
    const workouts: WorkoutLogEntry[] = [
      { id: 'w1', dateISO: NOW.toISOString(), templateId: null, label: 'Run', durationMin: 30, caloriesBurned: 600 },
    ];
    const logs = { [dateKeyDaysAgo(0)]: marginalLog };
    const withoutWorkout = computeCurrentStreak(logs, MEAL_TEMPLATES, [], TDEE_KCAL, NOW);
    const withWorkout = computeCurrentStreak(logs, MEAL_TEMPLATES, workouts, TDEE_KCAL, NOW);
    expect(withoutWorkout).toBe(0);
    expect(withWorkout).toBe(1);
  });
});

describe('unlockedStreakBadges', () => {
  it('unlocks only thresholds at or below the streak', () => {
    expect(unlockedStreakBadges(5)).toEqual([3]);
    expect(unlockedStreakBadges(10)).toEqual([3, 7]);
    expect(unlockedStreakBadges(0)).toEqual([]);
  });
});
