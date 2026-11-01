import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase');
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { buildWeekInput, type WeekSource } from '../../ai/weeklyReport';
import { evaluatorFor } from '../../ai/coachContext';
import { computeInsights } from '../../insights';
import { thresholdsFrom } from '../../insights/thresholds';
import { buildWeekControl } from '../../insights/weekControl';
import { computeCurrentStreak, computeLongestStreak } from '../../utils/streak';
import { toDateKey } from '../../utils/date';
import type { DailyNutritionLog, DayType, ExtraFoodItem, MealTemplate } from '../../types';
import { bossForWeek } from '../boss';
import { buildDamageLog } from '../bossDamage';
import { evaluateDay } from '../missions';
import { computeGameState } from '../state';

// A cheat day keeps its food on record but is left out of every calorie figure: no deficit, no boss damage or heal, not in
// the insights' sums, neutral for the streak, and marked (not given a deficit) in what the AI is told.

const TDEE = 2500;
const NO_MEALS: Record<DayType, MealTemplate[]> = { training: [], rest: [] };
const NOW = new Date('2026-10-23T20:00:00'); // Friday; the week started Monday 19/10

let seq = 0;
const item = (date: string, calories: number, mealTime: ExtraFoodItem['mealTime'] = 'lunch'): ExtraFoodItem => ({
  id: `i${++seq}`, name: 'món', calories, proteinG: 30, loggedAtISO: `${date}T12:00:00`, mealTime,
});
const log = (date: string, kcal: number): DailyNutritionLog => {
  const items = [item(date, kcal / 3, 'breakfast'), item(date, kcal / 3, 'lunch'), item(date, kcal / 3, 'dinner')];
  return { dateISO: date, mealsEaten: {}, extraCalories: kcal, extraProteinG: 90, extraItems: items, waterMl: 0 };
};
const keyAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return toDateKey(d);
};

const evalInput = (dateKey: string, kcal: number, cheat: boolean) => ({
  dateKey, now: NOW, log: log(dateKey, kcal), mealTemplatesByDayType: NO_MEALS, workouts: [], tdeeKcal: TDEE, proteinTargetG: 100, cheat,
});

describe('a cheat day in the day evaluation', () => {
  it('keeps what was eaten but has no deficit and earns no deficit mission', () => {
    const normal = evaluateDay(evalInput('2026-10-20', 1500, false));
    const cheat = evaluateDay(evalInput('2026-10-20', 1500, true));
    expect(normal).toMatchObject({ deficitKcal: 1000, cheat: false });
    expect(cheat).toMatchObject({ deficitKcal: null, cheat: true, eatenKcal: 1500 });
    expect(cheat.missions.find((m) => m.id === 'deficit')?.status).toBe('missed');
    expect(cheat.earnedXp).toBeLessThan(normal.earnedXp);
  });
});

describe('a cheat day in the game state and bosses', () => {
  const logs = { '2026-10-19': log('2026-10-19', 1500), '2026-10-20': log('2026-10-20', 4500), '2026-10-21': log('2026-10-21', 1500) };
  const base = { now: NOW, startDateISO: '2026-10-19T08:00:00', logs, workoutEntries: [], mealTemplatesByDayType: NO_MEALS, tdeeKcal: TDEE, proteinTargetG: 100 };

  it('the weekly boss neither loses nor regains HP on it', () => {
    const plain = computeGameState(base);
    const marked = computeGameState({ ...base, cheatDays: ['2026-10-20'] });
    expect(plain.boss.days.find((d) => d.dateKey === '2026-10-20')).toMatchObject({ deficitKcal: -2000, damage: 0, cheat: false });
    expect(marked.boss.days.find((d) => d.dateKey === '2026-10-20')).toMatchObject({ deficitKcal: null, damage: 0, cheat: true });
    expect(marked.boss.totalDamage).toBe(2000);
    expect(marked.days.find((d) => d.dateKey === '2026-10-20')).toMatchObject({ cheat: true, deficitKcal: null, eatenKcal: 4500 });
    expect(bossForWeek(NOW, () => 1000, undefined, (k) => k === '2026-10-22').days.find((d) => d.dateKey === '2026-10-22')).toMatchObject({ damage: 0, cheat: true });
  });

  it('the stage damage log has no estimate for it (no damage, no heal) and marks it', () => {
    const game = computeGameState({ ...base, cheatDays: ['2026-10-20'] });
    const dmg = buildDamageLog({ days: game.days, entries: [], startKg: 110, startDateKey: '2026-10-19', bosses: [] });
    expect(dmg.days.find((d) => d.dateKey === '2026-10-20')).toMatchObject({ cheat: true, deficitKcal: null, estKg: null });
    expect(dmg.estTotalKg).toBeCloseTo(2000 / 7700);
  });
});

