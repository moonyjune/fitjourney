import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockNet = jest.fn<() => Promise<{ isConnected: boolean; isInternetReachable: boolean }>>();
const mockUpsert = jest.fn<(...a: unknown[]) => Promise<{ error: unknown }>>();
const mockFrom = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => mockNet(), addEventListener: () => () => undefined },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), auth: { signOut: jest.fn() } },
}));

import { whenPushesSettled } from '../../sync/cloudSync';
import { mergeNutrition, reconcileNutrition } from '../../sync/restore';
import { useSyncQueueStore } from '../../sync/syncQueue';
import { useAuthStore } from '../../store/useAuthStore';
import { applyWaterTargetChange, useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { buildWaterSchedule, clampWaterWindow, dayWaterTargetMl, nextDrink, planAnchors, waterDrinkAmounts } from '../../water/schedule';
import { waterPlanFor } from '../../water/useWaterPlan';
import { DEFAULT_PLAN } from '../../constants/plan';
import { toDateKey } from '../../utils/date';

const clock = (c: { hour: number; minute: number }) => `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
const rows = () => mockUpsert.mock.calls.map((c) => c[0] as Record<string, unknown>);

beforeEach(() => {
  jest.clearAllMocks();
  useSyncQueueStore.setState({ pending: [] });
  mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockUpsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ upsert: (...a: unknown[]) => mockUpsert(...a), update: () => ({ eq: async () => ({ error: null }) }) });
  useAuthStore.setState({ session: { user: { id: 'user-123', email: 'a@b.c' } } as never, devMode: false });
  useNutritionStore.setState({ logs: {} });
  useSettingsStore.setState({ waterTargetMl: 4500, language: 'vi' });
});

describe('water drinks from the daily target', () => {
  it('splits the target into 500 ml drinks, the last one taking the rest', () => {
    expect(waterDrinkAmounts(4500)).toEqual(Array(9).fill(500));
    expect(waterDrinkAmounts(3500)).toEqual(Array(7).fill(500));
    expect(waterDrinkAmounts(3700)).toEqual([...Array(6).fill(500), 700]);
    expect(waterDrinkAmounts(3800)).toEqual([...Array(7).fill(500), 300]);
    expect(waterDrinkAmounts(400)).toEqual([400]);
    expect(waterDrinkAmounts(0)).toEqual([]);
  });

  it('spreads the drinks evenly over the waking day and adds up to exactly the target', () => {
    const s = buildWaterSchedule(3500);
    expect(s.map(clock)).toEqual(['06:00', '08:30', '11:00', '13:30', '16:00', '18:30', '21:00']);
    expect(s.map((c) => c.cumulativeTargetMl)).toEqual([500, 1000, 1500, 2000, 2500, 3000, 3500]);
    expect(s[0].label).toBe('Thức dậy - 1 ly nước ấm');
    expect(s[6].label).toBe('Ly cuối ngày (trước khi ngủ ~1 tiếng)');

    const big = buildWaterSchedule(4500, { startMinutes: 7 * 60, endMinutes: 22 * 60 });
    expect(big).toHaveLength(9);
    expect(clock(big[0])).toBe('07:00');
    expect(clock(big[8])).toBe('22:00');
    expect(big[8].cumulativeTargetMl).toBe(4500);
    // Times sit on 5-minute marks.
    expect(big.every((c) => c.minute % 5 === 0)).toBe(true);
  });

  it('names drinks after nearby meals and workouts without moving them', () => {
    const anchors = planAnchors(DEFAULT_PLAN.mealTemplates.training, DEFAULT_PLAN.workoutTemplates, true);
    const named = buildWaterSchedule(3500, { anchors, fasting: true, eatingStartHour: 12, language: 'en' });
    expect(named.map(clock)).toEqual(buildWaterSchedule(3500).map(clock));
    expect(named[1].label).toMatch(/workout|fast|Early|Mid-morning|breakfast/);
    expect(named.some((c) => /lunch|dinner|afternoon meal/.test(c.label))).toBe(true);
  });

  it('keeps the drinking window in range, at least 3 hours long', () => {
    expect(clampWaterWindow(2 * 60, 24 * 60)).toEqual({ start: 4 * 60, end: 23 * 60 + 30 });
    expect(clampWaterWindow(12 * 60, 13 * 60)).toEqual({ start: 12 * 60, end: 15 * 60 });
    expect(clampWaterWindow(undefined, undefined)).toEqual({ start: 6 * 60, end: 21 * 60 });
  });

  it('tells the next drink, a missed one to catch up on, or that the day is done', () => {
    const s = buildWaterSchedule(3500);
    const at = (h: number, m = 0) => new Date(2026, 9, 31, h, m);
    expect(nextDrink(s, 0, at(5))).toMatchObject({ ml: 500, hour: 6, minute: 0, overdue: false });
    expect(nextDrink(s, 500, at(9))).toMatchObject({ ml: 500, hour: 8, minute: 30, overdue: true });
    expect(nextDrink(s, 500, at(12))).toMatchObject({ ml: 1000, hour: 11, minute: 0, overdue: true });
    expect(nextDrink(s, 3500, at(22))).toBeNull();
  });

  it('builds a day from its own target', () => {
    const plan = waterPlanFor({ targetMl: 3500, date: new Date(2026, 9, 31, 12), plan: DEFAULT_PLAN, startMinutes: 360, endMinutes: 1260, fasting: true, language: 'vi' });
    expect(plan.targetMl).toBe(3500);
    expect(plan.schedule).toHaveLength(7);
  });
});

describe('the water target of each day', () => {
  const today = toDateKey(new Date());

  it('reads the day’s own target, else the current setting', () => {
    expect(dayWaterTargetMl({ waterTargetMl: 3500 }, 4500)).toBe(3500);
    expect(dayWaterTargetMl({}, 4500)).toBe(4500);
    expect(dayWaterTargetMl(undefined, 3000)).toBe(3000);
  });

  it('stamps a day with the setting when it is saved, and sends the target with the day', async () => {
    useNutritionStore.getState().addWater(today, 500);
    await whenPushesSettled();
    expect(useNutritionStore.getState().logs[today].waterTargetMl).toBe(4500);
    expect(rows().at(-1)).toMatchObject({ entry_date: today, water_ml: 500, water_target_ml: 4500 });
  });

  it('on a change of the setting, today follows it and past days keep the target they were lived under', async () => {
    useNutritionStore.setState({
      logs: {
        '2026-10-01': { dateISO: '2026-10-01', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 4000 },
        '2026-10-02': { dateISO: '2026-10-02', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 3000, waterTargetMl: 3000 },
        [today]: { dateISO: today, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 1000, waterTargetMl: 4500 },
      },
    });
    useSettingsStore.getState().updateSettings({ waterTargetMl: 3500 });
    await whenPushesSettled();
    const logs = useNutritionStore.getState().logs;
    expect(logs['2026-10-01'].waterTargetMl).toBe(4500);
    expect(logs['2026-10-02'].waterTargetMl).toBe(3000);
    expect(logs[today].waterTargetMl).toBe(3500);
    expect(rows().find((r) => r.entry_date === today)).toMatchObject({ water_target_ml: 3500 });

    // An edit of a past day later keeps that day's target.
    useNutritionStore.getState().addWater('2026-10-01', 250);
    expect(useNutritionStore.getState().logs['2026-10-01'].waterTargetMl).toBe(4500);
  });

  it('leaves the days alone when there was no earlier target to keep and no log today', () => {
    useNutritionStore.setState({ logs: { '2026-10-01': { dateISO: '2026-10-01', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 } } });
    const before = useNutritionStore.getState().logs;
    applyWaterTargetChange(4500, 0, today);
    expect(useNutritionStore.getState().logs).toBe(before);
  });

  it('still saves the day when the cloud has no water_target_ml column yet', async () => {
    mockUpsert.mockImplementation(async (row: unknown) =>
      'water_target_ml' in (row as object) ? { error: { code: 'PGRST204', message: "Could not find the 'water_target_ml' column" } } : { error: null }
    );
    useNutritionStore.getState().addWater(today, 500);
    await whenPushesSettled();
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).not.toHaveProperty('water_target_ml');
    expect(rows()[1]).toMatchObject({ water_ml: 500 });
    expect(useSyncQueueStore.getState().pending).toEqual([]);
  });

  it('restores each day’s target from the cloud, keeping this device’s when the cloud row has none', () => {
    const row = (date: string, target: number | null) => ({ entry_date: date, meals_eaten: {}, extra_calories: 0, extra_protein_g: 0, extra_items: [], water_ml: 1000, water_target_ml: target });
    const merged = mergeNutrition({}, [row('2026-10-01', 3500), row('2026-10-02', null)]);
    expect(merged['2026-10-01'].waterTargetMl).toBe(3500);
    expect(merged['2026-10-02'].waterTargetMl).toBeUndefined();

    const local = { '2026-10-02': { dateISO: '2026-10-02', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 1000, waterTargetMl: 3000 } };
    const out = reconcileNutrition(local, [row('2026-10-01', 3500), row('2026-10-02', null)], new Set());
    expect(out['2026-10-01'].waterTargetMl).toBe(3500);
    expect(out['2026-10-02'].waterTargetMl).toBe(3000);
  });
});
