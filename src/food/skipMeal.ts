import type { ExtraFoodItem } from '../types';
import type { MainMeal } from '../insights/days';
import { SKIPPED_MEAL_NAME } from '../insights/missing';
import { useNutritionStore } from '../store/useNutritionStore';
import { loggedAtFor } from '../utils/mealClock';

/** Is this the item that records a main meal as not eaten (0 kcal, named "Không ăn")? */
export function isSkippedMealItem(item: Pick<ExtraFoodItem, 'name' | 'calories'>): boolean {
  return item.name.trim() === SKIPPED_MEAL_NAME && item.calories === 0;
}

/** The "Không ăn" item for a main meal of a day, at that meal's usual time, under the given id (not saved). */
export function skippedMealItem(dateKey: string, meal: MainMeal, id: string): ExtraFoodItem {
  return { id, name: SKIPPED_MEAL_NAME, calories: 0, proteinG: 0, mealTime: meal, loggedAtISO: loggedAtFor(dateKey, meal) };
}

/** Records a main meal as not eaten: a 0 kcal item named "Không ăn" at that meal (the diary's convention), saved and synced like any food,
 *  so the day no longer counts that meal as missing and it can be removed again. Nothing is added when that meal already has one; returns
 *  whether an item was added. */
export function logSkippedMeal(dateKey: string, meal: MainMeal): boolean {
  const store = useNutritionStore.getState();
  const items = store.logs[dateKey]?.extraItems ?? [];
  if (items.some((i) => i.mealTime === meal && isSkippedMealItem(i))) return false;
  store.addExtra(dateKey, SKIPPED_MEAL_NAME, 0, 0, meal, { fromFoodDb: true });
  return true;
}
