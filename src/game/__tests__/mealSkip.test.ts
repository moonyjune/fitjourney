import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushUserData = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
  pushProofPhoto: jest.fn(),
}));

import { DEFAULT_MEAL_TEMPLATES } from '../../constants/plan';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';
import { isFasting, setFastingState, setSkipBreakfastState, skipsBreakfast } from '../../utils/mealMode';
import { useMealModeStore } from '../../store/useMealModeStore';
import { cleanSkipEntries, cleanSkippedMeals, daysFromEntries, mergeSkipEntries, mergeSkippedMeals, readSkippedPayload, skippedPayload, useSkippedMealStore } from '../../store/useSkippedMealStore';
import { mealDefs } from '../mealSlots';
import { evaluateDay } from '../missions';
import { computeGameState } from '../state';

// Fri 23 Oct 2026.
const FRIDAY = '2026-10-23';
const THURSDAY = '2026-10-22';
const base = { mealTemplatesByDayType: DEFAULT_MEAL_TEMPLATES, tdeeKcal: 2694, proteinTargetG: 200, workouts: [] };

function item(id: string, dateKey: string, mealTime: ExtraFoodItem['mealTime'], calories: number, name = 'Cơm gà'): ExtraFoodItem {
  const hour = mealTime === 'breakfast' ? '07' : mealTime === 'lunch' ? '12' : '19';
  return { id, name, calories, proteinG: 20, mealTime, loggedAtISO: `${dateKey}T${hour}:30:00` };
}
function log(dateKey: string, items: ExtraFoodItem[]): DailyNutritionLog {
  return { dateISO: dateKey, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: items, waterMl: 0 };
}
/** A normal day with lunch and dinner logged, breakfast not. */
const noBreakfast = (dateKey: string) => log(dateKey, [item('l', dateKey, 'lunch', 600), item('d', dateKey, 'dinner', 700)]);

beforeEach(() => {
  mockPushUserData.mockClear();
  setFastingState(false);
  setSkipBreakfastState(false);
});
afterEach(() => {
  useMealModeStore.setState({ fasting: true, skipBreakfast: false });
  useSkippedMealStore.setState({ days: {}, entries: {} });
  setFastingState(true);
  setSkipBreakfastState(false);
});

