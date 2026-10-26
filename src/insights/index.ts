import type { DailyNutritionLog, PlanData, WeightEntry, WorkoutLogEntry } from '../types';
import { buildDayRows, type DayRow } from './days';
import { computeEfficiency, type Efficiency } from './efficiency';
import { computeFatWater, type FatWater } from './fatWater';
import { computeForecast, recentAvgDeficit, type Forecast } from './forecast';
import { buildPeriods, type PeriodSummary } from './periods';
import type { Thresholds } from './thresholds';
import { OVERVIEW_WINDOWS, windowStats, type WindowStats } from './windows';
import { toWeighs, validWeighs, weightAtDay, type Weigh } from './weights';

export interface InsightsInput {
  logs: Record<string, DailyNutritionLog>;
  mealTemplates: PlanData['mealTemplates'];
  workouts: WorkoutLogEntry[];
  weights: WeightEntry[];
  /** TDEE at the latest body weight (from the profile or the plan target). */
  tdeeNowKcal: number;
  startWeightKg: number;
  goalWeightKg: number | null;
  thresholds: Thresholds;
}

export interface Insights {
  rows: DayRow[];
  weighs: Weigh[];
  windows: WindowStats[];
  efficiency: Efficiency;
  fatWater: FatWater;
  forecast: Forecast | null;
  weeks: PeriodSummary[];
  months: PeriodSummary[];
  /** Latest weight (morning equivalent) or the starting weight when nothing was weighed. */
  currentWeightKg: number;
  totalDeficit: number;
}

/** Everything the analysis screen shows, computed from what the user has logged. Pure: same input, same output. */
export function computeInsights(input: InsightsInput): Insights {
  const th = input.thresholds;
  const weighs = toWeighs(input.weights, th);
  const valid = validWeighs(weighs);
  const currentWeightKg = (valid[valid.length - 1] ?? weighs[weighs.length - 1])?.morningKg ?? input.startWeightKg;

  // Energy burned at rest changes with body weight, so each day uses the weight of that day.
  const tdeeFor = (dateKey: string): number => {
    const w = weightAtDay(weighs, dateKey);
    return w === null ? input.tdeeNowKcal : input.tdeeNowKcal + th.tdeePerKg * (w - currentWeightKg);
  };
  const rows = buildDayRows({ logs: input.logs, mealTemplates: input.mealTemplates, workouts: input.workouts, tdeeFor });

  const efficiency = computeEfficiency(weighs, rows, th);
  const futureDeficit = recentAvgDeficit(rows, th);
  const fatWater = computeFatWater(weighs, rows, efficiency, futureDeficit, th);
  const forecast = computeForecast(weighs, rows, efficiency, input.tdeeNowKcal, input.goalWeightKg, th);
  const windows = OVERVIEW_WINDOWS.map((d) => windowStats(rows, d)).filter((w): w is WindowStats => w !== null);
  return {
    rows,
    weighs,
    windows,
    efficiency,
    fatWater,
    forecast,
    weeks: buildPeriods('week', rows, weighs, efficiency, th),
    months: buildPeriods('month', rows, weighs, efficiency, th),
    currentWeightKg,
    totalDeficit: rows.length > 0 ? rows[rows.length - 1].cumDeficit : 0,
  };
}
