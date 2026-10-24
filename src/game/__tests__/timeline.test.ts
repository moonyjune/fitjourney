import { describe, expect, it } from '@jest/globals';
import { DEFAULT_MEAL_TEMPLATES, DEFAULT_WATER_SCHEDULE } from '../../constants/plan';
import type { DailyNutritionLog, ExtraFoodItem, FeelingRecord, WorkoutLogEntry } from '../../types';
import { isoWeekNumber } from '../../utils/isoWeek';
import { buildTimeline, type TimelineInput } from '../timeline';

const DATE = '2026-10-23'; // Friday: training-day meals (741 / 500 / 713 kcal)
const meals = DEFAULT_MEAL_TEMPLATES.training;

const baseLog: DailyNutritionLog = {
  dateISO: DATE, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 2400,
};

function input(patch: Partial<TimelineInput> = {}): TimelineInput {
  return {
    dateKey: DATE,
    now: new Date('2026-10-23T16:10:00'),
    log: baseLog,
    meals,
    waterSchedule: DEFAULT_WATER_SCHEDULE,
    workouts: [],
    feelings: [],
    photoSlots: new Set<string>(),
    ...patch,
  };
}

describe('buildTimeline', () => {
  it('orders meals and water checkpoints by time and puts the "now" marker between past and upcoming', () => {
    const items = buildTimeline(input());
    const minutes = items.map((i) => i.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    const nowAt = items.findIndex((i) => i.kind === 'now');
    expect(nowAt).toBeGreaterThan(0);
    expect(items.slice(0, nowAt).every((i) => i.minutes <= 16 * 60 + 10)).toBe(true);
    expect(items.slice(nowAt + 1).every((i) => i.minutes > 16 * 60 + 10)).toBe(true);
    // Meal 3 (19:15) is still ahead of us.
    const meal3 = items.find((i) => i.kind === 'meal' && i.slot === 'meal3');
    expect(meal3).toMatchObject({ eaten: false, past: false });
  });

  it('lists a meal before water at the same minute (12:00)', () => {
    const items = buildTimeline(input());
    const at1200 = items.filter((i) => i.minutes === 12 * 60).map((i) => i.kind);
    expect(at1200).toEqual(['meal', 'water']);
  });

  it('marks water checkpoints reached by comparing the day total with the cumulative target', () => {
    const water = buildTimeline(input()).filter((i) => i.kind === 'water');
    // 2,400 ml covers the 500/1000/2000/2300 ml checkpoints, not 2700 and above.
    expect(water.filter((w) => w.kind === 'water' && w.reached).map((w) => w.kind === 'water' && w.cumulativeMl)).toEqual([500, 1000, 2000, 2300]);
    expect(water[0]).toMatchObject({ incrementMl: 500 });
    expect(water[2]).toMatchObject({ incrementMl: 1000 }); // 1000 -> 2000
  });

  it('reports protein so far on each eaten meal, counting extras logged earlier', () => {
    const extra: ExtraFoodItem = { id: 'e', name: 'Sữa', calories: 100, proteinG: 10, loggedAtISO: `${DATE}T10:00:00`, mealTime: null };
    const log = { ...baseLog, extraItems: [extra], extraCalories: 100, extraProteinG: 10 };
    const meal1 = buildTimeline(input({ log })).find((i) => i.kind === 'meal' && i.slot === 'meal1');
    const meal2 = buildTimeline(input({ log })).find((i) => i.kind === 'meal' && i.slot === 'meal2');
    expect(meal1).toMatchObject({ proteinSoFarG: 10 + 53 });
    expect(meal2).toMatchObject({ proteinSoFarG: 10 + 53 + 64 });
    expect(buildTimeline(input({ log })).find((i) => i.kind === 'meal' && i.slot === 'meal3')).toMatchObject({ proteinSoFarG: null });
  });

  it('includes extras, workouts and check-ins at the time they were logged, and only that day\'s check-ins', () => {
    const workout: WorkoutLogEntry = { id: 'w', dateISO: `${DATE}T15:45:00`, templateId: null, label: 'Ngày A', durationMin: 14, caloriesBurned: 420 };
    const feelings: FeelingRecord[] = [
      { id: 'f1', loggedAtISO: `${DATE}T14:20:00`, cravingLevel: 2, hungerLevel: 3, mood: 'good', workoutCondition: null, note: '' },
      { id: 'f2', loggedAtISO: '2026-10-22T14:20:00', cravingLevel: 5, hungerLevel: 5, mood: 'tired', workoutCondition: null, note: '' },
    ];
    const items = buildTimeline(input({ workouts: [workout], feelings }));
    expect(items.find((i) => i.kind === 'workout')).toMatchObject({ minutes: 15 * 60 + 45, kcal: 420 });
    expect(items.filter((i) => i.kind === 'feeling')).toHaveLength(1);
    expect(items.find((i) => i.kind === 'feeling')).toMatchObject({ mood: 'good', minutes: 14 * 60 + 20 });
  });

  it('has no "now" marker on a past day and treats every item as past', () => {
    const items = buildTimeline(input({ dateKey: '2026-10-21', now: new Date('2026-10-23T16:10:00'), log: undefined }));
    expect(items.some((i) => i.kind === 'now')).toBe(false);
    const meal = items.find((i) => i.kind === 'meal');
    expect(meal).toMatchObject({ eaten: false, past: true });
  });

  it('flags photos by meal slot', () => {
    const items = buildTimeline(input({ photoSlots: new Set(['meal1']) }));
    expect(items.find((i) => i.kind === 'meal' && i.slot === 'meal1')).toMatchObject({ hasPhoto: true });
    expect(items.find((i) => i.kind === 'meal' && i.slot === 'meal2')).toMatchObject({ hasPhoto: false });
  });

  it('puts the marker last when everything has passed', () => {
    const items = buildTimeline(input({ now: new Date('2026-10-23T23:30:00') }));
    expect(items[items.length - 1].kind).toBe('now');
  });
});

describe('isoWeekNumber', () => {
  it('matches the ISO calendar, including year boundaries', () => {
    expect(isoWeekNumber(new Date('2026-10-24T09:00:00'))).toBe(43); // Saturday of week 43
    expect(isoWeekNumber(new Date('2026-10-19T00:00:00'))).toBe(43); // its Monday
    expect(isoWeekNumber(new Date('2026-10-18T23:59:00'))).toBe(42); // the Sunday before
    expect(isoWeekNumber(new Date('2026-01-01T12:00:00'))).toBe(1);
    expect(isoWeekNumber(new Date('2021-01-01T12:00:00'))).toBe(53); // belongs to the previous ISO year
    expect(isoWeekNumber(new Date('2026-12-31T12:00:00'))).toBe(53);
  });
});