describe('"I skip breakfast" (normal mode)', () => {
  it('drops breakfast from a normal day, and lunch and dinner share the whole day', () => {
    const all = mealDefs(false, []);
    expect(all.map((d) => d.id)).toEqual(['breakfast', 'lunch', 'dinner']);
    const two = mealDefs(false, [], true);
    expect(two.map((d) => d.id)).toEqual(['lunch', 'dinner']);
    expect(two.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(all.reduce((s, d) => s + d.weight, 0));
    expect(two.find((d) => d.id === 'lunch')?.endMinutes).toBe(all.find((d) => d.id === 'lunch')?.endMinutes);
    // A fasting plan's meals are untouched.
    const plan = DEFAULT_MEAL_TEMPLATES.training;
    expect(mealDefs(true, plan, true).map((d) => d.id)).toEqual(plan.map((m) => m.slot));
  });

  it('breakfast is never missing nor still to come, and the day still expects the same kcal', () => {
    const past = { ...base, dateKey: THURSDAY, now: new Date(`${FRIDAY}T08:00:00`), log: noBreakfast(THURSDAY) };
    expect(evaluateDay(past).missingMeals.map((m) => m.id)).toEqual(['breakfast']);

    const early = { ...base, dateKey: FRIDAY, now: new Date(`${FRIDAY}T08:00:00`), log: log(FRIDAY, [item('s', FRIDAY, 'breakfast', 50, 'Cà phê')]) };
    const before = evaluateDay(early);
    expect(before.pendingMeals.map((m) => m.id)).toEqual(['breakfast', 'lunch', 'dinner']);

    setSkipBreakfastState(true);
    expect(evaluateDay(past).missingMeals).toEqual([]);
    const after = evaluateDay(early);
    expect(after.pendingMeals.map((m) => m.id)).toEqual(['lunch', 'dinner']);
    const sum = (meals: { kcal: number }[]) => meals.reduce((s, m) => s + m.kcal, 0);
    expect(Math.abs(sum(after.pendingMeals) - sum(before.pendingMeals))).toBeLessThanOrEqual(1); // rounding only
  });

  it('the store saves the setting to the cloud with the meal mode and mirrors it into the pure helpers', () => {
    useMealModeStore.getState().setFasting(false);
    useMealModeStore.getState().setSkipBreakfast(true);
    expect(skipsBreakfast()).toBe(true);
    expect(isFasting()).toBe(false);
    expect(mockPushUserData).toHaveBeenLastCalledWith('mealMode', { fasting: false, skipBreakfast: true });
    useMealModeStore.getState().setSkipBreakfast(false);
    expect(skipsBreakfast()).toBe(false);
    expect(mockPushUserData).toHaveBeenLastCalledWith('mealMode', { fasting: false, skipBreakfast: false });
  });
});

describe('per-day "Skipped" meal', () => {
  it('a skipped meal of a past day is no longer missing, and is listed as skipped', () => {
    const day = evaluateDay({ ...base, dateKey: THURSDAY, now: new Date(`${FRIDAY}T08:00:00`), log: noBreakfast(THURSDAY), skippedMealIds: ['breakfast'] });
    expect(day.settled).toBe(true);
    expect(day.missingMeals).toEqual([]);
    expect(day.skippedMeals.map((m) => m.id)).toEqual(['breakfast']);
  });

  it("the diary's own \"Không ăn\" mark counts as skipped too", () => {
    const l = noBreakfast(THURSDAY);
    l.extraItems = [...(l.extraItems ?? []), item('k', THURSDAY, 'breakfast', 0, 'Không ăn')];
    expect(evaluateDay({ ...base, dateKey: THURSDAY, now: new Date(`${FRIDAY}T08:00:00`), log: l }).missingMeals).toEqual([]);
  });

  it('today settles once only skipped meals are left: final deficit, deficit mission earned, no pending boss damage', () => {
    setFastingState(true);
    const now = new Date(`${FRIDAY}T16:10:00`);
    const todayLog: DailyNutritionLog = { dateISO: FRIDAY, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 };
    const input = { ...base, dateKey: FRIDAY, now, log: todayLog };
    const pending = evaluateDay(input);
    expect(pending.settled).toBe(false);
    expect(pending.pendingMeals.map((m) => m.id)).toEqual(['meal3']);

    const skipped = evaluateDay({ ...input, skippedMealIds: ['meal3'] });
    expect(skipped.settled).toBe(true);
    expect(skipped.pendingMeals).toEqual([]);
    expect(skipped.projectedDeficitKcal).toBeNull();
    expect(skipped.missingMeals).toEqual([]);
    expect(skipped.missions.find((m) => m.id === 'deficit')?.status).toBe('done');

    const replay = (skippedMeals?: Record<string, string[]>) =>
      computeGameState({ now, startDateISO: `${FRIDAY}T08:00:00`, logs: { [FRIDAY]: todayLog }, workoutEntries: [], mealTemplatesByDayType: DEFAULT_MEAL_TEMPLATES, tdeeKcal: 2694, proteinTargetG: 200, skippedMeals });
    const open = replay();
    expect(open.today.settled).toBe(false);
    expect(open.boss.pendingDamage).toBeGreaterThan(0);
    const settled = replay({ [FRIDAY]: ['meal3'] });
    expect(settled.today.settled).toBe(true);
    expect(settled.boss.pendingDamage).toBe(0);
  });

  it('the store toggles a skip on and off (undo) and saves every change to the cloud', () => {
    useSkippedMealStore.getState().toggle(THURSDAY, 'breakfast');
    expect(useSkippedMealStore.getState().isSkipped(THURSDAY, 'breakfast')).toBe(true);
    expect(mockPushUserData).toHaveBeenLastCalledWith('skippedMeals', {
      v: 2,
      entries: { [THURSDAY]: { breakfast: { skipped: true, at: expect.any(Number) } } },
      days: { [THURSDAY]: ['breakfast'] },
    });
    const skippedAt = useSkippedMealStore.getState().entries[THURSDAY].breakfast.at;
    useSkippedMealStore.getState().toggle(THURSDAY, 'breakfast');
    expect(useSkippedMealStore.getState().isSkipped(THURSDAY, 'breakfast')).toBe(false);
    // The undo is kept as a mark of its own (newer than the skip), so another device's older skip cannot bring it back.
    const undo = useSkippedMealStore.getState().entries[THURSDAY].breakfast;
    expect(undo.skipped).toBe(false);
    expect(undo.at).toBeGreaterThan(skippedAt);
    expect(mockPushUserData).toHaveBeenLastCalledWith('skippedMeals', { v: 2, entries: { [THURSDAY]: { breakfast: undo } }, days: {} });
  });

  it('last writer wins per (day, meal): an un-skip on one device survives an older skip synced later from another', () => {
    const deviceA = { [THURSDAY]: { lunch: { skipped: false, at: 2000 }, dinner: { skipped: true, at: 1500 } } };
    const deviceB = { [THURSDAY]: { lunch: { skipped: true, at: 1000 }, dinner: { skipped: false, at: 1400 } }, [FRIDAY]: { meal3: { skipped: true, at: 900 } } };
    const merged = mergeSkipEntries(deviceA, deviceB);
    expect(merged).toEqual(mergeSkipEntries(deviceB, deviceA));
    expect(merged[THURSDAY]).toEqual({ dinner: { skipped: true, at: 1500 }, lunch: { skipped: false, at: 2000 } });
    expect(daysFromEntries(merged)).toEqual({ [FRIDAY]: ['meal3'], [THURSDAY]: ['dinner'] });
    // An un-skip newer than the skip wins even when it comes from the cloud.
    expect(daysFromEntries(mergeSkipEntries({ [THURSDAY]: { lunch: { skipped: true, at: 10 } } }, { [THURSDAY]: { lunch: { skipped: false, at: 11 } } }))).toEqual({});
  });

  it('reads the old { days } payload as skips with no time; any timed mark beats them; equal times keep the skip', () => {
    const old = readSkippedPayload({ days: { [THURSDAY]: ['lunch', 'lunch'], bad: ['x'] } });
    expect(old).toEqual({ [THURSDAY]: { lunch: { skipped: true, at: 0 } } });
    expect(daysFromEntries(mergeSkipEntries(old, { [THURSDAY]: { lunch: { skipped: false, at: 5 } } }))).toEqual({});
    expect(mergeSkipEntries({ [THURSDAY]: { lunch: { skipped: false, at: 0 } } }, old)[THURSDAY].lunch.skipped).toBe(true);
    // The new payload: entries win over the days list written beside them.
    const payload = skippedPayload({ [FRIDAY]: { dinner: { skipped: true, at: 7 }, lunch: { skipped: false, at: 8 } } });
    expect(payload.days).toEqual({ [FRIDAY]: ['dinner'] });
    expect(readSkippedPayload({ ...payload, days: { [FRIDAY]: ['lunch'] } })).toEqual(payload.entries);
    expect(readSkippedPayload(null)).toEqual({});
  });

  it('keeps only valid marks and the newest 400 days', () => {
    expect(cleanSkipEntries({ [THURSDAY]: { a: { skipped: 'yes', at: 1 }, b: { skipped: true, at: -3 }, c: null }, x: {}, [FRIDAY]: {} })).toEqual({ [THURSDAY]: { b: { skipped: true, at: 0 } } });
    const many: Record<string, Record<string, { skipped: boolean; at: number }>> = {};
    for (let i = 0; i < 450; i++) many[new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)] = { lunch: { skipped: false, at: i + 1 } };
    const kept = Object.keys(cleanSkipEntries(many));
    expect(kept).toHaveLength(400);
    expect(kept).not.toContain('2025-01-01');
  });

  it('a device saved with the old format moves its skips into marks when it loads', async () => {
    const options = useSkippedMealStore.persist.getOptions();
    const migrated = (await options.migrate!({ days: { [THURSDAY]: ['meal3'] } }, 0)) as { days: unknown; entries: unknown };
    expect(migrated).toEqual({ days: { [THURSDAY]: ['meal3'] }, entries: { [THURSDAY]: { meal3: { skipped: true, at: 0 } } } });
  });

  it('cleans and joins the per-day marks from the cloud', () => {
    expect(cleanSkippedMeals({ [THURSDAY]: ['lunch', 'lunch', 3, ''], bad: ['x'], [FRIDAY]: [] })).toEqual({ [THURSDAY]: ['lunch'] });
    expect(cleanSkippedMeals(null)).toEqual({});
    expect(mergeSkippedMeals({ [THURSDAY]: ['lunch'] }, { [THURSDAY]: ['breakfast'], [FRIDAY]: ['dinner'] })).toEqual({
      [FRIDAY]: ['dinner'],
      [THURSDAY]: ['breakfast', 'lunch'],
    });
  });
});
