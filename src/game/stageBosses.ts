import type { WeightEntry } from '../types';
import { toDateKey } from '../utils/date';
import { regionBoundaries, type Region } from './map';

/**
 * Stage bosses on the Map: the weight journey from the start weight down to the goal is cut into 5 kg bands with the
 * same boundaries as the map regions and the Weight tab milestones (regionBoundaries: clean multiples of 5 below the
 * start, the last band ending exactly at the goal, so the first and last bands may be shorter). Each band is one boss
 * whose HP is the band's kilograms.
 *
 * Zones: the bosses are grouped into zones so the journey always has a beginning, a middle and an end. There are at
 * least 3 zones (fewer only when there are fewer than 3 bosses) and about 3 bosses per zone on longer journeys, capped
 * at 7 zones (6 named regions + the summit). Bosses are spread over the zones in order, earlier zones taking the extra
 * boss when they do not divide evenly. 110 -> 95 kg = 3 bosses = Zone 1, 2, 3 with one boss each.
 *
 * Difficulty: tier = zone number (1..5 stars); the very last boss (the one guarding the goal) gets one more star.
 * Skills: zone 1 bosses use only their signature skill, zone 2 adds a second one, zone 3 and later combine three. The
 * last boss always has at least two.
 *
 * Defeat dates come from the weight history: a boss falls on the first weigh-in on or after the plan start at or below
 * the bottom of its band. A boss once beaten stays beaten (it is a trophy) even if the weight later goes back up; the
 * player marker still shows the real current weight.
 */

export const STAGE_KG = 5;
export const BOSSES_PER_ZONE = 3;
const MIN_ZONES = 3;
const MAX_ZONES = 7;
const MAX_TIER = 5;

export type BossArchetype = 'sugar' | 'beer' | 'bubbleTea' | 'noodle' | 'couch' | 'hotpot';
export type BossSkill = 'sugarLure' | 'coldBeer' | 'milkTea' | 'midnightNoodles' | 'hotpotBuffet' | 'lateNight' | 'couchPotato' | 'snackAttack';
export type StageStatus = 'defeated' | 'current' | 'locked';

/** The order bosses appear in; the last stage is always the hotpot dragon. */
export const ARCHETYPE_ORDER: BossArchetype[] = ['sugar', 'beer', 'bubbleTea', 'noodle', 'couch'];
export const FINAL_ARCHETYPE: BossArchetype = 'hotpot';

/** Signature skill first, then the one each archetype adds from zone 2 on. */
export const ARCHETYPE_SKILLS: Record<BossArchetype, [BossSkill, BossSkill]> = {
  sugar: ['sugarLure', 'snackAttack'],
  beer: ['coldBeer', 'lateNight'],
  bubbleTea: ['milkTea', 'sugarLure'],
  noodle: ['midnightNoodles', 'lateNight'],
  couch: ['couchPotato', 'snackAttack'],
  hotpot: ['hotpotBuffet', 'coldBeer'],
};

/** The third skill a zone 3+ boss combines in: borrowed from a neighbouring archetype. */
const COMBO_SKILL: Record<BossArchetype, BossSkill> = {
  sugar: 'milkTea',
  beer: 'midnightNoodles',
  bubbleTea: 'couchPotato',
  noodle: 'snackAttack',
  couch: 'lateNight',
  hotpot: 'sugarLure',
};

