import { addDaysToKey } from './dateMath';
import type { DayRow, MainMeal } from './days';

/** A day of the period that has some meals on record but not all three main meals. */
export interface MissingDay {
  dateKey: string;
  missing: MainMeal[];
}

/** What a period lacks, so the user can check it: days missing a main meal (today included, it may still be in progress), and
 *  days up to yesterday with nothing on record at all. */
export function missingInPeriod(rows: DayRow[], fromKey: string, toKey: string, todayKey: string): { partial: MissingDay[]; empty: string[] } {
  const inPeriod = rows.filter((r) => r.dateKey >= fromKey && r.dateKey <= toKey);
  const partial = inPeriod.filter((r) => !r.complete).map((r) => ({ dateKey: r.dateKey, missing: r.missing }));
  const logged = new Set(inPeriod.map((r) => r.dateKey));
  const empty: string[] = [];
  const last = toKey < todayKey ? toKey : addDaysToKey(todayKey, -1);
  for (let d = fromKey; d <= last; d = addDaysToKey(d, 1)) if (!logged.has(d)) empty.push(d);
  return { partial, empty };
}

/** The name of the item that records a main meal as not eaten (the diary's convention; see feedback/match isSkippedMeal). */
export const SKIPPED_MEAL_NAME = 'Không ăn';
