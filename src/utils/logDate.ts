import { toDateKey } from './date';

/** How far back a meal or water can be logged from the quick-add sheet. */
export const MAX_LOG_DAYS_BACK = 30;

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

/** The oldest day that can be picked, counted from today. */
export function oldestLogDateKey(now: Date): string {
  return shiftDateKey(toDateKey(now), -MAX_LOG_DAYS_BACK);
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