export interface StageBoss {
  /** 0-based position on the journey (0 = the first boss below the start weight). */
  index: number;
  /** 0-based zone. */
  zone: number;
  /** 0-based position inside its zone. */
  indexInZone: number;
  archetype: BossArchetype;
  /** 1..5 stars. */
  tier: number;
  skills: BossSkill[];
  /** Top of the band (heavier). */
  fromKg: number;
  /** Bottom of the band: weigh in at or below this to defeat the boss. */
  toKg: number;
  /** The band's kilograms. */
  hpKg: number;
  /** Kilograms of the band still to lose (0 once defeated). */
  hpLeftKg: number;
  isFinal: boolean;
  status: StageStatus;
  /** 0..1 progress through the band (1 when defeated, 0 when locked). */
  progress: number;
  /** Local date key (YYYY-MM-DD) of the first weigh-in at or below `toKg`; null when not beaten (or beaten without a
   *  dated weigh-in, e.g. a start weight already below the band). */
  defeatedDateKey: string | null;
  /** Days from the previous boss's defeat (or the plan start) to this one's; null when not dated. */
  daysTaken: number | null;
}

export interface Zone {
  index: number;
  /** Key suffix of the zone name: 1..6, or `summit` for the last zone. */
  nameKey: string;
  isSummit: boolean;
  fromKg: number;
  toKg: number;
  bosses: StageBoss[];
  defeatedCount: number;
  /** Highest tier among its bosses. */
  tier: number;
  status: StageStatus;
  /** 0..1 of the zone's kilograms already lost. */
  progress: number;
}

