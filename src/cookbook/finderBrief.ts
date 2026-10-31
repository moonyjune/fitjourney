import type { DinnerBrief } from '../ai/dinner';
import { MAX_MEAL_KCAL, mealBrief, type DayTotals, type SplitMeal } from '../ai/mealSplit';
import { NO_MEAL_PREFS, type MealPrefs } from '../store/useMealPrefStore';
import { DRINK_KCAL, isSnackOnly, MAIN_MEALS, SNACK_KCAL, type CookbookFilters, type OccasionId } from './filters';

/** What the cook book finder's ideas are checked against (and what the AI is told), from what is left of today:
 *  - only snacks / drinks / coffee / desserts: a snack brief (no protein asked, up to 250 kcal, 150 for drinks alone);
 *  - a meal (or no occasion): the share of the next meal still to come of that kind, as on Camp; when none is left today, a meal
 *    of at most 600 kcal from what is left of the day;
 *  - "low calorie" asks for three quarters of that (unless the user set exact figures per meal). */
export function filterBrief(totals: DayTotals, meals: SplitMeal[], filters: CookbookFilters, prefs: MealPrefs = NO_MEAL_PREFS): DinnerBrief {
  const base = { hour: totals.hour, eatByHour: Math.min(24, totals.hour + 3), headroom: totals.headroom, limits: totals.limits };
  if (isSnackOnly(filters)) {
    const drinksOnly = filters.occasions.every((o) => o === 'drink' || o === 'coffee');
    return { ...base, meal: 'meal', budgetKcal: Math.min(Math.max(0, totals.budgetKcal), drinksOnly ? DRINK_KCAL : SNACK_KCAL), proteinLeftG: 0, snack: true, ...(prefs.strictKcal ? { strictKcal: true } : {}) };
  }
  const mains = filters.occasions.filter((o) => MAIN_MEALS.includes(o));
  const meal = meals.find((m) => mains.length === 0 || mains.includes(m.slot.kind as OccasionId));
  const brief: DinnerBrief = meal
    ? mealBrief(totals, meal, prefs)
    : { ...base, meal: (mains[0] as DinnerBrief['meal']) ?? 'meal', budgetKcal: Math.min(totals.budgetKcal, MAX_MEAL_KCAL), proteinLeftG: Math.min(totals.proteinLeftG, 40) };
  if (filters.cravings.includes('lowCal') && !brief.exact) brief.budgetKcal = Math.round(brief.budgetKcal * 0.75);
  return brief;
}
