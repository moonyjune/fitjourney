import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushHabit = jest.fn();
const mockPushCheck = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushHabit: (...a: unknown[]) => mockPushHabit(...a),
  pushHabitCheck: (...a: unknown[]) => mockPushCheck(...a),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { autoSignals } from '../../habits/auto';
import { buildHabitWeeks, dayRatio, FORMED_RATE, streak, trackedHabits, weekRates } from '../../habits/rates';
import { formatHabitText } from '../../habits/strings';
import type { Habit, HabitChecks } from '../../habits/types';
import { applyDiaryImport, parseDiaryImport } from '../../import/diaryImport';
import { useHabitStore } from '../../store/useHabitStore';
import { resetAllLocalStores } from '../../store/resetLocalStores';

const habit = (id: string, over: Partial<Habit> = {}): Habit => ({ id, name: `Habit ${id}`, status: 'building', assessment: '', kaizen: '', measuredBy: '', tracked: true, auto: null, sort: Number(id.replace(/\D/g, '')) || 1, archived: false, ...over });
const H = [habit('h1'), habit('h2'), habit('h3', { tracked: false }), habit('h4', { archived: true }), habit('h5')];

describe('which habits are ticked', () => {
  it('lists the tracked, active habits in their order', () => {
    expect(trackedHabits(H).map((h) => h.id)).toEqual(['h1', 'h2', 'h5']);
    expect(trackedHabits([habit('h9', { sort: 9 }), habit('h2', { sort: 2 })]).map((h) => h.id)).toEqual(['h2', 'h9']);
  });
});

describe('the day’s ratio', () => {
  it('is the share of ticked habits that were done, ignoring unticked, untracked and archived ones', () => {
    const checks: HabitChecks = { '2026-10-05': { h1: 'done', h2: 'missed', h3: 'done', h4: 'done' } };
    expect(dayRatio(checks, '2026-10-05', H)).toBe(0.5); // h1 done, h2 missed; h5 unticked, h3/h4 do not count
    expect(dayRatio({ '2026-10-05': { h1: 'done', h2: 'done', h5: 'done' } }, '2026-10-05', H)).toBe(1);
  });

  it('is null when nothing was ticked that day', () => {
    expect(dayRatio({}, '2026-10-05', H)).toBeNull();
    expect(dayRatio({ '2026-10-05': { h3: 'done' } }, '2026-10-05', H)).toBeNull();
  });
});

describe('weekly consistency', () => {
  // 5 Oct 2026 is a Monday: ticks on 5th..11th.
  const week = (h1: string, h2: string): HabitChecks => {
    const checks: HabitChecks = {};
    for (let i = 0; i < 7; i++) checks[`2026-10-${String(5 + i).padStart(2, '0')}`] = { h1: h1[i] === 'x' ? 'done' : 'missed', h2: h2[i] === 'x' ? 'done' : 'missed' };
    return checks;
  };

  it('counts done and missed days per habit and takes 5 of 7 days as a routine', () => {
    const w = weekRates(week('xxxxx..', 'xxxx...'), H, '2026-10-05');
    expect(w.weekEnd).toBe('2026-10-11');
    const byId = Object.fromEntries(w.rates.map((r) => [r.habit.id, r]));
    expect(byId.h1).toMatchObject({ done: 5, missed: 2 });
    expect(byId.h1.rate).toBeCloseTo(5 / 7, 9);
    expect(byId.h2.rate).toBeCloseTo(4 / 7, 9);
    expect(byId.h5.rate).toBeNull(); // never ticked this week
    expect(FORMED_RATE).toBeLessThan(5 / 7);
    expect(FORMED_RATE).toBeGreaterThan(4 / 7);
    expect(w.weakest?.habit.id).toBe('h2');
    expect(w.allFormed).toBe(false);
  });

  it('says every ticked habit is a routine when none is below 5/7, and nothing when nothing was ticked', () => {
    expect(weekRates(week('xxxxx..', 'xxxxxxx'), H, '2026-10-05').allFormed).toBe(true);
    const empty = weekRates({}, H, '2026-10-05');
    expect(empty).toMatchObject({ weakest: null, allFormed: null });
  });

  it('only looks at ticks inside the week', () => {
    const checks: HabitChecks = { '2026-10-04': { h1: 'missed' }, '2026-10-05': { h1: 'done' }, '2026-10-12': { h1: 'missed' } };
    const r = weekRates(checks, H, '2026-10-05').rates.find((x) => x.habit.id === 'h1')!;
    expect([r.done, r.missed]).toEqual([1, 0]);
  });

  it('builds every week from the first ticked day to this week, newest first', () => {
    const checks: HabitChecks = { '2026-09-30': { h1: 'done' }, '2026-10-14': { h1: 'done' } };
    expect(buildHabitWeeks(checks, H, '2026-10-15').map((w) => w.weekStart)).toEqual(['2026-10-12', '2026-10-05', '2026-09-28']);
    expect(buildHabitWeeks(checks, H, '2026-10-30').map((w) => w.weekStart)[0]).toBe('2026-10-26'); // the weeks after the last tick are listed too
    expect(buildHabitWeeks({}, H, '2026-10-15')).toEqual([]);
    expect(buildHabitWeeks({ '2026-10-05': {} }, H, '2026-10-15')).toEqual([]);
  });
});

