import type { WeightEntry } from '../types';
import { formatDateVi, toDateKey } from '../utils/date';
import { predictedWeightKgAt } from '../utils/milestones';
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
  /** The input `marks` placed on the chart (those inside the visible range). */
  marks: SeriesMark[];
  /** With `predicted`: the plan's expected weight over the window (dashed line), else null. */
  predictedPath: string | null;
  /** With `predicted`: x of "today" (a vertical marker), else null. */
  todayX: number | null;
}

/** A point to mark on the chart, e.g. where a stage boss fell: its weight line on the day it fell. */
export interface SeriesMark {
  x: number;
  y: number;
  kg: number;
  dateKey: string;
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
  /** Optional dated weights to mark (local date keys). */
  marks?: { kg: number; dateKey: string }[];
  /** Show only the last `windowDays` days (the weight page's 2 weeks / 1 month / 3 months); left out = since the plan started. */
  windowDays?: number;
  /** Also draw the plan's predicted weight (dashed) and a "today" marker, running `forecastDays` past today. */
  predicted?: boolean;
  forecastDays?: number;
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

  const all = [{ time: t0, kg: startWeightKg, isStart: true }, ...logged.map((e) => ({ ...e, isStart: false }))];
  // A window shorter than the whole plan starts the line where it crosses the window's left edge (a point that was not weighed).
  const from = input.windowDays != null ? Math.max(t0, now.getTime() - input.windowDays * DAY) : t0;
  const before = all.filter((p) => p.time < from);
  const inside = all.filter((p) => p.time >= from);
  const edge = before[before.length - 1];
  const next = inside[0];
  const raw =
    edge == null
      ? inside
      : [{ time: from, kg: next ? edge.kg + ((next.kg - edge.kg) * (from - edge.time)) / Math.max(1, next.time - edge.time) : edge.kg, isStart: true }, ...inside];
  const lastTime = raw[raw.length - 1].time;
  const forecast = input.predicted ? Math.max(0, input.forecastDays ?? 0) * DAY : 0;
  const t1 = Math.max(now.getTime(), lastTime, from + 7 * DAY) + forecast;

  const predictedAt = (time: number) => predictedWeightKgAt(new Date(time), startDateISO, startWeightKg, goalWeightKg);
  const PREDICTED_SAMPLES = 24;
  const predictedRaw = input.predicted
    ? Array.from({ length: PREDICTED_SAMPLES + 1 }, (_, i) => {
        const time = from + ((t1 - from) * i) / PREDICTED_SAMPLES;
        return { time, kg: predictedAt(time) };
      })
    : [];

  const kgs = [...raw.map((p) => p.kg), ...predictedRaw.map((p) => p.kg)];
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
  const xOf = (time: number) => pad.left + ((time - from) / (t1 - from)) * innerW;
  const yOf = (kg: number) => pad.top + ((hi - kg) / (hi - lo)) * innerH;

  const points: SeriesPoint[] = raw.map((p) => ({ x: xOf(p.time), y: yOf(p.kg), kg: p.kg, isStart: p.isStart }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const ticks: SeriesTick[] = bounds
    .filter((b) => b >= lo && b <= hi)
    .map((b) => ({ y: yOf(b), kg: b, kind: b === goalWeightKg ? ('goal' as const) : ('milestone' as const) }));

  const marks: SeriesMark[] = (input.marks ?? [])
    .map((m) => ({ ...m, time: new Date(`${m.dateKey}T12:00:00`).getTime() }))
    .filter((m) => Number.isFinite(m.time) && m.time >= from && m.time <= t1 && m.kg >= lo && m.kg <= hi)
    .map((m) => ({ x: xOf(m.time), y: yOf(m.kg), kg: m.kg, dateKey: m.dateKey }));

  const label = (time: number) => formatDateVi(toDateKey(new Date(time))).slice(0, 5);
  return {
    points,
    path,
    ticks,
    minKg: lo,
    maxKg: hi,
    xLabels: [
      { x: xOf(from), label: label(from) },
      { x: xOf(t1), label: label(t1) },
    ],
    marks,
    predictedPath: input.predicted
      ? predictedRaw.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.time).toFixed(1)} ${yOf(p.kg).toFixed(1)}`).join(' ')
      : null,
    todayX: input.predicted ? xOf(Math.min(t1, Math.max(from, now.getTime()))) : null,
  };
}
