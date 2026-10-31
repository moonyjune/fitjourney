import { useMemo } from 'react';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { resolveTdeeKcal } from '../utils/tdee';
import { buildDiaryItems, type DiaryItem } from '../feedback/items';
import { useAnalysisStore } from '../store/useAnalysisStore';
import { classifyMainMeals } from '../feedback/flex';
import { computeInsights, type Insights } from './index';
import type { Thresholds } from './thresholds';
import { buildWeekControl, buildWeekQuotas, type WeekControl, type WeekQuota } from './weekControl';
import { useThresholds } from './useThresholds';
import { composeInput, liveDays, rangeStatus, type AnalysisMode, type AnalysisScope, type DayStamp, type LiveDay, type RangeStatus } from './snapshot';

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
  /** The part of the screen this analysis is for (none: always the diary as it is now, e.g. Learn or Uric acid). */
  scope?: AnalysisScope;
  mode: AnalysisMode;
  /** The diary as it is now, by day, and when each day was analysed for this part: for "analysed at" and "outdated". */
  live: Map<string, LiveDay>;
  stamps: Record<string, DayStamp>;
  /** The whole part: when it was last analysed and whether the data changed since. */
  status: RangeStatus;
}

const NO_STAMPS: Record<string, DayStamp> = {};

/** The analysis for the signed-in user's logs. Without a scope it always follows the diary as it is now. With one (a tab of the
 *  Analysis screen), in auto mode it is the same; in manual mode each day is taken as it was when that part last analysed it, so the
 *  screen keeps showing that analysis (marked outdated) until the user asks again. */
export function useInsights(scope?: AnalysisScope): InsightsView {
  const liveLogs = useNutritionStore((s) => s.logs);
  const liveWorkouts = useWorkoutStore((s) => s.entries);
  const liveWeights = useWeightStore((s) => s.entries);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const settings = useSettingsStore();
  const thresholds = useThresholds();
  const mode = useAnalysisStore((s) => s.mode);
  const stamps = useAnalysisStore((s) => (scope ? s.scopes[scope] : undefined)) ?? NO_STAMPS;
  const stored = useAnalysisStore((s) => s.data);
  const live = useMemo(() => liveDays(liveLogs, liveWorkouts, liveWeights, mealTemplates), [liveLogs, liveWorkouts, liveWeights, mealTemplates]);
  const frozen = !!scope && mode === 'manual';
  const input = useMemo(
    () => (frozen ? composeInput(live, stamps, stored, 'manual') : { logs: liveLogs, workouts: liveWorkouts, weights: liveWeights }),
    [frozen, live, stamps, stored, liveLogs, liveWorkouts, liveWeights]
  );
  const { logs, workouts, weights } = input;
  const items = useMemo(() => buildDiaryItems(logs, mealTemplates), [logs, mealTemplates]);
  const status = useMemo(() => rangeStatus(live, stamps), [live, stamps]);

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
  return { insights, thresholds, tdeeKcal, goalWeightKg: settings.goalWeightKg, items, weekControl, quotas, scope, mode, live, stamps, status };
}
