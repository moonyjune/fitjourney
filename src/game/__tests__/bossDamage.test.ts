import { describe, expect, it } from '@jest/globals';
import type { WeightEntry } from '../../types';
import { bossOnDay, buildDamageLog, buildWeightLog, dailyWeights, deficitToKg } from '../bossDamage';
import { buildStageJourney } from '../stageBosses';
import { buildWeightSeries } from '../weightSeries';

const START = '2026-10-01T08:00:00';
const w = (dateKey: string, kg: number, time = '06:30'): WeightEntry => ({ id: `${dateKey}-${time}`, dateISO: `${dateKey}T${time}:00`, weightKg: kg });
const day = (dateKey: string, deficitKcal: number | null) => ({ dateKey, deficitKcal });

// 110 -> 95: bosses [110-105], [105-100], [100-95].
const journey = (entries: WeightEntry[]) =>
  buildStageJourney({ startKg: 110, goalKg: 95, currentKg: entries.length ? entries[entries.length - 1].weightKg : 110, entries, startDateISO: START });

describe('boss damage: estimated vs real', () => {
  it('turns a deficit into kg of fat at 7700 kcal/kg, a surplus healing the boss', () => {
    expect(deficitToKg(770)).toBeCloseTo(0.1, 10);
    expect(deficitToKg(-385)).toBeCloseTo(-0.05, 10);
  });

  it('keeps one weight per day (the last), on or after the plan start', () => {
    const list = dailyWeights([w('2026-10-03', 109, '07:00'), w('2026-10-03', 108.6, '21:00'), w('2026-09-30', 111), w('2026-10-02', 109.5)], '2026-10-01');
    expect(list).toEqual([
      { dateKey: '2026-10-02', kg: 109.5 },
      { dateKey: '2026-10-03', kg: 108.6 },
    ]);
  });

  it('logs each day: estimate from the deficit, real from the weigh-in against the one before, with running totals', () => {
    const entries = [w('2026-10-02', 109.5), w('2026-10-04', 109.7)];
    const j = journey(entries);
    const log = buildDamageLog({
      days: [day('2026-10-01', 770), day('2026-10-02', 1540), day('2026-10-03', null), day('2026-10-04', -770)],
      entries,
      startKg: 110,
      startDateKey: j.startDateKey,
      bosses: j.bosses,
    });
    expect(log.days.map((d) => d.estKg)).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.2, 6), null, expect.closeTo(-0.1, 6)]);
    expect(log.days.map((d) => d.weightKg)).toEqual([null, 109.5, null, 109.7]);
    expect(log.days[1].realKg).toBeCloseTo(0.5, 6); // first weigh-in against the start weight
    expect(log.days[3].realKg).toBeCloseTo(-0.2, 6); // the scale went up
    expect(log.days.map((d) => d.estTotalKg)).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.3, 6), expect.closeTo(0.3, 6), expect.closeTo(0.2, 6)]);
    expect(log.days.map((d) => d.realTotalKg)).toEqual([null, expect.closeTo(0.5, 6), expect.closeTo(0.5, 6), expect.closeTo(0.3, 6)]);
    expect(log.estTotalKg).toBeCloseTo(0.2, 6);
    expect(log.realTotalKg).toBeCloseTo(0.3, 6);
    expect(log.days.every((d) => d.bossIndex === 0)).toBe(true);
  });

  it('skips days before the plan start', () => {
    const j = journey([]);
    const log = buildDamageLog({ days: [day('2026-09-30', 1000), day('2026-10-01', 770)], entries: [], startKg: 110, startDateKey: j.startDateKey, bosses: j.bosses });
    expect(log.days.map((d) => d.dateKey)).toEqual(['2026-10-01']);
    expect(log.realTotalKg).toBeNull();
  });

  it('charges each day to the boss standing that day; the defeat day still hits the boss that fell', () => {
    const entries = [w('2026-10-03', 107), w('2026-10-05', 104.8), w('2026-10-08', 103)];
    const j = journey(entries);
    expect(j.bosses[0].defeatedDateKey).toBe('2026-10-05');
    expect(bossOnDay(j.bosses, '2026-10-05')).toBe(0);
    expect(bossOnDay(j.bosses, '2026-10-06')).toBe(1);

    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((k) => day(k, 770));
    days[1] = day('2026-10-02', null);
    const log = buildDamageLog({ days, entries, startKg: 110, startDateKey: j.startDateKey, bosses: j.bosses });
    expect(log.days.map((d) => d.bossIndex)).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
    expect(log.days.find((d) => d.dateKey === '2026-10-05')?.felled).toEqual([0]);
    expect(log.days.filter((d) => d.felled.length > 0)).toHaveLength(1);

    const [b0, b1] = log.perBoss;
    expect(b0).toEqual({ index: 0, estKg: expect.closeTo(0.4, 6), realKg: 5, loggedDays: 4, days: 5 });
    expect(b1.index).toBe(1);
    expect(b1.estKg).toBeCloseTo(0.3, 6);
    expect(b1.realKg).toBeCloseTo(2, 6); // 105 -> 103 of its 5 kg
    expect(b1.days).toBe(3);
    // The locked final boss has had no day yet.
    expect(log.perBoss[2]).toEqual({ index: 2, estKg: 0, realKg: 0, loggedDays: 0, days: 0 });
  });

  it('gives no days to a boss beaten without a dated weigh-in, and none to anyone once every boss is down', () => {
    const entries = [w('2026-10-10', 94)];
    const j = journey(entries);
    expect(j.bosses.every((b) => b.defeatedDateKey === '2026-10-10')).toBe(true);
    expect(bossOnDay(j.bosses, '2026-10-11')).toBeNull();
    const log = buildDamageLog({ days: [day('2026-10-10', 500), day('2026-10-11', 500)], entries, startKg: 110, startDateKey: j.startDateKey, bosses: j.bosses });
    expect(log.days[0].bossIndex).toBe(0);
    expect(log.days[0].felled).toEqual([0, 1, 2]);
    expect(log.days[1].bossIndex).toBeNull();
  });
});

