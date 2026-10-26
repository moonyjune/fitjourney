import { describe, expect, it } from '@jest/globals';
import { DEFAULT_MEAL_TEMPLATES } from '../../constants/plan';
import { computeInsights } from '../../insights';
import { buildDayRows, dayScore } from '../../insights/days';
import { addDaysToKey, dayNumber, mondayOf } from '../../insights/dateMath';
import { computeEfficiency, efficiencyBand } from '../../insights/efficiency';
import { computeFatWater, waterLevel } from '../../insights/fatWater';
import { EXERCISE_CATALOG, kcalPer10Min, kcalPerUnit, planExercises } from '../../insights/exercises';
import { computeForecast } from '../../insights/forecast';
import { fmtDec, fmtInt, fmtSigned } from '../../insights/format';
import { buildPeriods } from '../../insights/periods';
import { thresholdsFrom } from '../../insights/thresholds';
import { windowStats } from '../../insights/windows';
import { isEveningNote, toWeighs, weightAtDay } from '../../insights/weights';
import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime, WeightEntry, WorkoutLogEntry } from '../../types';

const th = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 600, saltG: 5, sugarG: 35 } });

let seq = 0;
const item = (mealTime: ExtraMealTime | null, calories: number, extra: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: `i${++seq}`,
  name: 'x',
  calories,
  proteinG: 0,
  loggedAtISO: '2026-10-05T05:00:00.000Z',
  mealTime,
  ...extra,
});
const log = (dateKey: string, items: ExtraFoodItem[], mealsEaten: DailyNutritionLog['mealsEaten'] = {}): DailyNutritionLog => ({
  dateISO: dateKey,
  mealsEaten,
  extraCalories: items.reduce((s, i) => s + i.calories, 0),
  extraProteinG: items.reduce((s, i) => s + i.proteinG, 0),
  extraItems: items,
  waterMl: 0,
});
/** A complete day: three main meals sharing `kcal`. */
const fullDay = (dateKey: string, kcal: number) =>
  log(dateKey, (['breakfast', 'lunch', 'dinner'] as const).map((m) => item(m, kcal / 3)));
const weigh = (dateKey: string, weightKg: number, note?: string): WeightEntry => ({ id: dateKey + weightKg, dateISO: `${dateKey}T12:00:00`, weightKg, note });
const workout = (dateKey: string, caloriesBurned: number): WorkoutLogEntry => ({ id: `w${dateKey}`, dateISO: `${dateKey}T12:00:00`, templateId: null, label: 'Walk', durationMin: 30, caloriesBurned });

describe('date math', () => {
  it('counts whole days and finds Mondays independent of time zone', () => {
    expect(dayNumber('2026-10-06') - dayNumber('2026-10-05')).toBe(1);
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05'); // a Monday
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); // the Sunday after it
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
  });
});

describe('thresholds', () => {
  it('derive from the user’s own targets and limits', () => {
    expect(th).toMatchObject({ deficitOk: 1000, deficitFair: 700, proteinOk: 110, purineMax: 600, purineFair: 750, sugarMax: 35, sodiumMax: 2000, sodiumFair: 3000 });
    expect(thresholdsFrom({ targetDailyDeficitKcal: 500, proteinTargetG: 100, limits: { purineMg: 1200, saltG: 7, sugarG: 25 } }).sodiumMax).toBe(2800);
  });
});

