import type { ExtraMealTime } from '../types';
import { toDateKey } from './date';

/** The usual clock time of each meal, used to file a food under the meal the user picked instead of the moment they typed it in. */
export const MEAL_CLOCK: Record<ExtraMealTime, [number, number]> = {
  breakfast: [8, 0],
  morning_snack: [10, 0],
  lunch: [12, 0],
  afternoon_snack: [14, 0],
  late_afternoon_snack: [16, 0],
  dinner: [19, 0],
  evening_snack: [23, 0],
};

/** A time of day as [hour, minute]. */
export type Clock = [number, number];

/** The time the user typed ("19:30", "7:05", "19h30", "19.30", "1930"), or null when it is not a time of day (hour 0-23, minute 0-59).
 *  An empty or blank text is not an error: it means "no time given" and is also null, see `timeTextInvalid`. */
export function parseClock(text: string | undefined | null): Clock | null {
  const match = /^(\d{1,2})\s*[:h.]\s*(\d{2})$|^(\d{2})(\d{2})$/i.exec((text ?? '').trim());
  if (!match) return null;
  const h = Number(match[1] ?? match[3]);
  const m = Number(match[2] ?? match[4]);
  return h <= 23 && m <= 59 ? [h, m] : null;
}

/** Something was typed in the time box but it is not a time: the form should say so instead of silently using another time. */
export function timeTextInvalid(text: string | undefined | null): boolean {
  return (text ?? '').trim() !== '' && parseClock(text) === null;
}

/** "07:30" for a clock, for showing it. */
export function clockText(clock: Clock): string {
  return `${String(clock[0]).padStart(2, '0')}:${String(clock[1]).padStart(2, '0')}`;
}

/** When a food counts as eaten, as an ISO time on `dateKey` (local time): the exact time the user gave, else the usual time of the meal that was picked; with no meal
 *  picked, now when logging for today, or midday when logging for another day. So a dinner entered at 23:00, or a breakfast entered
 *  the next morning, still sits at its own place in the day (the journal, the late-meal check and the day's order all follow it). */
export function loggedAtFor(dateKey: string, mealTime: ExtraMealTime | null | undefined, now: Date = new Date(), exact?: Clock | null): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (exact) return new Date(y, m - 1, d, exact[0], exact[1]).toISOString();
  const clock = mealTime ? MEAL_CLOCK[mealTime] : undefined;
  if (clock) return new Date(y, m - 1, d, clock[0], clock[1]).toISOString();
  if (toDateKey(now) === dateKey) return now.toISOString();
  return new Date(y, m - 1, d, 12, 0).toISOString();
}
