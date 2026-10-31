import type { WeightEntry } from '../types';
import { toDateKey } from '../utils/date';
import { KCAL_PER_KG_FAT } from '../utils/tdee';
import type { StageBoss, StageStatus } from './stageBosses';

/**
 * The stage bosses' damage log: what each day's calorie deficit should have done to the boss (estimated damage, deficit
 * kcal / 7700 kcal per kg of fat) next to what the scale says it did (real damage, from the weigh-ins), plus the weight
 * log with the bosses' weight lines.
 *
 * - Estimated: a day with logged food deals deficit / KCAL_PER_KG_FAT kg; a surplus is negative (the boss heals). A day
 *   with no food logged has no estimate (it is a gap, not a zero). No daily cap here: the weekly boss caps its damage
 *   for the game, this log is about the body.
 * - Real: the day's last weigh-in against the weigh-in before it (the start weight for the first one); positive = kg
 *   lost. Weigh-ins before the plan start are ignored, like the journey does.
 * - Which boss a day hit: the first boss (in journey order) that had not fallen before that day. A boss falls on its
 *   defeat date, so that day's damage still counts against it. Bosses "beaten" without a dated weigh-in were never
 *   fought and get no days.
 */

export interface DamageDayInput {
  dateKey: string;
  /** The day's deficit (GameState.days), null when no food was logged. */
  deficitKcal: number | null;
}

export interface DamageDay {
  dateKey: string;
  deficitKcal: number | null;
  /** Estimated fat lost that day in kg; negative for a surplus; null when the day has no food logged. */
  estKg: number | null;
  /** The day's last weigh-in. */
  weightKg: number | null;
  /** Kg lost since the weigh-in before (or the start weight); negative when the scale went up; null without a weigh-in. */
  realKg: number | null;
  /** Estimated kg lost since the plan start, through this day. */
  estTotalKg: number;
  /** Start weight minus the latest weigh-in up to this day; null before the first weigh-in. */
  realTotalKg: number | null;
  /** Journey index of the boss this day hit; null once every boss is down. */
  bossIndex: number | null;
  /** Journey indexes of the bosses that fell this day. */
  felled: number[];
}

export interface BossDamage {
  index: number;
  /** Sum of the estimated damage of the days that hit this boss. */
  estKg: number;
  /** Kilograms of its band actually lost (the band's HP minus what is left). */
  realKg: number;
  /** Days that hit it with food logged (an estimate). */
  loggedDays: number;
  /** Days that hit it at all (from the first to the last day of the fight, so far). */
  days: number;
}

export interface DamageLog {
  /** Days from the plan start through the last input day, oldest first. */
  days: DamageDay[];
  perBoss: BossDamage[];
  estTotalKg: number;
  realTotalKg: number | null;
}

export interface DamageInput {
  /** Every day since the plan start, oldest first (GameState.days). */
  days: DamageDayInput[];
  entries: WeightEntry[];
  startKg: number;
  /** Plan start as a local date key (StageJourney.startDateKey). */
  startDateKey: string | null;
  bosses: StageBoss[];
}

/** Kg of fat a calorie deficit is worth (negative for a surplus). */
export function deficitToKg(deficitKcal: number): number {
  return deficitKcal / KCAL_PER_KG_FAT;
}

/** One weight per day (its last weigh-in), on or after the plan start, oldest first. */
export function dailyWeights(entries: WeightEntry[], startDateKey: string | null): { dateKey: string; kg: number }[] {
  const byDay = new Map<string, { t: number; kg: number }>();
  for (const e of entries) {
    const t = new Date(e.dateISO).getTime();
    if (!Number.isFinite(t) || !Number.isFinite(e.weightKg)) continue;
    const key = toDateKey(new Date(t));
    if (startDateKey && key < startDateKey) continue;
    const seen = byDay.get(key);
    if (!seen || t >= seen.t) byDay.set(key, { t, kg: e.weightKg });
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dateKey, v]) => ({ dateKey, kg: v.kg }));
}

/** The bosses that were really fought (everything except "beaten" bosses without a defeat date), in journey order. */
function foughtBosses(bosses: StageBoss[]): StageBoss[] {
  return bosses.filter((b) => b.status !== 'defeated' || b.defeatedDateKey != null);
}