describe('day rows', () => {
  const day1 = log('2026-10-05', [
    item('breakfast', 400, { proteinG: 40, purineMg: 100, saltG: 1, sugarG: 3 }),
    item('lunch', 600, { proteinG: 40, purineMg: 100, saltG: 2, sugarG: 3 }),
    item('dinner', 500, { proteinG: 40, purineMg: 100, saltG: 2, sugarG: 4 }),
  ]);
  const day2 = log('2026-10-06', [item('breakfast', 600), item('lunch', 700)]); // no dinner
  const rows = buildDayRows({ logs: { '2026-10-06': day2, '2026-10-05': day1 }, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [workout('2026-10-06', 200)], tdeeFor: () => 2500 });

  it('sums the day, converts salt to sodium, and builds the running deficit oldest first', () => {
    expect(rows.map((r) => r.dateKey)).toEqual(['2026-10-05', '2026-10-06']);
    expect(rows[0]).toMatchObject({ kcal: 1500, proteinG: 120, purineMg: 300, sugarG: 10, sodiumMg: 2000, exerciseKcal: 0, deficit: 1000, cumDeficit: 1000, complete: true, missing: [] });
    // day 2: 2500 + 200 burned - 1300 eaten
    expect(rows[1]).toMatchObject({ kcal: 1300, exerciseKcal: 200, deficit: 1400, cumDeficit: 2400, complete: false, missing: ['dinner'] });
  });

  it('counts a skipped meal recorded as 0 kcal as covered, and ignores days with nothing on record', () => {
    const skipped = log('2026-10-07', [item('breakfast', 0), item('lunch', 500), item('dinner', 500)]);
    const empty = log('2026-10-08', []);
    const r = buildDayRows({ logs: { '2026-10-07': skipped, '2026-10-08': empty }, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 });
    expect(r).toHaveLength(1);
    expect(r[0].complete).toBe(true);
  });

  it('counts ticked plan meals (with their calories, protein and estimated purine) and maps them onto the main meals', () => {
    const training = DEFAULT_MEAL_TEMPLATES.training;
    const rest = DEFAULT_MEAL_TEMPLATES.rest;
    // 2026-10-05 is a Monday; pick whichever plan applies and tick all three meals.
    const meals = ((): typeof training => {
      const probe = buildDayRows({ logs: { '2026-10-05': log('2026-10-05', [], { meal1: true, meal2: true, meal3: true }) }, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 0 })[0];
      return probe.kcal === training.reduce((s, m) => s + m.calories, 0) ? training : rest;
    })();
    const r = buildDayRows({ logs: { '2026-10-05': log('2026-10-05', [], { meal1: true, meal2: true, meal3: true }) }, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 })[0];
    expect(r.kcal).toBe(meals.reduce((s, m) => s + m.calories, 0));
    expect(r.proteinG).toBe(meals.reduce((s, m) => s + m.proteinG, 0));
    expect(r.complete).toBe(true);
    const one = buildDayRows({ logs: { '2026-10-05': log('2026-10-05', [], { meal2: true }) }, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 })[0];
    expect(one.missing).toEqual(['breakfast', 'dinner']);
  });

  it('scores a complete day 0-10 from the five indicators and leaves incomplete days unscored', () => {
    expect(dayScore(rows[0], th)).toBe(2 + 2 + 2 + 2 + 2); // deficit 1000, protein 120, purine 300, sugar 10, sodium 2000
    expect(dayScore(rows[1], th)).toBeNull();
    const bad = { ...rows[0], deficit: 100, proteinG: 50, purineMg: 900, sugarG: 60, sodiumMg: 4000 };
    expect(dayScore(bad, th)).toBe(0);
    const middling = { ...rows[0], deficit: 800, proteinG: 95, purineMg: 700, sugarG: 45, sodiumMg: 2500 };
    expect(dayScore(middling, th)).toBe(5);
  });
});

describe('weigh-ins', () => {
  it('reads an evening note, converts to a morning equivalent, and excludes it from the trend', () => {
    expect(isEveningNote('Cân tối, sau ăn')).toBe(true);
    expect(isEveningNote('evening weigh')).toBe(true);
    expect(isEveningNote('Cân sáng')).toBe(false);
    expect(isEveningNote('Tối qua ăn mặn, sáng nay cân')).toBe(true); // matches the word; the user marks evening readings explicitly
    expect(isEveningNote(undefined)).toBe(false);
    const w = toWeighs([weigh('2026-10-02', 105), weigh('2026-10-01', 107, 'Cân tối')], th);
    expect(w.map((x) => x.dateKey)).toEqual(['2026-10-01', '2026-10-02']);
    expect(w[0]).toMatchObject({ evening: true, kg: 107 });
    expect(w[0].morningKg).toBeCloseTo(105.8, 5);
    expect(w[1]).toMatchObject({ evening: false, morningKg: 105 });
  });

  it('interpolates weight between weigh-ins and holds it flat outside them', () => {
    const w = toWeighs([weigh('2026-10-01', 100), weigh('2026-10-11', 90)], th);
    expect(weightAtDay(w, '2026-09-20')).toBe(100);
    expect(weightAtDay(w, '2026-10-06')).toBeCloseTo(95, 5);
    expect(weightAtDay(w, '2026-10-30')).toBe(90);
    expect(weightAtDay([], '2026-10-01')).toBeNull();
  });
});

