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
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
  pushProofPhoto: jest.fn(),
}));

import { buildMealPlan, COVER_MIN_KCAL, coveredMealIds, mealBrief, mealCardVisible, mealDefs, mealTimeFor, MIN_MEAL_KCAL, periodOfItem, remainingMeals, splitBudget, type DayTotals, type MealPlan } from '../../ai/mealSplit';
import { acceptDinner } from '../../ai/dinner';
import { DEFAULT_PLAN, getDayType } from '../../constants/plan';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';
import { eatingEndHour, eatingStartHour, isFasting, lateMealHour, NORMAL_EATING_END_HOUR, NORMAL_EATING_START_HOUR } from '../../utils/mealMode';

const FRIDAY = new Date('2026-10-23T12:00:00');
const planMeals = DEFAULT_PLAN.mealTemplates[getDayType(FRIDAY)];
const TOTALS: DayTotals = { hour: 8, dayTargetKcal: 1600, budgetKcal: 1200, proteinLeftG: 120, headroom: { purine: 800, salt: 5, sugar: 20 }, limits: { purine: 1200, salt: 7, sugar: 25 } };

describe('meal mode helpers', () => {
  it('fasting: window 12-20 and a late meal from 20:00; normal day: 6-22 and a late meal from 21:00', () => {
    expect([eatingStartHour(true), eatingEndHour(true), lateMealHour(true)]).toEqual([12, 20, 20]);
    expect([eatingStartHour(false), eatingEndHour(false), lateMealHour(false)]).toEqual([NORMAL_EATING_START_HOUR, NORMAL_EATING_END_HOUR, 21]);
  });
});

describe('meal mode store', () => {
  beforeEach(() => {
    mockPushUserData.mockClear();
    useMealModeStore.setState({ fasting: true });
  });

  it('is on by default, mirrors every change into the pure helpers, and saves the choice to the cloud', () => {
    expect(useMealModeStore.getState().fasting).toBe(true);
    expect(isFasting()).toBe(true);
    useMealModeStore.getState().setFasting(false);
    expect(isFasting()).toBe(false);
    expect(eatingEndHour()).toBe(22);
    expect(mockPushUserData).toHaveBeenCalledWith('mealMode', { fasting: false });
    useMealModeStore.setState({ fasting: true }); // a plain setState (restore, tests) is mirrored too
    expect(isFasting()).toBe(true);
    expect(eatingEndHour()).toBe(20);
  });
});

describe('mealDefs', () => {
  it('fasting: the plan\'s meals at the plan\'s times, each until the next starts, the last until the window closes; weights from the plan', () => {
    const defs = mealDefs(true, planMeals);
    expect(defs.map((d) => d.id)).toEqual(planMeals.map((m) => m.slot));
    expect(defs.map((d) => d.kind)).toEqual(['lunch', 'meal', 'dinner']); // first = lunch, last = dinner, the one between a snack-like meal
    expect(mealDefs(true, planMeals.slice(0, 1)).map((d) => d.kind)).toEqual(['dinner']); // a single meal is the last one of the day
    expect(defs[0].endMinutes).toBe(planMeals[1].startHour * 60 + planMeals[1].startMinute);
    expect(defs[2].endMinutes).toBe(20 * 60);
    expect(defs[0].weight).toBe(planMeals[0].calories);
    expect(defs[0].label).toBe(planMeals[0].label);
    expect(defs[2].plan).toEqual({ kcal: planMeals[2].calories, proteinG: planMeals[2].proteinG });
  });

  it('normal day: breakfast, lunch and dinner with fixed times and weights 25/35/40, the last until 22:00', () => {
    const defs = mealDefs(false, planMeals);
    expect(defs.map((d) => [d.id, d.startHour, d.startMinute, d.weight])).toEqual([['breakfast', 7, 0, 0.25], ['lunch', 12, 0, 0.35], ['dinner', 18, 30, 0.4]]);
    expect(defs.map((d) => d.endMinutes)).toEqual([10 * 60 + 30, 15 * 60, 22 * 60]);
    expect(defs.every((d) => d.label === undefined && d.plan === undefined)).toBe(true);
  });
});

