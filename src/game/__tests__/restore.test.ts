import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }), addEventListener: () => () => undefined },
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

type Row = Record<string, unknown>;
let mockOnline = true;
let mockFailTable: string | null = null;
const mockDb: Record<string, Row[]> = {};
const mockRequests: { table: string; from?: number }[] = [];
let mockIdCounter = 0;

const KEYS: Record<string, string[]> = {
  weight_entries: ['user_id', 'client_id'],
  workout_entries: ['user_id', 'client_id'],
  nutrition_logs: ['user_id', 'entry_date'],
  habits: ['user_id', 'client_id'],
  habit_checks: ['user_id', 'habit_client_id', 'entry_date'],
  uric_readings: ['user_id', 'client_id'],
  user_data: ['user_id', 'key'],
};

function mockUpsert(table: string, row: Row) {
  const rows = (mockDb[table] ??= []);
  const keys = KEYS[table];
  const at = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
  if (at >= 0) rows[at] = { ...rows[at], ...row };
  else rows.push({ id: `row-${++mockIdCounter}`.padStart(12, '0'), ...row });
}

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    from: (table: string) => ({
      upsert: async (row: Row) => {
        mockUpsert(table, row);
        return { error: null };
      },
      select: () => {
        let filter: Row = {};
        let range: [number, number] | null = null;
        const query = {
          eq: (col: string, val: unknown) => {
            filter = { ...filter, [col]: val };
            return query;
          },
          order: () => query,
          range: (a: number, b: number) => {
            range = [a, b];
            return query;
          },
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            mockRequests.push({ table, from: range?.[0] });
            if (mockFailTable === table) return Promise.resolve({ data: null, error: new Error('boom') }).then(resolve, reject);
            let rows = (mockDb[table] ?? []).filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
            rows = [...rows].sort((x, y) => String(x.id ?? '').localeCompare(String(y.id ?? '')));
            if (range) rows = rows.slice(range[0], range[1] + 1);
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          },
        };
        return query;
      },
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  },
}));

import { WATER_DEFAULT_ML } from '../../store/useNutritionStore';
import { waterFills, mergeChecks, mergeNutrition, mergeWeights, mergeWorkouts, restoreOwnData } from '../../sync/restore';
import { whenPushesSettled } from '../../sync/cloudSync';
import { applyDiaryImport, type DiaryImportFile } from '../../import/diaryImport';
import { useAuthStore } from '../../store/useAuthStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useHabitStore } from '../../store/useHabitStore';
import { useLearnStore } from '../../store/useLearnStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { resetAllLocalStores } from '../../store/resetLocalStores';
import { useUricStore } from '../../store/useUricStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useSyncQueueStore } from '../../sync/syncQueue';

const signIn = (id = 'user-1') => useAuthStore.setState({ session: { user: { id, email: 'a@b.c' } } as never, devMode: false });

const item = (id: string, name: string, calories: number, extra: Record<string, unknown> = {}) => ({
  id, name, calories, proteinG: 10, loggedAtISO: '2026-10-01T05:00:00.000Z', mealTime: 'lunch', purineMg: 20, saltG: 1.5, sugarG: 3, ...extra,
});

const diary = (): DiaryImportFile =>
  ({
    format: 'fitjourney-diary',
    version: 1,
    weights: [
      { id: 'diary-w-20261001-1', dateISO: '2026-10-01T05:00:00.000Z', weightKg: 106.5, note: 'Sáng' },
      { id: 'diary-w-20261001-2', dateISO: '2026-10-01T14:00:00.000Z', weightKg: 107.7, note: 'Cân tối' },
      { id: 'diary-w-20261002-1', dateISO: '2026-10-02T05:00:00.000Z', weightKg: 106 },
    ],
    nutrition: [
      { dateISO: '2026-10-01', items: [item('diary-20261001-1', 'Cơm gà', 500), item('diary-20261001-2', 'Xúc xích', 150, { junk: true })] },
      { dateISO: '2026-10-02', items: [item('diary-20261002-1', 'Phở', 400)] },
    ],
    workouts: [{ id: 'diary-20261001-1', dateISO: '2026-10-01T05:00:00.000Z', templateId: null, label: 'Đi bộ dốc', durationMin: 40, caloriesBurned: 370 }],
    habits: [{ id: 'diary-h-01', name: 'Uống nước', status: 'building', assessment: 'ổn', kaizen: 'rải đều', measuredBy: 'lít', tracked: true, auto: 'water', sort: 1, archived: false }],
    learnNotes: { '1': 'Ghi chú của tôi' },
    uric: [{ id: 'diary-u-1', dateKey: '2026-10-16', valueUmol: 457, note: 'Xét nghiệm' }],
  }) as unknown as DiaryImportFile;

