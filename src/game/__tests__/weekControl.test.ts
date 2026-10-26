import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

import { classifyMainMeals, type MainMealRecord } from '../../feedback/flex';
import type { DiaryItem } from '../../feedback/items';
import { addDaysToKey } from '../../insights/dateMath';
import type { DayRow } from '../../insights/days';
import { thresholdsFrom } from '../../insights/thresholds';
import { buildWeekControl, buildWeekQuotas } from '../../insights/weekControl';
import type { ExtraMealTime } from '../../types';

const th = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 600, saltG: 5, sugarG: 35 } });

let seq = 0;
const item = (dateKey: string, mealTime: ExtraMealTime | null, text: string, over: Partial<DiaryItem> = {}): DiaryItem => ({
  id: `i${++seq}`,
  dateKey,
  text,
  mealTime,
  kcal: 500,
  proteinG: 30,
  purineMg: 100,
  sugarG: 0,
  sodiumMg: 600,
  ...over,
});
const cls = (items: DiaryItem[]) => classifyMainMeals(items, th).map((m) => `${m.dateKey}:${m.slot}:${m.cls}`);
const D = '2026-10-05'; // a Monday

describe('classifying main meals for 80/20', () => {
  it('counts an ordinary breakfast, lunch and dinner as on plan, and ignores snacks', () => {
    expect(cls([item(D, 'breakfast', 'cơm'), item(D, 'lunch', 'cơm'), item(D, 'dinner', 'cơm'), item(D, 'afternoon_snack', 'snack', { kcal: 2000 }), item(D, null, 'x')])).toEqual([
      `${D}:breakfast:onPlan`,
      `${D}:lunch:onPlan`,
      `${D}:dinner:onPlan`,
    ]);
  });

  it('makes a meal flexible when it is over 900 kcal, over half the purine limit, or over 75% of the sodium limit', () => {
    expect(cls([item(D, 'lunch', 'cơm', { kcal: 900 })])).toEqual([`${D}:lunch:onPlan`]);
    expect(cls([item(D, 'lunch', 'cơm', { kcal: 901 })])).toEqual([`${D}:lunch:flexible`]);
    expect(cls([item(D, 'lunch', 'cơm', { purineMg: 300 })])).toEqual([`${D}:lunch:onPlan`]);
    expect(cls([item(D, 'lunch', 'cơm', { purineMg: 301 })])).toEqual([`${D}:lunch:flexible`]);
    expect(cls([item(D, 'lunch', 'cơm', { sodiumMg: 1500 })])).toEqual([`${D}:lunch:onPlan`]);
    expect(cls([item(D, 'lunch', 'cơm', { sodiumMg: 1501 })])).toEqual([`${D}:lunch:flexible`]);
  });

  it('follows the user’s own purine and sodium limits', () => {
    const strict = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 400, saltG: 3, sugarG: 35 } });
    expect(classifyMainMeals([item(D, 'lunch', 'cơm', { purineMg: 250, sodiumMg: 100 })], strict)[0].cls).toBe('flexible'); // 250 > 400 / 2
    expect(classifyMainMeals([item(D, 'lunch', 'cơm', { sodiumMg: 1000 })], strict)[0].cls).toBe('flexible'); // 1,000 > 75% of 1,200
  });

  it('makes a meal flexible when it holds a food the rules say to replace, but not for a mere note or a good food', () => {
    expect(cls([item(D, 'lunch', '1 bát mì tôm')])).toEqual([`${D}:lunch:flexible`]);
    expect(cls([item(D, 'lunch', 'phở bò')])).toEqual([`${D}:lunch:onPlan`]); // "phở" is only a note
    expect(cls([item(D, 'lunch', 'ức gà + rau')])).toEqual([`${D}:lunch:onPlan`]);
  });

  it('takes the items of one meal together', () => {
    // two items of 500 kcal in one lunch = 1,000 kcal > 900
    expect(cls([item(D, 'lunch', 'cơm'), item(D, 'lunch', 'thịt')])).toEqual([`${D}:lunch:flexible`]);
    // a skipped note next to real food does not make it skipped
    expect(cls([item(D, 'lunch', 'Không ăn', { kcal: 0 }), item(D, 'lunch', 'cơm')])).toEqual([`${D}:lunch:onPlan`]);
  });

  it('records a skipped meal as skipped, whatever the numbers say', () => {
    expect(cls([item(D, 'breakfast', 'Dậy muộn – không ăn', { kcal: 0, sodiumMg: 0, purineMg: 0 })])).toEqual([`${D}:breakfast:skipped`]);
  });

  it('lists meals oldest day first, and in breakfast, lunch, dinner order within a day', () => {
    const out = cls([item('2026-10-06', 'dinner', 'a'), item(D, 'dinner', 'a'), item(D, 'breakfast', 'a'), item('2026-10-06', 'lunch', 'a')]);
    expect(out).toEqual([`${D}:breakfast:onPlan`, `${D}:dinner:onPlan`, '2026-10-06:lunch:onPlan', '2026-10-06:dinner:onPlan']);
  });
});

