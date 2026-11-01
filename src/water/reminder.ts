import type { WaterCheckpoint } from '../types';
import { clockText } from './schedule';

/** A drink time whose pop-up was missed (app closed) is still shown this long after it, then skipped. */
export const WATER_REMINDER_LATE_MIN = 120;

/** One water pop-up: the drink time it is for, how much to drink now and where the day stands. */
export interface WaterReminder {
  /** `<dateKey>@<HH:MM>`: shown once per drink time. */
  key: string;
  dateKey: string;
  hour: number;
  minute: number;
  label: string;
  /** What to drink now: the drink time's running total less what was drunk so far. */
  ml: number;
  drunkMl: number;
  targetMl: number;
  /** Drink times of the day already reached by what was drunk (before this one). */
  doneCount: number;
  totalCount: number;
}

export const waterReminderKey = (dateKey: string, c: Pick<WaterCheckpoint, 'hour' | 'minute'>) => `${dateKey}@${clockText(c.hour, c.minute)}`;

/** The pop-up due now, or null: the latest drink time already reached (at most WATER_REMINDER_LATE_MIN ago) that was not shown yet
 *  and whose running total was not drunk yet. Several missed times give one pop-up (the latest, with the amount to catch up);
 *  `dueKeys` lists every time it covers, so none of them pops up later. */
export function dueWaterReminder(
  schedule: WaterCheckpoint[],
  waterMl: number,
  targetMl: number,
  now: Date,
  dateKey: string,
  shown: readonly string[]
): { reminder: WaterReminder; dueKeys: string[] } | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const at = (c: WaterCheckpoint) => c.hour * 60 + c.minute;
  const due = schedule.filter((c) => at(c) <= nowMin);
  const latest = due[due.length - 1];
  if (!latest) return null;
  const key = waterReminderKey(dateKey, latest);
  if (shown.includes(key) || nowMin - at(latest) > WATER_REMINDER_LATE_MIN) return null;
  const dueKeys = due.map((c) => waterReminderKey(dateKey, c)).filter((k) => !shown.includes(k));
  if (waterMl >= latest.cumulativeTargetMl) return null;
  return {
    reminder: {
      key,
      dateKey,
      hour: latest.hour,
      minute: latest.minute,
      label: latest.label,
      ml: latest.cumulativeTargetMl - waterMl,
      drunkMl: waterMl,
      targetMl,
      doneCount: schedule.filter((c) => waterMl >= c.cumulativeTargetMl).length,
      totalCount: schedule.length,
    },
    dueKeys,
  };
}

/** How many cheer lines there are (`water.cheer.<n>`). */
export const WATER_CHEER_COUNT = 8;

/** Which cheer line a pop-up shows: the same for one drink time, different from one time to the next. */
export function waterCheerIndex(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % WATER_CHEER_COUNT;
}