export interface StageJourney {
  bosses: StageBoss[];
  zones: Zone[];
  /** The boss being fought now; undefined once every boss is down (or there is no journey). */
  current: StageBoss | undefined;
  defeatedCount: number;
  /** Start weight minus current weight (negative when up). */
  lostKg: number;
  totalKg: number;
  leftKg: number;
  /** Local date key of the plan start. */
  startDateKey: string | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Zone count for `n` bosses: at least 3 (or n when fewer), about 3 bosses per zone, at most 7. */
export function zoneCount(n: number): number {
  if (n <= 0) return 0;
  return Math.min(n, Math.min(MAX_ZONES, Math.max(MIN_ZONES, Math.ceil(n / BOSSES_PER_ZONE))));
}

/** 0-based zone of boss `i` out of `n`: evenly in order, earlier zones taking the extra ones. */
export function zoneOf(i: number, n: number): number {
  const z = zoneCount(n);
  return z === 0 ? 0 : Math.floor((i * z) / n);
}

export function skillsFor(archetype: BossArchetype, zone: number, isFinal: boolean): BossSkill[] {
  const [sig, second] = ARCHETYPE_SKILLS[archetype];
  const count = Math.max(zone >= 2 ? 3 : zone + 1, isFinal ? 2 : 1);
  return [sig, second, COMBO_SKILL[archetype]].slice(0, count);
}

/** Whole calendar days between two local date keys. */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T12:00:00`).getTime();
  const b = new Date(`${toKey}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** First weigh-in (by date) on or after `startDateKey` at or below `kg`, as a local date key. */
export function firstReachedDateKey(entries: WeightEntry[], kg: number, startDateKey: string | null): string | null {
  let best: { t: number; key: string } | null = null;
  for (const e of entries) {
    const t = new Date(e.dateISO).getTime();
    if (!Number.isFinite(t) || e.weightKg > kg + 1e-9) continue;
    const key = toDateKey(new Date(t));
    if (startDateKey && key < startDateKey) continue;
    if (!best || t < best.t) best = { t, key };
  }
  return best?.key ?? null;
}

export interface StageInput {
  startKg: number;
  goalKg: number;
  currentKg: number;
  entries: WeightEntry[];
  startDateISO?: string | null;
}

export function buildStageJourney({ startKg, goalKg, currentKg, entries, startDateISO }: StageInput): StageJourney {
  const startDateKey = startDateISO ? toDateKey(new Date(startDateISO)) : null;
  const lostKg = round1(startKg - currentKg);
  const totalKg = round1(Math.max(0, startKg - goalKg));
  const leftKg = round1(Math.max(0, currentKg - goalKg));
  if (!(goalKg < startKg)) {
    return { bosses: [], zones: [], current: undefined, defeatedCount: 0, lostKg, totalKg, leftKg, startDateKey };
  }

  const bounds = regionBoundaries(startKg, goalKg);
  const n = bounds.length - 1;
  const bosses: StageBoss[] = [];
  let prevKey = startDateKey;
  let foundCurrent = false;
  const zoneSeen: number[] = [];
  for (let i = 0; i < n; i++) {
    const fromKg = bounds[i];
    const toKg = bounds[i + 1];
    const isFinal = i === n - 1;
    const zone = zoneOf(i, n);
    zoneSeen[zone] = (zoneSeen[zone] ?? -1) + 1;
    const archetype = isFinal ? FINAL_ARCHETYPE : ARCHETYPE_ORDER[i % ARCHETYPE_ORDER.length];
    const tier = Math.min(MAX_TIER, zone + 1 + (isFinal && n > 1 ? 1 : 0));
    const reachedKey = firstReachedDateKey(entries, toKg, startDateKey);
    const beaten = currentKg <= toKg + 1e-9 || reachedKey != null;
    let status: StageStatus;
    if (beaten && !foundCurrent) status = 'defeated';
    else if (!foundCurrent) {
      status = 'current';
      foundCurrent = true;
    } else status = beaten ? 'defeated' : 'locked';
    const span = fromKg - toKg;
    const progress = status === 'defeated' ? 1 : status === 'locked' ? 0 : span > 0 ? clamp01((fromKg - currentKg) / span) : 1;
    const defeatedDateKey = status === 'defeated' ? reachedKey : null;
    const daysTaken = defeatedDateKey && prevKey ? Math.max(0, daysBetween(prevKey, defeatedDateKey)) : null;
    if (defeatedDateKey) prevKey = defeatedDateKey;
    bosses.push({
      index: i,
      zone,
      indexInZone: zoneSeen[zone],
      archetype,
      tier,
      skills: skillsFor(archetype, zone, isFinal && n > 1),
      fromKg,
      toKg,
      hpKg: round1(span),
      hpLeftKg: status === 'defeated' ? 0 : round1(Math.min(span, Math.max(0, currentKg - toKg))),
      isFinal,
      status,
      progress,
      defeatedDateKey,
      daysTaken,
    });
  }

  const zCount = zoneCount(n);
  const zones: Zone[] = [];
  for (let z = 0; z < zCount; z++) {
    const zb = bosses.filter((b) => b.zone === z);
    const fromKg = zb[0].fromKg;
    const toKg = zb[zb.length - 1].toKg;
    const isSummit = z === zCount - 1;
    const defeatedCount = zb.filter((b) => b.status === 'defeated').length;
    const status: StageStatus = defeatedCount === zb.length ? 'defeated' : zb.some((b) => b.status === 'current') ? 'current' : 'locked';
    const zoneKg = fromKg - toKg;
    const lostIn = zb.reduce((s, b) => s + b.progress * (b.fromKg - b.toKg), 0);
    zones.push({
      index: z,
      nameKey: isSummit ? 'summit' : String(Math.min(z + 1, 6)),
      isSummit,
      fromKg,
      toKg,
      bosses: zb,
      defeatedCount,
      tier: Math.max(...zb.map((b) => b.tier)),
      status,
      progress: zoneKg > 0 ? clamp01(lostIn / zoneKg) : 1,
    });
  }

  return {
    bosses,
    zones,
    current: bosses.find((b) => b.status === 'current'),
    defeatedCount: bosses.filter((b) => b.status === 'defeated').length,
    lostKg,
    totalKg,
    leftKg,
    startDateKey,
  };
}

/** The boss's band as a map Region, so the existing TrailMap can draw the current stage. */
export function stageAsRegion(b: StageBoss): Region {
  return {
    index: b.index,
    nameKey: b.isFinal ? 'summit' : String(Math.min(b.index + 1, 6)),
    fromKg: b.fromKg,
    toKg: b.toKg,
    isSummit: b.isFinal,
    status: b.status === 'defeated' ? 'done' : b.status,
    progress: b.progress,
  };
}
