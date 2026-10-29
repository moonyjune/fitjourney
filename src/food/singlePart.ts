import type { ExtraFoodItem, MealPart } from '../types';
import type { ExtraPatch } from '../store/useNutritionStore';
import { SKIPPED_MEAL_NAME } from '../insights/missing';
import { partsMatchTotals } from './mealParts';
import { replacePartPatch } from './partScale';

/** The food itself as the one part of a meal saved as a single food (its name and every figure), so it can be shown and re-scaled like a
 *  part of a meal saved as several. Null for a meal with no name or a "Không ăn" (skipped meal) record. */
export function selfPart(item: ExtraFoodItem): MealPart | null {
  const name = item.name.replace(/\s+/g, ' ').trim();
  if (!name || name === SKIPPED_MEAL_NAME) return null;
  const part: MealPart = { name, calories: item.calories, proteinG: item.proteinG };
  if (item.purineMg) part.purineMg = item.purineMg;
  if (item.saltG) part.saltG = item.saltG;
  if (item.sugarG) part.sugarG = item.sugarG;
  return part;
}

/** What a meal's detail lists: its parts while they still add up to its calories, otherwise the meal itself as its one part (empty for a
 *  meal that has no name or records a skipped meal). */
export function partsOrSelf(item: ExtraFoodItem): MealPart[] {
  if (partsMatchTotals(item)) return item.parts!;
  const self = selfPart(item);
  return self ? [self] : [];
}

/** What to save when part `index` of what `partsOrSelf` lists becomes `replacement`. For a meal of several parts this is replacePartPatch;
 *  for a single food the food takes the part's figures and name (no one-part breakdown is stored, since the store keeps a breakdown only
 *  from 2 parts: the food is its own part, and parts that no longer added up are dropped). Null when there is no such part. */
export function editListedPartPatch(item: ExtraFoodItem, index: number, replacement: MealPart): ExtraPatch | null {
  if (partsMatchTotals(item)) return replacePartPatch(item, index, replacement);
  if (index !== 0 || !selfPart(item)) return null;
  const patch: ExtraPatch = { name: replacement.name, calories: replacement.calories, proteinG: replacement.proteinG };
  if (item.purineMg || replacement.purineMg) patch.purineMg = replacement.purineMg ?? 0;
  if (item.saltG || replacement.saltG) patch.saltG = replacement.saltG ?? 0;
  if (item.sugarG || replacement.sugarG) patch.sugarG = replacement.sugarG ?? 0;
  if (item.parts) patch.parts = undefined;
  return patch;
}
