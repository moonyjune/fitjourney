import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushUserData = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
}));

import { DEFAULT_PLAN } from '../../constants/plan';
import { adviceFor } from '../../feedback/day';
import { buildDiaryItems } from '../../feedback/items';
import { classifyMainMeals } from '../../feedback/flex';
import { buildDayRows, mainMealOf } from '../../insights/days';
import { composeInput, fingerprint, liveDays, outdatedDays, rangeStatus, stableJson } from '../../insights/snapshot';
import { thresholdsFrom } from '../../insights/thresholds';
import { AI_AUTO_DEBOUNCE_MS, AI_AUTO_MIN_GAP_MS, autoRefreshDelay } from '../../ai/useWeeklyReportAutoRefresh';
import { weekInputFingerprint, type WeekInput } from '../../ai/weeklyReport';
import { resetAnalysisStore, useAnalysisStore } from '../../store/useAnalysisStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

const T = DEFAULT_PLAN.mealTemplates;
const DEFAULT_THRESHOLDS = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 1200, saltG: 7, sugarG: 25 } });
const item = (id: string, mealTime: ExtraFoodItem['mealTime'], at: string, extra: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id,
  name: id,
  calories: 500,
  proteinG: 30,
  mealTime,
  loggedAtISO: new Date(at).toISOString(),
  ...extra,
});
const log = (dateKey: string, items: ExtraFoodItem[]): DailyNutritionLog => ({
  dateISO: dateKey,
  mealsEaten: {},
  extraCalories: items.reduce((s, i) => s + i.calories, 0),
  extraProteinG: 0,
  extraItems: items,
  waterMl: 0,
});