/** 15 complete days from 2026-10-01, eating `kcal` each, TDEE 2500. */
function span(kcal: number, days = 15, from = '2026-10-01') {
  const logs: Record<string, DailyNutritionLog> = {};
  for (let i = 0; i < days; i++) {
    const k = addDaysToKey(from, i);
    logs[k] = fullDay(k, kcal);
  }
  return buildDayRows({ logs, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 });
}

describe('efficiency', () => {
  it('is 1 with fewer than two usable weigh-ins', () => {
    expect(computeEfficiency(toWeighs([weigh('2026-10-01', 100)], th), span(1100), th)).toMatchObject({ applied: 1, count: 1 });
    // an evening reading does not count
    expect(computeEfficiency(toWeighs([weigh('2026-10-01', 100), weigh('2026-10-15', 98, 'Cân tối')], th), span(1100), th).count).toBe(1);
  });

  it('measures how much of the paper deficit shows up on the scale, trusting it only as far as the weigh-ins allow', () => {
    // 3 weigh-ins, -1 kg per week => -2 kg over 14 days. Deficit 1400/day => paper loss 2.545 kg => raw 0.786.
    const weighs = toWeighs([weigh('2026-10-01', 100), weigh('2026-10-08', 99), weigh('2026-10-15', 98)], th);
    const e = computeEfficiency(weighs, span(1100), th);
    expect(e.spanDays).toBe(14);
    expect(e.actualLossKg).toBeCloseTo(2, 6);
    expect(e.avgDeficit).toBeCloseTo(1400, 6);
    expect(e.theoryLossKg).toBeCloseTo((1400 * 14) / 7700, 6);
    expect(e.raw).toBeCloseTo(2 / ((1400 * 14) / 7700), 6);
    expect(e.confidence).toBeCloseTo(0.3, 6); // 3 of 10 weigh-ins
    expect(e.applied).toBeCloseTo(0.3 * e.raw + 0.7, 6);
    expect(e.kgPer1000).toBeCloseTo((1000 * e.applied) / 7700, 9);
  });

  it('clamps an extreme reading before blending it in, and names the band', () => {
    // Scale falls 5 kg while the paper deficit is only ~0.4 kg: raw is huge, so it is clamped to 1.3.
    const weighs = toWeighs(Array.from({ length: 10 }, (_, i) => weigh(addDaysToKey('2026-10-01', i), 100 - i * (5 / 9))), th);
    const e = computeEfficiency(weighs, span(2300, 10), th);
    expect(e.raw).toBeGreaterThan(1.3);
    expect(e.confidence).toBe(1);
    expect(e.applied).toBe(1.3);
    expect(efficiencyBand(0.5)).toBe('low');
    expect(efficiencyBand(0.7)).toBe('slow');
    expect(efficiencyBand(1)).toBe('good');
    expect(efficiencyBand(1.2)).toBe('fast');
  });
});

