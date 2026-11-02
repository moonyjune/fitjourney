import { getDayType } from '../constants/plan';
import type { ExtraMealTime } from '../types';
import { toDateKey } from '../utils/date';
import { eatingEndHour, eatingStartHour, isFasting } from '../utils/mealMode';
import { makeDayEvaluator } from './coachContext';
import { NO_MEAL_PREFS, type MealPrefs } from '../store/useMealPrefStore';
import { LIGHT_BUDGET_KCAL, type DinnerBrief, type Room } from './dinner';
import { coveredMealIds, mealDefs, remainingMeals, type MealKind, type MealSlotDef } from '../game/mealSlots';

export { COVER_MIN_KCAL, coveredMealIds, mealDefs, periodOfItem, remainingMeals, type MealKind, type MealSlotDef } from '../game/mealSlots';

/** Today so far against the targets: what is left to eat, in total. */
export interface DayTotals {
  hour: number;
  /** What the day's eating should add up to: TDEE − the daily deficit target (the top of the 200 kcal band the day aims for). */
  dayTargetKcal: number;
  /** TDEE + exercise − the daily deficit target − eaten; 0 when nothing is left. */
  budgetKcal: number;
  proteinLeftG: number;
  /** Room left in each limit (limit minus the day so far); negative when already over. */
  headroom: Room;
  limits: Room;
}

/** A remaining meal with its share of what is left. */
export interface SplitMeal {
  slot: MealSlotDef;
  kcal: number;
  proteinG: number;
  /** Room each limit leaves for this meal: a share of the positive room, or the (negative) room as it is when it is already full. */
  headroom: Room;
  /** Almost nothing is left in total: this is one light meal, not a share. */
  light: boolean;
}

export interface MealSplit {
  meals: SplitMeal[];
  /** Remaining meals folded into the others because their share would have been too small to be a meal. */
  merged: MealSlotDef[];
}

/** No meal is sized above this when the user has not set their own figure: one meal of a ~1600 kcal day averages 530 kcal. */
export const MAX_MEAL_KCAL = 600;
/** The day's intake aims at the target minus up to this much (a 1400-1600 kcal day for a 1600 kcal target). */
export const DAY_BAND_KCAL = 200;

