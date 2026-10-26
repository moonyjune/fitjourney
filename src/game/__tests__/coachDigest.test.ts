import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { chunk, cleanDigest, clientStatusOf, DIGEST_CHUNK, STATUS_ORDER, weekSourceFromRows, type ClientRows } from '../../ai/coachDigest';
import { buildWeekInput, buildWeeklyReportInput, type WeekInput } from '../../ai/weeklyReport';
import { fakeDigest } from '../../ai/devPhotoAnalysis';
import { DEFAULT_PLAN } from '../../constants/plan';
import { LIMITS } from '../../game/constants';
import { useAiDigestStore, DIGEST_WEEKS_KEEP } from '../../store/useAiDigestStore';
import { resetAllLocalStores } from '../../store/resetLocalStores';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const NOW = new Date('2026-10-23T16:10:00'); // Friday: Monday 19/10 is the start of the week

const week = (over: { daysLogged?: number; daysElapsed?: number; status?: WeekInput['boss']['status']; defeated?: boolean } = {}): WeekInput =>
  ({
    week: { start: '2026-10-19', today: '2026-10-23', daysElapsed: over.daysElapsed ?? 5, daysUntilReset: 3 },
    boss: { maxHp: 7700, hpLeft: 5000, damageSoFar: 2700, defeated: over.defeated ?? false, neededPerRemainingDay: 1000, status: over.status ?? 'on_track' },
    targets: {}, days: [], weight: {},
    patterns: { daysLogged: over.daysLogged ?? 5 },
  }) as unknown as WeekInput;

describe('clientStatusOf', () => {
  it('no_data when nothing was logged this week, whatever the boss says', () => {
    expect(clientStatusOf(week({ daysLogged: 0, status: 'on_track' }))).toBe('no_data');
  });

  it('good when the boss is down (even with little logging), or the week is on track', () => {
    expect(clientStatusOf(week({ defeated: true, status: 'defeated', daysLogged: 1 }))).toBe('good');
    expect(clientStatusOf(week({ status: 'on_track' }))).toBe('good');
  });

  it('watch when behind the boss, nudge when far behind', () => {
    expect(clientStatusOf(week({ status: 'behind' }))).toBe('watch');
    expect(clientStatusOf(week({ status: 'far' }))).toBe('nudge');
  });

  it('nudge when logging on fewer than half of the days so far (even if the boss looks fine)', () => {
    expect(clientStatusOf(week({ daysElapsed: 4, daysLogged: 1 }))).toBe('nudge');
    expect(clientStatusOf(week({ daysElapsed: 4, daysLogged: 2 }))).toBe('good'); // exactly half is not "fewer than half"
    expect(clientStatusOf(week({ daysElapsed: 3, daysLogged: 1 }))).toBe('nudge');
    expect(clientStatusOf(week({ daysElapsed: 2, daysLogged: 1 }))).toBe('good'); // half of the days: not fewer than half
  });

  it('lists the ones to reach out to first', () => {
    expect(STATUS_ORDER).toEqual(['nudge', 'no_data', 'watch', 'good']);
  });
});

