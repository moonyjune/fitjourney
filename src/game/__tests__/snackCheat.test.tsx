import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { DEFAULT_PLAN, getDayType } from '../../constants/plan';
import { classifyMainMeals } from '../../feedback/flex';
import { buildDiaryItems } from '../../feedback/items';
import { toggleSnackWithUndo } from '../../food/mealActions';
import { coversMeal, isSnackItem, planSaveEntries, snackMarks, snackTogglePlan } from '../../food/snackItems';
import { buildDayRows } from '../../insights/days';
import { thresholdsFrom } from '../../insights/thresholds';

const TH = thresholdsFrom({ targetDailyDeficitKcal: 500, proteinTargetG: 120, limits: { purineMg: 1200, saltG: 7, sugarG: 50 } });
import { bufferedKcal, CHEAT_MEAL_BUFFER, cheatDayPlan, cheatMealKcal, recoveryPlan, RECOVERY_MAX_PER_DAY } from '../cheatPlan';
import { bossForWeek } from '../boss';
import { COVER_MIN_KCAL, coveredMealIds, mealDefs } from '../mealSlots';
import { buildTimeline } from '../timeline';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useToastStore } from '../../store/useToastStore';
import type { DailyNutritionLog, ExtraFoodItem, MealPart } from '../../types';

const DAY = '2026-11-18';
const FRIDAY = new Date('2026-10-23T12:00:00');
const planMeals = DEFAULT_PLAN.mealTemplates[getDayType(FRIDAY)];
const part = (name: string, calories: number, proteinG = 5, more: Partial<MealPart> = {}): MealPart => ({ name, calories, proteinG, ...more });
const x = (name: string, kcal: number, mealTime: ExtraFoodItem['mealTime'], hour = 12, more: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: name,
  name,
  calories: kcal,
  proteinG: 10,
  loggedAtISO: `2026-10-23T${String(hour).padStart(2, '0')}:00:00`,
  mealTime,
  ...more,
});
const log = (over: Partial<DailyNutritionLog>): DailyNutritionLog => ({ dateISO: '2026-10-23', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0, ...over });