/** Journey index of the boss being fought on `dateKey`, or null once every boss had fallen before it. */
export function bossOnDay(bosses: StageBoss[], dateKey: string): number | null {
  for (const b of foughtBosses(bosses)) {
    if (b.defeatedDateKey == null || b.defeatedDateKey >= dateKey) return b.index;
  }
  return null;
}

export function buildDamageLog({ days: input, entries, startKg, startDateKey, bosses }: DamageInput): DamageLog {
  const weights = new Map(dailyWeights(entries, startDateKey).map((w) => [w.dateKey, w.kg]));
  const fought = foughtBosses(bosses);
  const days: DamageDay[] = [];
  let estTotal = 0;
  let prevKg = startKg;
  let realTotal: number | null = null;
  for (const d of input) {
    if (startDateKey && d.dateKey < startDateKey) continue;
    const estKg = d.deficitKcal == null || !Number.isFinite(d.deficitKcal) ? null : deficitToKg(d.deficitKcal);
    if (estKg != null) estTotal += estKg;
    const weightKg = weights.get(d.dateKey) ?? null;
    let realKg: number | null = null;
    if (weightKg != null) {
      realKg = prevKg - weightKg;
      prevKg = weightKg;
      realTotal = startKg - weightKg;
    }
    days.push({
      dateKey: d.dateKey,
      deficitKcal: d.deficitKcal,
      estKg,
      weightKg,
      realKg,
      estTotalKg: estTotal,
      realTotalKg: realTotal,
      bossIndex: bossOnDay(bosses, d.dateKey),
      felled: fought.filter((b) => b.defeatedDateKey === d.dateKey).map((b) => b.index),
    });
  }

  const perBoss: BossDamage[] = fought.map((b) => {
    const hit = days.filter((d) => d.bossIndex === b.index);
    return {
      index: b.index,
      estKg: hit.reduce((s, d) => s + (d.estKg ?? 0), 0),
      realKg: Math.max(0, b.hpKg - b.hpLeftKg),
      loggedDays: hit.filter((d) => d.estKg != null).length,
      days: hit.length,
    };
  });

  return { days, perBoss, estTotalKg: estTotal, realTotalKg: realTotal };
}

export type WeightLogRow =
  /** A weigh-in: the day's weight, its change from the weigh-in before and the boss it was fought against. */
  | { kind: 'weigh'; dateKey: string; kg: number; changeKg: number; bossIndex: number | null }
  /** A boss's weight line: where it falls (`kg`, the bottom of its band) and when it fell (null while standing). */
  | { kind: 'boss'; bossIndex: number; kg: number; dateKey: string | null; status: StageStatus }
  | { kind: 'start'; dateKey: string | null; kg: number };

/**
 * The weight log newest first, with each fallen boss's line just above the weigh-in that beat it and the current boss's
 * line on top (the next line to cross), ending with the start weight.
 */
export function buildWeightLog(entries: WeightEntry[], bosses: StageBoss[], startKg: number, startDateKey: string | null): WeightLogRow[] {
  const weights = dailyWeights(entries, startDateKey);
  const rows: WeightLogRow[] = [];
  const current = bosses.find((b) => b.status === 'current');
  if (current) rows.push({ kind: 'boss', bossIndex: current.index, kg: current.toKg, dateKey: null, status: 'current' });
  const fallen = foughtBosses(bosses).filter((b) => b.defeatedDateKey != null);
  for (let i = weights.length - 1; i >= 0; i--) {
    const w = weights[i];
    // Several bosses can fall on one weigh-in (a big drop); list the lowest line first, as it sits highest in a newest-first log.
    const down = fallen.filter((b) => b.defeatedDateKey === w.dateKey).reverse();
    for (const b of down) rows.push({ kind: 'boss', bossIndex: b.index, kg: b.toKg, dateKey: b.defeatedDateKey, status: 'defeated' });
    const prev = i > 0 ? weights[i - 1].kg : startKg;
    rows.push({ kind: 'weigh', dateKey: w.dateKey, kg: w.kg, changeKg: w.kg - prev, bossIndex: bossOnDay(bosses, w.dateKey) });
  }
  rows.push({ kind: 'start', dateKey: startDateKey, kg: startKg });
  return rows;
}
