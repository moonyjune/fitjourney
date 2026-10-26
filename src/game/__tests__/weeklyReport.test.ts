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

import { bossStatusOf, buildWeeklyReportInput, cleanReport } from '../../ai/weeklyReport';
import { fakeWeeklyReport } from '../../ai/devPhotoAnalysis';
import { REPORTS_KEEP, useAiReportStore } from '../../store/useAiReportStore';
import { resetAllLocalStores } from '../../store/resetLocalStores';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

const NOW = new Date('2026-10-23T16:10:00'); // Friday; the week started Monday 19/10, last week 12/10 - 18/10

const item = (name: string, kcal: number, protein: number, hour: number, date: string, extra: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: `${date}-${name}`, name, calories: kcal, proteinG: protein, loggedAtISO: `${date}T${String(hour).padStart(2, '0')}:00:00`, mealTime: 'lunch', ...extra,
});
const day = (date: string, items: ExtraFoodItem[], waterMl = 0): DailyNutritionLog => ({
  dateISO: date, mealsEaten: {}, extraCalories: items.reduce((s, i) => s + i.calories, 0), extraProteinG: items.reduce((s, i) => s + i.proteinG, 0), extraItems: items, waterMl,
});

describe('bossStatusOf', () => {
  it('defeated, on track (needed ≤ daily deficit target), behind (≤ the 1500 daily cap) or far', () => {
    expect(bossStatusOf({ defeated: true, neededPerRemainingDay: 0 }, 1100)).toBe('defeated');
    expect(bossStatusOf({ defeated: false, neededPerRemainingDay: 1100 }, 1100)).toBe('on_track');
    expect(bossStatusOf({ defeated: false, neededPerRemainingDay: 1101 }, 1100)).toBe('behind');
    expect(bossStatusOf({ defeated: false, neededPerRemainingDay: 1500 }, 1100)).toBe('behind');
    expect(bossStatusOf({ defeated: false, neededPerRemainingDay: 1501 }, 1100)).toBe('far');
  });
});