describe('fat versus water', () => {
  it('splits the scale into fat (from the deficit) and water, and labels the retention level', () => {
    expect(waterLevel(2, th)).toBe('high');
    expect(waterLevel(0.8, th)).toBe('mild');
    expect(waterLevel(0, th)).toBe('normal');
    expect(waterLevel(-0.5, th)).toBe('normal');
    expect(waterLevel(-1, th)).toBe('releasing');

    // Efficiency 1, deficit 1400/day. Fat line drops 1400/7700 = 0.1818 kg/day.
    const rows = span(1100, 15);
    const weighs = toWeighs([weigh('2026-10-01', 100), weigh('2026-10-08', 98.7), weigh('2026-10-15', 97.4)], th);
    const eff = { ...computeEfficiency(weighs, rows, th), applied: 1 };
    const fw = computeFatWater(weighs, rows, eff, 1400, th);
    expect(fw.points).toHaveLength(3);
    // fat drop between the first and last weigh-in = 14 days x 1400 kcal / 7700
    expect(fw.points[0].fatLineKg - fw.points[2].fatLineKg).toBeCloseTo((14 * 1400) / 7700, 6);
    expect(fw.fatLostKg).toBeCloseTo((15 * 1400) / 7700, 6);
    expect(fw.scaleLostKg).toBeCloseTo(2.6, 6);
    // water points are the scale minus the fat line and average to ~0 because the line is anchored to the weigh-ins
    expect(fw.points.reduce((s, p) => s + p.waterKg, 0) / 3).toBeCloseTo(0, 6);
    expect(fw.fatPerWeekKg).toBeCloseTo(((15 * 1400) / 7700 / 15) * 7, 6);
  });

  it('turns an evening weigh-in into a morning equivalent before judging water', () => {
    const rows = span(1100, 15);
    const weighs = toWeighs([weigh('2026-10-01', 100), weigh('2026-10-14', 97.5), weigh('2026-10-15', 99, 'Cân tối')], th);
    const eff = { ...computeEfficiency(weighs, rows, th), applied: 1 };
    const fw = computeFatWater(weighs, rows, eff, 1400, th);
    const last = fw.latest!;
    expect(last.evening).toBe(true);
    expect(last.morningKg).toBeCloseTo(97.8, 6);
    expect(last.waterKg).toBeCloseTo(last.morningKg - last.fatLineKg, 9);
  });
});

describe('forecast', () => {
  const rows = span(1500, 10); // deficit exactly 1000 every day
  const weighs = toWeighs([weigh('2026-10-10', 100)], th);
  const eff = { ...computeEfficiency(weighs, rows, th), applied: 1 };

  it('is null with nothing to start from', () => {
    expect(computeForecast([], rows, eff, 2500, 95, th)).toBeNull();
    expect(computeForecast(weighs, [], eff, 2500, 95, th)).toBeNull();
  });

  it('projects a falling weight whose daily deficit shrinks as weight drops', () => {
    const f = computeForecast(weighs, rows, eff, 2500, 95, th)!;
    expect(f.avgDeficit).toBeCloseTo(1000, 6);
    expect(f.startKg).toBe(100);
    expect(f.startKey).toBe('2026-10-11');
    expect(f.points.map((p) => p.days)).toEqual([7, 14, 30, 60, 90]);
    // the first day removes exactly 1000/7700 kg; later days slightly less
    const oneWeekNaive = (7 * 1000) / 7700;
    expect(f.points[0].lostKg).toBeLessThan(oneWeekNaive);
    expect(f.points[0].lostKg).toBeGreaterThan(oneWeekNaive - 0.01);
    expect(f.points[1].lostKg).toBeGreaterThan(f.points[0].lostKg);
    expect(f.points[0].high - f.points[0].kg).toBe(th.waterBand);
    expect(f.points[0].kg - f.points[0].low).toBe(th.waterBand);
    // 100 -> 95 kg at ~0.13 kg/day, slowing a little: between 38 and 45 days
    expect(f.daysToGoal).toBeGreaterThanOrEqual(38);
    expect(f.daysToGoal).toBeLessThanOrEqual(45);
    expect(f.goalDateKey).toBe(addDaysToKey('2026-10-10', f.daysToGoal!));
  });

  it('shrinks the daily deficit by 13 kcal for every kg already lost (a lighter body burns less)', () => {
    const f = computeForecast(weighs, rows, eff, 2500, 95, th)!;
    // Independent walk through 7 days: intake is 1500 kcal, TDEE = 2500 - 13 x (kg lost so far).
    let kg = 100;
    for (let d = 0; d < 7; d++) kg -= (2500 - 13 * (100 - kg) - 1500) / 7700;
    expect(f.points[0].kg).toBeCloseTo(kg, 9);
    expect(f.points[0].kg).toBeGreaterThan(100 - 7000 / 7700); // would be lower if the deficit did not shrink
  });

  it('starts below the last weigh-in by the deficit logged after it, and handles goals already met or out of reach', () => {
    const later = span(1500, 12); // two more logged days after the 10-10 weigh-in
    const f = computeForecast(weighs, later, eff, 2500, 95, th)!;
    expect(f.startKg).toBeCloseTo(100 - 2000 / 7700, 6);
    expect(computeForecast(weighs, rows, eff, 2500, 101, th)!.daysToGoal).toBe(0);
    const noDeficit = span(2500, 10);
    expect(computeForecast(weighs, noDeficit, eff, 2500, 95, th)!.daysToGoal).toBeNull();
    expect(computeForecast(weighs, rows, eff, 2500, null, th)!.daysToGoal).toBeNull();
  });
});