describe('"Ăn vặt" per food: what the check step saves', () => {
  const rows = [
    { key: 'a', part: part('Cơm 150g', 200, 4) },
    { key: 'b', part: part('Gà kho', 300, 25, { saltG: 1.5 }) },
    { key: 'c', part: part('Bim bim 30g', 160, 2, { saltG: 0.4 }) },
  ];

  it('nothing ticked: one meal, as before 1.5 (named after its foods, or the title typed)', () => {
    const [meal, ...rest] = planSaveEntries(rows, new Set());
    expect(rest).toHaveLength(0);
    expect(meal).toMatchObject({ name: 'Cơm 150g, Gà kho, Bim bim 30g', calories: 660, proteinG: 31, saltG: 1.9, snack: false, keys: ['a', 'b', 'c'] });
    expect(meal.parts).toHaveLength(3);
    expect(planSaveEntries(rows, new Set(), 'Bữa trưa')[0].name).toBe('Bữa trưa');
    // One food: its own name, no breakdown.
    expect(planSaveEntries(rows.slice(0, 1), new Set())[0]).toMatchObject({ name: 'Cơm 150g', calories: 200, snack: false });
    expect(planSaveEntries(rows.slice(0, 1), new Set())[0].parts).toBeUndefined();
  });

  it('a ticked food is a snack entry of its own; the rest stay one meal; kcal all counted', () => {
    const entries = planSaveEntries(rows, new Set(['c']));
    expect(entries.map((e) => [e.name, e.calories, e.snack])).toEqual([
      ['Cơm 150g, Gà kho', 500, false],
      ['Bim bim 30g', 160, true],
    ]);
    expect(entries.reduce((s, e) => s + e.calories, 0)).toBe(660);
    expect(entries[1].parts).toBeUndefined();
    // Every food ticked: each its own snack, no meal.
    expect(planSaveEntries(rows, new Set(['a', 'b', 'c'])).map((e) => e.snack)).toEqual([true, true, true]);
  });

  it('a logged meal: a food ticked leaves the meal (totals move by exactly that food, the title follows); a single food is marked', () => {
    const meal: ExtraFoodItem = { ...x('Cơm 150g, Gà kho, Bim bim 30g', 660, 'lunch'), proteinG: 31, saltG: 1.9, parts: rows.map((r) => r.part) };
    const plan = snackTogglePlan(meal, 2);
    expect(plan).toMatchObject({ kind: 'split', part: { name: 'Bim bim 30g', calories: 160 }, patch: { calories: 500, proteinG: 29, saltG: 1.5, name: 'Cơm 150g, Gà kho' } });
    // Two foods: one left, so no breakdown and the food's own name.
    const two: ExtraFoodItem = { ...x('Cơm 150g, Bim bim 30g', 360, 'lunch'), parts: [rows[0].part, rows[2].part] };
    expect(snackTogglePlan(two, 1)).toMatchObject({ kind: 'split', patch: { calories: 200, name: 'Cơm 150g', parts: undefined } });
    // A title typed by the user stays.
    expect(snackTogglePlan({ ...meal, name: 'Bữa trưa' }, 2)).not.toHaveProperty('patch.name');
    const single = x('Bim bim', 160, 'afternoon_snack');
    expect(snackTogglePlan(single, 0)).toEqual({ kind: 'flag', on: true, patch: { snack: true, junk: true } });
    expect(snackTogglePlan({ ...single, junk: true }, 0)).toEqual({ kind: 'flag', on: false, patch: { snack: undefined, junk: undefined } });
    expect(snackTogglePlan(single, 1)).toBeNull();
    expect(snackMarks({ ...single, snack: true, junk: true }, 1)).toEqual([true]);
    expect(snackMarks(meal, 3)).toEqual([false, false, false]);
  });

  it('old data: a whole meal marked junk before 1.5 is shown as "Ăn vặt" but still covers its meal; a 1.5 snack never does', () => {
    expect(isSnackItem({ junk: true })).toBe(true);
    expect(coversMeal({})).toBe(true);
    expect(coversMeal({ snack: true })).toBe(false);
    const defs = mealDefs(false, planMeals);
    const ids = (l: DailyNutritionLog) => [...coveredMealIds(false, defs, planMeals, l)].sort();
    expect(ids(log({ extraItems: [x('Gà rán', 600, 'lunch', 12, { junk: true })] }))).toEqual(['lunch']);
    expect(ids(log({ extraItems: [x('Bim bim', 600, 'lunch', 12, { junk: true, snack: true })] }))).toEqual([]);
    expect(ids(log({ extraItems: [x('Cơm', COVER_MIN_KCAL, 'lunch'), x('Bim bim', 300, 'lunch', 12, { junk: true, snack: true })] }))).toEqual(['lunch']);
    // Fasting: a snack never covers a plan meal either.
    const fdefs = mealDefs(true, planMeals);
    expect(coveredMealIds(true, fdefs, planMeals, log({ extraItems: [{ ...x('Pizza', 1500, 'lunch'), snack: true }] })).size).toBe(0);
  });

  it('the day rows (missing meals), the 80/20 meals and the timeline treat a snack as a snack', () => {
    const logs = { [DAY]: log({ dateISO: DAY, extraItems: [x('Bim bim', 400, 'lunch', 12, { snack: true, junk: true }), x('Phở', 500, 'dinner', 19)] }) };
    const rows = buildDayRows({ logs, mealTemplates: DEFAULT_PLAN.mealTemplates, workouts: [], tdeeFor: () => 2200 });
    expect(rows[0].missing).toEqual(['breakfast', 'lunch']);
    expect(rows[0].kcal).toBe(900); // still counted
    const items = buildDiaryItems(logs, DEFAULT_PLAN.mealTemplates);
    expect(classifyMainMeals(items, TH).map((m) => m.slot)).toEqual(['dinner']);
    const timeline = buildTimeline({ dateKey: DAY, now: new Date(`${DAY}T22:00:00`), log: logs[DAY], meals: [], waterSchedule: [], workouts: [], feelings: [], photoSlots: new Set() });
    const extras = timeline.filter((i) => i.kind === 'extra');
    expect(extras.map((i) => (i.kind === 'extra' ? [i.name, !!i.snack, i.junk] : null))).toEqual([
      ['Bim bim', true, true],
      ['Phở', false, false],
    ]);
  });

  it('the toggle in a logged meal\'s detail splits the food out, with Hoàn tác putting the meal back whole', () => {
    const meal: ExtraFoodItem = {
      id: 'm1',
      name: 'Cơm 150g, Gà kho, Bim bim 30g',
      calories: 660,
      proteinG: 31,
      saltG: 1.9,
      mealTime: 'lunch',
      loggedAtISO: `${DAY}T12:15:00`,
      parts: rows.map((r) => r.part),
    };
    useNutritionStore.setState({ logs: { [DAY]: log({ dateISO: DAY, extraItems: [meal], extraCalories: 660, extraProteinG: 31 }) } });
    expect(toggleSnackWithUndo(DAY, 'm1', 2, { on: 'on {name}', off: 'off {name}', split: 'tách {name}' })).toBe(true);
    const items = useNutritionStore.getState().logs[DAY].extraItems;
    expect(items.map((i) => [i.name, i.calories, !!i.snack, !!i.junk])).toEqual([
      ['Cơm 150g, Gà kho', 500, false, false],
      ['Bim bim 30g', 160, true, true],
    ]);
    expect(new Date(items[1].loggedAtISO).getHours()).toBe(12);
    expect(new Date(items[1].loggedAtISO).getMinutes()).toBe(15);
    expect(items[1].mealTime).toBe('lunch');
    expect(useNutritionStore.getState().logs[DAY].extraCalories).toBe(660);
    expect(useToastStore.getState().toast?.text).toBe('tách Bim bim 30g');
    useToastStore.getState().undo();
    expect(useNutritionStore.getState().logs[DAY].extraItems).toEqual([meal]);
    // A single food is marked, then unmarked.
    toggleSnackWithUndo(DAY, 'm1', 0, { on: 'on {name}', off: 'off {name}', split: 'tách {name}' });
    useToastStore.getState().hide();
    expect(useNutritionStore.getState().logs[DAY].extraItems).toHaveLength(2);
  });
});

