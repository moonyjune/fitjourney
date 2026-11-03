import { useMemo } from 'react';
import type { DinnerBrief } from '../ai/dinner';
import { buildMealPlan, mealBrief } from '../ai/mealSplit';
import { pick as pickPrefs, useMealPrefStore } from '../store/useMealPrefStore';
import { useNutritionStore } from '../store/useNutritionStore';

/** The share of the next meal still to come today (Camp's split), to tell which dishes fit it; null when no meal is left. */
export function useNextMealBrief(): DinnerBrief | null {
  const kcal = useMealPrefStore((s) => s.kcal);
  const proteinG = useMealPrefStore((s) => s.proteinG);
  const strictKcal = useMealPrefStore((s) => s.strictKcal);
  const logs = useNutritionStore((s) => s.logs);
  return useMemo(() => {
    const prefs = pickPrefs({ kcal, proteinG, strictKcal });
    const plan = buildMealPlan(new Date(), prefs);
    return plan && plan.split.meals[0] ? mealBrief(plan.totals, plan.split.meals[0], prefs) : null;
  }, [kcal, proteinG, strictKcal, logs]);
}