describe('windows', () => {
  it('averages the last N calendar days and prefers complete days for the deficit', () => {
    const rows = span(1500, 10);
    // make the last day incomplete: remove dinner
    const logs: Record<string, DailyNutritionLog> = {};
    for (let i = 0; i < 10; i++) {
      const k = addDaysToKey('2026-10-01', i);
      logs[k] = i === 9 ? log(k, [item('breakfast', 500), item('lunch', 500)]) : fullDay(k, 1500);
    }
    const r = buildDayRows({ logs, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 });
    const w7 = windowStats(r, 7)!;
    expect(w7.daysWithData).toBe(7);
    expect(w7.completeDays).toBe(6);
    expect(w7.avgDeficit).toBe(1000); // complete days only
    expect(w7.avgDeficitAll).toBeCloseTo((6 * 1000 + 1500) / 7, 6);
    expect(windowStats(r, null)!.daysWithData).toBe(10);
    expect(windowStats(rows, 3)!.fromKey).toBe('2026-10-08');
    expect(windowStats([], 7)).toBeNull();
  });
});

describe('weekly and monthly summaries', () => {
  const mk = (dateKey: string, p: number, purine: number, salt: number, sugar: number, kcal: number, complete = true) =>
    log(
      dateKey,
      (complete ? (['breakfast', 'lunch', 'dinner'] as const) : (['breakfast', 'lunch'] as const)).map((m, i) =>
        item(m, kcal / (complete ? 3 : 2), { proteinG: i === 0 ? p : 0, purineMg: i === 0 ? purine : 0, saltG: i === 0 ? salt : 0, sugarG: i === 0 ? sugar : 0 })
      )
    );
  const logs = {
    '2026-10-05': mk('2026-10-05', 120, 300, 5, 10, 1500),
    '2026-10-06': mk('2026-10-06', 80, 700, 8, 40, 2000),
    '2026-10-07': mk('2026-10-07', 100, 200, 4, 5, 1300, false), // dinner missing
  };
  const rows = buildDayRows({ logs, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [workout('2026-10-07', 200)], tdeeFor: () => 2500 });
  const weighs = toWeighs([weigh('2026-10-05', 100), weigh('2026-10-07', 99)], th);
  const eff = { ...computeEfficiency(weighs, rows, th), applied: 0.8 };
  const weeks = buildPeriods('week', rows, weighs, eff, th);

  it('groups Monday to Sunday and totals the period', () => {
    expect(weeks).toHaveLength(1);
    const w = weeks[0];
    expect(w).toMatchObject({ kind: 'week', key: '2026-10-05', fromKey: '2026-10-05', toKey: '2026-10-11', days: 3, missingDays: 1 });
    expect(w.avgKcal).toBeCloseTo((1500 + 2000 + 1300) / 3, 6);
    expect(w.avgDeficitFull).toBeCloseTo(750, 6); // (1000 + 500) / 2 complete days
    expect(w.avgDeficitAll).toBeCloseTo((1000 + 500 + 1400) / 3, 6);
    expect(w.avgDeficit).toBeCloseTo(750, 6);
    expect(w.totalDeficit).toBe(2900);
    expect(w.theoryFatKg).toBeCloseTo(2900 / 7700, 9);
    expect(w.fatKg).toBeCloseTo((2900 / 7700) * 0.8, 9);
    expect(w.daysMeetDeficit).toBe(2); // 1000 and 1400
    expect(w.avgProteinG).toBe(100);
    expect(w.daysProteinOk).toBe(1);
    expect(w.avgPurineMg).toBeCloseTo(400, 6);
    expect(w.maxPurineMg).toBe(700);
    expect(w.daysPurineOver).toBe(1);
    expect(w.avgSodiumMg).toBeCloseTo((2000 + 3200 + 1600) / 3, 6);
    expect(w.daysSodiumOver).toBe(1);
    expect(w.avgWeightKg).toBeCloseTo(99.5, 6);
    expect(w.minWeightKg).toBe(99);
    // day 1 = 10 (all five green); day 2 = deficit 500 (0) + protein 80 (0) + purine 700 (1) + sugar 40 (1) + sodium 3200 (0) = 2
    expect(w.avgScore).toBe(6);
    expect(w.deltaDeficit).toBeNull();
  });

  it('lists strengths and things to improve from the figures', () => {
    const w = weeks[0];
    const keys = (f: { key: string }[]) => f.map((x) => x.key);
    expect(keys(w.strengths)).toEqual(['purine', 'sugar']);
    expect(keys(w.improvements)).toEqual(['deficit', 'protein', 'purineDays', 'sodium', 'missing']);
    expect(w.improvements.find((f) => f.key === 'deficit')).toMatchObject({ value: 750, extra: 250 });
    expect(w.improvements.find((f) => f.key === 'sodium')).toMatchObject({ extra: 1, total: 3 });
  });

  it('puts missing data first in the one-change suggestion, otherwise the indicator furthest from target', () => {
    expect(weeks[0].kaizen).toEqual({ kind: 'data', value: 1 });

    const completeLogs: Record<string, DailyNutritionLog> = {};
    for (let i = 0; i < 5; i++) completeLogs[addDaysToKey('2026-10-12', i)] = mk(addDaysToKey('2026-10-12', i), 120, 300, 8, 10, 1500);
    const r = buildDayRows({ logs: completeLogs, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 });
    const k = buildPeriods('week', r, [], eff, th)[0].kaizen!;
    expect(k.kind).toBe('sodium'); // 3200 mg vs 2000 mg is the widest gap
    expect(k.value).toBeCloseTo(3200, 6);

    const perfect: Record<string, DailyNutritionLog> = {};
    for (let i = 0; i < 5; i++) perfect[addDaysToKey('2026-10-12', i)] = mk(addDaysToKey('2026-10-12', i), 120, 300, 4, 10, 1500);
    const rp = buildDayRows({ logs: perfect, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 });
    expect(buildPeriods('week', rp, [], eff, th)[0].kaizen).toEqual({ kind: 'steady', value: 0 });
  });

  it('compares each period with the one before it and groups by calendar month', () => {
    const two: Record<string, DailyNutritionLog> = { ...logs };
    for (let i = 0; i < 7; i++) two[addDaysToKey('2026-10-12', i)] = mk(addDaysToKey('2026-10-12', i), 120, 300, 4, 10, 1300);
    const r = buildDayRows({ logs: two, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], tdeeFor: () => 2500 });
    const ws = buildPeriods('week', r, [], eff, th);
    expect(ws.map((w) => w.key)).toEqual(['2026-10-05', '2026-10-12']);
    expect(ws[1].deltaDeficit).toBeCloseTo(1200 - ws[0].avgDeficit, 6);
    expect(ws[1].strengths.map((f) => f.key)).toContain('deficitUp');
    expect(ws[0].improvements.map((f) => f.key)).not.toContain('deficitDown');

    const months = buildPeriods('month', r, [], eff, th);
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ kind: 'month', key: '2026-10', fromKey: '2026-10-01', toKey: '2026-10-31', days: 10 });
    expect(buildPeriods('week', [], [], eff, th)).toEqual([]);
  });
});

