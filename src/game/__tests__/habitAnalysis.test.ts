import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushHabit = jest.fn();
jest.mock('../../sync/cloudSync', () => ({ pushHabit: (...a: unknown[]) => mockPushHabit(...a), pushHabitCheck: jest.fn() }));

import { analyzeHabits, FORMATION, habitStats, manualMark, weekdayOf } from '../../habits/analysis';
import { formationLabel, habitCandidates, habitInsights, habitToSteadyFirst, kaizenTips } from '../../habits/kaizen';
import type { CheckValue, Habit, HabitAuto, HabitChecks } from '../../habits/types';
import { addDaysToKey } from '../../insights/dateMath';
import { useHabitStore } from '../../store/useHabitStore';

const TODAY = '2026-10-31'; // a Saturday
const habit = (id: string, over: Partial<Habit> = {}): Habit => ({ id, name: `Habit ${id}`, status: 'building', assessment: '', kaizen: '', measuredBy: '', tracked: true, auto: null, sort: Number(id.replace(/\D/g, '')) || 1, archived: false, ...over });

/** Ticks `pattern[i]` on the day i days before today (index 0 = today); '.' leaves the day unticked. */
function ticks(checks: HabitChecks, id: string, pattern: string): HabitChecks {
  [...pattern].forEach((c, i) => {
    if (c === '.') return;
    const d = addDaysToKey(TODAY, -i);
    (checks[d] ??= {})[id] = (c === 'x' ? 'missed' : 'done') as CheckValue;
  });
  return checks;
}
const of = (id: string, pattern: string) => ticks({}, id, pattern);

describe('formed status from the ticks', () => {
  it('needs at least 5 ticks before judging', () => {
    expect(habitStats(of('h1', 'vvvv'), habit('h1'), TODAY).suggested).toBe('new');
    expect(habitStats(of('h1', 'vvvvv'), habit('h1'), TODAY).suggested).toBe('building');
  });

  it('is formed after ≥ 21 days tracked, ≥ 14 ticks in 28 days and ≥ 80 % done', () => {
    // 28 days, 3 misses spread out: 25/28 = 89 %
    const s = habitStats(of('h1', 'vvvvvxvvvvvvvvvxvvvvvvvvvxvv'), habit('h1'), TODAY);
    expect(s.window).toEqual({ done: 25, missed: 3, rate: 25 / 28 });
    expect(s.daysTracked).toBe(28);
    expect(s.suggested).toBe('formed');
    expect(s.verdict).toBe('formed');
    expect(s.progress).toBe(1);
  });

  it('stays "building" while tracked under 21 days, even at 100 %', () => {
    const s = habitStats(of('h1', 'vvvvvvvvvvvvvv'), habit('h1'), TODAY);
    expect(s.daysTracked).toBe(14);
    expect(s.suggested).toBe('building');
    expect(s.progress).toBeCloseTo(14 / 21);
  });

  it('stays "building" with too few ticks in the window, or under 80 %', () => {
    // first tick 24 days ago, only 13 ticks
    expect(habitStats(of('h1', 'v.v.v.v.v.v.v.v.v.v.v.v.v'), habit('h1'), TODAY).suggested).toBe('building');
    // 21 ticks, 16 done = 76 %
    expect(habitStats(of('h1', 'vvxvvxvvxvvxvvxvvvvvv'), habit('h1'), TODAY).suggested).toBe('building');
  });

  it('is "unstable" under 50 %, or with 3 misses in a row right now', () => {
    expect(habitStats(of('h1', 'vxxvxxvxvx'), habit('h1'), TODAY).suggested).toBe('unstable');
    const run = habitStats(of('h1', 'xxxvvvvvvvvvvvvvvvvvvvvvvvvv'), habit('h1'), TODAY);
    expect(run.missRun).toBe(3);
    expect(run.suggested).toBe('unstable');
  });

  it('counts the miss run from yesterday while today is unticked', () => {
    expect(habitStats(of('h1', '.xxv'), habit('h1'), TODAY).missRun).toBe(2);
  });

  it('documents its thresholds', () => {
    expect(FORMATION).toMatchObject({ windowDays: 28, minDaysTracked: 21, minTicksInWindow: 14, formedRate: 0.8, unstableRate: 0.5, unstableMissRun: 3 });
  });
});

