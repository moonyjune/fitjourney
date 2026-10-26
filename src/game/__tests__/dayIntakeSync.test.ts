import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => ({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined } }));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() }, from: jest.fn() } }));

import { limitsFrom } from '../../coach/clientSnapshot';
import { daysToPush, foodFills } from '../../sync/restore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';
import { dayHasFood, extraIntake, withIntakeCounters } from '../../utils/dayIntake';
import { evaluateDay } from '../missions';
import { DEFAULT_PLAN } from '../../constants/plan';

const item = (id: string, calories: number, proteinG: number): ExtraFoodItem => ({ id, name: id, calories, proteinG, loggedAtISO: '2026-10-26T05:00:00.000Z', mealTime: 'lunch' });
const log = (over: Partial<DailyNutritionLog>): DailyNutritionLog => ({ dateISO: '2026-10-26', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0, ...over });

describe('extraIntake', () => {
  it('sums the items and rounds once, whatever the stored counters say', () => {
    const l = log({ extraCalories: 9999, extraProteinG: 99, extraItems: [item('a', 333.4, 10.04), item('b', 333.4, 10.04), item('c', 333.4, 10.04)] });
    expect(extraIntake(l)).toEqual({ kcal: 1000, proteinG: 30.1 });
  });
  it('has no float drift from adding 0.1 + 0.2', () => {
    expect(extraIntake(log({ extraItems: [item('a', 100.1, 0.1), item('b', 200.2, 0.2)] }))).toEqual({ kcal: 300, proteinG: 0.3 });
  });
  it('falls back to the counters for a log without items', () => {
    expect(extraIntake(log({ extraCalories: 450.4, extraProteinG: 20.04 }))).toEqual({ kcal: 450, proteinG: 20 });
    expect(extraIntake(undefined)).toEqual({ kcal: 0, proteinG: 0 });
  });
  it('withIntakeCounters puts the item sums back into the counters', () => {
    const fixed = withIntakeCounters(log({ extraCalories: 5, extraItems: [item('a', 400, 30)] }));
    expect(fixed.extraCalories).toBe(400);
    expect(fixed.extraProteinG).toBe(30);
  });
  it('a day with only water is not a day of eating', () => {
    expect(dayHasFood(log({ waterMl: 3000 }))).toBe(false);
    expect(dayHasFood(log({ extraItems: [item('a', 100, 1)] }))).toBe(true);
    expect(dayHasFood(undefined)).toBe(false);
  });
});

describe('evaluateDay uses the items for the totals and rounds the deficit', () => {
  const base = { now: new Date('2026-10-27T10:00:00'), mealTemplatesByDayType: DEFAULT_PLAN.mealTemplates, workouts: [], proteinTargetG: 150 };
  it('eaten kcal, protein and deficit come from the items (counter drift ignored)', () => {
    const l = log({ extraCalories: 1, extraProteinG: 1, extraItems: [item('a', 700.4, 40.25), item('b', 650.4, 35.25)] });
    const day = evaluateDay({ ...base, dateKey: '2026-10-26', log: l, tdeeKcal: 2500.6 });
    expect(day.eatenKcal).toBe(1351);
    expect(day.proteinG).toBe(75.5);
    expect(day.deficitKcal).toBe(1150);
  });
  it('a water-only day has no deficit', () => {
    expect(evaluateDay({ ...base, dateKey: '2026-10-26', log: log({ waterMl: 3000 }), tdeeKcal: 2500 }).deficitKcal).toBeNull();
  });
});

describe('restore: days the device has without food', () => {
  const row = (date: string, items: ExtraFoodItem[], water = 0) => ({ entry_date: date, meals_eaten: {}, extra_calories: items.reduce((s, i) => s + i.calories, 0), extra_protein_g: 0, extra_items: items, water_ml: water });
  it('takes the cloud food for a local day that only has the default water, keeping the local water', () => {
    const local = { '2026-10-24': log({ dateISO: '2026-10-24', waterMl: 3000 }) };
    const fills = foodFills(local, [row('2026-10-24', [item('d1', 440, 20), item('d2', 436, 40)], 500)]);
    expect(fills['2026-10-24'].extraItems).toHaveLength(2);
    expect(fills['2026-10-24'].extraCalories).toBe(876);
    expect(fills['2026-10-24'].waterMl).toBe(3000);
  });
  it('leaves a day that already has food alone, and a day the device does not know', () => {
    const local = { '2026-10-24': log({ dateISO: '2026-10-24', extraItems: [item('mine', 100, 1)] }) };
    expect(foodFills(local, [row('2026-10-24', [item('d1', 440, 20)]), row('2026-10-25', [item('d2', 1, 1)])])).toEqual({});
  });
  it('sends up a day with food that the cloud has no food for', () => {
    const local = { '2026-10-24': log({ dateISO: '2026-10-24', extraItems: [item('a', 400, 1)] }), '2026-10-25': log({ dateISO: '2026-10-25', extraItems: [item('b', 400, 1)] }), '2026-10-26': log({ dateISO: '2026-10-26', waterMl: 3000 }) };
    const pushed = daysToPush(local, [row('2026-10-25', [item('b', 400, 1)]), row('2026-10-24', [], 3000)]);
    expect(pushed.map((l) => l.dateISO)).toEqual(['2026-10-24']);
  });
});

describe('client view', () => {
  it('limitsFrom keeps valid limits of the client over the defaults', () => {
    expect(limitsFrom({ purineMg: 900, saltG: 'x' }).purineMg).toBe(900);
    expect(limitsFrom(null).purineMg).toBeGreaterThan(0);
    expect(limitsFrom({ purineMg: 99999999 }).purineMg).not.toBe(99999999);
  });
});
