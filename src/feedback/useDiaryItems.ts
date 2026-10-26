import { useMemo } from 'react';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { buildDiaryItems, type DiaryItem } from './items';

/** Everything the signed-in user has logged, flattened for comments and repeat counts. */
export function useDiaryItems(): DiaryItem[] {
  const logs = useNutritionStore((s) => s.logs);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  return useMemo(() => buildDiaryItems(logs, mealTemplates), [logs, mealTemplates]);
}
