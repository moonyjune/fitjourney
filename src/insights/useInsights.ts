import { useMemo } from 'react';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { resolveTdeeKcal } from '../utils/tdee';
import type { DiaryItem } from '../feedback/items';
import { useDiaryItems } from '../feedback/useDiaryItems';
import { classifyMainMeals } from '../feedback/flex';
import { computeInsights, type Insights } from './index';
import type { Thresholds } from './thresholds';
import { buildWeekControl, buildWeekQuotas, type WeekControl, type WeekQuota } from './weekControl';
import { useThresholds } from './useThresholds';

export interface InsightsView {
  insights: Insights;
  thresholds: Thresholds;
  tdeeKcal: number;
  goalWeightKg: number;
  /** Everything logged, flattened for the food comments. */
  items: DiaryItem[];
  /** The current week against the weekly deficit target and the 80/20 allowance (null with nothing logged). */
  weekControl: WeekControl | null;
  /** Every logged week against the 80/20 rule, oldest first. */
  quotas: WeekQuota[];
}

/** The analysis for the signed-in user's logs, recomputed when any input changes. */
export function useInsights(): InsightsView {
  const logs = useNutritionStore((s) => s.logs);
  const workouts = useWorkoutStore((s) => s.entries);
  const weights = useWeightStore((s) => s.entries);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const settings = useSettingsStore();
  const thresholds = useThresholds();
  const items = useDiaryItems();

  const latestKg = weights.length > 0 ? weights[weights.length - 1].weightKg : settings.startWeightKg;
  const tdeeKcal = useMemo(
    () =>
      resolveTdeeKcal({
        gender: settings.gender,
        age: settings.age,
        heightCm: settings.heightCm,
        activityLevel: settings.activityLevel,
        weightKg: latestKg,
        calorieTargetKcal: settings.calorieTargetKcal,
        targetDailyDeficitKcal: settings.targetDailyDeficitKcal,
      }).tdeeKcal,
    [settings.gender, settings.age, settings.heightCm, settings.activityLevel, latestKg, settings.calorieTargetKcal, settings.targetDailyDeficitKcal]
  );

  const insights = useMemo(
    () =>
      computeInsights({
        logs,
        mealTemplates,
        workouts,
        weights,
        tdeeNowKcal: tdeeKcal,
        startWeightKg: settings.startWeightKg,
        goalWeightKg: settings.goalWeightKg,
        thresholds,
      }),
    [logs, mealTemplates, workouts, weights, tdeeKcal, settings.startWeightKg, settings.goalWeightKg, thresholds]
  );
  const meals = useMemo(() => classifyMainMeals(items, thresholds), [items, thresholds]);
  const weekControl = useMemo(() => buildWeekControl(insights.rows, meals, tdeeKcal, thresholds), [insights.rows, meals, tdeeKcal, thresholds]);
  const quotas = useMemo(() => buildWeekQuotas(insights.rows, meals, thresholds), [insights.rows, meals, thresholds]);
  return { insights, thresholds, tdeeKcal, goalWeightKg: settings.goalWeightKg, items, weekControl, quotas };
}
