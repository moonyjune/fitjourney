import type { WeightEntry } from '../types';
import { addDays, buildWeightLossMilestones, predictedWeightKgAt } from './milestones';
import { thinLabels } from './chartLabels';
import { formatDateVi, toDateKey } from './date';
import { colors } from '../theme/tokens';

export interface WeightChartDataset {
  data: number[];
  color: () => string;
  strokeWidth: number;
  withDots?: boolean;
  strokeDashArray?: number[];
}

export interface WeightChartData {
  labels: string[];
  datasets: WeightChartDataset[];
  hasActual: boolean;
  /** Index of "today" (clamped into the chart's [startDate, endDate] window) — always an exact
   *  grid point, inserted if the natural grid spacing wouldn't otherwise land on it. */
  todayIndex: number;
  /** Grid indices that do NOT correspond to a real logged entry — pass to chart-kit's
   *  hidePointsAtIndex so the actual line's carried-forward/interpolated stretches don't draw a
   *  dot that looks like a real log. */
  nonEntryIndices: number[];
}

const MAX_GRID_POINTS = 30;

/** Builds the weight-vs-time chart data for a FIXED window: always [plan start date, plan start
 *  date + rangeDays] — the selected range picks how far past the start the chart extends, not a
 *  rolling "last N days from now" window, so the x-axis stays stable as you log more entries or as
 *  time passes. The predicted (dashed) trend line always spans the full window; the actual line
 *  only appears once at least one entry exists, holding at the nearest earlier logged value
 *  between log dates (chart-kit has no concept of a gap) until the next one. Pulled out of the
 *  Weight screen component so the reverse-engineered chart-kit interop can be unit tested without
 *  rendering RN. */
export function buildWeightChartData(
  entries: WeightEntry[],
  rangeDays: number,
  startDateISO: string,
  startWeightKg: number,
  goalWeightKg: number,
  now: Date = new Date()
): WeightChartData {
  const startDate = new Date(startDateISO);
  startDate.setHours(0, 0, 0, 0);
  const endDate = addDays(startDate, rangeDays);

  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
  const stepDays = Math.max(1, Math.ceil(totalDays / MAX_GRID_POINTS));
  const gridDates: Date[] = [];
  for (let d = 0; d < totalDays; d += stepDays) {
    gridDates.push(addDays(startDate, d));
  }
  if (toDateKey(gridDates[gridDates.length - 1]) !== toDateKey(endDate)) {
    gridDates.push(endDate);
  }

  // Clamp "today" into the visible window, and make sure it's an exact grid point (inserting it
  // if the natural step spacing skipped over it) so the marker never has to interpolate.
  const clampedNowTime = Math.min(Math.max(now.getTime(), startDate.getTime()), endDate.getTime());
  const clampedNow = new Date(clampedNowTime);
  let todayIndex = gridDates.findIndex((d) => toDateKey(d) === toDateKey(clampedNow));
  if (todayIndex === -1) {
    todayIndex = gridDates.findIndex((d) => d.getTime() > clampedNowTime);
    if (todayIndex === -1) todayIndex = gridDates.length;
    gridDates.splice(todayIndex, 0, clampedNow);
  }

  const labels = thinLabels(gridDates.map((d) => formatDateVi(toDateKey(d)).slice(0, 5)));
  const predictedData = gridDates.map((d) => predictedWeightKgAt(d, startDateISO, startWeightKg, goalWeightKg));
  const predictedDataset: WeightChartDataset = {
    data: predictedData,
    color: () => 'rgba(150,150,150,0.7)',
    strokeWidth: 2,
    withDots: false,
    strokeDashArray: [6, 4],
  };

  const sortedEntries = [...entries].sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
  const hasActual = sortedEntries.length > 0;
  const nonEntryIndices: number[] = [];
  const datasets: WeightChartDataset[] = [predictedDataset];

  if (hasActual) {
    const entryDateKeys = new Set(sortedEntries.map((e) => toDateKey(new Date(e.dateISO))));
    const actualData = gridDates.map((d, i) => {
      if (!entryDateKeys.has(toDateKey(d))) nonEntryIndices.push(i);
      let latest = sortedEntries[0];
      for (const e of sortedEntries) {
        if (new Date(e.dateISO).getTime() <= d.getTime()) latest = e;
        else break;
      }
      return latest.weightKg;
    });
    datasets.unshift({ data: actualData, color: () => colors.primary, strokeWidth: 3 });
  }

  return { labels, datasets, hasActual, todayIndex, nonEntryIndices };
}

export interface WeightLossMilestoneView {
  targetWeightKg: number;
  date: Date;
  isGoal: boolean;
  daysRemaining: number;
}

/** Sequential 5kg-loss checkpoints down to the goal (see buildWeightLossMilestones), each with how
 *  many days remain — the Weight screen's replacement for a single end-of-range prediction. */
export function buildWeightLossMilestoneViews(
  startWeightKg: number,
  goalWeightKg: number,
  startDateISO: string,
  now: Date = new Date()
): WeightLossMilestoneView[] {
  return buildWeightLossMilestones(startWeightKg, goalWeightKg, startDateISO).map((m) => ({
    ...m,
    daysRemaining: Math.ceil((m.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

/** Replicates react-native-chart-kit's internal point-x formula (paddingRight/paddingTop default
 *  to 64/16 when not overridden via the chart's `style`, which the Weight screen doesn't) so a
 *  "today" marker can be drawn without fighting the library's lack of native vertical-reference-
 *  line support. Must be kept in sync with getLegacyLineChartPointX in react-native-chart-kit. */
export function computeTodayLineX(todayIndex: number, labelsLength: number, screenWidth: number, paddingRight = 64): number {
  const xMax = Math.max(labelsLength, 1);
  return paddingRight + (todayIndex * (screenWidth - paddingRight)) / xMax;
}
