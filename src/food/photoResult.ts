import type { MealTextItem, MealTextResult, PhotoAnalysisResult } from '../sync/cloudSync';
import { partsFromComponents } from './mealParts';

/** A meal photo's analysis (analyze-proof-photo) in the shape of a text analysis (parse-meal-text), so the meal-logging flow turns
 *  both into the same review lines: the foods the AI split the photo into (2 or more), else one food for the whole photo.
 *  Each line carries the photo's own accuracy. `fallbackName` names a food the AI left unnamed. */
export function photoResultToMealText(result: PhotoAnalysisResult, fallbackName: string): MealTextResult {
  const accuracyPercent = result.accuracyPercent;
  const parts = partsFromComponents(result.components);
  let items: MealTextItem[];
  if (parts.length >= 2) {
    items = parts.map((p) => ({ name: p.name, caloriesKcal: p.calories, proteinG: p.proteinG, purineMg: p.purineMg, saltG: p.saltG, sugarG: p.sugarG, accuracyPercent }));
  } else if (result.foodName?.trim() || (result.estimatedCaloriesKcal ?? 0) > 0) {
    items = [
      {
        name: result.foodName?.trim() || fallbackName,
        caloriesKcal: result.estimatedCaloriesKcal ?? 0,
        proteinG: result.estimatedProteinG ?? 0,
        purineMg: result.estimatedPurineMg,
        saltG: result.estimatedSaltG,
        sugarG: result.estimatedSugarG,
        accuracyPercent,
      },
    ];
  } else {
    items = [];
  }
  return { items, advice: result.advice, accuracyPercent, reasoning: result.reasoning ?? '' };
}