describe('periodOfItem', () => {
  const item = (mealTime: ExtraFoodItem['mealTime'] | undefined, hour: number) => ({ mealTime, loggedAtISO: `2026-10-23T${String(hour).padStart(2, '0')}:00:00` });
  it('goes by the meal time the user chose', () => {
    expect(periodOfItem(item('breakfast', 20))).toBe('breakfast');
    expect(periodOfItem(item('morning_snack', 20))).toBe('breakfast');
    expect(periodOfItem(item('lunch', 8))).toBe('lunch');
    expect(periodOfItem(item('afternoon_snack', 8))).toBe('lunch');
    expect(periodOfItem(item('late_afternoon_snack', 8))).toBe('dinner');
    expect(periodOfItem(item('dinner', 8))).toBe('dinner');
    expect(periodOfItem(item('evening_snack', 8))).toBe('dinner');
  });
  it('else by the hour it was logged: before 10:30 breakfast, before 15:00 lunch, later dinner', () => {
    expect(periodOfItem(item(null, 9))).toBe('breakfast');
    expect(periodOfItem(item(undefined, 10))).toBe('breakfast');
    expect(periodOfItem({ mealTime: null, loggedAtISO: '2026-10-23T10:30:00' })).toBe('lunch');
    expect(periodOfItem(item(null, 14))).toBe('lunch');
    expect(periodOfItem(item(null, 15))).toBe('dinner');
  });
});

const x = (name: string, kcal: number, mealTime: ExtraFoodItem['mealTime'], hour = 12): ExtraFoodItem => ({ id: name, name, calories: kcal, proteinG: 10, loggedAtISO: `2026-10-23T${String(hour).padStart(2, '0')}:00:00`, mealTime });
const log = (over: Partial<DailyNutritionLog>): DailyNutritionLog => ({ dateISO: '2026-10-23', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0, ...over });

describe('coveredMealIds', () => {
  it('fasting: a plan meal ticked eaten or removed is covered; off-plan food does not cover a plan meal', () => {
    const defs = mealDefs(true, planMeals);
    expect([...coveredMealIds(true, defs, planMeals, log({ mealsEaten: { meal1: true }, removedMealSlots: ['meal2'] }))].sort()).toEqual(['meal1', 'meal2']);
    expect(coveredMealIds(true, defs, planMeals, log({ extraItems: [{ ...x('Cơm', 900, 'lunch'), proteinG: 60 }] })).size).toBe(0);
    expect(coveredMealIds(true, defs, planMeals, undefined).size).toBe(0);
  });

  it('normal day: a period is covered by 150 kcal or more logged for it; the plan\'s first two meals count as lunch, the last as dinner', () => {
    const defs = mealDefs(false, planMeals);
    const ids = (l: DailyNutritionLog) => [...coveredMealIds(false, defs, planMeals, l)].sort();
    expect(ids(log({ extraItems: [x('Bánh mì', COVER_MIN_KCAL, 'breakfast', 8)] }))).toEqual(['breakfast']);
    expect(ids(log({ extraItems: [x('Bánh mì', COVER_MIN_KCAL - 1, 'breakfast', 8)] }))).toEqual([]);
    expect(ids(log({ extraItems: [x('Trái cây', 100, 'lunch'), x('Sữa chua', 60, 'afternoon_snack', 14)] }))).toEqual(['lunch']); // 100 + 60 together
    expect(ids(log({ mealsEaten: { meal1: true } }))).toEqual(['lunch']);
    expect(ids(log({ mealsEaten: { meal2: true } }))).toEqual(['lunch']);
    expect(ids(log({ mealsEaten: { meal3: true } }))).toEqual(['dinner']);
  });
});

