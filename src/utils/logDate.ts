import { toDateKey } from './date';

/** The hard limit on how far back a day can be logged on (a sanity bound for route params and the shared selected day); the date
 *  calendar itself goes back to the plan's start date, at least DEFAULT_PICK_DAYS_BACK days (see `oldestPickableKey`). */
export const MAX_LOG_DAYS_BACK = 5 * 366;
/** How far back the date calendar goes at least, whatever the plan's start date. */
export const DEFAULT_PICK_DAYS_BACK = 365;

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Noon of a "YYYY-MM-DD" day (noon so daylight-saving changes never move it to another day). */
export function dateOfKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0);
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = dateOfKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** The oldest day that can be logged on at all, counted from today. */
export function oldestLogDateKey(now: Date): string {
  return shiftDateKey(toDateKey(now), -MAX_LOG_DAYS_BACK);
}

/** The oldest day the date calendar offers: the plan's start date when it is earlier than DEFAULT_PICK_DAYS_BACK days ago, else that
 *  (a start date of today, or none, still leaves the past year), never before `oldestLogDateKey`. */
export function oldestPickableKey(now: Date, startDateISO?: string | null): string {
  const yearBack = shiftDateKey(toDateKey(now), -DEFAULT_PICK_DAYS_BACK);
  const start = startDateISO ? new Date(startDateISO) : null;
  const startKey = start && !Number.isNaN(start.getTime()) ? toDateKey(start) : null;
  const floor = oldestLogDateKey(now);
  const key = startKey && startKey < yearBack ? startKey : yearBack;
  return key < floor ? floor : key;
}

/** A `date` route param to the day to log on: a real calendar day between MAX_LOG_DAYS_BACK days ago and today.
 *  Anything else (missing, malformed, in the future, too old) means today. Never throws. */
export function logDateParam(raw: unknown, now: Date): string {
  const today = toDateKey(now);
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return today;
  const match = KEY.exec(value);
  if (!match) return today;
  if (toDateKey(dateOfKey(value)) !== value) return today; // e.g. 2026-02-31
  if (value > today || value < oldestLogDateKey(now)) return today;
  return value;
}

/** A moment on `dateKey` for something logged now (a weighing, a workout): now for today, else that day at the current time of day. */
export function momentOnDay(dateKey: string, now: Date): Date {
  if (dateKey === toDateKey(now)) return new Date(now.getTime());
  const at = dateOfKey(dateKey);
  at.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return at;
}