describe('buildWeeklyReportInput', () => {
  beforeEach(() => {
    // No profile: TDEE = calorie target + deficit target = 1900 + 1100 = 3000.
    useSettingsStore.setState({ gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, startWeightKg: 106, startDateISO: '2026-10-01T08:00:00' });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWorkoutStore.setState({ entries: [{ id: 'w1', dateISO: '2026-10-19T18:00:00', templateId: null, label: 'Bơi', durationMin: 45, caloriesBurned: 400 }] });
    useWeightStore.setState({ entries: [
      { id: 'a', dateISO: '2026-10-18T06:00:00', weightKg: 106 },
      { id: 'b', dateISO: '2026-10-21T06:00:00', weightKg: 105.6 },
      { id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 105.2 },
    ] });
    useNutritionStore.setState({ logs: {
      '2026-10-12': day('2026-10-12', [item('Cơm', 2000, 100, 12, '2026-10-12')]), // last week: deficit 1000
      '2026-10-19': day('2026-10-19', [item('Cơm gà', 1500, 200, 12, '2026-10-19')], 3000), // deficit 3000+400-1500 = 1900 → damage capped 1500
      '2026-10-20': day('2026-10-20', [item('Pizza', 3400, 60, 21, '2026-10-20', { junk: true, saltG: 9, purineMg: 1500 })], 1000), // surplus 400 (3000 − 3400) → no damage; late, salt+purine over, junk, water short
      '2026-10-22': day('2026-10-22', [item('Bún', 1800, 100, 12, '2026-10-22')], 3000), // deficit 1200
      '2026-10-23': day('2026-10-23', [item('Phở', 600, 40, 12, '2026-10-23')], 500), // today so far: deficit 2400 → capped 1500
    } });
  });

  it('lists Monday to today with per-day figures, nothing for days after today, and marks an empty day as not logged', () => {
    const w = buildWeeklyReportInput(NOW);
    expect(w.week).toMatchObject({ start: '2026-10-19', today: '2026-10-23', daysElapsed: 5, daysUntilReset: 3 });
    expect(w.days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    const [mon, tue, wed, thu, fri] = w.days;
    expect(mon).toMatchObject({ logged: true, deficitKcal: 1900, damage: 1500, eatenKcal: 1500, proteinG: 200, burnedKcal: 400, workouts: 1, waterMl: 3000, lastMealHour: 12 });
    expect(tue).toMatchObject({ logged: true, deficitKcal: -400, damage: 0, junkCount: 1, saltG: 9, purineMg: 1500, lastMealHour: 21 });
    expect(tue.missed).toEqual(expect.arrayContaining(['salt', 'purine', 'junk', 'deficit']));
    expect(wed).toMatchObject({ logged: false, damage: 0, eatenKcal: 0 });
    expect(wed.deficitKcal).toBeUndefined();
    expect(wed.lastMealHour).toBeUndefined();
    expect(thu).toMatchObject({ deficitKcal: 1200, damage: 1200, workouts: 0 });
    expect(thu.missed).toContain('protein');
    expect(fri).toMatchObject({ deficitKcal: 2400, damage: 1500 });
  });

  it('counts the patterns over the logged days only', () => {
    const p = buildWeeklyReportInput(NOW).patterns;
    expect(p).toMatchObject({ daysLogged: 4, avgDeficitKcal: Math.round((1900 - 400 + 1200 + 2400) / 4), workoutDays: 1, saltOverDays: 1, purineOverDays: 1, sugarOverDays: 0, junkDays: 1, lateMealDays: 1, waterShortDays: 2 });
    expect(p.avgProteinG).toBe(Math.round((200 + 60 + 100 + 40) / 4));
    expect(p.proteinMissDays).toBeGreaterThanOrEqual(2);
  });

  it('counts a last meal at exactly the end of the eating window (20:00) as late, and 19:00 as not', () => {
    useNutritionStore.setState({ logs: { '2026-10-19': day('2026-10-19', [item('A', 1500, 100, 20, '2026-10-19')]), '2026-10-20': day('2026-10-20', [item('B', 1500, 100, 19, '2026-10-20')]) } });
    const w = buildWeeklyReportInput(NOW);
    expect(w.days[0].lastMealHour).toBe(20);
    expect(w.patterns.lateMealDays).toBe(1);
  });

  it('reports the boss: damage so far, HP left and the status from the numbers', () => {
    const { boss } = buildWeeklyReportInput(NOW);
    expect(boss).toMatchObject({ maxHp: 7700, damageSoFar: 1500 + 0 + 1200 + 1500, defeated: false });
    expect(boss.hpLeft).toBe(7700 - 4200);
    expect(boss.neededPerRemainingDay).toBe(Math.ceil(3500 / 2)); // two days left after today: Saturday, Sunday
    expect(boss.status).toBe('far'); // 1750 a day is more than a day can deal
  });

  it('compares the weight with what the deficit predicts (3,500-ish kcal per 0.45 kg is kcal / 7,700 per kg)', () => {
    const { weight } = buildWeeklyReportInput(NOW);
    expect(weight).toMatchObject({ startKg: 106, endKg: 105.2, changeKg: -0.8 });
    expect(weight.expectedChangeKg).toBe(Math.round((-(1900 - 400 + 1200 + 2400) / 7700) * 10) / 10);
    expect(weight.gapKg).toBe(Math.round(((weight.changeKg ?? 0) - (weight.expectedChangeKg ?? 0)) * 10) / 10);
  });

  it('has no weight block with fewer than two weigh-ins to compare, and uses the first of the week when none came before it', () => {
    useWeightStore.setState({ entries: [{ id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 105.2 }] });
    expect(buildWeeklyReportInput(NOW).weight).toEqual({});
    useWeightStore.setState({ entries: [{ id: 'b', dateISO: '2026-10-21T06:00:00', weightKg: 105.6 }, { id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 105.2 }] });
    expect(buildWeeklyReportInput(NOW).weight).toMatchObject({ startKg: 105.6, endKg: 105.2, changeKg: -0.4 });
  });

  it('includes last week for comparison, and leaves it out when there was nothing', () => {
    expect(buildWeeklyReportInput(NOW).previousWeek).toEqual({ damage: 1000, daysLogged: 1, avgDeficitKcal: 1000 });
    useNutritionStore.setState((s) => ({ logs: { ...s.logs, '2026-10-12': undefined as never } }));
    expect(buildWeeklyReportInput(NOW).previousWeek).toBeUndefined();
  });

  it('works on an empty week and carries no free text, names or ids', () => {
    useNutritionStore.setState({ logs: {} });
    const w = buildWeeklyReportInput(NOW);
    expect(w.patterns.daysLogged).toBe(0);
    expect(w.days.every((d) => !d.logged)).toBe(true);
    useNutritionStore.setState({ logs: { '2026-10-19': day('2026-10-19', [item('Món riêng tư', 1500, 100, 12, '2026-10-19')]) } });
    const json = JSON.stringify(buildWeeklyReportInput(NOW));
    expect(json).not.toContain('riêng tư');
    expect(json).not.toMatch(/@|"id"/);
  });

  it('on a Monday the week is just that day, and on Sunday the whole week', () => {
    const monday = new Date('2026-10-19T09:00:00');
    expect(buildWeeklyReportInput(monday).week).toMatchObject({ start: '2026-10-19', daysElapsed: 1, daysUntilReset: 7 });
    const sunday = new Date('2026-10-25T21:00:00');
    expect(buildWeeklyReportInput(sunday).week).toMatchObject({ start: '2026-10-19', daysElapsed: 7, daysUntilReset: 1 });
  });
});

describe('cleanReport', () => {
  const ok = { headline: ' Tuần khá tốt ', causes: [{ date: '2026-10-20', text: 'Ăn pizza tối.' }, { text: 'Thiếu đạm.' }], patterns: ['Ăn muộn'], nextWeek: [{ action: 'Ăn trước 20h', why: 'Giữ thâm hụt' }, { action: 'Uống đủ nước' }], weightNote: ' Nước giữ lại ', encouragement: ' Cố lên ' };

  it('keeps a well-formed report, trimming text', () => {
    expect(cleanReport(ok)).toEqual({
      headline: 'Tuần khá tốt',
      causes: [{ date: '2026-10-20', text: 'Ăn pizza tối.' }, { text: 'Thiếu đạm.' }],
      patterns: ['Ăn muộn'],
      weightNote: 'Nước giữ lại',
      nextWeek: [{ action: 'Ăn trước 20h', why: 'Giữ thâm hụt' }, { action: 'Uống đủ nước' }],
      encouragement: 'Cố lên',
    });
  });

  it('is null without a headline, or when there is nothing to show besides it', () => {
    expect(cleanReport(null)).toBeNull();
    expect(cleanReport({ ...ok, headline: '  ' })).toBeNull();
    expect(cleanReport({ headline: 'x', causes: [], patterns: [], nextWeek: [] })).toBeNull();
  });

  it('caps the lists (3 causes, 3 patterns, 5 actions), drops blank or wrongly-typed entries and bad dates', () => {
    const out = cleanReport({
      headline: 'x',
      causes: [{ text: 'a', date: 'not a date' }, { text: ' ' }, null, { text: 'b' }, { text: 'c' }, { text: 'd' }],
      patterns: ['1', 2, '', '3', '4', '5'],
      nextWeek: Array.from({ length: 8 }, (_, i) => ({ action: `act ${i}` })).concat([{ action: '' }]),
    })!;
    expect(out.causes).toEqual([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    expect(out.patterns).toEqual(['1', '3', '4']);
    expect(out.nextWeek).toHaveLength(5);
  });
});

describe('weekly report store and dev fake', () => {
  it('keeps the latest 8 weeks and is emptied on sign-out', () => {
    const report = { headline: 'h', causes: [], patterns: ['p'], nextWeek: [] };
    const { saveWeekly } = useAiReportStore.getState();
    for (let i = 1; i <= REPORTS_KEEP + 3; i++) saveWeekly(`2026-0${i < 10 ? '1' : '2'}-${String(i).padStart(2, '0')}`, report, '2026-10-26T00:00:00.000Z');
    const keys = Object.keys(useAiReportStore.getState().weekly).sort();
    expect(keys).toHaveLength(REPORTS_KEEP);
    expect(keys[0]).toBe('2026-01-04');
    resetAllLocalStores();
    expect(useAiReportStore.getState().weekly).toEqual({});
  });

  it('the offline dev account gets plain wording built only from the numbers, labelled as simulated', () => {
    const useNow = buildWeeklyReportInput(NOW);
    const fake = fakeWeeklyReport(useNow);
    expect(fake.headline).toContain('[Giả lập]');
    expect(fake.causes.length).toBeGreaterThan(0);
    expect(cleanReport(fake)).not.toBeNull();
  });
});