describe('remainingMeals', () => {
  it('drops meals that are covered, and meals whose time is over', () => {
    const defs = mealDefs(false, planMeals);
    expect(remainingMeals(defs, new Set(), 8 * 60).map((d) => d.id)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(remainingMeals(defs, new Set(['lunch']), 8 * 60).map((d) => d.id)).toEqual(['breakfast', 'dinner']);
    expect(remainingMeals(defs, new Set(), 10 * 60 + 30).map((d) => d.id)).toEqual(['lunch', 'dinner']); // breakfast ends at 10:30 exactly
    expect(remainingMeals(defs, new Set(), 10 * 60 + 29).map((d) => d.id)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(remainingMeals(defs, new Set(), 16 * 60).map((d) => d.id)).toEqual(['dinner']);
    expect(remainingMeals(defs, new Set(), 22 * 60)).toEqual([]);
  });
});

describe('splitBudget', () => {
  const defs = mealDefs(false, planMeals);
  const split = (budget: number, from = 0, over: Partial<DayTotals> = {}) => splitBudget(defs.slice(from), { ...TOTALS, budgetKcal: budget, ...over });

  it('a full budget over three meals by weight (25/35/40), the figures adding up exactly', () => {
    const { meals, merged } = split(1200);
    expect(meals.map((m) => m.slot.id)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(meals.map((m) => m.kcal)).toEqual([300, 420, 480]);
    expect(meals.map((m) => m.proteinG)).toEqual([30, 42, 48]);
    expect(merged).toEqual([]);
    expect(meals.every((m) => !m.light)).toBe(true);
    expect(meals.reduce((s, m) => s + m.kcal, 0)).toBe(1200);
    expect(meals.reduce((s, m) => s + m.proteinG, 0)).toBe(120);
  });

  it('a share of exactly 250 kcal is still a meal (1,000 kcal: 250 / 350 / 400)', () => {
    expect(split(1000).meals.map((m) => m.kcal)).toEqual([250, 350, 400]);
    expect(split(999).meals.length).toBe(2); // 999 × .25 = 249.75 is not a meal
  });

  it('rounding never loses or invents a calorie: the last meal takes what is left (1,001 kcal)', () => {
    const { meals } = split(1001, 0, { proteinLeftG: 101 });
    expect(meals.reduce((s, m) => s + m.kcal, 0)).toBe(1001);
    expect(meals.reduce((s, m) => s + m.proteinG, 0)).toBe(101);
  });

  it('shares of the room left in each limit follow the same split', () => {
    const { meals } = split(1200);
    expect(meals[2].headroom).toEqual({ purine: 320, salt: 2, sugar: 8 });
    expect(meals[0].headroom).toEqual({ purine: 200, salt: 1.3, sugar: 5 });
  });

  it('a limit that is already full stays full (negative) for every meal, not shared', () => {
    const { meals } = split(1200, 0, { headroom: { purine: -50, salt: 0, sugar: 20 } });
    expect(meals.every((m) => m.headroom.purine === -50 && m.headroom.salt === 0)).toBe(true);
  });

  it('a small budget is not cut into three: shares under 250 kcal fold the smallest meal into the others', () => {
    const six = split(600);
    expect(six.meals.map((m) => [m.slot.id, m.kcal])).toEqual([['lunch', 280], ['dinner', 320]]);
    expect(six.merged.map((m) => m.id)).toEqual(['breakfast']);
    const four = split(400);
    expect(four.meals.map((m) => [m.slot.id, m.kcal])).toEqual([['dinner', 400]]);
    expect(four.merged.map((m) => m.id)).toEqual(['breakfast', 'lunch']);
  });

  it('the cut-off is exactly 250 kcal for the smallest share', () => {
    // two meals left (lunch .35, dinner .4): the smaller share is 0.35 / 0.75 of the budget
    const at = (budget: number) => split(budget, 1).meals.length;
    expect(MIN_MEAL_KCAL).toBe(250);
    expect(at(536)).toBe(2); // 536 × .35 / .75 = 250.1: the smaller share is a meal
    expect(at(535)).toBe(1); // 535 × .35 / .75 = 249.7: it is not, so lunch is folded into dinner
  });

  it('two meals left share what is left; one meal left gets everything', () => {
    expect(split(1200, 1).meals.map((m) => m.kcal)).toEqual([560, 600]); // the dinner share of 640 is capped at 600
    expect(split(1200, 2).meals.map((m) => [m.slot.id, m.kcal, m.proteinG])).toEqual([['dinner', 600, 120]]); // one meal left gets all the protein but at most 600 kcal
  });

  it('with under 150 kcal left in total it is one light meal (the next one), the rest folded away', () => {
    const { meals, merged } = split(120);
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ kcal: 120, proteinG: 120, light: true });
    expect(meals[0].slot.id).toBe('breakfast');
    expect(merged.map((m) => m.id)).toEqual(['lunch', 'dinner']);
    expect(split(150).meals[0].light).toBe(false);
  });

  it('no meals left, no split', () => {
    expect(splitBudget([], TOTALS)).toEqual({ meals: [], merged: [] });
  });

  it('equal weights fold the earliest first', () => {
    const equal = defs.map((d) => ({ ...d, weight: 1 }));
    const out = splitBudget(equal, { ...TOTALS, budgetKcal: 600 }); // 200 each
    expect(out.merged.map((m) => m.id)).toEqual(['breakfast']);
    expect(out.meals.map((m) => m.slot.id)).toEqual(['lunch', 'dinner']);
  });
});

describe('buildMealPlan: the number of meals follows the day', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m);
  beforeEach(() => {
    // No profile: TDEE = 1900 + 1100 = 3000; nothing eaten: 1900 kcal left.
    useSettingsStore.setState({ gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWorkoutStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: {} });
    useMealModeStore.setState({ fasting: false });
  });

  it('normal day: 3 meals in the morning, 2 at noon after breakfast time, 1 in the evening', () => {
    expect(buildMealPlan(at(8))!.split.meals.map((m) => m.slot.id)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(buildMealPlan(at(11))!.split.meals.map((m) => m.slot.id)).toEqual(['lunch', 'dinner']);
    expect(buildMealPlan(at(16))!.split.meals.map((m) => m.slot.id)).toEqual(['dinner']);
    expect(buildMealPlan(at(16))!.split.meals[0].kcal).toBe(600); // 1900 left, but one meal is at most 600
    expect(buildMealPlan(at(22))).toBeNull();
  });

  it('what is eaten changes the split: lunch eaten, only dinner is left even at 11:00; and the budget shrinks', () => {
    useNutritionStore.setState({ logs: { '2026-10-23': log({ extraCalories: 900, extraProteinG: 60, extraItems: [{ ...x('Cơm', 900, 'lunch'), proteinG: 60 }] }) } });
    const plan = buildMealPlan(at(11))!;
    expect(plan.totals.budgetKcal).toBe(1000);
    expect(plan.totals.proteinLeftG).toBe(140);
    expect(plan.split.meals.map((m) => m.slot.id)).toEqual(['dinner']);
  });

  it('fasting: the plan\'s meals, so 2 at 16:10 (the first is over), all 3 before the window, none after', () => {
    useMealModeStore.setState({ fasting: true });
    expect(buildMealPlan(at(11, 30))!.split.meals.map((m) => m.slot.id)).toEqual(['meal1', 'meal2', 'meal3']);
    expect(buildMealPlan(at(16, 10))!.split.meals.map((m) => m.slot.id)).toEqual(['meal2', 'meal3']);
    expect(buildMealPlan(at(19, 30))!.split.meals.map((m) => m.slot.id)).toEqual(['meal3']);
    expect(buildMealPlan(at(20, 0))).toBeNull();
  });

  it('fasting: a meal ticked eaten is not suggested again, and the plan\'s own meal is kept for the comparison', () => {
    useMealModeStore.setState({ fasting: true });
    useNutritionStore.setState({ logs: { '2026-10-23': log({ mealsEaten: { meal2: true } }) } });
    const plan = buildMealPlan(at(16, 10))!;
    expect(plan.split.meals.map((m) => m.slot.id)).toEqual(['meal3']);
    expect(plan.split.meals[0].slot.plan).toEqual({ kcal: planMeals[2].calories, proteinG: planMeals[2].proteinG });
  });

  it('a budget that is nearly gone gives one light meal whatever the mode', () => {
    useNutritionStore.setState({ logs: { '2026-10-23': log({ extraCalories: 1800, extraProteinG: 100, extraItems: [{ ...x('Nhiều', 1800, 'breakfast', 8), proteinG: 100 }] }) } });
    const plan = buildMealPlan(at(11))!; // 3000 − 1100 − 1800 = 100 left
    expect(plan.split.meals).toHaveLength(1);
    expect(plan.split.meals[0].light).toBe(true);
  });
});

