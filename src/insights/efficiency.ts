import { avg, dayNumber } from './dateMath';
import type { DayRow } from './days';
import type { Thresholds } from './thresholds';
import { validWeighs, type Weigh } from './weights';

export interface Efficiency {
  /** Valid weigh-ins used. */
  count: number;
  firstKey: string | null;
  lastKey: string | null;
  spanDays: number;
  /** Least-squares slope of the valid weigh-ins, kg per day (negative = losing). */
  slopeKgPerDay: number;
  /** Loss over the span according to the scale. */
  actualLossKg: number;
  /** Average deficit over the span (complete days when there are any). */
  avgDeficit: number;
  /** Loss over the span that the deficit alone would predict at 7,700 kcal/kg. */
  theoryLossKg: number;
  /** actual / theory, before being tempered by how few weigh-ins there are. */
  raw: number;
  /** 0..1: how far the raw figure is trusted. */
  confidence: number;
  /** The coefficient used everywhere: 1 means "scale follows the maths exactly". */
  applied: number;
  /** Kg actually lost per 1,000 kcal of paper deficit. */
  kgPer1000: number;
}

const slope = (pts: { x: number; y: number }[]): number => {
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
};

/** How much of the paper deficit really shows up as weight lost, measured from the user's own weigh-ins. */
export function computeEfficiency(weighs: Weigh[], rows: DayRow[], th: Thresholds): Efficiency {
  const valid = validWeighs(weighs);
  const empty: Efficiency = {
    count: valid.length,
    firstKey: valid[0]?.dateKey ?? null,
    lastKey: valid[valid.length - 1]?.dateKey ?? null,
    spanDays: 0,
    slopeKgPerDay: 0,
    actualLossKg: 0,
    avgDeficit: 0,
    theoryLossKg: 0,
    raw: 1,
    confidence: 0,
    applied: 1,
    kgPer1000: (1000 * 1) / th.kcalPerKgFat,
  };
  if (valid.length < 2) return empty;

  const first = valid[0].dateKey;
  const last = valid[valid.length - 1].dateKey;
  const spanDays = dayNumber(last) - dayNumber(first);
  if (spanDays <= 0) return empty;

  const base = dayNumber(first);
  const k = slope(valid.map((w) => ({ x: dayNumber(w.dateKey) - base, y: w.kg })));
  const actualLossKg = -k * spanDays;

  const within = rows.filter((r) => r.dateKey >= first && r.dateKey < last);
  const full = within.filter((r) => r.complete);
  const avgDeficit = avg((full.length > 0 ? full : within).map((r) => r.deficit));
  const theoryLossKg = (avgDeficit * spanDays) / th.kcalPerKgFat;
  const raw = theoryLossKg !== 0 ? actualLossKg / theoryLossKg : 1;
  const confidence = Math.min(1, valid.length / th.trustWeighIns);
  const clamped = Math.max(th.efficiencyMin, Math.min(th.efficiencyMax, raw));
  const applied = confidence * clamped + (1 - confidence) * 1;
  return {
    count: valid.length,
    firstKey: first,
    lastKey: last,
    spanDays,
    slopeKgPerDay: k,
    actualLossKg,
    avgDeficit,
    theoryLossKg,
    raw,
    confidence,
    applied,
    kgPer1000: (1000 * applied) / th.kcalPerKgFat,
  };
}

export type EfficiencyBand = 'low' | 'slow' | 'good' | 'fast';
export function efficiencyBand(applied: number): EfficiencyBand {
  if (applied < 0.65) return 'low';
  if (applied < 0.85) return 'slow';
  if (applied <= 1.15) return 'good';
  return 'fast';
}
