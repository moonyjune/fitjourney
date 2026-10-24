import type { WeightEntry } from '../types';
import { formatDateVi, toDateKey } from '../utils/date';
import { regionBoundaries } from './map';

export interface SeriesPoint {
  x: number;
  y: number;
  kg: number;
  /** True for the synthetic point at the plan's start date and start weight. */
  isStart: boolean;
}

export interface SeriesTick {
  y: number;
  kg: number;
  kind: 'milestone' | 'goal';
}

export interface WeightSeries {
  points: SeriesPoint[];
  /** SVG path through all points (a single `M` when there is only the start point). */
  path: string;
  ticks: SeriesTick[];
  minKg: number;
  maxKg: number;
  /** Date labels under the chart: the plan start and the latest day shown. */
  xLabels: { x: number; label: string }[];
}

export interface SeriesInput {
  entries: WeightEntry[];
  startDateISO: string;
  startWeightKg: number;
  goalWeightKg: number;
  now: Date;
  width: number;
  height: number;
  pad?: { left: number; right: number; top: number; bottom: number };
}

const DAY = 86400000;

/**
 * Turns the weight log into drawable coordinates. Real entries only: the line starts at the plan's
 * start weight and passes through each logged weight, with no interpolated or predicted points.
 * The vertical range hugs the data (plus the next 5 kg checkpoint so "how far to go" is visible)
 * instead of stretching all the way to the goal, which would flatten the line.
 */
export function buildWeightSeries(input: SeriesInput): WeightSeries {
  const { entries, startDateISO, startWeightKg, goalWeightKg, now, width, height } = input;
  const pad = input.pad ?? { left: 36, right: 52, top: 14, bottom: 26 };

  const start = new Date(startDateISO);
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();

  const logged = entries
    .map((e) => ({ time: new Date(e.dateISO).getTime(), kg: e.weightKg }))
    .filter((e) => e.time >= t0 && e.time <= now.getTime() + DAY)
    .sort((a, b) => a.time - b.time);

  const raw = [{ time: t0, kg: startWeightKg, isStart: true }, ...logged.map((e) => ({ ...e, isStart: false }))];
  const lastTime = raw[raw.length - 1].time;
  const t1 = Math.max(now.getTime(), lastTime, t0 + 7 * DAY);

  const kgs = raw.map((p) => p.kg);
  let lo = Math.min(...kgs);
  let hi = Math.max(...kgs);
  const latest = raw[raw.length - 1].kg;
  const bounds = regionBoundaries(startWeightKg, goalWeightKg).slice(1); // checkpoints below the start
  const nextCheckpoint = bounds.find((b) => b < latest);
  if (nextCheckpoint != null && latest - nextCheckpoint <= 8) lo = Math.min(lo, nextCheckpoint - 0.3);
  lo = Math.floor(lo - 0.5);
  hi = Math.ceil(hi + 0.5);
  if (hi - lo < 3) hi = lo + 3;

  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const xOf = (time: number) => pad.left + ((time - t0) / (t1 - t0)) * innerW;
  const yOf = (kg: number) => pad.top + ((hi - kg) / (hi - lo)) * innerH;

  const points: SeriesPoint[] = raw.map((p) => ({ x: xOf(p.time), y: yOf(p.kg), kg: p.kg, isStart: p.isStart }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const ticks: SeriesTick[] = bounds
    .filter((b) => b >= lo && b <= hi)
    .map((b) => ({ y: yOf(b), kg: b, kind: b === goalWeightKg ? ('goal' as const) : ('milestone' as const) }));

  const label = (time: number) => formatDateVi(toDateKey(new Date(time))).slice(0, 5);
  return {
    points,
    path,
    ticks,
    minKg: lo,
    maxKg: hi,
    xLabels: [
      { x: xOf(t0), label: label(t0) },
      { x: xOf(t1), label: label(t1) },
    ],
  };
}
