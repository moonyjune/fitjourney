import { describe, expect, it } from '@jest/globals';
import type { WeightEntry } from '../../types';
import { buildStageJourney, daysBetween, firstReachedDateKey, skillsFor, stageAsRegion, zoneCount, zoneOf } from '../stageBosses';

const START = '2026-10-01T08:00:00';
const w = (dateKey: string, kg: number, id = dateKey): WeightEntry => ({ id, dateISO: `${dateKey}T06:30:00`, weightKg: kg });

describe('stage bosses: bands and zones', () => {
  it('cuts 110 -> 95 into three 5 kg bosses, one per zone, harder further on', () => {
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 110, entries: [], startDateISO: START });
    expect(j.bosses.map((b) => [b.fromKg, b.toKg, b.hpKg])).toEqual([
      [110, 105, 5],
      [105, 100, 5],
      [100, 95, 5],
    ]);
    expect(j.zones).toHaveLength(3);
    expect(j.bosses.map((b) => b.zone)).toEqual([0, 1, 2]);
    expect(j.bosses.map((b) => b.tier)).toEqual([1, 2, 4]); // the final boss gets an extra star
    expect(j.bosses.map((b) => b.skills.length)).toEqual([1, 2, 3]);
    expect(j.bosses.map((b) => b.archetype)).toEqual(['sugar', 'beer', 'hotpot']);
    expect(j.bosses[0].skills).toEqual(['sugarLure']);
    expect(j.bosses[2].isFinal).toBe(true);
    expect(j.zones.map((z) => z.nameKey)).toEqual(['1', '2', 'summit']);
    expect(j.totalKg).toBe(15);
  });

  it('makes the first and last bands shorter when start and goal are not multiples of 5', () => {
    const j = buildStageJourney({ startKg: 107.3, goalKg: 96, currentKg: 107.3, entries: [] });
    expect(j.bosses.map((b) => b.hpKg)).toEqual([2.3, 5, 4]);
  });

  it('groups about 3 bosses per zone on long journeys, earlier zones taking the extras, at most 7 zones', () => {
    expect([1, 2, 3, 4, 6, 9, 10, 14, 30].map(zoneCount)).toEqual([1, 2, 3, 3, 3, 3, 4, 5, 7]);
    expect([0, 1, 2, 3].map((i) => zoneOf(i, 4))).toEqual([0, 0, 1, 2]);
    const j = buildStageJourney({ startKg: 150, goalKg: 80, currentKg: 150, entries: [] }); // 14 bosses
    expect(j.bosses).toHaveLength(14);
    expect(j.zones).toHaveLength(5);
    expect(j.zones.map((z) => z.bosses.length)).toEqual([3, 3, 3, 3, 2]);
    expect(j.zones.map((z) => z.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(Math.max(...j.bosses.map((b) => b.tier))).toBe(5);
    expect(j.zones[4].bosses[1].indexInZone).toBe(1);
  });

  it('combines skills by zone and never repeats one', () => {
    expect(skillsFor('sugar', 0, false)).toEqual(['sugarLure']);
    expect(skillsFor('sugar', 1, false)).toEqual(['sugarLure', 'snackAttack']);
    expect(skillsFor('sugar', 3, false)).toEqual(['sugarLure', 'snackAttack', 'milkTea']);
    expect(skillsFor('hotpot', 0, true)).toHaveLength(2);
    for (const a of ['sugar', 'beer', 'bubbleTea', 'noodle', 'couch', 'hotpot'] as const) {
      const s = skillsFor(a, 4, false);
      expect(new Set(s).size).toBe(s.length);
    }
  });

  it('has no bosses when the goal is not below the start', () => {
    const j = buildStageJourney({ startKg: 90, goalKg: 95, currentKg: 92, entries: [] });
    expect(j.bosses).toEqual([]);
    expect(j.zones).toEqual([]);
    expect(j.current).toBeUndefined();
  });
});

describe('stage bosses: defeat dates from the weight history', () => {
  const entries = [w('2026-10-21', 104.6), w('2026-10-05', 108), w('2026-10-12', 104.9), w('2026-10-30', 101.2)];

  it('dates each defeat by the first weigh-in at or below the band, with the days it took', () => {
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 101.2, entries, startDateISO: START });
    const [first, second, last] = j.bosses;
    expect(first).toMatchObject({ status: 'defeated', defeatedDateKey: '2026-10-12', daysTaken: 11, hpLeftKg: 0, progress: 1 });
    expect(second.status).toBe('current');
    expect(second.hpLeftKg).toBe(1.2);
    expect(second.progress).toBeCloseTo(3.8 / 5, 5);
    expect(second.defeatedDateKey).toBeNull();
    expect(last).toMatchObject({ status: 'locked', progress: 0, hpLeftKg: 5 });
    expect(j.current?.index).toBe(1);
    expect(j.defeatedCount).toBe(1);
    expect(j.lostKg).toBe(8.8);
    expect(j.leftKg).toBe(6.2);
    expect(j.zones.map((z) => z.status)).toEqual(['defeated', 'current', 'locked']);
    expect(j.zones[1].progress).toBeCloseTo(0.76, 5);
  });

  it('counts days from the previous defeat, not from the start', () => {
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 99, entries: [...entries, w('2026-10-31', 99)], startDateISO: START });
    expect(j.bosses[1]).toMatchObject({ status: 'defeated', defeatedDateKey: '2026-10-31', daysTaken: 19 });
  });

  it('keeps a boss beaten after the weight goes back up (a trophy), while HP follows the real weight', () => {
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 105.8, entries: [...entries.slice(0, 3), w('2026-10-31', 105.8)], startDateISO: START });
    expect(j.bosses[0].status).toBe('defeated');
    expect(j.bosses[1]).toMatchObject({ status: 'current', progress: 0, hpLeftKg: 5 });
  });

  it('ignores weigh-ins before the plan start and copes with no dated weigh-in', () => {
    expect(firstReachedDateKey([w('2026-09-01', 100)], 105, '2026-10-01')).toBeNull();
    expect(firstReachedDateKey([w('2026-10-20', 105)], 105, '2026-10-01')).toBe('2026-10-20'); // exactly at the line counts
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 104, entries: [], startDateISO: START });
    expect(j.bosses[0]).toMatchObject({ status: 'defeated', defeatedDateKey: null, daysTaken: null });
  });

  it('counts whole calendar days and maps the current boss to a trail region', () => {
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0);
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 96, entries: [], startDateISO: START });
    expect(stageAsRegion(j.current!)).toMatchObject({ index: 2, fromKg: 100, toKg: 95, isSummit: true, status: 'current', progress: 0.8 });
  });

  it('has no current boss once the goal is reached', () => {
    const j = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 94.5, entries: [w('2026-10-30', 94.5)], startDateISO: START });
    expect(j.current).toBeUndefined();
    expect(j.bosses.every((b) => b.status === 'defeated' && b.defeatedDateKey === '2026-10-30')).toBe(true);
    expect(j.bosses.map((b) => b.daysTaken)).toEqual([29, 0, 0]);
  });
});