describe('manual mark', () => {
  const formedData = 'vvvvvvvvvvvvvvvvvvvvvvvvvvvv';
  const poorData = 'xxvxvxxvxvxx';

  it('reads formedMark first, then a diary status of "formed"', () => {
    expect(manualMark(habit('h1'))).toBeNull();
    expect(manualMark(habit('h1', { status: 'formed' }))).toBe(true);
    expect(manualMark(habit('h1', { status: 'formed', formedMark: false }))).toBe(false);
    expect(manualMark(habit('h1', { formedMark: true }))).toBe(true);
  });

  it('wins over the suggestion, and says so when they disagree; a formed habit that slips is flagged', () => {
    const s = habitStats(of('h1', poorData), habit('h1', { formedMark: true }), TODAY);
    expect(s.suggested).toBe('unstable');
    expect(s.verdict).toBe('formed');
    expect(s.disagree).toBe(true);
    expect(s.slipping).toBe(true);
    expect(formationLabel('vi', s)).toBe('Đã thành thói quen');
    expect(formationLabel('vi', s, s.suggested)).toMatch(/^Chưa ổn định · \d+% trong 28 ngày$/);
  });

  it('"not yet" turns a formed suggestion into building', () => {
    const s = habitStats(of('h1', formedData), habit('h1', { formedMark: false }), TODAY);
    expect(s.suggested).toBe('formed');
    expect(s.verdict).toBe('building');
    expect(s.disagree).toBe(true);
  });

  it('agrees quietly when data and mark match', () => {
    const s = habitStats(of('h1', formedData), habit('h1', { formedMark: true }), TODAY);
    expect(s.disagree).toBe(false);
    expect(s.slipping).toBe(false);
  });

  it('untracked habits are only "formed" when the user says so', () => {
    expect(habitStats({}, habit('h1', { tracked: false }), TODAY).verdict).toBe('untracked');
    expect(habitStats({}, habit('h1', { tracked: false, status: 'formed' }), TODAY).verdict).toBe('formed');
  });

  it('the store keeps status in step with the mark and pushes the habit', () => {
    useHabitStore.setState({ habits: [habit('h1', { status: 'formed' })], checks: {} });
    useHabitStore.getState().setFormedMark('h1', false);
    expect(useHabitStore.getState().habits[0]).toMatchObject({ formedMark: false, status: 'building' });
    useHabitStore.getState().setFormedMark('h1', true);
    expect(useHabitStore.getState().habits[0]).toMatchObject({ formedMark: true, status: 'formed' });
    useHabitStore.getState().setFormedMark('h1', null);
    expect(useHabitStore.getState().habits[0]).toMatchObject({ formedMark: null, status: 'building' });
    expect(manualMark(useHabitStore.getState().habits[0])).toBeNull();
    expect(mockPushHabit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'h1', formedMark: null }));
  });
});

describe('analysis from the ticks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('compares the last 7 days with the 7 before and finds streaks', () => {
    const s = habitStats(of('h1', 'vvvvvvx' + 'vvxxxvx'), habit('h1'), TODAY);
    expect(s.last7).toMatchObject({ done: 6, missed: 1 });
    expect(s.prev7).toMatchObject({ done: 3, missed: 4 });
    expect(s.streak).toBe(6);
    expect(s.bestStreak).toBe(6);
  });

  it('finds the weekday that fails most (≥ 2 misses, ≥ 50 %, above the habit\'s own miss rate)', () => {
    const checks: HabitChecks = {};
    for (let i = 0; i < 56; i++) {
      const d = addDaysToKey(TODAY, -i);
      (checks[d] ??= {}).h1 = weekdayOf(d) === 0 ? 'missed' : 'done';
    }
    const s = habitStats(checks, habit('h1'), TODAY);
    expect(s.worstWeekday).toEqual({ weekday: 0, missed: 8, ticked: 8 });
    const lines = habitInsights('vi', analyzeHabits(checks, [habit('h1', { name: 'Đi ngủ sớm' })], TODAY)).map((l) => l.text);
    expect(lines).toContain('Đi ngủ sớm: hay trượt vào Thứ Hai (8/8 lần).');
    expect(lines).toContain('Thứ Hai là ngày hay trượt nhất: 8/8 lần chưa làm trong 8 tuần qua.');
  });

  it('spots habits that slip on the same days', () => {
    const checks = of('h1', 'xvxvxvxv');
    ticks(checks, 'h2', 'xvxvxvvv');
    ticks(checks, 'h3', 'vvvvvvvv');
    const o = analyzeHabits(checks, [habit('h1', { name: 'A' }), habit('h2', { name: 'B' }), habit('h3', { name: 'C' })], TODAY);
    expect(o.pair).toMatchObject({ a: { id: 'h1' }, b: { id: 'h2' }, both: 3, aMissed: 4, bMissed: 3 });
    expect(habitInsights('vi', o).map((l) => l.text)).toContain('"A" và "B" hay trượt cùng nhau: 3 ngày cùng chưa làm trong 28 ngày (3/4 lần "A" trượt) → sửa một cái có thể kéo cái kia lên.');
  });

  it('compares manual ticks with what the app\'s data shows for auto habits', () => {
    const checks = of('h1', 'vvx.vv');
    // data: water reached today, 1 and 2 days ago and 3 days ago; not 4 days ago
    const sig = (d: string): Record<HabitAuto, boolean> => ({ water: d >= addDaysToKey(TODAY, -3), weigh: false, walk: false });
    const s = habitStats(checks, habit('h1', { auto: 'water' }), TODAY, sig);
    // today ✔+data, -1 ✔+data, -2 ✘ but data (forgot), -3 unticked but data (forgot), -4 and -5 ✔ no data (unconfirmed)
    expect(s.auto).toEqual({ agree: 2, forgot: 2, unconfirmed: 2, days: 6 });
    const lines = habitInsights('vi', { ...analyzeHabits(checks, [habit('h1', { name: 'Nước', auto: 'water' })], TODAY, sig) }).map((l) => l.text);
    expect(lines).toContain('Nước: 2 ngày dữ liệu cho thấy đã làm nhưng chưa tích ✔ (28 ngày) → dùng "Dùng gợi ý".');
    expect(lines).toContain('Nước: 2 ngày tích ✔ nhưng dữ liệu không thấy đủ 3 L nước → nhớ ghi lại trong app.');
  });

  it('cites the numbers in its comments, overall and per habit', () => {
    const checks = of('h1', 'vvvvvvx' + 'vvxxxvx');
    const lines = habitInsights('vi', analyzeHabits(checks, [habit('h1', { name: 'Cân' })], TODAY)).map((l) => l.text);
    expect(lines).toContain('Tổng 7 ngày qua: 6/7 lần tích là đã làm (86%); 7 ngày trước 43% (+43 điểm).');
    expect(lines).toContain('Cân: 7 ngày qua 6/7 (86%), tăng 43 điểm so với 7 ngày trước (43%).');
    expect(lines).toContain('Cân: chuỗi hiện tại 6 ngày, dài nhất 6 ngày.');
    expect(lines.some((l) => l.startsWith('Đã thành thói quen: 0 · đang hình thành: 1'))).toBe(true);
    const en = habitInsights('en', analyzeHabits(checks, [habit('h1', { name: 'Weigh' })], TODAY)).map((l) => l.text);
    expect(en).toContain('Weigh: last 7 days 6/7 (86%), up 43 points from the 7 days before (43%).');
  });

  it('says nothing until there are 5 ticks', () => {
    expect(habitInsights('vi', analyzeHabits(of('h1', 'vvvv'), [habit('h1')], TODAY))).toEqual([]);
  });
});