const row = (dateKey: string, over: Partial<DayRow> = {}): DayRow => ({
  dateKey,
  kcal: 1500,
  proteinG: 120,
  purineMg: 300,
  sugarG: 10,
  sodiumMg: 1800,
  exerciseKcal: 0,
  tdee: 2500,
  deficit: 1000,
  cumDeficit: 0,
  complete: true,
  missing: [],
  ...over,
});
const meal = (dateKey: string, c: MainMealRecord['cls'], slot: MainMealRecord['slot'] = 'lunch'): MainMealRecord => ({ dateKey, slot, cls: c });
const week = (n: number, over: (i: number) => Partial<DayRow> = () => ({})) => Array.from({ length: n }, (_, i) => row(addDaysToKey(D, i), over(i)));

describe('the current week', () => {
  it('is null with nothing logged', () => {
    expect(buildWeekControl([], [], 2500, th)).toBeNull();
  });

  it('finds the week of the latest logged day and sizes the weekly target, what is achieved and what is left', () => {
    const wc = buildWeekControl(week(5), [], 2500, th)!;
    expect(wc).toMatchObject({ weekStart: D, weekEnd: '2026-10-11', lastDataKey: '2026-10-09', daysWithData: 5, daysLeft: 2, targetDeficit: 7000, achieved: 5000, short: 2000, safeMaxPerDay: 1200 });
    expect(wc.pctTarget).toBeCloseTo(5000 / 7000, 9);
    expect(wc.neededPerDay).toBe(1000);
    expect(wc.maxPossiblePct).toBe(1); // 5,000 + 2 x 1,200 is already past the target
  });

  it('puts rows from other weeks aside', () => {
    const rows = [row('2026-09-30', { deficit: 5000 }), ...week(3)];
    expect(buildWeekControl(rows, [], 2500, th)!.achieved).toBe(3000);
  });

  it('is on track when the rest of the target is within a normal day', () => {
    expect(buildWeekControl(week(5), [], 2500, th)!.deficitStatus).toBe('onTrack');
  });

  it('asks for more effort when the remaining days must beat the daily target but stay safe', () => {
    // achieved 4,100 of 7,000 over 5 days => 2,900 short / 2 days = 1,450 (over 1,000, under the safe 1,500 at TDEE 2,800)
    const wc = buildWeekControl(week(5, () => ({ deficit: 820 })), [], 2800, th)!;
    expect(wc.neededPerDay).toBe(1450);
    expect(wc.safeMaxPerDay).toBe(1500);
    expect(wc.deficitStatus).toBe('push');
  });

  it('warns of a miss when the days left would have to go beyond the safe deficit, and says the best that is still possible', () => {
    const wc = buildWeekControl(week(5, () => ({ deficit: 820 })), [], 2500, th)!; // needs 1,450 > safe 1,200
    expect(wc.deficitStatus).toBe('risk');
    expect(wc.maxPossiblePct).toBeCloseTo((4100 + 2 * 1200) / 7000, 9);
  });

  it('is done as soon as the target is met, and reports the end of a week that fell short', () => {
    expect(buildWeekControl(week(5, () => ({ deficit: 1500 })), [], 2500, th)!.deficitStatus).toBe('done');
    const ended = buildWeekControl(week(7, () => ({ deficit: 500 })), [], 2500, th)!;
    expect(ended).toMatchObject({ daysLeft: 0, neededPerDay: null, maxPossiblePct: null, deficitStatus: 'ended' });
    expect(buildWeekControl(week(7), [], 2500, th)!.deficitStatus).toBe('done');
  });

  it('tracks the flexible-meal allowance: 4 of the week’s 21 meals', () => {
    const meals = (flex: number): MainMealRecord[] => [
      ...Array.from({ length: flex }, (_, i) => meal(addDaysToKey(D, i), 'flexible')),
      ...Array.from({ length: 6 }, (_, i) => meal(addDaysToKey(D, i), 'onPlan', 'dinner')),
      meal(D, 'skipped', 'breakfast'),
    ];
    const ok = buildWeekControl(week(3), meals(2), 2500, th)!;
    expect(ok).toMatchObject({ quota: 4, flexible: 2, quotaLeft: 2, quotaStatus: 'ok', mainMeals: 9, onPlan: 6, skipped: 1 });
    expect(ok.pctOnPlan).toBeCloseTo(6 / 9, 9);
    expect(buildWeekControl(week(3), meals(4), 2500, th)).toMatchObject({ quotaLeft: 0, quotaStatus: 'used' });
    expect(buildWeekControl(week(3), meals(5), 2500, th)).toMatchObject({ quotaLeft: -1, quotaStatus: 'over' });
    expect(buildWeekControl(week(3), [], 2500, th)!.pctOnPlan).toBeNull();
  });

  it('counts surplus days, days under the minimum, purine days over the limit and the average sodium', () => {
    const rows = [row(D, { deficit: -50 }), row(addDaysToKey(D, 1), { kcal: 1200 }), row(addDaysToKey(D, 2), { kcal: 1200, complete: false, missing: ['dinner'] }), row(addDaysToKey(D, 3), { purineMg: 700, sodiumMg: 2800 })];
    const wc = buildWeekControl(rows, [], 2500, th)!;
    expect(wc).toMatchObject({ surplusDays: 1, lowKcalDays: 1, purineOverDays: 1 }); // an incomplete day is not judged on kcal
    expect(wc.avgSodiumMg).toBeCloseTo((1800 + 1800 + 1800 + 2800) / 4, 6);
  });
});