describe('chunk', () => {
  it('splits into groups of at most 12 in order, and nothing for nothing', () => {
    const out = chunk(Array.from({ length: 25 }, (_, i) => i));
    expect(DIGEST_CHUNK).toBe(12);
    expect(out.map((c) => c.length)).toEqual([12, 12, 1]);
    expect(out[2]).toEqual([24]);
    expect(chunk([])).toEqual([]);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

describe('cleanDigest', () => {
  it('maps by asked keys, trimming; a summary is required; a key counts once (the first); unknown keys are dropped', () => {
    const out = cleanDigest(
      { items: [
        { key: 'c1', summary: ' Đi tốt ', nudge: ' Giữ nhé ' },
        { key: 'c1', summary: 'Bản thứ hai' },
        { key: 'c2', summary: ' ', nudge: 'x' },
        { key: 'c3', summary: 'Hợp lệ' },
        { key: 'c9', summary: 'Không hỏi' },
        { summary: 'Không khóa' },
        null,
      ] },
      ['c1', 'c2', 'c3']
    );
    expect(out).toEqual({ c1: { summary: 'Đi tốt', nudge: 'Giữ nhé' }, c3: { summary: 'Hợp lệ' } });
  });

  it('is empty for a non-list or nothing', () => {
    expect(cleanDigest(null, ['c1'])).toEqual({});
    expect(cleanDigest({ items: 'no' }, ['c1'])).toEqual({});
  });
});

describe('weekSourceFromRows', () => {
  const rows: ClientRows = {
    profile: { start_weight_kg: '110', water_target_ml: '3000', protein_target_g: '180', calorie_target_kcal: '1900', target_daily_deficit_kcal: '1100', gender: null, age: null, height_cm: null, activity_level: null },
    plan: DEFAULT_PLAN,
    weights: [{ entry_date: '2026-10-23', weight_kg: '105.2' }, { entry_date: '2026-10-18', weight_kg: '106' }, { entry_date: '2026-10-20', weight_kg: 'x' }, { entry_date: '2026-10-21', weight_kg: '0' }],
    nutrition: [{ entry_date: '2026-10-19', meals_eaten: { meal1: true }, extra_calories: '1500', extra_protein_g: '100', extra_items: [{ id: 'a' }], water_ml: '3000', removed_meal_slots: ['meal3'] }],
    workouts: [{ id: 'w1', entry_date: '2026-10-19', template_id: 't', label: 'Bơi', duration_min: '45', calories_burned: '400' }],
  };

  it('coerces PostgREST strings to numbers, keeps valid weigh-ins in date order, and builds logs and workouts', () => {
    const s = weekSourceFromRows(rows);
    expect(s.weights).toEqual([{ dateISO: '2026-10-18T06:00:00', weightKg: 106 }, { dateISO: '2026-10-23T06:00:00', weightKg: 105.2 }]);
    expect(s.proteinTargetG).toBe(180);
    expect(s.waterTargetMl).toBe(3000);
    expect(s.dailyDeficitKcal).toBe(1100);
    expect(s.tdeeKcal).toBe(3000); // no profile: calorie target + deficit target
    expect(s.logs['2026-10-19']).toMatchObject({ mealsEaten: { meal1: true }, extraCalories: 1500, extraProteinG: 100, waterMl: 3000, removedMealSlots: ['meal3'] });
    expect(s.workoutEntries).toEqual([{ id: 'w1', dateISO: '2026-10-19T12:00:00', templateId: 't', label: 'Bơi', durationMin: 45, caloriesBurned: 400 }]);
    expect(s.limits).toEqual({ purineMg: LIMITS.purineMg, saltG: LIMITS.saltG, sugarG: LIMITS.sugarG });
  });

  it('falls back to the app defaults for a missing profile or empty rows, and tolerates malformed log fields', () => {
    const s = weekSourceFromRows({ profile: null, plan: DEFAULT_PLAN, weights: [], nutrition: [{ entry_date: '2026-10-19', meals_eaten: null, extra_items: 'x', removed_meal_slots: 5 }], workouts: [] });
    expect(s.proteinTargetG).toBe(200);
    expect(s.waterTargetMl).toBe(4500);
    expect(s.dailyDeficitKcal).toBeGreaterThan(0);
    expect(s.tdeeKcal).toBeGreaterThan(1500);
    expect(s.logs['2026-10-19']).toMatchObject({ mealsEaten: {}, extraItems: [], removedMealSlots: [], extraCalories: 0 });
  });

  it('uses the profile (sex, age, height, activity) and the latest weight for the TDEE when they are all known', () => {
    const a = weekSourceFromRows({ ...rows, profile: { ...rows.profile, gender: 'male', age: '34', height_cm: '172', activity_level: 'light' } });
    expect(a.tdeeKcal).not.toBe(3000);
    expect(a.tdeeKcal).toBeGreaterThan(2000);
    const heavier = weekSourceFromRows({ ...rows, profile: { ...rows.profile, gender: 'male', age: '34', height_cm: '172', activity_level: 'light' }, weights: [{ entry_date: '2026-10-23', weight_kg: '130' }] });
    expect(heavier.tdeeKcal).toBeGreaterThan(a.tdeeKcal);
  });
});

describe('a client\'s week read from rows equals the same week read from the device', () => {
  beforeEach(() => {
    useSettingsStore.setState({ gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, startWeightKg: 106 });
    useLimitsStore.setState({ purineMg: LIMITS.purineMg, saltG: LIMITS.saltG, sugarG: LIMITS.sugarG });
    useWorkoutStore.setState({ entries: [{ id: 'w1', dateISO: '2026-10-19T12:00:00', templateId: null, label: 'Bơi', durationMin: 45, caloriesBurned: 400 }] });
    useWeightStore.setState({ entries: [{ id: 'a', dateISO: '2026-10-18T06:00:00', weightKg: 106 }, { id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 105.2 }] });
    const item = (id: string, name: string, kcal: number, hour: number, date: string, extra: object = {}) => ({ id, name, calories: kcal, proteinG: 80, loggedAtISO: `${date}T${String(hour).padStart(2, '0')}:00:00`, mealTime: 'lunch' as const, ...extra });
    const day = (date: string, items: ReturnType<typeof item>[], water: number) => ({ dateISO: date, mealsEaten: {}, extraCalories: items.reduce((s, i) => s + i.calories, 0), extraProteinG: items.reduce((s, i) => s + i.proteinG, 0), extraItems: items, waterMl: water });
    useNutritionStore.setState({ logs: {
      '2026-10-12': day('2026-10-12', [item('p', 'Cơm', 2000, 12, '2026-10-12')], 3000),
      '2026-10-19': day('2026-10-19', [item('a', 'Cơm gà', 1500, 12, '2026-10-19')], 3000),
      '2026-10-20': day('2026-10-20', [item('b', 'Pizza', 3400, 21, '2026-10-20', { junk: true, saltG: 9, purineMg: 1500 })], 1000),
      '2026-10-22': day('2026-10-22', [item('c', 'Bún', 1800, 12, '2026-10-22')], 3000),
    } });
  });

  it('gives the same days, boss, patterns and weight numbers', () => {
    const fromStores = buildWeeklyReportInput(NOW);
    const logs = useNutritionStore.getState().logs;
    const rows: ClientRows = {
      profile: { start_weight_kg: '106', water_target_ml: '3000', protein_target_g: '200', calorie_target_kcal: '1900', target_daily_deficit_kcal: '1100' },
      plan: DEFAULT_PLAN,
      weights: [{ entry_date: '2026-10-18', weight_kg: '106' }, { entry_date: '2026-10-23', weight_kg: '105.2' }],
      nutrition: Object.entries(logs).map(([date, l]) => ({ entry_date: date, meals_eaten: l.mealsEaten, extra_calories: String(l.extraCalories), extra_protein_g: String(l.extraProteinG), extra_items: l.extraItems, water_ml: String(l.waterMl), removed_meal_slots: [] })),
      workouts: [{ id: 'w1', entry_date: '2026-10-19', template_id: null, label: 'Bơi', duration_min: '45', calories_burned: '400' }],
    };
    const fromRows = buildWeekInput(weekSourceFromRows(rows), NOW);
    expect(fromRows).toEqual(fromStores);
    expect(fromRows.boss.damageSoFar).toBeGreaterThan(0);
    expect(fromRows.previousWeek).toBeDefined();
  });
});

describe('digest store and dev fake', () => {
  it('merges entries into a week, keeps the latest 4 weeks and is emptied on sign-out', () => {
    const e = (status: 'good' | 'nudge') => ({ status, generatedAtISO: '2026-10-26T00:00:00.000Z' });
    const { save } = useAiDigestStore.getState();
    save('2026-10-19', { a: e('good') });
    save('2026-10-19', { b: e('nudge') });
    expect(Object.keys(useAiDigestStore.getState().weeks['2026-10-19'])).toEqual(['a', 'b']);
    for (const d of ['2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21']) save(d, { a: e('good') });
    const keys = Object.keys(useAiDigestStore.getState().weeks).sort();
    expect(keys).toHaveLength(DIGEST_WEEKS_KEEP);
    expect(keys[0]).toBe('2026-09-28');
    resetAllLocalStores();
    expect(useAiDigestStore.getState().weeks).toEqual({});
  });

  it('the offline dev account gets plain lines built from the numbers, labelled as simulated', () => {
    const out = fakeDigest([{ key: 'c1', week: week({ status: 'far' }) }, { key: 'c2', week: week({ status: 'on_track' }) }]);
    expect(out.items[0].summary).toContain('[Giả lập]');
    expect(out.items[0].nudge).toBeDefined();
    expect(out.items[1].nudge).toBeUndefined();
    expect(Object.keys(cleanDigest(out, ['c1', 'c2']))).toEqual(['c1', 'c2']);
  });
});