/** A share smaller than this is not a meal: it is folded into the others. */
export const MIN_MEAL_KCAL = 250;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Splits what is left over the meals still to come, so the number of meals suggested follows the day: with 150 kcal or less in
 *  total there is one light meal; otherwise the budget is shared by weight, and while a share would be under 250 kcal the
 *  smallest meal is folded into the others (so a small budget at 3 pm is two meals, at 9 pm one, and a full day's is three). */
export function splitBudget(meals: MealSlotDef[], totals: DayTotals, prefs: MealPrefs = NO_MEAL_PREFS): MealSplit {
  if (meals.length === 0) return { meals: [], merged: [] };
  if (totals.budgetKcal < LIGHT_BUDGET_KCAL) {
    return { meals: [{ slot: meals[0], kcal: totals.budgetKcal, proteinG: totals.proteinLeftG, headroom: totals.headroom, light: true }], merged: meals.slice(1) };
  }
  if (prefs.kcal) {
    // The user's own figure per meal: as many meals as the calories left can fill, the soonest first, each at that figure.
    const n = Math.max(1, Math.min(meals.length, Math.round(totals.budgetKcal / prefs.kcal)));
    let left = totals.budgetKcal;
    const out: SplitMeal[] = meals.slice(0, n).map((slot) => {
      const kcal = Math.min(prefs.kcal!, left);
      left -= kcal;
      const share = 1 / n;
      const room = (h: number) => (h > 0 ? r1(h * share) : h);
      return { slot, kcal, proteinG: prefs.proteinG ?? Math.round(totals.proteinLeftG * share), headroom: { purine: Math.round(room(totals.headroom.purine)), salt: room(totals.headroom.salt), sugar: room(totals.headroom.sugar) }, light: false };
    });
    return { meals: out, merged: meals.slice(n) };
  }
  const chosen = [...meals];
  const merged: MealSlotDef[] = [];
  for (;;) {
    const weight = chosen.reduce((s, m) => s + m.weight, 0);
    const smallest = Math.min(...chosen.map((m) => (totals.budgetKcal * m.weight) / weight));
    if (smallest >= MIN_MEAL_KCAL || chosen.length === 1) break;
    // Fold the smallest meal (the earliest of equals) into the rest.
    let at = 0;
    chosen.forEach((m, i) => {
      if (m.weight < chosen[at].weight) at = i;
    });
    merged.push(chosen.splice(at, 1)[0]);
  }
  const weight = chosen.reduce((s, m) => s + m.weight, 0);
  let kcalLeft = totals.budgetKcal;
  let proteinLeft = totals.proteinLeftG;
  const out: SplitMeal[] = chosen.map((slot, i) => {
    const last = i === chosen.length - 1;
    const share = slot.weight / weight;
    const shareKcal = last ? kcalLeft : Math.round(totals.budgetKcal * share);
    const shareProtein = last ? proteinLeft : Math.round(totals.proteinLeftG * share);
    kcalLeft -= shareKcal;
    proteinLeft -= shareProtein;
    const kcal = Math.min(shareKcal, MAX_MEAL_KCAL);
    const proteinG = prefs.proteinG ?? shareProtein;
    const room = (h: number) => (h > 0 ? r1(h * share) : h);
    return { slot, kcal, proteinG, headroom: { purine: Math.round(room(totals.headroom.purine)), salt: room(totals.headroom.salt), sugar: room(totals.headroom.sugar) }, light: false };
  });
  return { meals: out, merged };
}

export interface MealPlan {
  fasting: boolean;
  totals: DayTotals;
  split: MealSplit;
  prefs: MealPrefs;
}

/** Today so far and the meals still to come, from this device's logs, split by what is left. Null when no meal is left to suggest. */
export function buildMealPlan(now: Date = new Date(), prefs: MealPrefs = NO_MEAL_PREFS): MealPlan | null {
  const { evaluate, logs, plan, settings, limits, tdeeKcal } = makeDayEvaluator(now);
  const fasting = isFasting();
  const dateKey = toDateKey(now);
  const today = evaluate(dateKey);
  const planMeals = plan.mealTemplates[getDayType(now)];
  const defs = mealDefs(fasting, planMeals);
  const covered = coveredMealIds(fasting, defs, planMeals, logs[dateKey]);
  const left = remainingMeals(defs, covered, now.getHours() * 60 + now.getMinutes());
  if (left.length === 0) return null;
  const totals = totalsOf(now, today, settings, limits, tdeeKcal);
  return { fasting, totals, split: splitBudget(left, totals, prefs), prefs };
}

type Evaluator = ReturnType<typeof makeDayEvaluator>;

function totalsOf(now: Date, today: ReturnType<Evaluator['evaluate']>, settings: Evaluator['settings'], limits: Evaluator['limits'], tdeeKcal: number): DayTotals {
  const n = today.nutrients;
  return {
    hour: now.getHours(),
    dayTargetKcal: Math.max(0, Math.round(tdeeKcal - settings.targetDailyDeficitKcal)),
    budgetKcal: Math.max(0, Math.round(tdeeKcal + today.burnedKcal - settings.targetDailyDeficitKcal - today.eatenKcal)),
    proteinLeftG: Math.max(0, Math.round(settings.proteinTargetG - today.proteinG)),
    headroom: { purine: Math.round(limits.purineMg - n.purineMg), salt: r1(limits.saltG - n.saltG), sugar: r1(limits.sugarG - n.sugarG) },
    limits: { purine: limits.purineMg, salt: limits.saltG, sugar: limits.sugarG },
  };
}

/** What is left of today (calories, protein, room in the limits), whether or not a meal is still to come. */
export function dayTotals(now: Date = new Date()): DayTotals {
  const { evaluate, settings, limits, tdeeKcal } = makeDayEvaluator(now);
  return totalsOf(now, evaluate(toDateKey(now)), settings, limits, tdeeKcal);
}

/** The card is shown while there is eating left in the day: from an hour before it starts until it ends. */
export function mealCardVisible(now: Date, plan: MealPlan | null): boolean {
  if (!plan) return false;
  const f = plan.fasting;
  return now.getHours() >= eatingStartHour(f) - 1 && now.getHours() < eatingEndHour(f);
}

/** The meal time to file a food under when it is logged from a suggestion. */
export function mealTimeFor(kind: MealKind): ExtraMealTime {
  return kind === 'breakfast' ? 'breakfast' : kind === 'lunch' ? 'lunch' : kind === 'dinner' ? 'dinner' : 'afternoon_snack';
}

/** The brief for one meal of the split: its own share of the calories, protein and room in the limits, which is what the ideas for
 *  that meal (from the user's foods or the AI) are checked against. */
export function mealBrief(totals: DayTotals, meal: SplitMeal, prefs: MealPrefs = NO_MEAL_PREFS): DinnerBrief {
  return {
    hour: meal.slot.startHour,
    meal: meal.slot.kind,
    eatByHour: Math.min(24, Math.ceil(meal.slot.endMinutes / 60)),
    budgetKcal: meal.kcal,
    proteinLeftG: meal.proteinG,
    headroom: meal.headroom,
    limits: totals.limits,
    ...(prefs.kcal && !meal.light ? { exact: true } : {}),
    ...(prefs.proteinG && !meal.light ? { proteinExact: true } : {}),
    ...(prefs.strictKcal && !meal.light ? { strictKcal: true } : {}),
    ...(meal.slot.plan ? { planMeal: { label: meal.slot.label ?? '', kcal: meal.slot.plan.kcal, proteinG: meal.slot.plan.proteinG } } : {}),
  };
}