describe('cheat meal and cheat day: the numbers', () => {
  beforeEach(() => {
    useNutritionStore.setState({ logs: {} });
  });

  it('a cheat meal = a typical restaurant portion × 1.3', () => {
    expect(CHEAT_MEAL_BUFFER).toBe(1.3);
    expect(cheatMealKcal(800)).toEqual({ base: 800, buffered: 1040, extra: 240 });
    expect(cheatMealKcal(-5)).toEqual({ base: 0, buffered: 0, extra: 0 });
    expect(bufferedKcal(455)).toBe(592);
  });

  it('recovery: spread over 2 days, 3 when bigger, at most 300 kcal a day; the rest is let go', () => {
    expect(recoveryPlan(0)).toEqual({ days: 0, perDayKcal: 0, coveredKcal: 0, leftKcal: 0 });
    expect(recoveryPlan(500)).toEqual({ days: 2, perDayKcal: 250, coveredKcal: 500, leftKcal: 0 });
    expect(recoveryPlan(600)).toEqual({ days: 2, perDayKcal: 300, coveredKcal: 600, leftKcal: 0 });
    expect(recoveryPlan(700)).toEqual({ days: 3, perDayKcal: 240, coveredKcal: 700, leftKcal: 0 });
    expect(recoveryPlan(1300)).toEqual({ days: 3, perDayKcal: RECOVERY_MAX_PER_DAY, coveredKcal: 900, leftKcal: 400 });
  });

  it('a cheat day: budget = TDEE, the boss still takes the target, only the part over the TDEE is to make up (weight), with the player\'s numbers', () => {
    const under = cheatDayPlan({ tdeeKcal: 2400, targetDeficitKcal: 500, eatenKcal: 2100 });
    expect(under).toMatchObject({ normalBudgetKcal: 1900, budgetKcal: 2400, extraKcal: 500, overKcal: 0, leftKcal: 300, bossHitKcal: 500, bossHitPct: 6, overFatG: 0 });
    expect(under.recovery).toEqual({ days: 0, perDayKcal: 0, coveredKcal: 0, leftKcal: 0, dayBudgetKcal: 1900 });
    const over = cheatDayPlan({ tdeeKcal: 2400, targetDeficitKcal: 500, eatenKcal: 3170 });
    expect(over).toMatchObject({ overKcal: 770, leftKcal: 0, bossHitKcal: 500, bossHitPct: 6, overFatG: 100 });
    expect(over.recovery).toEqual({ days: 3, perDayKcal: 260, coveredKcal: 770, leftKcal: 0, dayBudgetKcal: 1640 });
  });

  it('consistent with the existing mark: a marked cheat day heals nothing (no target given: deals nothing), and the boss spreads its HP over the other days', () => {
    // Monday 2026-11-16 … Sunday 22; judged on Wednesday 18 evening, Thursday 19 marked as a cheat day ahead.
    const now = new Date('2026-11-18T21:00:00');
    const deficit = (k: string) => (k === '2026-11-17' ? -800 : 600);
    const plain = bossForWeek(now, deficit);
    const marked = bossForWeek(now, deficit, undefined, (k) => k === '2026-11-17' || k === '2026-11-19');
    expect(plain.days.find((d) => d.dateKey === '2026-11-17')).toMatchObject({ damage: 0, cheat: false });
    expect(marked.days.find((d) => d.dateKey === '2026-11-17')).toMatchObject({ damage: 0, cheat: true, deficitKcal: null });
    // Four days left (Thu–Sun) without the mark, three with Thursday marked: more needed on each.
    expect(plain.neededPerRemainingDay).toBe(Math.ceil(plain.hpLeft / 4));
    expect(marked.neededPerRemainingDay).toBe(Math.ceil(marked.hpLeft / 3));
  });
});