describe('the 80/20 record by week', () => {
  const meals = (flex: number, onPlan: number, d = D): MainMealRecord[] => [
    ...Array.from({ length: flex }, () => meal(d, 'flexible')),
    ...Array.from({ length: onPlan }, () => meal(d, 'onPlan')),
  ];

  it('gives one line per logged week, with the deficit as a share of days x target', () => {
    const rows = [...week(7), ...week(3).map((r) => row(addDaysToKey(r.dateKey, 7), { deficit: 500 }))];
    const q = buildWeekQuotas(rows, [...meals(3, 17), ...meals(1, 8, '2026-10-12')], th);
    expect(q.map((w) => w.weekStart)).toEqual([D, '2026-10-12']);
    expect(q[0]).toMatchObject({ dataDays: 7, totalDeficit: 7000, mainMeals: 20, flexible: 3, allowed: 4, over: 0, verdict: 'ok' });
    expect(q[0].pctTarget).toBe(1);
    expect(q[0].pctOnPlan).toBeCloseTo(17 / 20, 9);
    expect(q[1]).toMatchObject({ dataDays: 3, mainMeals: 9, flexible: 1, allowed: 2 });
    expect(q[1].pctTarget).toBeCloseTo(1500 / 3000, 9);
  });

  it('grades the week: within the allowance is ok, up to 2 over is fair, more is bad', () => {
    const verdict = (flex: number, onPlan: number) => buildWeekQuotas(week(7), meals(flex, onPlan), th)[0];
    expect(verdict(4, 16)).toMatchObject({ allowed: 4, over: 0, verdict: 'ok' });
    expect(verdict(5, 15)).toMatchObject({ over: 1, verdict: 'fair' });
    expect(verdict(6, 14)).toMatchObject({ over: 2, verdict: 'fair' });
    expect(verdict(7, 13)).toMatchObject({ over: 3, verdict: 'bad' });
  });

  it('counts surplus days and copes with a week that has no main meals', () => {
    const q = buildWeekQuotas([row(D, { deficit: -10 }), row(addDaysToKey(D, 1))], [], th);
    expect(q[0]).toMatchObject({ surplusDays: 1, mainMeals: 0, flexible: 0, pctOnPlan: null, allowed: 0, over: 0, verdict: 'ok' });
    expect(buildWeekQuotas([], [], th)).toEqual([]);
  });
});