describe('mealCardVisible', () => {
  const plan = (fasting: boolean) => ({ fasting } as MealPlan);
  const at = (h: number) => new Date(2026, 9, 23, h, 0);
  it('fasting: from 11:00 until 20:00; normal day: from 05:00 until 22:00; never without a plan', () => {
    expect([10, 11, 19, 20].map((h) => mealCardVisible(at(h), plan(true)))).toEqual([false, true, true, false]);
    expect([4, 5, 21, 22].map((h) => mealCardVisible(at(h), plan(false)))).toEqual([false, true, true, false]);
    expect(mealCardVisible(at(15), null)).toBe(false);
  });
});

describe('mealBrief and meal times', () => {
  it('the brief of a meal carries its own share, kind, eat-by hour and the plan\'s meal', () => {
    const defs = mealDefs(true, planMeals);
    const { meals } = splitBudget(defs.slice(1), { ...TOTALS, budgetKcal: 1200 });
    const b = mealBrief(TOTALS, meals[1]);
    expect(b).toMatchObject({ hour: 19, meal: 'dinner', eatByHour: 20, budgetKcal: meals[1].kcal, proteinLeftG: meals[1].proteinG, limits: TOTALS.limits });
    expect(b.planMeal).toMatchObject({ kcal: planMeals[2].calories });
    expect(mealBrief(TOTALS, splitBudget(mealDefs(false, planMeals), TOTALS).meals[0]).planMeal).toBeUndefined();
  });

  it('files a suggested food under the matching meal time', () => {
    expect([mealTimeFor('breakfast'), mealTimeFor('lunch'), mealTimeFor('dinner'), mealTimeFor('meal')]).toEqual(['breakfast', 'lunch', 'dinner', 'afternoon_snack']);
  });
});

