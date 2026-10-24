import { describe, expect, it } from '@jest/globals';
import type { WeightEntry } from '../../types';
import { buildWeightLossMilestones } from '../../utils/milestones';
import { buildRegions, currentRegion, regionBoundaries } from '../map';
import { MAP_TRAIL, pointAt, pointsUpTo, sampleCubics } from '../pathGeometry';
import { buildWeightSeries } from '../weightSeries';

describe('regions', () => {
  it('uses the same checkpoints as the Weight tab milestones (110 -> 95)', () => {
    expect(regionBoundaries(110, 95)).toEqual([110, 105, 100, 95]);
    const fromMilestones = buildWeightLossMilestones(110, 95, '2026-10-19T00:00:00').map((m) => m.targetWeightKg);
    expect(regionBoundaries(110, 95).slice(1)).toEqual(fromMilestones);
  });

  it('handles starts and goals that are not multiples of 5', () => {
    expect(regionBoundaries(107.3, 96)).toEqual([107.3, 105, 100, 96]);
    expect(regionBoundaries(105, 95)).toEqual([105, 100, 95]); // an exact multiple still steps down a full 5
    expect(regionBoundaries(100, 98)).toEqual([100, 98]);
  });

  it('marks the region the player is in, finished ones, and locked ones', () => {
    const regions = buildRegions(110, 95, 106.2);
    expect(regions.map((r) => r.status)).toEqual(['current', 'locked', 'locked']);
    expect(regions[0].progress).toBeCloseTo((110 - 106.2) / 5, 5); // 0.76
    expect(regions[2]).toMatchObject({ isSummit: true, nameKey: 'summit', progress: 0 });
    expect(regions[0]).toMatchObject({ fromKg: 110, toKg: 105, nameKey: '1' });

    const later = buildRegions(110, 95, 101);
    expect(later.map((r) => r.status)).toEqual(['done', 'current', 'locked']);
    expect(later[0].progress).toBe(1);
    expect(currentRegion(later)?.index).toBe(1);
  });

  it('finishes every region at the goal and stays safe when weight went up', () => {
    expect(buildRegions(110, 95, 94).every((r) => r.status === 'done')).toBe(true);
    expect(currentRegion(buildRegions(110, 95, 94))?.index).toBe(2); // last region when all are done
    const up = buildRegions(110, 95, 112);
    expect(up[0]).toMatchObject({ status: 'current', progress: 0 });
  });

  it('copes with a goal that is not below the start', () => {
    const regions = buildRegions(90, 95, 92);
    expect(regions).toHaveLength(1);
    expect(regions[0].status).toBe('done');
  });
});

describe('trail geometry', () => {
  const pts = sampleCubics(MAP_TRAIL);

  it('starts at the bottom and ends at the gate', () => {
    expect(pts[0]).toEqual({ x: 60, y: 400 });
    expect(pts[pts.length - 1].x).toBeCloseTo(290, 5);
    expect(pts[pts.length - 1].y).toBeCloseTo(50, 5);
    expect(pointAt(pts, 0)).toEqual(pts[0]);
    expect(pointAt(pts, 1).y).toBeCloseTo(50, 5);
  });

  it('moves steadily up the trail as the fraction grows', () => {
    const ys = [0, 0.25, 0.5, 0.76, 1].map((t) => pointAt(pts, t).y);
    expect(ys[0]).toBeGreaterThan(ys[2]);
    expect(ys[2]).toBeGreaterThan(ys[4]);
  });

  it('draws the walked part ending exactly at the player', () => {
    const walked = pointsUpTo(pts, 0.76);
    const end = walked[walked.length - 1];
    const player = pointAt(pts, 0.76);
    expect(end.x).toBeCloseTo(player.x, 5);
    expect(end.y).toBeCloseTo(player.y, 5);
    expect(walked.length).toBeLessThan(pts.length);
    expect(pointsUpTo(pts, 0)).toHaveLength(1);
    expect(pointsUpTo(pts, 1)).toBe(pts);
  });
});

describe('weight series', () => {
  const entries: WeightEntry[] = [
    { id: 'a', dateISO: '2026-10-21T06:00:00', weightKg: 109 },
    { id: 'b', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 },
  ];
  const base = { entries, startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, now: new Date('2026-10-23T16:00:00'), width: 360, height: 180 };

  it('starts at the plan start weight and passes through each real entry in time order', () => {
    const s = buildWeightSeries(base);
    expect(s.points.map((p) => p.kg)).toEqual([110, 109, 106.2]);
    expect(s.points[0].isStart).toBe(true);
    const xs = s.points.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // A heavier weight is drawn higher, i.e. with a smaller y.
    expect(s.points[0].y).toBeLessThan(s.points[2].y);
    expect(s.path.startsWith('M')).toBe(true);
    expect(s.path.match(/L/g)).toHaveLength(2);
  });

  it('keeps the next 5 kg checkpoint in view and draws it as a tick', () => {
    const s = buildWeightSeries(base);
    const tick = s.ticks.find((t) => t.kg === 105);
    expect(tick).toBeDefined();
    expect(tick!.kind).toBe('milestone');
    expect(s.minKg).toBeLessThanOrEqual(104);
    expect(s.maxKg).toBeGreaterThanOrEqual(111);
    // The goal is far below the data, so it is not forced into the range.
    expect(s.ticks.find((t) => t.kind === 'goal')).toBeUndefined();
  });

  it('works with no entries at all (just the start point) and ignores entries before the start', () => {
    const none = buildWeightSeries({ ...base, entries: [] });
    expect(none.points).toHaveLength(1);
    expect(none.path).toMatch(/^M[\d.]+ [\d.]+$/);
    const old = buildWeightSeries({ ...base, entries: [{ id: 'z', dateISO: '2026-09-01T06:00:00', weightKg: 120 }] });
    expect(old.points).toHaveLength(1);
  });

  it('labels the first and last day of the window and never divides by zero on day one', () => {
    const s = buildWeightSeries({ ...base, now: new Date('2026-10-19T09:00:00'), entries: [] });
    expect(s.xLabels[0].label).toBe('19/10');
    expect(Number.isFinite(s.points[0].x)).toBe(true);
    expect(s.xLabels[1].x).toBeGreaterThan(s.xLabels[0].x);
  });
});
