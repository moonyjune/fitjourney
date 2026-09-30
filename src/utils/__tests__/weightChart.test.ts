import { describe, expect, it } from '@jest/globals';
import { buildWeightChartData, buildWeightLossMilestoneViews, computeTodayLineX } from '../weightChart';
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
  it('spans a FIXED window [startDate, startDate+rangeDays], not a rolling "now - rangeDays" window', () => {
    const result = buildWeightChartData([], 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    const firstLabelDate = new Date(START_DATE_ISO);
    firstLabelDate.setHours(0, 0, 0, 0);
    // The predicted line's first point should be at the plan's start date, not 30 days before now.
    expect(result.datasets[0].data[0]).toBeCloseTo(START_WEIGHT, 5);
  });

  it('has no actual dataset when there are no entries', () => {
    const result = buildWeightChartData([], 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.hasActual).toBe(false);
    expect(result.datasets).toHaveLength(1);
  });

  it('adds an actual dataset once entries exist, in front of the predicted one', () => {
    const entries = [entry(10, 108), entry(5, 106.5), entry(0, 105)];
    const result = buildWeightChartData(entries, 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.hasActual).toBe(true);
    expect(result.datasets).toHaveLength(2);
    expect(result.datasets[1].withDots).toBe(false); // predicted line never gets dots
  });

  it("clamps today's marker into the window and keeps it an exact grid index", () => {
    const result = buildWeightChartData([], 7, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    // now is 21 days after start, but the window only runs 7 days -> clamp to the last index.
    expect(result.todayIndex).toBe(result.datasets[0].data.length - 1);
  });

  it("places today's marker partway through the window when now falls inside it", () => {
    const recentStart = new Date(NOW.getTime() - 3 * DAY_MS).toISOString();
    const result = buildWeightChartData([], 30, recentStart, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.todayIndex).toBeGreaterThan(0);
    expect(result.todayIndex).toBeLessThan(result.datasets[0].data.length - 1);
  });

  it('shows the today marker at the correct day even with zero logged entries', () => {
    // This is the exact bug report: "dù chưa có data vẫn hiển thị đường đỏ đúng ngày".
    const recentStart = new Date(NOW.getTime() - 3 * DAY_MS).toISOString();
    const result = buildWeightChartData([], 30, recentStart, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.hasActual).toBe(false);
    expect(result.todayIndex).toBeGreaterThanOrEqual(0);
    expect(result.todayIndex).toBeLessThan(result.labels.length);
  });

  it('holds the actual line at the nearest earlier entry between log dates (no gaps)', () => {
    const entries = [entry(10, 108)];
    const result = buildWeightChartData(entries, 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    const actualData = result.datasets[0].data;
    // Every point should be a real number (no null/NaN gaps chart-kit can't render).
    for (const v of actualData) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Points before the only entry hold at that entry's value.
    expect(actualData[0]).toBe(108);
  });

  it('marks grid points that are not real logged entries via nonEntryIndices, for hidePointsAtIndex', () => {
    const entries = [entry(0, 105)]; // dated "today", which the 30-day window (start 21 days ago) contains
    const result = buildWeightChartData(entries, 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.nonEntryIndices.length).toBeGreaterThan(0);
    expect(result.nonEntryIndices.length).toBeLessThan(result.datasets[0].data.length);
  });

  it('never lets the predicted line drop below the goal weight once the plan is old enough', () => {
    const oldStartISO = new Date(NOW.getTime() - 300 * DAY_MS).toISOString();
    const result = buildWeightChartData([], 30, oldStartISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    const predicted = result.datasets[0];
    for (const v of predicted.data) {
      expect(v).toBeGreaterThanOrEqual(GOAL_WEIGHT);
    }
  });

  it('thins labels once the grid has many points, but keeps one label slot per data point', () => {
    const result = buildWeightChartData([], 91, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.labels).toHaveLength(result.datasets[0].data.length);
    expect(result.labels.filter((l) => l !== '').length).toBeLessThan(result.labels.length);
  });

  it("always keeps the start date, today, and end date labels visible, even when thinning would otherwise blank them", () => {
    // NOW is 21 days after start; a 30-day window puts "today" at index 21, not a multiple of the
    // ~5-step thinning stride computed for ~31 labels — the exact case that used to silently drop
    // the "today" label even though the red today-line was still drawn at that x position.
    const result = buildWeightChartData([], 30, START_DATE_ISO, START_WEIGHT, GOAL_WEIGHT, NOW);
    expect(result.labels[0]).not.toBe('');
    expect(result.labels[result.todayIndex]).not.toBe('');
    expect(result.labels[result.labels.length - 1]).not.toBe('');
  });
});

describe('buildWeightLossMilestoneViews', () => {
  it('builds sequential 5kg steps down to the goal', () => {
    const milestones = buildWeightLossMilestoneViews(110, 95, START_DATE_ISO, NOW);
    expect(milestones.map((m) => m.targetWeightKg)).toEqual([105, 100, 95]);
    expect(milestones[milestones.length - 1].isGoal).toBe(true);
    expect(milestones.slice(0, -1).every((m) => !m.isGoal)).toBe(true);
  });

  it('produces later dates for each successive (lower) milestone', () => {
    const milestones = buildWeightLossMilestoneViews(110, 95, START_DATE_ISO, NOW);
    for (let i = 1; i < milestones.length; i++) {
      expect(milestones[i].date.getTime()).toBeGreaterThan(milestones[i - 1].date.getTime());
    }
  });

  it('handles a goal weight that is not a clean multiple of 5kg below start', () => {
    const milestones = buildWeightLossMilestoneViews(102, 93, START_DATE_ISO, NOW);
    // 100, 95, then the goal 93 (not a further full 5kg step).
    expect(milestones.map((m) => m.targetWeightKg)).toEqual([100, 95, 93]);
  });

  it('reports non-positive daysRemaining for a milestone whose date has already passed', () => {
    // Plan started 21 days ago at 1kg/week -> ~3kg lost so far, so the first 5kg milestone is
    // still in the future; force a very old start so it's clearly in the past instead.
    const oldStart = new Date(NOW.getTime() - 300 * DAY_MS).toISOString();
    const milestones = buildWeightLossMilestoneViews(110, 95, oldStart, NOW);
    expect(milestones[0].daysRemaining).toBeLessThanOrEqual(0);
  });
});

describe('computeTodayLineX', () => {
  it("matches react-native-chart-kit's getLegacyLineChartPointX formula", () => {
    function referenceFormula(index: number, xMax: number, width: number, paddingRight: number) {
      return paddingRight + (index * (width - paddingRight)) / Math.max(xMax, 1);
    }
    const width = 398;
    expect(computeTodayLineX(4, 5, width)).toBeCloseTo(referenceFormula(4, 5, width, 64), 5);
    expect(computeTodayLineX(0, 5, width)).toBeCloseTo(referenceFormula(0, 5, width, 64), 5);
  });

  it('places the marker exactly at paddingRight when todayIndex is 0 (single-point chart)', () => {
    expect(computeTodayLineX(0, 2, 398)).toBe(64);
  });

  it('approaches but never reaches the right edge, since chart-kit divides by labelsLength not labelsLength-1', () => {
    const width = 398;
    const x = computeTodayLineX(4, 5, width);
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