describe('streaks', () => {
  const done = (...days: string[]): HabitChecks => Object.fromEntries(days.map((d) => [d, { h1: 'done' as const }]));

  it('counts days done in a row back from today', () => {
    expect(streak(done('2026-10-05', '2026-10-04', '2026-10-03'), 'h1', '2026-10-05')).toBe(3);
  });

  it('counts back from yesterday while today is still unticked', () => {
    expect(streak(done('2026-10-04', '2026-10-03'), 'h1', '2026-10-05')).toBe(2);
  });

  it('stops at a gap or a missed day, and is 0 for a habit never done', () => {
    expect(streak(done('2026-10-05', '2026-10-03'), 'h1', '2026-10-05')).toBe(1);
    expect(streak({ '2026-10-05': { h1: 'missed' }, '2026-10-04': { h1: 'done' } }, 'h1', '2026-10-05')).toBe(0);
    expect(streak({}, 'h1', '2026-10-05')).toBe(0);
  });
});

describe('what the app’s own data says', () => {
  const data = (over: Partial<Parameters<typeof autoSignals>[1]> = {}) => ({ waterMl: 0, weights: [], workouts: [], ...over });
  const D = '2026-10-05';

  it('needs 3 L of water', () => {
    expect(autoSignals(D, data({ waterMl: 2999 })).water).toBe(false);
    expect(autoSignals(D, data({ waterMl: 3000 })).water).toBe(true);
  });

  it('needs a weigh-in that day that is not an evening one', () => {
    const w = (dateISO: string, note?: string) => ({ id: dateISO, dateISO, weightKg: 100, note });
    expect(autoSignals(D, data({ weights: [w(`${D}T07:00:00`)] })).weigh).toBe(true);
    expect(autoSignals(D, data({ weights: [w(`${D}T21:00:00`, 'Cân tối')] })).weigh).toBe(false);
    expect(autoSignals(D, data({ weights: [w('2026-10-04T07:00:00')] })).weigh).toBe(false);
  });

  it('needs a walk of at least 15 minutes that day', () => {
    const wk = (dateISO: string, label: string, durationMin: number) => ({ id: dateISO + label, dateISO, templateId: null, label, durationMin, caloriesBurned: 100 });
    expect(autoSignals(D, data({ workouts: [wk(`${D}T18:00:00`, 'Đi bộ máy dốc 10%', 40)] })).walk).toBe(true);
    expect(autoSignals(D, data({ workouts: [wk(`${D}T18:00:00`, 'Đi bộ', 15)] })).walk).toBe(true); // exactly 15 minutes counts
    expect(autoSignals(D, data({ workouts: [wk(`${D}T18:00:00`, 'Walk to work', 20)] })).walk).toBe(true);
    expect(autoSignals(D, data({ workouts: [wk(`${D}T18:00:00`, 'Đi bộ', 14)] })).walk).toBe(false);
    expect(autoSignals(D, data({ workouts: [wk(`${D}T18:00:00`, 'Bơi', 40)] })).walk).toBe(false);
    expect(autoSignals(D, data({ workouts: [wk('2026-10-04T18:00:00', 'Đi bộ', 40)] })).walk).toBe(false);
  });
});

