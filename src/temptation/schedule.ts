import { eatingEndHour, eatingStartHour } from '../utils/mealMode';
import { toDateKey } from '../utils/date';

// When the temptation pop-up may appear: a few random moments a day inside the allowed hours (not in the quiet hours, and with
// intermittent fasting on, only inside the eating window), at most the daily number for the chosen frequency, at least 45 minutes
// apart. The moments of a day are drawn from a seed (the day and a per-install salt), so reopening the app does not draw new ones.
// Pure: unit-tested.

export type TemptLevel = 'easy' | 'hard';
export type TemptFrequency = 'low' | 'mid' | 'high';

export interface TemptSettings {
  enabled: boolean;
  level: TemptLevel;
  frequency: TemptFrequency;
  /** Quiet hours, whole hours 0-23: none from `quietStartHour` to `quietEndHour` (across midnight when start > end; none when equal). */
  quietStartHour: number;
  quietEndHour: number;
  /** Optional city for the Hard level (weather and local trends). */
  city: string;
}

export const DEFAULT_TEMPT_SETTINGS: TemptSettings = { enabled: false, level: 'easy', frequency: 'mid', quietStartHour: 22, quietEndHour: 7, city: '' };

/** Ít / Vừa / Nhiều. */
export const MAX_PER_DAY: Record<TemptFrequency, number> = { low: 1, mid: 3, high: 5 };
export const MIN_GAP_MINUTES = 45;
/** Candidate moments are on this grid (minutes). */
const STEP_MINUTES = 5;

export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Whether a minute of the day (0-1439) may have a pop-up. */
export function isAllowedMinute(minute: number, settings: TemptSettings, fasting: boolean): boolean {
  const hour = Math.floor(minute / 60);
  if (inQuietHours(hour, settings.quietStartHour, settings.quietEndHour)) return false;
  if (fasting && (hour < eatingStartHour(true) || hour >= eatingEndHour(true))) return false;
  return true;
}

/** Small deterministic generator (mulberry32) from a string seed. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's pop-up moments (minutes of the day, ascending): up to the frequency's number, all allowed, at least the gap apart. */
export function planDay(dateKey: string, settings: TemptSettings, fasting: boolean, salt: string): number[] {
  const count = MAX_PER_DAY[settings.frequency];
  const allowed: number[] = [];
  for (let m = 0; m < 1440; m += STEP_MINUTES) if (isAllowedMinute(m, settings, fasting)) allowed.push(m);
  const rand = seededRandom(`${dateKey}|${salt}|${settings.frequency}|${settings.quietStartHour}-${settings.quietEndHour}|${fasting ? 'f' : 'n'}`);
  // Shuffle, then keep each candidate that is far enough from those already kept.
  for (let i = allowed.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allowed[i], allowed[j]] = [allowed[j], allowed[i]];
  }
  const kept: number[] = [];
  for (const m of allowed) {
    if (kept.length >= count) break;
    if (kept.every((k) => Math.abs(k - m) >= MIN_GAP_MINUTES)) kept.push(m);
  }
  return kept.sort((a, b) => a - b);
}

export interface TemptClock {
  now: Date;
  settings: TemptSettings;
  fasting: boolean;
  salt: string;
  /** Times (ms) the pop-up was shown, any day; only today's count. */
  shownAt: number[];
}

/** Times shown on the day of `now`. */
export function shownToday(now: Date, shownAt: number[]): number[] {
  const key = toDateKey(now);
  return shownAt.filter((t) => toDateKey(new Date(t)) === key);
}

/** Whether a pop-up is due right now: switched on, an allowed minute, under the day's number, the gap since the last one kept, and
 *  fewer shown today than planned moments already passed (a moment missed while the app was closed is caught up later, one at a time). */
export function isTemptationDue({ now, settings, fasting, salt, shownAt }: TemptClock): boolean {
  if (!settings.enabled) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  if (!isAllowedMinute(minute, settings, fasting)) return false;
  const today = shownToday(now, shownAt);
  if (today.length >= MAX_PER_DAY[settings.frequency]) return false;
  const last = shownAt.length ? Math.max(...shownAt) : 0;
  if (last && now.getTime() - last < MIN_GAP_MINUTES * 60_000) return false;
  const passed = planDay(toDateKey(now), settings, fasting, salt).filter((m) => m <= minute).length;
  return today.length < passed;
}