describe('computeInsights', () => {
  it('ties the pieces together and uses each day’s own body weight for the energy burned at rest', () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (let i = 0; i < 15; i++) logs[addDaysToKey('2026-10-01', i)] = fullDay(addDaysToKey('2026-10-01', i), 1500);
    const out = computeInsights({
      logs,
      mealTemplates: DEFAULT_MEAL_TEMPLATES,
      workouts: [],
      weights: [weigh('2026-10-01', 110), weigh('2026-10-15', 100)],
      tdeeNowKcal: 2500,
      startWeightKg: 110,
      goalWeightKg: 95,
      thresholds: th,
    });
    expect(out.currentWeightKg).toBe(100);
    // 13 kcal per kg: the first day (110 kg) burns 130 kcal more than the last (100 kg)
    expect(out.rows[0].tdee).toBeCloseTo(2630, 6);
    expect(out.rows[14].tdee).toBeCloseTo(2500, 6);
    expect(out.rows[0].tdee).toBeGreaterThan(out.rows[7].tdee);
    expect(out.rows[7].tdee).toBeGreaterThan(out.rows[14].tdee);
    expect(out.totalDeficit).toBe(out.rows[14].cumDeficit);
    expect(out.windows.map((w) => w.days)).toEqual([7, 14, 30, null]);
    expect(out.forecast).not.toBeNull();
    expect(out.weeks.length).toBeGreaterThan(0);
    expect(out.months).toHaveLength(1);
  });

  it('returns empty, safe results with no data at all', () => {
    const out = computeInsights({ logs: {}, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], weights: [], tdeeNowKcal: 2500, startWeightKg: 110, goalWeightKg: 95, thresholds: th });
    expect(out.rows).toEqual([]);
    expect(out.windows).toEqual([]);
    expect(out.forecast).toBeNull();
    expect(out.currentWeightKg).toBe(110);
    expect(out.totalDeficit).toBe(0);
  });
});