describe('kaizen', () => {
  it('shrinks and anchors a struggling habit, keeps a forming one, and steps up a formed one', () => {
    const checks: HabitChecks = {};
    for (let i = 0; i < 28; i++) {
      const d = addDaysToKey(TODAY, -i);
      const day = (checks[d] ??= {});
      day.h1 = weekdayOf(d) <= 2 || i < 2 ? 'missed' : i % 2 ? 'done' : 'missed'; // poor: fails Mon–Wed, and the last 2 days (Fri, Sat) → 7 misses in a row
      day.h3 = 'done';
      if (i < 10) day.h2 = i % 3 === 0 ? 'missed' : 'done';
    }
    const habits = [habit('h1', { name: 'Uống nước', auto: 'water' }), habit('h2', { name: 'Ăn chậm' }), habit('h3', { name: 'Cân', auto: 'weigh', kaizen: 'Ghi vòng eo' })];
    const o = analyzeHabits(checks, habits, TODAY);
    expect(o.stats.map((s) => s.verdict)).toEqual(['unstable', 'building', 'formed']);
    const tips = kaizenTips('vi', o).map((l) => l.text);
    expect(tips).toContain('Uống nước: đã 7 ngày liền chưa làm. Quy tắc "không bỏ 2 ngày liên tiếp": hôm nay chỉ cần bản nhỏ nhất.');
    expect(tips.some((t) => /^Uống nước \(\d+%\): thu nhỏ bước, mục tiêu 2 L trước, uống 1 cốc sau mỗi bữa\.$/.test(t))).toBe(true);
    expect(tips.some((t) => t.startsWith('Vào Thứ Hai (ngày "Uống nước" hay trượt: 4/4)'))).toBe(true);
    expect(tips).toContain('Ăn chậm (60%, ngày 10/21): giữ nguyên mức hiện tại, chưa tăng độ khó cho đến khi đạt 80%.');
    expect(tips).toContain('Cân đã ổn định (100%): bước tiếp theo, Ghi vòng eo.');
    expect(habitToSteadyFirst(o)?.name).toBe('Uống nước');
  });

  it('offers new habits the user does not have yet, by auto type or name', () => {
    const have = [habit('h1', { name: 'Uống 2 lít nước', auto: null }), habit('h2', { name: 'Cân hàng ngày' }), habit('h3', { name: 'Không bia', archived: true })];
    const c = habitCandidates('vi', have, 10);
    const ids = c.map((x) => x.id);
    expect(ids).not.toContain('water');
    expect(ids).not.toContain('weigh');
    expect(ids).toContain('alcohol'); // the archived one does not count
    expect(ids[0]).toBe('walk');
    expect(c[0].fields).toMatchObject({ name: 'Đi bộ 15 phút sau bữa', auto: 'walk', tracked: true, status: 'building', formedMark: null });
    expect(habitCandidates('en', [], 3).map((x) => x.name)).toEqual(['Drink 3 L of water a day', 'Weigh in every morning', 'Walk 15 minutes after a meal']);
  });
});
