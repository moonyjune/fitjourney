import { mainMealOf, PLAN_SLOT_MEAL } from '../insights/days';
import type { DailyNutritionLog, ExtraMealTime, MealSlot } from '../types';
import { isSkippedMealItem } from './skipMeal';

/** The meal time a food was eaten at: its own meal chip, else the time it was logged (breakfast / lunch / dinner as
 *  `mainMealOf` places them, an afternoon snack between lunch and dinner, an evening snack late at night). */
function mealTimeOf(item: { mealTime?: ExtraMealTime | null; loggedAtISO?: string }): ExtraMealTime | null {
  if (item.mealTime) return item.mealTime;
  const main = mainMealOf({ mealTime: null, loggedAtISO: item.loggedAtISO });
  if (main) return main;
  if (!item.loggedAtISO) return null;
  const hour = new Date(item.loggedAtISO).getHours();
  if (!Number.isFinite(hour)) return null;
  return hour >= 15 && hour < 17 ? 'afternoon_snack' : 'evening_snack';
}

/** How many meals a day had, counted from what was logged rather than from the plan: every meal time (breakfast, a
 *  snack, lunch…) with food in it is one, and a ticked plan meal counts as its main meal. A "Không ăn" mark is not a
 *  meal. Four meal times with food make 4, even though the day's plan has 3. */
export function mealsLogged(log: Pick<DailyNutritionLog, 'mealsEaten' | 'extraItems'> | undefined): number {
  if (!log) return 0;
  const times = new Set<string>();
  for (const [slot, eaten] of Object.entries(log.mealsEaten ?? {}) as [MealSlot, boolean | undefined][]) {
    if (eaten && PLAN_SLOT_MEAL[slot]) times.add(PLAN_SLOT_MEAL[slot]);
  }
  for (const item of log.extraItems ?? []) {
    if (isSkippedMealItem(item)) continue;
    const time = mealTimeOf(item);
    times.add(time ?? `item-${item.id}`);
  }
  return times.size;
}
