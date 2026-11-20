import { useMemo } from 'react';
import { useNutritionStore } from '../store/useNutritionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import { toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { dayWaterMl } from '../water/drinks';
import { compareWeighIns, estimateDays, lossVarsOf, sumFatG, type DayLossEstimate, type DayLossVars, type WeighInComparison } from './dailyLossEstimate';
import { useDayEvaluator, useNow, useTdeeKcal } from './useGameState';

/** Days estimated before the shown day so the glycogen stores carry a realistic state into it. */
const WARM_UP_DAYS = 14;
/** Weigh-ins compared with the estimate: the last 7 days up to the shown day. */
const WEIGH_IN_DAYS = 7;

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export interface DailyLoss {
  vars: DayLossVars;
  estimate: DayLossEstimate;
  /** Fat estimate of the week (Monday up to this day), g. */
  weekFatG: number;
  weighIn: WeighInComparison | null;
}

/** The signed-in user's fat-loss estimate of a day (null when nothing is logged that day). */
export function useDailyLoss(dayKey: string): DailyLoss | null {
  const now = useNow();
  const evaluate = useDayEvaluator(now);
  const tdeeKcal = useTdeeKcal();
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const logs = useNutritionStore((s) => s.logs);
  const weights = useWeightStore((s) => s.entries);
  return useMemo(() => {
    const keys: string[] = [];
    for (let i = WARM_UP_DAYS; i >= 0; i--) keys.push(addDays(dayKey, -i));
    const vars = keys.map((key) => lossVarsOf(evaluate(key), { tdeeKcal, waterMl: dayWaterMl(logs[key]), proteinTargetG }));
    const estimates = estimateDays(vars);
    const shownVars = vars[vars.length - 1];
    const estimate = estimates[estimates.length - 1];
    if (!shownVars || !estimate) return null;
    const monday = weekStartKey(new Date(`${dayKey}T12:00:00`));
    const weekFatG = sumFatG(estimates.filter((e) => e && e.dateKey >= monday));
    const from = addDays(dayKey, -WEIGH_IN_DAYS);
    const weighIns = weights
      .map((w) => ({ dateKey: toDateKey(new Date(w.dateISO)), weightKg: w.weightKg }))
      .filter((w) => w.dateKey >= from && w.dateKey <= dayKey);
    return { vars: shownVars, estimate, weekFatG, weighIn: compareWeighIns(weighIns, estimates) };
  }, [dayKey, evaluate, tdeeKcal, proteinTargetG, logs, weights]);
}