describe('exercise catalogue', () => {
  it('burns only what is above rest: (MET - 1) x kg x hours', () => {
    const walk = EXERCISE_CATALOG.find((e) => e.id === 'walk-steps')!;
    expect(kcalPerUnit(walk, 105)).toBeCloseTo(0.039375, 9); // matches the diary sheet
    expect(kcalPer10Min(walk, 105)).toBeCloseTo(43.75, 9);
    const brisk = EXERCISE_CATALOG.find((e) => e.id === 'walk-brisk')!;
    expect(kcalPerUnit(brisk, 105)).toBeCloseTo(5.775, 9);
  });

  it('sizes the gap in steps and in the suggested daily set, and says what is left for food', () => {
    const plan = planExercises(312.43, 105);
    expect(plan.gapKcal).toBeCloseTo(312.43, 6);
    expect(plan.stepsToCloseGap).toBeCloseTo(7934.69, 0);
    expect(plan.bundle.length).toBe(8);
    expect(plan.bundleKcal).toBeCloseTo(364.9, 1); // same total as the sheet's suggested set at 105 kg
    expect(plan.leftForFoodKcal).toBe(0);
    const big = planExercises(700, 105);
    expect(big.leftForFoodKcal).toBeCloseTo(700 - big.bundleKcal, 6);
    expect(planExercises(-50, 105)).toMatchObject({ gapKcal: 0, leftForFoodKcal: 0 });
    // a lighter body burns less for the same moves
    expect(planExercises(300, 80).bundleKcal).toBeLessThan(plan.bundleKcal);
  });

  it('gives every exercise a name in both languages, a tip, and a joint rating', () => {
    expect(new Set(EXERCISE_CATALOG.map((e) => e.id)).size).toBe(EXERCISE_CATALOG.length);
    for (const e of EXERCISE_CATALOG) {
      expect(e.nameVi.length).toBeGreaterThan(2);
      expect(e.nameEn.length).toBeGreaterThan(2);
      expect(e.tipVi.length).toBeGreaterThan(5);
      expect(e.tipEn.length).toBeGreaterThan(5);
      expect(['friendly', 'careful', 'avoid']).toContain(e.joint);
      expect(e.met).toBeGreaterThan(1);
    }
  });
});

describe('number formatting', () => {
  it('uses the reader’s separators', () => {
    expect(fmtInt(3885, 'vi')).toBe('3.885');
    expect(fmtInt(3885, 'en')).toBe('3,885');
    expect(fmtInt(-1234567, 'en')).toBe('-1,234,567');
    expect(fmtInt(-0.2, 'en')).toBe('0');
    expect(fmtDec(0.5234, 2, 'vi')).toBe('0,52');
    expect(fmtDec(104.89, 1, 'en')).toBe('104.9');
    expect(fmtSigned(120, 'en')).toBe('+120');
    expect(fmtSigned(-45, 'en')).toBe('-45');
  });
});
