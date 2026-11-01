import type { WaterCheckpoint } from '../types';
import { clockText } from './schedule';

/** A drink time whose pop-up was missed (app closed) is still shown this long after it, then skipped. */
export const WATER_REMINDER_LATE_MIN = 120;

/** Most a pop-up asks to drink at once beyond the drink time's own portion: a shortfall bigger than that is spread over the
 *  drink times still ahead (gulping a litre at once is neither pleasant nor useful). */
export const WATER_CATCH_UP_EXTRA_ML = 250;

/** One drink time of the day as the pop-up lists it: reached, missed (its time passed before its running total was drunk),
 *  the one this pop-up is for, or still ahead. */
export interface WaterStep {
  time: string;
  cumulativeTargetMl: number;
  status: 'done' | 'missed' | 'now' | 'later';
}

/** A drink time ahead that takes part of a shortfall: drink `extraMl` more than planned there, to reach `reachMl` by then. */
export interface WaterCatchUp {
  time: string;
  extraMl: number;
  reachMl: number;
}

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
  /** What to drink now: the drink time's own portion plus up to WATER_CATCH_UP_EXTRA_ML of any shortfall (all of `ml` when
   *  no drink time is left). */
  nowMl: number;
  /** The day's water once this drink is done (drunkMl + nowMl): the button sets the day to it, never adds it. */
  reachMl: number;
  /** Every drink time of the day with its status. */
  steps: WaterStep[];
  /** The drink times passed whose running total was not drunk in time (this one excluded). */
  missed: string[];
  /** How the rest of a shortfall is spread over the drink times ahead (empty when on schedule). */
  catchUp: WaterCatchUp[];
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
  const latestIndex = schedule.indexOf(latest);
  const ml = latest.cumulativeTargetMl - waterMl;
  const portion = latest.cumulativeTargetMl - (latestIndex > 0 ? schedule[latestIndex - 1].cumulativeTargetMl : 0);
  const ahead = schedule.slice(latestIndex + 1);
  const nowMl = ahead.length === 0 ? ml : Math.min(ml, portion + WATER_CATCH_UP_EXTRA_ML);
  // The rest of the shortfall, in even 50 ml shares over the drink times ahead (the last one takes the rounding).
  const rest = ml - nowMl;
  const catchUp: WaterCatchUp[] = [];
  if (rest > 0) {
    const share = Math.floor(rest / ahead.length / 50) * 50;
    let carried = 0;
    ahead.forEach((c, i) => {
      const extraMl = i === ahead.length - 1 ? rest - carried : share;
      carried += extraMl;
      if (extraMl > 0) catchUp.push({ time: clockText(c.hour, c.minute), extraMl, reachMl: c.cumulativeTargetMl });
    });
  }
  const steps: WaterStep[] = schedule.map((c, i) => ({
    time: clockText(c.hour, c.minute),
    cumulativeTargetMl: c.cumulativeTargetMl,
    status: i === latestIndex ? 'now' : i > latestIndex ? 'later' : waterMl >= c.cumulativeTargetMl ? 'done' : 'missed',
  }));
  return {
    reminder: {
      key,
      dateKey,
      hour: latest.hour,
      minute: latest.minute,
      label: latest.label,
      ml,
      nowMl,
      reachMl: waterMl + nowMl,
      steps,
      missed: steps.filter((s) => s.status === 'missed').map((s) => s.time),
      catchUp,
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
