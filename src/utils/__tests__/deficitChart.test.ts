import { describe, expect, it } from '@jest/globals';
import { buildDeficitChartData } from '../deficitChart';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('buildDeficitChartData', () => {
  it('returns null when the plan starts today (not enough range for a line)', () => {
    const startISO = new Date(NOW.getTime()).toISOString();
    expect(buildDeficitChartData(startISO, () => 500, NOW)).toBeNull();
  });

  it('returns null when the plan starts in the future', () => {
    const startISO = new Date(NOW.getTime() + DAY_MS).toISOString();
    expect(buildDeficitChartData(startISO, () => 500, NOW)).toBeNull();
  });

  it('does NOT include a bogus point beyond today for a same-day plan (regression: Math.max(1,...) bug)', () => {
    // A naive `Math.max(1, totalDays)` forces at least 1 day even when start === today, which
    // pulled in a spurious "tomorrow" grid point plus a duplicate "today" appended after it.
    const startISO = new Date(NOW.getTime()).toISOString();
    const result = buildDeficitChartData(startISO, () => 500, NOW);
    expect(result).toBeNull();
  });

  it('spans exactly [startDate, today] for a short range, one point per day', () => {
    const startISO = new Date(NOW.getTime() - 5 * DAY_MS).toISOString();
    const result = buildDeficitChartData(startISO, () => 500, NOW)!;
    expect(result.datasets[0].data).toHaveLength(6); // day 0..5 inclusive
    expect(result.labels).toHaveLength(6);
  });

  it('passes each grid date key to the callback and uses its return value verbatim (rounded)', () => {
    const startISO = new Date(NOW.getTime() - 2 * DAY_MS).toISOString();
    const seenKeys: string[] = [];
    const result = buildDeficitChartData(
      startISO,
      (dateKey) => {
        seenKeys.push(dateKey);
        return 1234.6;
      },
      NOW
    )!;
    expect(seenKeys).toHaveLength(3);
    expect(result.datasets[0].data.every((v) => v === 1235)).toBe(true);
  });

  it('thins to at most MAX_GRID_POINTS grid points for a long-running plan, but still ends exactly on today', () => {
    const startISO = new Date(NOW.getTime() - 200 * DAY_MS).toISOString();
    const result = buildDeficitChartData(startISO, () => 0, NOW)!;
    expect(result.datasets[0].data.length).toBeLessThanOrEqual(31);
    expect(result.labels.filter((l) => l !== '').length).toBeLessThan(result.labels.length);
  });

  it('uses the given color for the single dataset', () => {
    const startISO = new Date(NOW.getTime() - 3 * DAY_MS).toISOString();
    const result = buildDeficitChartData(startISO, () => 0, NOW, '#ff0000')!;
    expect(result.datasets[0].color()).toBe('#ff0000');
  });

  it('passes through null verbatim (unrounded) for a day with no logged data at all', () => {
    const startISO = new Date(NOW.getTime() - 4 * DAY_MS).toISOString();
    const result = buildDeficitChartData(
      startISO,
      (dateKey) => (dateKey === '2026-09-28' ? null : 500),
      NOW
    )!;
    // day 0..4: 26,27,28,29,30 Sep -> index 2 is the 28th, the one with no data.
    expect(result.datasets[0].data[2]).toBeNull();
    expect(result.datasets[0].data.filter((v) => v !== null)).toEqual([500, 500, 500, 500]);
  });
});