const snapshot = () => ({
  weights: useWeightStore.getState().entries,
  logs: useNutritionStore.getState().logs,
  workouts: useWorkoutStore.getState().entries,
  habits: useHabitStore.getState().habits,
  checks: useHabitStore.getState().checks,
  uric: useUricStore.getState().readings,
  target: useUricStore.getState().targetUmol,
  notes: useLearnStore.getState().notes,
  limits: (({ purineMg, saltG, sugarG }) => ({ purineMg, saltG, sugarG }))(useLimitsStore.getState()),
  custom: useFoodDbStore.getState().custom,
  overrides: useFoodDbStore.getState().overrides,
});

beforeEach(() => {
  mockOnline = true;
  mockFailTable = null;
  mockRequests.length = 0;
  for (const k of Object.keys(mockDb)) delete mockDb[k];
  resetAllLocalStores();
  signIn();
});

describe('restore from the cloud', () => {
  it('after import and sign-out, signing back in brings every record and setting back unchanged', async () => {
    applyDiaryImport(diary());
    useHabitStore.getState().setCheck('2026-10-01', 'diary-h-01', 'done');
    useHabitStore.getState().setCheck('2026-10-02', 'diary-h-01', 'missed');
    useUricStore.getState().nudgeTarget(-1);
    useLimitsStore.getState().nudge('purineMg', -1);
    useLimitsStore.getState().nudge('saltG', 1);
    const food = useFoodDbStore.getState().addCustom({ name: 'Bánh mì nhà làm', group: 'starch', unit: 'cái', unitG: 80, kcal: 250, proteinG: 8, purineMg: 20, sugarG: 3, sodiumMg: 400, confidence: 'medium' });
    useFoodDbStore.getState().updateFood('b-1', { ...food, name: 'Sửa nhãn' });
    await whenPushesSettled();
    const before = snapshot();
    expect(useSyncQueueStore.getState().pending).toHaveLength(0);

    resetAllLocalStores(); // what signing out does
    expect(useWeightStore.getState().entries).toHaveLength(0);
    signIn();
    const result = await restoreOwnData();

    expect(result).toMatchObject({ ok: true, weights: 3, days: 2, workouts: 1, habits: 1, uric: 1 });
    const after = snapshot();
    expect(after.weights).toEqual(before.weights);
    expect(after.logs).toEqual(before.logs);
    expect(after.workouts).toEqual(before.workouts);
    expect(after.habits).toEqual(before.habits);
    expect(after.checks).toEqual(before.checks);
    expect(after.uric).toEqual(before.uric);
    expect(after.target).toBe(350);
    expect(after.notes).toEqual({ '1': 'Ghi chú của tôi' });
    expect(after.limits).toEqual(before.limits);
    expect(after.custom).toEqual(before.custom);
    expect(after.overrides).toEqual(before.overrides);
    expect(after.logs['2026-10-01'].extraItems.map((i) => i.name)).toEqual(['Cơm gà', 'Xúc xích']);
    expect(after.logs['2026-10-01'].extraItems[1].junk).toBe(true);
  });

  it('restoring twice changes nothing (no duplicates)', async () => {
    applyDiaryImport(diary());
    await whenPushesSettled();
    resetAllLocalStores();
    signIn();
    await restoreOwnData();
    const once = snapshot();
    const second = await restoreOwnData();
    expect(second).toMatchObject({ ok: true, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 });
    expect(snapshot()).toEqual(once);
  });

  it('what is already on the device wins over the cloud copy', async () => {
    applyDiaryImport(diary());
    await whenPushesSettled();
    // The device has a different version of 1 Oct, a changed habit and another target.
    useNutritionStore.setState((s) => ({ logs: { ...s.logs, '2026-10-01': { ...s.logs['2026-10-01'], waterMl: 777 } } }));
    useHabitStore.getState().setCheck('2026-10-01', 'diary-h-01', 'missed');
    mockDb.habit_checks = [{ id: 'x1', user_id: 'user-1', habit_client_id: 'diary-h-01', entry_date: '2026-10-01', value: 'done' }];
    await restoreOwnData();
    expect(useNutritionStore.getState().logs['2026-10-01'].waterMl).toBe(777);
    expect(useHabitStore.getState().checks['2026-10-01']['diary-h-01']).toBe('missed');
  });

  it('a day the device has with no water takes the cloud figure (e.g. water seeded in SQL), a typed figure is kept', async () => {
    mockDb.nutrition_logs = [
      { id: 'n1', user_id: 'user-1', entry_date: '2026-10-01', water_ml: 3000, extra_items: [], meals_eaten: {} },
      { id: 'n2', user_id: 'user-1', entry_date: '2026-10-02', water_ml: 3000, extra_items: [], meals_eaten: {} },
    ];
    const day = (d: string, waterMl: number) => ({ dateISO: d, mealsEaten: {}, extraCalories: 5, extraProteinG: 0, extraItems: [], waterMl });
    useNutritionStore.setState({ logs: { '2026-10-01': day('2026-10-01', 0), '2026-10-02': day('2026-10-02', 1200) } });
    signIn();
    await restoreOwnData();
    const logs = useNutritionStore.getState().logs;
    expect(logs['2026-10-01'].waterMl).toBe(3000);
    expect(logs['2026-10-01'].extraCalories).toBe(5);
    expect(logs['2026-10-02'].waterMl).toBe(1200);
  });

  it('a failed request leaves the device as it was and reports not ok', async () => {
    applyDiaryImport(diary());
    await whenPushesSettled();
    resetAllLocalStores();
    signIn();
    mockFailTable = 'habit_checks';
    const result = await restoreOwnData();
    expect(result.ok).toBe(false);
    expect(useWeightStore.getState().entries).toHaveLength(0);
    expect(useNutritionStore.getState().logs).toEqual({});
    mockFailTable = null;
    expect((await restoreOwnData()).ok).toBe(true);
    expect(useWeightStore.getState().entries).toHaveLength(3);
  });

  it('does nothing when signed out or on the offline Dev login', async () => {
    useAuthStore.setState({ session: null, devMode: false });
    expect((await restoreOwnData()).ok).toBe(false);
    useAuthStore.setState({ session: { user: { id: 'user-1' } } as never, devMode: true });
    expect((await restoreOwnData()).ok).toBe(false);
    expect(mockRequests).toHaveLength(0);
  });

  it('reads only the signed-in user’s rows', async () => {
    mockDb.uric_readings = [
      { id: 'a', user_id: 'user-1', client_id: 'u-a', entry_date: '2026-10-16', value_umol: '450', note: '' },
      { id: 'b', user_id: 'someone-else', client_id: 'u-b', entry_date: '2026-10-17', value_umol: '300', note: '' },
    ];
    await restoreOwnData();
    expect(useUricStore.getState().readings.map((r) => r.id)).toEqual(['u-a']);
    expect(useUricStore.getState().readings[0].valueUmol).toBe(450);
  });

  it('reads every page of a large table (the server returns at most 1000 rows per request)', async () => {
    mockDb.habit_checks = Array.from({ length: 2500 }, (_, i) => ({
      id: `c${String(i).padStart(5, '0')}`, user_id: 'user-1', habit_client_id: `h-${i % 10}`, entry_date: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (Math.floor(i / 12) % 28)).padStart(2, '0')}`, value: 'done',
    }));
    const expected = new Set(mockDb.habit_checks.map((r) => `${r.entry_date}|${r.habit_client_id}`)).size;
    await restoreOwnData();
    const total = Object.values(useHabitStore.getState().checks).reduce((n, d) => n + Object.keys(d).length, 0);
    expect(total).toBe(expected);
    expect(mockRequests.filter((r) => r.table === 'habit_checks').map((r) => r.from)).toEqual([0, 1000, 2000]);
  });

  it('keeps the device’s own note and food edit when the cloud has another version, and adds what only the cloud has', async () => {
    useLearnStore.setState({ notes: { '1': 'bản trên máy' } });
    useFoodDbStore.setState({ custom: [], overrides: { 'b-1': { name: 'Nhãn trên máy' } } });
    mockDb.user_data = [
      { user_id: 'user-1', key: 'learnNotes', value: { '1': 'bản trên cloud', '2': 'chỉ có trên cloud' } },
      { user_id: 'user-1', key: 'foodDb', value: { custom: [{ id: 'c-9', name: 'Món cloud' }], overrides: { 'b-1': { name: 'Nhãn cloud' }, 'b-2': { name: 'Nhãn khác' } } } },
    ];
    await restoreOwnData();
    expect(useLearnStore.getState().notes).toEqual({ '1': 'bản trên máy', '2': 'chỉ có trên cloud' });
    expect(useFoodDbStore.getState().overrides).toEqual({ 'b-1': { name: 'Nhãn trên máy' }, 'b-2': { name: 'Nhãn khác' } });
    expect(useFoodDbStore.getState().custom.map((f) => f.id)).toEqual(['c-9']);
  });

  describe('meal mode (fasting on or off)', () => {
    const cloud = (value: unknown) => {
      mockDb.user_data = [{ user_id: 'user-1', key: 'mealMode', value }];
    };

    it('a device still on the default (fasting on) takes the cloud\'s "off"', async () => {
      cloud({ fasting: false });
      await restoreOwnData();
      expect(useMealModeStore.getState().fasting).toBe(false);
    });

    it('a device that chose off keeps it and saves it to the cloud when the cloud does not have it', async () => {
      useMealModeStore.setState({ fasting: false });
      await restoreOwnData();
      expect(useMealModeStore.getState().fasting).toBe(false);
      await whenPushesSettled();
      expect(mockDb.user_data.find((r) => r.key === 'mealMode')?.value).toEqual({ fasting: false });
    });

    it('a device that chose off and a cloud that says on: the device wins and the cloud is updated', async () => {
      useMealModeStore.setState({ fasting: false });
      cloud({ fasting: true });
      await restoreOwnData();
      expect(useMealModeStore.getState().fasting).toBe(false);
      await whenPushesSettled();
      expect(mockDb.user_data.find((r) => r.key === 'mealMode')?.value).toEqual({ fasting: false });
    });

    it('fasting on everywhere changes nothing and writes nothing; a nonsense cloud value is ignored', async () => {
      await restoreOwnData();
      expect(useMealModeStore.getState().fasting).toBe(true);
      cloud({ fasting: 'no' });
      await restoreOwnData();
      expect(useMealModeStore.getState().fasting).toBe(true);
      await whenPushesSettled();
      expect(mockDb.user_data.filter((r) => r.key === 'mealMode')).toHaveLength(1); // only the nonsense row seeded above
      expect(mockDb.user_data.find((r) => r.key === 'mealMode')?.value).toEqual({ fasting: 'no' });
    });

    it('signing out puts the mode back to fasting on', () => {
      useMealModeStore.setState({ fasting: false });
      resetAllLocalStores();
      expect(useMealModeStore.getState().fasting).toBe(true);
    });
  });

  it('puts nothing on the device when the account changed while the requests were running', async () => {
    mockDb.uric_readings = [{ id: 'a', user_id: 'user-1', client_id: 'u-a', entry_date: '2026-10-16', value_umol: '450', note: '' }];
    const pending = restoreOwnData();
    signIn('user-2');
    expect((await pending).ok).toBe(false);
    expect(useUricStore.getState().readings).toEqual([]);
  });

  it('settings only on the device are saved to the cloud by the restore (older installs)', async () => {
    useUricStore.setState({ targetUmol: 330 });
    useLimitsStore.setState({ purineMg: 600 });
    useLearnStore.setState({ notes: { '3': 'x' } });
    await restoreOwnData();
    await whenPushesSettled();
    const stored = Object.fromEntries((mockDb.user_data ?? []).map((r) => [r.key, r.value]));
    expect(stored.uricTarget).toBe(330);
    expect(stored.limits).toMatchObject({ purineMg: 600 });
    expect(stored.learnNotes).toEqual({ '3': 'x' });
  });

  it('cloud settings fill in defaults but ignore values outside the allowed range', async () => {
    mockDb.user_data = [
      { user_id: 'user-1', key: 'uricTarget', value: 9999 },
      { user_id: 'user-1', key: 'limits', value: { purineMg: 600, saltG: 99, sugarG: 35 } },
    ];
    await restoreOwnData();
    expect(useUricStore.getState().targetUmol).toBe(360);
    expect(useLimitsStore.getState().purineMg).toBe(600);
    expect(useLimitsStore.getState().saltG).not.toBe(99);
    expect(useLimitsStore.getState().sugarG).toBe(35);
  });
});

describe('merge rules', () => {
  const row = (extra: Row) => ({ id: 'r1', user_id: 'u', ...extra });

  it('weights: numeric strings are numbers, the saved time is kept, rows without one get the diary’s midday', () => {
    const added = mergeWeights([], [
      row({ id: 'a', client_id: 'w1', entry_date: '2026-10-01', weight_kg: '106.5', logged_at: '2026-10-01T05:00:00+00:00', note: 'Sáng' }),
      row({ id: 'b', client_id: null, entry_date: '2026-10-03', weight_kg: '105', logged_at: null, note: null }),
    ]);
    expect(added).toEqual([
      { id: 'w1', dateISO: '2026-10-01T05:00:00.000Z', weightKg: 106.5, note: 'Sáng' },
      { id: 'cloud-b', dateISO: '2026-10-03T05:00:00.000Z', weightKg: 105 },
    ]);
  });

  it('weights: old rows without an id are not added when the same reading is already known (here or in the cloud)', () => {
    const local = [{ id: 'diary-w-1', dateISO: '2026-10-01T05:00:00.000Z', weightKg: 106.5 }];
    const added = mergeWeights(local, [
      row({ id: 'a', client_id: null, entry_date: '2026-10-01', weight_kg: '106.5' }),
      row({ id: 'b', client_id: 'w2', entry_date: '2026-10-02', weight_kg: '105', logged_at: null }),
      row({ id: 'c', client_id: null, entry_date: '2026-10-02', weight_kg: '105' }),
      row({ id: 'd', client_id: null, entry_date: '2026-10-04', weight_kg: '104' }),
      row({ id: 'e', client_id: null, entry_date: '2026-10-04', weight_kg: '104' }),
    ]);
    expect(added.map((w) => w.id)).toEqual(['w2', 'cloud-d']);
  });

  it('weights: two readings of one day without a saved time keep their order a minute apart', () => {
    const added = mergeWeights([], [
      row({ id: 'a', client_id: 'w1', entry_date: '2026-10-01', weight_kg: '106', logged_at: null }),
      row({ id: 'b', client_id: 'w2', entry_date: '2026-10-01', weight_kg: '107', logged_at: null }),
    ]);
    expect(added.map((w) => w.dateISO)).toEqual(['2026-10-01T05:00:00.000Z', '2026-10-01T05:01:00.000Z']);
  });

  it('weights: nonsense rows are skipped', () => {
    expect(mergeWeights([], [row({ entry_date: 'soon', weight_kg: '100' }), row({ entry_date: '2026-10-01', weight_kg: '0' }), row({ entry_date: '2026-10-01', weight_kg: 'x' })])).toEqual([]);
  });

  it('waterFills: only days known locally with no water, and a positive cloud figure', () => {
    const day = (waterMl: number) => ({ dateISO: 'x', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl });
    const fills = waterFills({ '2026-10-01': day(0), '2026-10-02': day(500), '2026-10-03': day(0), '2026-10-04': day(0) }, [
      row({ entry_date: '2026-10-01', water_ml: '3000' }),
      row({ entry_date: '2026-10-02', water_ml: '3000' }),
      row({ entry_date: '2026-10-03', water_ml: '0' }),
      row({ entry_date: '2026-10-09', water_ml: '3000' }),
      row({ entry_date: 'soon', water_ml: '3000' }),
    ]);
    expect(fills).toEqual({ '2026-10-01': 3000 });
  });

  it('applyWaterDefault: 3 L for 21/9-25/10 on days with no water, typed water kept, only once, reset on sign-out', () => {
    useNutritionStore.getState().addWater('2026-10-02', 1200);
    expect(useNutritionStore.getState().applyWaterDefault()).toBe(34); // 35 days minus the typed one
    const logs = useNutritionStore.getState().logs;
    expect(logs['2026-09-21'].waterMl).toBe(WATER_DEFAULT_ML);
    expect(logs['2026-10-25'].waterMl).toBe(3000);
    expect(logs['2026-10-02'].waterMl).toBe(1200);
    expect(logs['2026-09-20']).toBeUndefined();
    expect(logs['2026-10-26']).toBeUndefined();
    useNutritionStore.getState().resetWater('2026-10-05');
    expect(useNutritionStore.getState().applyWaterDefault()).toBe(0);
    expect(useNutritionStore.getState().logs['2026-10-05'].waterMl).toBe(0);
    resetAllLocalStores();
    expect(useNutritionStore.getState().waterDefaultDone).toBe(false);
  });

  it('nutrition: rebuilt from the row, unknown meal slots and malformed items dropped, days already known untouched', () => {
    const known = { dateISO: '2026-10-01', mealsEaten: {}, extraCalories: 1, extraProteinG: 0, extraItems: [], waterMl: 0 };
    const added = mergeNutrition({ '2026-10-01': known }, [
      row({ entry_date: '2026-10-01', extra_calories: '9' }),
      row({
        entry_date: '2026-10-02',
        meals_eaten: { meal1: true, meal2: false, bogus: true },
        extra_calories: '500.5',
        extra_protein_g: '12',
        extra_items: [{ id: 'i1', name: 'Phở', calories: 500 }, { name: 'no id' }, null],
        water_ml: '2500',
        removed_meal_slots: ['meal3', 'weird'],
      }),
    ]);
    expect(Object.keys(added)).toEqual(['2026-10-02']);
    expect(added['2026-10-02']).toEqual({
      dateISO: '2026-10-02', mealsEaten: { meal1: true }, extraCalories: 500.5, extraProteinG: 12,
      extraItems: [{ id: 'i1', name: 'Phở', calories: 500 }], waterMl: 2500, removedMealSlots: ['meal3'],
    });
  });

  it('workouts: matched by id; old rows without an id are not added twice', () => {
    const local = [{ id: 'k1', dateISO: '2026-10-01T05:00:00.000Z', templateId: null, label: 'Bơi', durationMin: 30, caloriesBurned: 200 }];
    const added = mergeWorkouts(local, [
      row({ client_id: 'k1', entry_date: '2026-10-01', label: 'Bơi', duration_min: '30', calories_burned: '999' }),
      row({ id: 'z', client_id: null, entry_date: '2026-10-01', label: 'Bơi', duration_min: '30', calories_burned: '200' }),
      row({ id: 'y', client_id: null, entry_date: '2026-10-02', label: 'Chạy', duration_min: '20', calories_burned: '150', template_id: 'home-A' }),
    ]);
    expect(added).toEqual([{ id: 'cloud-y', dateISO: '2026-10-02T05:00:00.000Z', templateId: 'home-A', label: 'Chạy', durationMin: 20, caloriesBurned: 150 }]);
  });

  it('habit ticks: a tick already on the device is never replaced, invalid ones are skipped', () => {
    const merged = mergeChecks({ '2026-10-01': { a: 'missed' } }, [
      row({ entry_date: '2026-10-01', habit_client_id: 'a', value: 'done' }),
      row({ entry_date: '2026-10-01', habit_client_id: 'b', value: 'done' }),
      row({ entry_date: '2026-10-02', habit_client_id: 'a', value: 'maybe' }),
    ]);
    expect(merged).toEqual({ '2026-10-01': { a: 'missed', b: 'done' } });
  });
});
