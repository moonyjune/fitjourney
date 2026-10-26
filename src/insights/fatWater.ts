import { avg, dayNumber } from './dateMath';
import type { DayRow } from './days';
import type { Efficiency } from './efficiency';
import type { Thresholds } from './thresholds';
import { validWeighs, type Weigh } from './weights';

export type WaterLevel = 'releasing' | 'normal' | 'mild' | 'high';

export interface FatWaterPoint {
  dateKey: string;
  kg: number;
  morningKg: number;
  evening: boolean;
  /** Weight the body would show if only fat had been lost (paper deficit x efficiency). */
  fatLineKg: number;
  /** Morning-equivalent reading minus the fat line: water, salt and food in the body. */
  waterKg: number;
  level: WaterLevel;
}

export interface FatWater {
  points: FatWaterPoint[];
  /** Estimated real fat lost since the first record (kg), from the deficit. */
  fatLostKg: number;
  /** Change on the scale since the first weigh-in, morning equivalent (kg, positive = lost). */
  scaleLostKg: number;
  /** Fat lost per week over the whole span. */
  fatPerWeekKg: number;
  /** Latest water figure, or null with no weigh-ins. */
  latest: FatWaterPoint | null;
}

export function waterLevel(waterKg: number, th: Thresholds): WaterLevel {
  if (waterKg > th.waterHigh) return 'high';
  if (waterKg > th.waterFair) return 'mild';
  if (waterKg >= -th.waterFair) return 'normal';
  return 'releasing';
}

/** Separates what the scale shows into real fat (from the deficit) and water/food (the rest). Days after the last
 *  recorded meal count at `futureDeficit` so a weigh-in just after the last log is still compared fairly. */
export function computeFatWater(weighs: Weigh[], rows: DayRow[], eff: Efficiency, futureDeficit: number, th: Thresholds): FatWater {
  const lastRow = rows[rows.length - 1];
  const lastRowN = lastRow ? dayNumber(lastRow.dateKey) : null;
  const cumBefore = (dateKey: string): number => {
    const sum = rows.filter((r) => r.dateKey < dateKey).reduce((s, r) => s + r.deficit, 0);
    const extra = lastRowN === null ? 0 : Math.max(0, dayNumber(dateKey) - 1 - lastRowN) * futureDeficit;
    return sum + extra;
  };
  const fatDrop = (dateKey: string): number => (eff.applied * cumBefore(dateKey)) / th.kcalPerKgFat;

  const valid = validWeighs(weighs);
  // The fat line is anchored so that it passes through the middle of the valid weigh-ins.
  const anchor = avg(valid.map((w) => w.kg + fatDrop(w.dateKey)));
  const points: FatWaterPoint[] = weighs.map((w) => {
    const fatLineKg = anchor - fatDrop(w.dateKey);
    const waterKg = w.morningKg - fatLineKg;
    return { dateKey: w.dateKey, kg: w.kg, morningKg: w.morningKg, evening: w.evening, fatLineKg, waterKg, level: waterLevel(waterKg, th) };
  });

  const totalDeficit = rows.reduce((s, r) => s + r.deficit, 0);
  const fatLostKg = (eff.applied * totalDeficit) / th.kcalPerKgFat;
  const scaleLostKg = weighs.length >= 2 ? weighs[0].morningKg - weighs[weighs.length - 1].morningKg : 0;
  const days = rows.length > 0 ? dayNumber(rows[rows.length - 1].dateKey) - dayNumber(rows[0].dateKey) + 1 : 0;
  return {
    points,
    fatLostKg,
    scaleLostKg,
    fatPerWeekKg: days > 0 ? (fatLostKg / days) * 7 : 0,
    latest: points[points.length - 1] ?? null,
  };
}
