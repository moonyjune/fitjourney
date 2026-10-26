import { addDaysToKey, avg, dayNumber } from './dateMath';
import type { DayRow } from './days';
import type { Efficiency } from './efficiency';
import type { Thresholds } from './thresholds';
import { validWeighs, type Weigh } from './weights';

export interface ForecastPoint {
  days: number;
  dateKey: string;
  kg: number;
  low: number;
  high: number;
  lostKg: number;
  perWeekKg: number;
}

export interface Forecast {
  /** Average deficit assumed from here on (kcal/day). */
  avgDeficit: number;
  startKey: string;
  startKg: number;
  efficiency: number;
  /** Rate for the first week (kg/week). */
  firstWeekKg: number;
  points: ForecastPoint[];
  /** Days until the goal weight is reached at this pace, or null when it is not within ~3 years / no deficit. */
  daysToGoal: number | null;
  goalDateKey: string | null;
}

export const FORECAST_HORIZONS = [7, 14, 30, 60, 90];
const MAX_GOAL_DAYS = 1100;

/** Average deficit of the recent days (complete days if there are any), used to project the future. */
export function recentAvgDeficit(rows: DayRow[], th: Thresholds): number {
  if (rows.length === 0) return 0;
  const lastN = dayNumber(rows[rows.length - 1].dateKey);
  const recent = rows.filter((r) => dayNumber(r.dateKey) > lastN - th.forecastDays);
  const full = recent.filter((r) => r.complete);
  return avg((full.length > 0 ? full : recent).map((r) => r.deficit));
}

/** Projects body weight forward: each day's deficit shrinks as weight falls (TDEE drops ~13 kcal per kg), and only
 *  `efficiency` of it becomes lost weight. Null when there is nothing to start from. */
export function computeForecast(
  weighs: Weigh[],
  rows: DayRow[],
  eff: Efficiency,
  tdeeNow: number,
  goalKg: number | null,
  th: Thresholds
): Forecast | null {
  const valid = validWeighs(weighs);
  const lastValid = valid[valid.length - 1];
  const lastRow = rows[rows.length - 1];
  if (!lastValid || !lastRow) return null;

  const deficitAfter = rows.filter((r) => r.dateKey > lastValid.dateKey).reduce((s, r) => s + r.deficit, 0);
  const startKg = lastValid.kg - (deficitAfter * eff.applied) / th.kcalPerKgFat;
  const avgDeficit = recentAvgDeficit(rows, th);
  const intake = tdeeNow - avgDeficit;
  const startKey = addDaysToKey(lastRow.dateKey, 1);

  const step = (kg: number): number => {
    const tdee = tdeeNow - th.tdeePerKg * (startKg - kg);
    return Math.max(0, tdee - intake);
  };
  const horizon = Math.max(...FORECAST_HORIZONS);
  const series: number[] = [startKg];
  for (let d = 1; d <= horizon; d++) {
    const prev = series[d - 1];
    series.push(prev - (eff.applied * step(prev)) / th.kcalPerKgFat);
  }
  const points: ForecastPoint[] = FORECAST_HORIZONS.map((days) => {
    const kg = series[days];
    return {
      days,
      dateKey: addDaysToKey(lastRow.dateKey, days),
      kg,
      low: kg - th.waterBand,
      high: kg + th.waterBand,
      lostKg: startKg - kg,
      perWeekKg: ((startKg - kg) / days) * 7,
    };
  });

  let daysToGoal: number | null = null;
  if (goalKg !== null) {
    if (startKg <= goalKg) daysToGoal = 0;
    else {
      let kg = startKg;
      for (let d = 1; d <= MAX_GOAL_DAYS; d++) {
        const drop = (eff.applied * step(kg)) / th.kcalPerKgFat;
        if (drop <= 0) break;
        kg -= drop;
        if (kg <= goalKg) {
          daysToGoal = d;
          break;
        }
      }
    }
  }
  return {
    avgDeficit,
    startKey,
    startKg,
    efficiency: eff.applied,
    firstWeekKg: points[0].lostKg,
    points,
    daysToGoal,
    goalDateKey: daysToGoal === null ? null : addDaysToKey(lastRow.dateKey, daysToGoal),
  };
}