describe('a cheat day in the streak', () => {
  // Three good days with a cheat day (a big surplus) in the middle.
  const logs: Record<string, DailyNutritionLog> = {};
  for (let i = 1; i <= 4; i++) logs[keyAgo(i)] = log(keyAgo(i), i === 2 ? 5000 : 1500);

  it('is neutral: it neither breaks the run nor adds to it', () => {
    expect(computeCurrentStreak(logs, NO_MEALS, [], TDEE, NOW)).toBe(1);
    expect(computeCurrentStreak(logs, NO_MEALS, [], TDEE, NOW, [keyAgo(2)])).toBe(3);
    expect(computeLongestStreak(logs, NO_MEALS, [], TDEE)).toBe(2);
    expect(computeLongestStreak(logs, NO_MEALS, [], TDEE, [keyAgo(2)])).toBe(3);
  });
});

describe('a cheat day in the insights', () => {
  const th = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 600, saltG: 5, sugarG: 35 } });
  const logs = { '2026-10-19': log('2026-10-19', 1500), '2026-10-20': log('2026-10-20', 5000), '2026-10-21': log('2026-10-21', 1500) };
  const input = { logs, mealTemplates: NO_MEALS, workouts: [], weights: [], tdeeNowKcal: TDEE, startWeightKg: 110, goalWeightKg: 95, thresholds: th };

  it('is left out of the counted days, the running deficit and the averages, but stays on record', () => {
    const out = computeInsights({ ...input, cheatDays: ['2026-10-20'] });
    expect(out.rows.map((r) => r.dateKey)).toEqual(['2026-10-19', '2026-10-21']);
    expect(out.allRows.map((r) => [r.dateKey, r.cheat])).toEqual([['2026-10-19', false], ['2026-10-20', true], ['2026-10-21', false]]);
    expect(out.totalDeficit).toBe(2000);
    expect(out.windows[0].avgDeficitAll).toBe(1000);
    expect(computeInsights(input).totalDeficit).toBe(-500);
  });

  it('shrinks the weekly target by a day and is not a day left to catch up', () => {
    const rows = computeInsights({ ...input, cheatDays: ['2026-10-20', '2026-10-24'] }).rows;
    const wc = buildWeekControl(rows, [], TDEE, th, ['2026-10-20', '2026-10-24'])!;
    expect(wc.targetDeficit).toBe(5000);
    expect(wc.achieved).toBe(2000);
    expect(wc.daysLeft).toBe(3); // 22, 23, 25 (24 is a cheat day)
  });
});

describe('a cheat day in what the AI is told', () => {
  const logs = { '2026-10-19': log('2026-10-19', 1500), '2026-10-20': log('2026-10-20', 5000) };
  const source: WeekSource = {
    logs, workoutEntries: [], mealTemplates: NO_MEALS, tdeeKcal: TDEE, proteinTargetG: 100, limits: { purineMg: 600, saltG: 5, sugarG: 35 },
    weights: [], dailyDeficitKcal: 1000, waterTargetMl: 2000, cheatDays: ['2026-10-20'],
  };

  it('the weekly review marks it instead of giving its deficit, and leaves it out of the patterns and the boss', () => {
    const week = buildWeekInput(source, NOW);
    const cheat = week.days.find((d) => d.date === '2026-10-20')!;
    expect(cheat).toMatchObject({ logged: true, cheatDay: true, damage: 0, eatenKcal: 5000 });
    expect(cheat.deficitKcal).toBeUndefined();
    expect(week.patterns).toMatchObject({ daysLogged: 1, cheatDays: 1, avgDeficitKcal: 1000 });
    expect(week.boss.damageSoFar).toBe(1000);
  });

  it('the coach snapshot day evaluator gives no deficit on it', () => {
    const { evaluate, isCheatDay } = evaluatorFor(source, NOW);
    expect(evaluate('2026-10-20')).toMatchObject({ cheat: true, deficitKcal: null });
    expect(isCheatDay('2026-10-20')).toBe(true);
    expect(evaluatorFor({ ...source, cheatDays: undefined }, NOW).evaluate('2026-10-20').deficitKcal).toBe(-2500);
  });
});
