import type { WeightEntry } from '../types';
import { predictedWeightKgAt } from './milestones';
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
  /** Index of "today" in every dataset's data array — the window always ends now, so this is
   *  always the last point. Used to draw the today marker. */
  todayIndex: number;
}

/** Builds the weight-vs-time chart data for the selected range. Always renders something: with
 *  no (or one) actual entry, only the predicted trend line (from start weight to goal, following
 *  the same curve milestones are scored against) spans the range; real entries overlay it as soon
 *  as they exist. Pulled out of the Weight screen component so the reverse-engineered chart-kit
 *  interop (labels/todayIndex/dataset shape) can be unit tested without rendering RN. */
export function buildWeightChartData(
  entries: WeightEntry[],
  rangeDays: number,
  startDateISO: string,
  startWeightKg: number,
  goalWeightKg: number,
  now: Date = new Date()
): WeightChartData {
  const cutoff = now.getTime() - rangeDays * 24 * 60 * 60 * 1000;
  const inRange = entries.filter((e) => new Date(e.dateISO).getTime() >= cutoff);
  const pointDates = inRange.length > 0 ? inRange.map((e) => new Date(e.dateISO)) : [new Date(cutoff), now];

  const labels = thinLabels(pointDates.map((d) => formatDateVi(toDateKey(d)).slice(0, 5)));
  const predictedData = pointDates.map((d) => predictedWeightKgAt(d, startDateISO, startWeightKg, goalWeightKg));

  const predictedDataset: WeightChartDataset = {
    data: predictedData,
    color: () => 'rgba(150,150,150,0.7)',
    strokeWidth: 2,
    withDots: false,
    strokeDashArray: [6, 4],
  };

  const datasets: WeightChartDataset[] =
    inRange.length > 0
      ? [{ data: inRange.map((e) => e.weightKg), color: () => colors.primary, strokeWidth: 3 }, predictedDataset]
      : [predictedDataset];

  return { labels, datasets, hasActual: inRange.length > 0, todayIndex: pointDates.length - 1 };
}

export interface MilestonePrediction {
  targetDate: Date;
  targetWeightKg: number;
  daysRemaining: number;
}

/** What the trend line projects for the end of the selected milestone range — shown as text since
 *  chart-kit has no clean way to extend one dataset past the chart's shared x-axis into the future
 *  while the other stops at today. */
export function computeMilestonePrediction(
  rangeDays: number,
  startDateISO: string,
  startWeightKg: number,
  goalWeightKg: number,
  now: Date = new Date()
): MilestonePrediction {
  const startDate = new Date(startDateISO);
  const targetDate = new Date(startDate);
  targetDate.setDate(targetDate.getDate() + rangeDays);
  const targetWeightKg = predictedWeightKgAt(targetDate, startDateISO, startWeightKg, goalWeightKg);
  const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return { targetDate, targetWeightKg, daysRemaining };
}

/** Replicates react-native-chart-kit's internal point-x formula (paddingRight/paddingTop default
 *  to 64/16 when not overridden via the chart's `style`, which the Weight screen doesn't) so a
 *  "today" marker can be drawn without fighting the library's lack of native vertical-reference-
 *  line support. Must be kept in sync with getLegacyLineChartPointX in react-native-chart-kit. */
export function computeTodayLineX(todayIndex: number, labelsLength: number, screenWidth: number, paddingRight = 64): number {
  const xMax = Math.max(labelsLength, 1);
  return paddingRight + (todayIndex * (screenWidth - paddingRight)) / xMax;
}