describe('habit store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useHabitStore.setState({ habits: [], checks: {} });
  });
  const fields = { name: '  Uống nước  ', status: 'building' as const, assessment: 'a', kaizen: 'k', measuredBy: 'm', tracked: true, auto: null };

  it('adds habits in order and syncs each one', () => {
    const a = useHabitStore.getState().addHabit(fields);
    const b = useHabitStore.getState().addHabit({ ...fields, name: 'Đi bộ' });
    expect(a.name).toBe('Uống nước');
    expect(b.sort).toBe(a.sort + 1);
    expect(a.id).not.toBe(b.id);
    expect(mockPushHabit).toHaveBeenCalledTimes(2);
    expect(mockPushHabit).toHaveBeenLastCalledWith(b);
  });

  it('edits a habit and syncs it; an unknown id changes nothing', () => {
    const a = useHabitStore.getState().addHabit(fields);
    useHabitStore.getState().updateHabit(a.id, { status: 'formed', kaizen: 'mới' });
    expect(useHabitStore.getState().habits[0]).toMatchObject({ status: 'formed', kaizen: 'mới', name: 'Uống nước' });
    expect(mockPushHabit).toHaveBeenLastCalledWith(expect.objectContaining({ id: a.id, status: 'formed' }));
    mockPushHabit.mockClear();
    useHabitStore.getState().updateHabit('nope', { status: 'todo' });
    expect(mockPushHabit).not.toHaveBeenCalled();
  });

  it('archives a habit but keeps the ticks it already has', () => {
    const a = useHabitStore.getState().addHabit(fields);
    useHabitStore.getState().setCheck('2026-10-05', a.id, 'done');
    useHabitStore.getState().archiveHabit(a.id);
    expect(useHabitStore.getState().habits[0].archived).toBe(true);
    expect(useHabitStore.getState().checks['2026-10-05'][a.id]).toBe('done');
    mockPushHabit.mockClear();
    useHabitStore.getState().archiveHabit(a.id); // already archived
    expect(mockPushHabit).not.toHaveBeenCalled();
  });

  it('ticks, changes and clears a day, drops a day with nothing left, and syncs every change', () => {
    const s = useHabitStore.getState();
    s.setCheck('2026-10-05', 'h1', 'done');
    s.setCheck('2026-10-05', 'h2', 'missed');
    expect(useHabitStore.getState().checks).toEqual({ '2026-10-05': { h1: 'done', h2: 'missed' } });
    s.setCheck('2026-10-05', 'h1', 'missed');
    expect(useHabitStore.getState().checks['2026-10-05'].h1).toBe('missed');
    s.setCheck('2026-10-05', 'h1', null);
    s.setCheck('2026-10-05', 'h2', null);
    expect(useHabitStore.getState().checks).toEqual({});
    expect(mockPushCheck.mock.calls).toEqual([
      ['h1', '2026-10-05', 'done'],
      ['h2', '2026-10-05', 'missed'],
      ['h1', '2026-10-05', 'missed'],
      ['h1', '2026-10-05', null],
      ['h2', '2026-10-05', null],
    ]);
  });

  it('is cleared when the signed-in account changes', () => {
    useHabitStore.getState().addHabit(fields);
    useHabitStore.getState().setCheck('2026-10-05', 'h1', 'done');
    resetAllLocalStores();
    expect(useHabitStore.getState()).toMatchObject({ habits: [], checks: {} });
  });
});

describe('importing habits from a diary file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useHabitStore.setState({ habits: [], checks: {} });
  });
  const file = (habits: unknown) => JSON.stringify({ format: 'fitjourney-diary', version: 1, weights: [], nutrition: [], workouts: [], habits });
  const h = (id: string, over: Record<string, unknown> = {}) => ({ id, name: 'Uống đủ 3 lít nước', status: 'formed', assessment: 'tốt', kaizen: 'rải đều', measuredBy: '', tracked: true, auto: 'water', sort: 1, archived: false, ...over });

  it('adds the habits, syncs them, and leaves edits alone when the same file is imported again', () => {
    const parsed = parseDiaryImport(file([h('diary-h-01'), h('diary-h-02', { name: 'Cân hàng ngày', auto: 'weigh', sort: 2 })]));
    if (!parsed.ok) throw new Error('parse');
    expect(applyDiaryImport(parsed.data).habitsAdded).toBe(2);
    expect(useHabitStore.getState().habits).toHaveLength(2);
    expect(mockPushHabit).toHaveBeenCalledTimes(2);
    useHabitStore.getState().updateHabit('diary-h-01', { status: 'todo', name: 'Tên của tôi' });
    mockPushHabit.mockClear();
    expect(applyDiaryImport(parsed.data).habitsAdded).toBe(0);
    expect(useHabitStore.getState().habits.find((x) => x.id === 'diary-h-01')).toMatchObject({ status: 'todo', name: 'Tên của tôi' });
    expect(mockPushHabit).not.toHaveBeenCalled();
  });

  it('still accepts files without habits (made before habits existed)', () => {
    const parsed = parseDiaryImport(JSON.stringify({ format: 'fitjourney-diary', version: 1, weights: [], nutrition: [], workouts: [] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(applyDiaryImport(parsed.data).habitsAdded).toBe(0);
  });

  it.each([
    ['an id without the diary- prefix', [h('abc')]],
    ['an empty name', [h('diary-h-01', { name: '  ' })]],
    ['an unknown status', [h('diary-h-01', { status: 'maybe' })]],
    ['an unknown auto kind', [h('diary-h-01', { auto: 'sleep' })]],
    ['a non-boolean tracked flag', [h('diary-h-01', { tracked: 'yes' })]],
    ['a duplicate id', [h('diary-h-01'), h('diary-h-01')]],
    ['habits that are not a list', { a: 1 }],
  ])('rejects the whole file on %s', (_name, habits) => {
    expect(parseDiaryImport(file(habits))).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('copy', () => {
  it('fills placeholders in both languages', () => {
    expect(formatHabitText('vi', 'hb.streak', { n: 4 })).toBe('Chuỗi 4 ngày');
    expect(formatHabitText('en', 'hb.streak', { n: 4 })).toBe('4-day streak');
  });
});