describe('boss damage: weight log with boss lines', () => {
  it('lists weigh-ins newest first, each fallen boss above the weigh-in that beat it, the current line on top, the start last', () => {
    const entries = [w('2026-10-03', 107), w('2026-10-05', 104.8), w('2026-10-08', 103)];
    const j = journey(entries);
    const rows = buildWeightLog(entries, j.bosses, 110, j.startDateKey);
    expect(rows.map((r) => r.kind)).toEqual(['boss', 'weigh', 'boss', 'weigh', 'weigh', 'start']);
    expect(rows[0]).toEqual({ kind: 'boss', bossIndex: 1, kg: 100, dateKey: null, status: 'current' });
    expect(rows[1]).toEqual({ kind: 'weigh', dateKey: '2026-10-08', kg: 103, changeKg: expect.closeTo(-1.8, 6), bossIndex: 1 });
    expect(rows[2]).toEqual({ kind: 'boss', bossIndex: 0, kg: 105, dateKey: '2026-10-05', status: 'defeated' });
    expect(rows[3]).toMatchObject({ kind: 'weigh', dateKey: '2026-10-05', bossIndex: 0 });
    expect(rows[4]).toMatchObject({ kind: 'weigh', dateKey: '2026-10-03', changeKg: -3 });
    expect(rows[5]).toEqual({ kind: 'start', dateKey: '2026-10-01', kg: 110 });
  });

  it('puts several bosses felled by one weigh-in lowest line first, and no current line once all are down', () => {
    const entries = [w('2026-10-10', 94)];
    const j = journey(entries);
    const rows = buildWeightLog(entries, j.bosses, 110, j.startDateKey);
    expect(rows.filter((r) => r.kind === 'boss').map((r) => (r.kind === 'boss' ? r.kg : 0))).toEqual([95, 100, 105]);
    expect(rows.some((r) => r.kind === 'boss' && r.status === 'current')).toBe(false);
  });

  it('places the fall markers on the weight chart at the boss line on its defeat day', () => {
    const entries = [w('2026-10-03', 107), w('2026-10-05', 104.8)];
    const series = buildWeightSeries({
      entries,
      startDateISO: START,
      startWeightKg: 110,
      goalWeightKg: 95,
      now: new Date('2026-10-06T12:00:00'),
      width: 300,
      height: 190,
      marks: [{ kg: 105, dateKey: '2026-10-05' }, { kg: 50, dateKey: '2026-10-05' }],
    });
    expect(series.marks).toHaveLength(1); // 50 kg is outside the visible range
    const tick = series.ticks.find((t) => t.kg === 105)!;
    expect(series.marks[0].y).toBeCloseTo(tick.y, 6);
    const last = series.points[series.points.length - 1];
    expect(Math.abs(series.marks[0].x - last.x)).toBeLessThan(15); // same day as the weigh-in that beat it
  });
});