describe('which main meal a food stands for', () => {
  it('a food filed under a meal is that meal; a snack is none', () => {
    expect(mainMealOf({ mealTime: 'breakfast' })).toBe('breakfast');
    expect(mainMealOf({ mealTime: 'dinner', loggedAtISO: new Date('2026-10-26T08:00:00').toISOString() })).toBe('dinner');
    expect(mainMealOf({ mealTime: 'morning_snack', loggedAtISO: new Date('2026-10-26T08:00:00').toISOString() })).toBeNull();
  });

  it('a food without a meal time counts by when it was eaten', () => {
    const at = (h: string) => mainMealOf({ mealTime: null, loggedAtISO: new Date(`2026-10-26T${h}:00`).toISOString() });
    expect(at('07:30')).toBe('breakfast');
    expect(at('12:00')).toBe('lunch');
    expect(at('19:15')).toBe('dinner');
    expect(at('16:00')).toBeNull();
    expect(at('23:30')).toBeNull();
  });

  it('regression: a breakfast logged without picking the meal no longer leaves the day "missing breakfast"', () => {
    const logs = {
      '2026-10-26': log('2026-10-26', [item('pho', null, '2026-10-26T07:30:00'), item('com', 'lunch', '2026-10-26T12:00:00'), item('ca', 'dinner', '2026-10-26T19:00:00')]),
    };
    const [row] = buildDayRows({ logs, mealTemplates: T, workouts: [], tdeeFor: () => 2500 });
    expect(row.missing).toEqual([]);
    expect(row.complete).toBe(true);
    // the comments and the 80/20 count see it as breakfast too
    const items = buildDiaryItems(logs, T);
    expect(items.find((i) => i.id === 'pho')!.mealTime).toBe('breakfast');
    expect(classifyMainMeals(items, DEFAULT_THRESHOLDS).map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('a "Không ăn" mark stops counting as a skipped meal once real food is logged for that meal', () => {
    const marked = [item('skip', 'breakfast', '2026-10-26T08:00:00', { name: 'Không ăn', calories: 0 }), item('com', 'lunch', '2026-10-26T12:00:00'), item('ca', 'dinner', '2026-10-26T19:00:00')];
    const advice = (items: ExtraFoodItem[]) => {
      const logs = { '2026-10-26': log('2026-10-26', items) };
      const rows = buildDayRows({ logs, mealTemplates: T, workouts: [], tdeeFor: () => 2500 });
      return adviceFor(rows[0], rows, buildDiaryItems(logs, T), DEFAULT_THRESHOLDS).map((a) => a.key);
    };
    expect(advice(marked)).toContain('skipped');
    expect(advice([...marked, item('pho', 'breakfast', '2026-10-26T07:30:00')])).not.toContain('skipped');
  });
});

describe('analysis snapshots', () => {
  it('fingerprints do not depend on key order, and photos do not change a day', () => {
    expect(stableJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    const a = liveDays({ '2026-10-26': log('2026-10-26', [item('pho', 'breakfast', '2026-10-26T07:30:00', { photoUri: 'file://1.jpg' })]) }, [], [], T);
    const b = liveDays({ '2026-10-26': log('2026-10-26', [item('pho', 'breakfast', '2026-10-26T07:30:00', { photoUri: 'file://2.jpg' })]) }, [], [], T);
    expect(a.get('2026-10-26')!.fp).toBe(b.get('2026-10-26')!.fp);
    expect(a.get('2026-10-26')!.data.log!.extraItems[0].photoUri).toBeUndefined();
  });

  it('a day includes its workouts and weigh-ins, and a day with only those is on record', () => {
    const live = liveDays({}, [{ id: 'w', dateISO: '2026-10-27T18:00:00', templateId: null, label: 'Đi bộ', durationMin: 30, caloriesBurned: 150 }], [{ id: 'k', dateISO: '2026-10-28T06:00:00', weightKg: 105 }], T);
    expect([...live.keys()]).toEqual(['2026-10-27', '2026-10-28']);
    expect(live.get('2026-10-27')!.data.workouts).toHaveLength(1);
  });

  it('manual mode works on each day as analysed, and tells which days changed since', () => {
    const before = liveDays({ '2026-10-26': log('2026-10-26', [item('com', 'lunch', '2026-10-26T12:00:00')]) }, [], [], T);
    const stamps = { '2026-10-26': { fp: before.get('2026-10-26')!.fp, atISO: '2026-10-26T13:00:00.000Z' } };
    const stored = { [before.get('2026-10-26')!.fp]: before.get('2026-10-26')!.data };
    const after = liveDays(
      {
        '2026-10-26': log('2026-10-26', [item('pho', 'breakfast', '2026-10-26T07:30:00'), item('com', 'lunch', '2026-10-26T12:00:00')]),
        '2026-10-27': log('2026-10-27', [item('bun', 'lunch', '2026-10-27T12:00:00')]),
      },
      [],
      [],
      T
    );
    const manual = composeInput(after, stamps, stored, 'manual');
    expect(manual.logs['2026-10-26'].extraItems.map((i) => i.id)).toEqual(['com']); // as analysed
    expect(manual.logs['2026-10-27'].extraItems.map((i) => i.id)).toEqual(['bun']); // never analysed: as it is now
    expect(composeInput(after, stamps, stored, 'auto').logs['2026-10-26'].extraItems).toHaveLength(2);
    expect(outdatedDays(after, stamps)).toEqual(['2026-10-26']);
    const status = rangeStatus(after, stamps, '2026-10-26', '2026-10-26');
    expect(status).toMatchObject({ atISO: '2026-10-26T13:00:00.000Z', outdated: true, changed: ['2026-10-26'] });
    // a deleted day is a change too
    expect(outdatedDays(new Map(), stamps)).toEqual(['2026-10-26']);
  });
});

describe('analysis store', () => {
  const v1 = () => liveDays({ '2026-10-26': log('2026-10-26', [item('com', 'lunch', '2026-10-26T12:00:00')]) }, [], [], T);
  const v2 = () => liveDays({ '2026-10-26': log('2026-10-26', [item('pho', 'breakfast', '2026-10-26T07:30:00'), item('com', 'lunch', '2026-10-26T12:00:00')]) }, [], [], T);
  beforeEach(() => {
    resetAnalysisStore();
    mockPushUserData.mockClear();
  });

  it('auto: a changed day is analysed again at once in every part', () => {
    const s = useAnalysisStore.getState();
    s.sync(v1(), new Date('2026-10-26T13:00:00Z'));
    s.sync(v2(), new Date('2026-10-26T14:00:00Z'));
    const { scopes, data } = useAnalysisStore.getState();
    for (const scope of ['overview', 'periods', 'move', 'feedback'] as const) {
      expect(scopes[scope]['2026-10-26']).toEqual({ fp: v2().get('2026-10-26')!.fp, atISO: '2026-10-26T14:00:00.000Z' });
    }
    expect(Object.keys(data)).toEqual([v2().get('2026-10-26')!.fp]); // the old copy is dropped
  });

  it('manual: a changed day keeps its analysis until asked again, then only that part changes', () => {
    useAnalysisStore.getState().setMode('manual');
    expect(mockPushUserData).toHaveBeenCalledWith('analysisMode', { mode: 'manual' });
    const s = useAnalysisStore.getState();
    s.sync(v1(), new Date('2026-10-26T13:00:00Z'));
    s.sync(v2(), new Date('2026-10-26T14:00:00Z'));
    let { scopes } = useAnalysisStore.getState();
    expect(scopes.feedback['2026-10-26'].fp).toBe(v1().get('2026-10-26')!.fp);
    expect(outdatedDays(v2(), scopes.feedback)).toEqual(['2026-10-26']);
    useAnalysisStore.getState().refresh(['feedback'], ['2026-10-26'], new Date('2026-10-26T15:00:00Z'), v2());
    ({ scopes } = useAnalysisStore.getState());
    expect(scopes.feedback['2026-10-26']).toEqual({ fp: v2().get('2026-10-26')!.fp, atISO: '2026-10-26T15:00:00.000Z' });
    expect(scopes.periods['2026-10-26'].fp).toBe(v1().get('2026-10-26')!.fp); // other tabs untouched
    expect(Object.keys(useAnalysisStore.getState().data).sort()).toEqual([v1().get('2026-10-26')!.fp, v2().get('2026-10-26')!.fp].sort());
    // refreshing a day that is no longer on record forgets it
    useAnalysisStore.getState().refresh(['feedback'], ['2026-10-26'], new Date(), new Map());
    expect(useAnalysisStore.getState().scopes.feedback['2026-10-26']).toBeUndefined();
  });

  it('switching back to auto analyses the changed days at once', () => {
    useAnalysisStore.getState().setMode('manual');
    useAnalysisStore.getState().sync(v1(), new Date('2026-10-26T13:00:00Z'));
    useAnalysisStore.getState().setMode('auto');
    useAnalysisStore.getState().sync(v2(), new Date('2026-10-26T16:00:00Z'));
    expect(useAnalysisStore.getState().scopes.overview['2026-10-26'].atISO).toBe('2026-10-26T16:00:00.000Z');
  });
});

describe('AI weekly review refresh', () => {
  const week = (over: Partial<WeekInput> = {}): WeekInput =>
    ({
      week: { start: '2026-10-26', today: '2026-10-28', daysElapsed: 3, daysUntilReset: 4 },
      boss: { maxHp: 7700, hpLeft: 5000, damageSoFar: 2700, defeated: false, neededPerRemainingDay: 675, status: 'on_track' },
      targets: { tdeeKcal: 2600, dailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, purineLimitMg: 1200, saltLimitG: 7, sugarLimitG: 25 },
      days: [
        { date: '2026-10-26', logged: true, damage: 1100, eatenKcal: 1500, proteinG: 100, burnedKcal: 0, waterMl: 3000, purineMg: 300, saltG: 4, sugarG: 10, workouts: 0, junkCount: 0, missed: [] },
        { date: '2026-10-27', logged: false, damage: 0, eatenKcal: 0, proteinG: 0, burnedKcal: 0, waterMl: 0, purineMg: 0, saltG: 0, sugarG: 0, workouts: 0, junkCount: 0, missed: ['deficit'] },
      ],
      patterns: { daysLogged: 1, workoutDays: 0, proteinMissDays: 0, saltOverDays: 0, purineOverDays: 0, sugarOverDays: 0, junkDays: 0, waterShortDays: 0, lateMealDays: 0 },
      weight: {},
      ...over,
    }) as WeekInput;

  it('the fingerprint follows the data, not the passing of time', () => {
    const base = weekInputFingerprint(week());
    expect(weekInputFingerprint(week({ week: { start: '2026-10-26', today: '2026-10-29', daysElapsed: 4, daysUntilReset: 3 } }))).toBe(base);
    const more = week();
    more.days = [...more.days, { ...more.days[0], date: '2026-10-28', eatenKcal: 1700 }];
    expect(weekInputFingerprint(more)).not.toBe(base);
  });

  it('waits for edits to settle and spaces automatic rewrites out', () => {
    const now = new Date('2026-10-28T12:00:00Z').getTime();
    expect(autoRefreshDelay(now, undefined)).toBe(AI_AUTO_DEBOUNCE_MS);
    expect(autoRefreshDelay(now, new Date(now - 5 * 60_000).toISOString())).toBe(AI_AUTO_MIN_GAP_MS - 5 * 60_000);
    expect(autoRefreshDelay(now, new Date(now - 2 * 60 * 60_000).toISOString())).toBe(AI_AUTO_DEBOUNCE_MS);
  });
});
