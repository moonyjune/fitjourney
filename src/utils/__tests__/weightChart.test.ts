import { describe, expect, it } from '@jest/globals';
import { buildWeightChartData, computeMilestonePrediction, computeTodayLineX } from '../weightChart';
import type { WeightEntry } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-21T12:00:00.000Z');
const START_DATE_ISO = new Date(NOW.getTime() - 21 * DAY_MS).toISOString(); // plan started 3 weeks ago
const START_WEIGHT = 110;
const GOAL_WEIGHT = 95;

function entry(daysAgo: number, weightKg: number): WeightEntry {
  return { id: `e${daysAgo}`, dateISO: new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString(), weightKg };
}

describe('buildWeightChartData', () => {
  it('falls back to a predicted-only dataset spanning [cutoff, now] when no entries are in range', () => {
    const result = buildWeightChartData([], 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);

    expect(result.hasActual).toBe(false);
    expect(result.datasets).toHaveLength(1);
    expect(result.datasets[0].withDots).toBe(false);
    expect(result.datasets[0].data).toHaveLength(2);
    // Window always ends "now" — last point is today, at index length-1.
    expect(result.todayIndex).toBe(1);
    expect(result.labels).toHaveLength(2);
  });

  it('overlays a real dataset (solid, with dots) in front of the predicted one when entries exist', () => {
    const entries = [entry(10, 108), entry(5, 106.5), entry(0, 105)];
    const result = buildWeightChartData(entries, 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);

    expect(result.hasActual).toBe(true);
    expect(result.datasets).toHaveLength(2);
    expect(result.datasets[0].data).toEqual([108, 106.5, 105]);
    expect(result.datasets[0].withDots).not.toBe(false); // real line keeps default (visible) dots
    expect(result.datasets[1].withDots).toBe(false); // predicted line never gets dots
    expect(result.datasets[1].data).toHaveLength(3); // one predicted point per actual date
    expect(result.todayIndex).toBe(2); // last of 3 actual points is "today"
  });

  it('excludes entries older than the selected range', () => {
    const entries = [entry(40, 112), entry(3, 107)]; // 40 days ago is outside a 30-day window
    const result = buildWeightChartData(entries, 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);

    expect(result.hasActual).toBe(true);
    expect(result.datasets[0].data).toEqual([107]);
    expect(result.todayIndex).toBe(0);
  });

  it('never lets the predicted line drop below the goal weight once the plan is old enough', () => {
    // `rangeDays` only controls how far back to look for entries/labels — the chart always ends
    // "today", so to see the floor kick in, "today" itself must be far enough past the plan's
    // start date (here, 300 days in) that the raw linear projection would overshoot the goal.
    const oldStartISO = new Date(NOW.getTime() - 300 * DAY_MS).toISOString();
    const result = buildWeightChartData([], 30, oldStartISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    for (const v of result.datasets[0].data) {
      expect(v).toBeGreaterThanOrEqual(GOAL_WEIGHT);
    }
    // 300 days in at 1.0kg/week would project to 110 - 42.9 ≈ 67kg, well past the 95kg goal.
    expect(result.datasets[0].data[result.datasets[0].data.length - 1]).toBe(GOAL_WEIGHT);
  });

  it('thins labels once there are more than 7 points, but keeps one label per data point', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(9 - i, 110 - i));
    const result = buildWeightChartData(entries, 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);

    expect(result.labels).toHaveLength(10); // thinLabels blanks entries, it doesn't drop them
    expect(result.labels.filter((l) => l !== '').length).toBeLessThan(10);
    expect(result.labels[result.labels.length - 1]).not.toBe(''); // last (today) label always kept
  });
});

describe('computeMilestonePrediction', () => {
  it('projects the weight at startDate + rangeDays using the same curve as the chart', () => {
    const prediction = computeMilestonePrediction(14, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    // 14 days from start, at 1.0kg/week average: 110 - 1.0*(14/7) = 108
    expect(prediction.targetWeightKg).toBeCloseTo(108, 5);
    expect(prediction.targetDate.getTime()).toBe(new Date(START_DATE_ISO).getTime() + 14 * DAY_MS);
  });

  it('reports a positive daysRemaining for a target date still in the future', () => {
    // Plan started 21 days ago; a 30-day range target date is 9 days from "now".
    const prediction = computeMilestonePrediction(30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(prediction.daysRemaining).toBe(9);
  });

  it('reports a non-positive daysRemaining once the target date has already passed', () => {
    // A 7-day range target date was 14 days before "now".
    const prediction = computeMilestonePrediction(7, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(prediction.daysRemaining).toBeLessThanOrEqual(0);
  });
});

describe('computeTodayLineX', () => {
  it('matches react-native-chart-kit\'s getLegacyLineChartPointX formula', () => {
    // Manually inlined reference formula so a future accidental edit to computeTodayLineX
    // (or an upstream chart-kit change we haven't re-synced against) shows up as a real diff.
    function referenceFormula(index: number, xMax: number, width: number, paddingRight: number) {
      return paddingRight + (index * (width - paddingRight)) / Math.max(xMax, 1);
    }
    const width = 398; // a typical phone screenWidth (430 - 32 padding)
    expect(computeTodayLineX(4, 5, width)).toBeCloseTo(referenceFormula(4, 5, width, 64), 5);
    expect(computeTodayLineX(0, 5, width)).toBeCloseTo(referenceFormula(0, 5, width, 64), 5);
  });

  it('places the marker exactly at paddingRight when todayIndex is 0 (single-point chart)', () => {
    expect(computeTodayLineX(0, 2, 398)).toBe(64);
  });

  it('approaches but never reaches the right edge, since chart-kit divides by labelsLength not labelsLength-1', () => {
    // This asymmetry is a chart-kit quirk, not a bug here — pinned so a "fix" that changes xMax
    // to labelsLength-1 (which would break sync with the library) gets caught immediately.
    const width = 398;
    const x = computeTodayLineX(4, 5, width); // last of 5 points: ratio 4/5, not 5/5
    expect(x).toBeCloseTo(64 + (4 * (width - 64)) / 5, 5);
    expect(x).toBeLessThan(width);
  });

  it('falls back to xMax=1 when there are no labels yet, avoiding a divide-by-zero', () => {
    expect(() => computeTodayLineX(0, 0, 398)).not.toThrow();
    expect(computeTodayLineX(0, 0, 398)).toBe(64);
  });

  it('respects a custom paddingRight override', () => {
    expect(computeTodayLineX(2, 4, 400, 40)).toBeCloseTo(40 + (2 * (400 - 40)) / 4, 5);
  });
});
