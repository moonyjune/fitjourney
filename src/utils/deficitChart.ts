import { addDays } from './milestones';
import { thinLabels } from './chartLabels';
import { formatDateVi, toDateKey } from './date';

export interface DeficitChartData {
  labels: string[];
  datasets: [{ data: (number | null)[]; color: () => string; strokeWidth: number }];
}

const MAX_GRID_POINTS = 30;

/** Builds a fixed-grid line-chart series of the daily calorie deficit for every calendar day from
 *  the plan's start date through today (inclusive), thinned to at most MAX_GRID_POINTS so a
 *  months-long plan doesn't render one point per day. Returns null when the range is too short to
 *  plot (plan starts today or later) — chart-kit needs at least 2 points for a line.
 *
 *  `deficitForDateKey` returns null for a day with no logged data at all — the line-chart patch in
 *  patches/react-native-chart-kit+*.patch breaks the line at those points instead of drawing a
 *  fabricated slope through them (a day nobody logged anything for isn't really "TDEE kcal
 *  deficit", it's just missing data). */
export function buildDeficitChartData(
  startDateISO: string,
  deficitForDateKey: (dateKey: string) => number | null,
  now: Date = new Date(),
  color = '#4F8EF7'
): DeficitChartData | null {
  const startDate = new Date(startDateISO);
  startDate.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (startDate.getTime() > today.getTime()) return null;

  const totalDays = Math.round((today.getTime() - startDate.getTime()) / 86400000);
  const stepDays = Math.max(1, Math.ceil(totalDays / MAX_GRID_POINTS));
  const gridDates: Date[] = [];
  for (let d = 0; d <= totalDays; d += stepDays) {
    gridDates.push(addDays(startDate, d));
  }
  if (toDateKey(gridDates[gridDates.length - 1]) !== toDateKey(today)) {
    gridDates.push(today);
  }
  if (gridDates.length < 2) return null;

  const labels = thinLabels(gridDates.map((d) => formatDateVi(toDateKey(d)).slice(0, 5)));
  const data = gridDates.map((d) => {
    const value = deficitForDateKey(toDateKey(d));
    return value == null ? null : Math.round(value);
  });
  return { labels, datasets: [{ data, color: () => color, strokeWidth: 3 }] };
}
