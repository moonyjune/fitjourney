import { LIMITS } from '../game/constants';
import type { MainMeal } from '../insights/days';
import type { ExtraMealTime } from '../types';

/**
 * "Không nhớ": the user cannot remember what they ate at a main meal. The meal is still logged, as one full meal sized at a third
 * of the day's target intake (TDEE minus the daily deficit target, the same intake the day's "meals still to come" are sized from),
 * and clearly named as an estimate so it is never mistaken for food that was really weighed or photographed. It covers that meal.
 */

export const FORGOT_MEAL_NAME = 'Bữa không nhớ (ước tính)';
export const FORGOT_MEALS: MainMeal[] = ['breakfast', 'lunch', 'dinner'];

/** The day's target intake (kcal): TDEE minus the deficit target (the deficit mission's bar when none is set), never below 0. */
export function targetIntakeKcal(tdeeKcal: number, targetDeficitKcal?: number): number {
  const tdee = Number.isFinite(tdeeKcal) ? tdeeKcal : 0;
  const deficit = targetDeficitKcal != null && Number.isFinite(targetDeficitKcal) ? targetDeficitKcal : LIMITS.deficitKcal;
  return Math.max(0, tdee - deficit);
}

/** One forgotten meal's estimate: a third of the day's target intake, rounded to 10 kcal. */
export function forgotMealKcal(tdeeKcal: number, targetDeficitKcal?: number): number {
  return Math.round(targetIntakeKcal(tdeeKcal, targetDeficitKcal) / 3 / 10) * 10;
}

/** Is this a logged "Không nhớ" estimate? */
export function isForgotMealItem(item: { name: string }): boolean {
  return item.name.trim() === FORGOT_MEAL_NAME;
}

/** The main meal to offer first: the meal chosen on the screen when it is a main one, else the one for the time of day. */
export function defaultForgotMeal(mealTime: ExtraMealTime | null, now: Date): MainMeal {
  if (mealTime && (FORGOT_MEALS as string[]).includes(mealTime)) return mealTime as MainMeal;
  const h = now.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}