describe('meal size cap and the user\'s own figures', () => {
  const slots = (n: number) => mealDefs(false, planMeals).slice(0, n);
  it('no meal is sized above 600 kcal by default', () => {
    const one = splitBudget(slots(1), { ...TOTALS, budgetKcal: 1000 });
    expect(one.meals[0].kcal).toBe(600);
    const three = splitBudget(slots(3), { ...TOTALS, budgetKcal: 1600 });
    expect(three.meals.map((m) => m.kcal).every((k) => k <= 600)).toBe(true);
    expect(three.meals.reduce((s, m) => s + m.kcal, 0)).toBeGreaterThanOrEqual(1500);
  });
  it('the wanted calories and protein per meal fill as many meals as the calories left allow', () => {
    const prefs = { kcal: 500, proteinG: 35, strictKcal: false };
    const split = splitBudget(slots(3), { ...TOTALS, budgetKcal: 1100 }, prefs);
    expect(split.meals.map((m) => [m.kcal, m.proteinG])).toEqual([[500, 35], [500, 35]]);
    expect(split.merged).toHaveLength(1);
    const small = splitBudget(slots(3), { ...TOTALS, budgetKcal: 300 }, prefs);
    expect(small.meals.map((m) => m.kcal)).toEqual([300]);
  });
  it('briefs carry the wanted flags, and ideas stay within ±10% (strict: never above)', () => {
    const prefs = { kcal: 500, proteinG: 35, strictKcal: false };
    const meal = splitBudget(slots(3), { ...TOTALS, budgetKcal: 1100 }, prefs).meals[0];
    const brief = mealBrief(TOTALS, meal, prefs);
    expect(brief).toMatchObject({ budgetKcal: 500, proteinLeftG: 35, exact: true, proteinExact: true });
    const idea = (calories: number, proteinG: number) => ({ calories, proteinG, purineMg: 0, saltG: 0, sugarG: 0 });
    expect(acceptDinner(brief, idea(540, 36))).toBe(true);
    expect(acceptDinner(brief, idea(560, 36))).toBe(false);
    expect(acceptDinner(brief, idea(480, 30))).toBe(false); // protein 14% under
    const strict = { ...brief, strictKcal: true };
    expect(acceptDinner(strict, idea(510, 36))).toBe(false);
    expect(acceptDinner(strict, idea(480, 36))).toBe(true);
    expect(acceptDinner(strict, idea(380, 36))).toBe(false); // too far under
  });
});
