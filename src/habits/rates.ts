import { addDaysToKey, mondayOf } from '../insights/dateMath';
import type { Habit, HabitChecks } from './types';

/** A habit counts as a routine in a week when it was done on at least 5 of the 7 days (5/7 = 71%). */
export const FORMED_RATE = 0.71;

export const trackedHabits = (habits: Habit[]): Habit[] => habits.filter((h) => h.tracked && !h.archived).sort((a, b) => a.sort - b.sort);

/** Share of ticked habits that were done on a day (null when none were ticked). Unticked habits are not counted either way. */
export function dayRatio(checks: HabitChecks, dateKey: string, habits: Habit[]): number | null {
  const day = checks[dateKey];
  if (!day) return null;
  let done = 0;
  let marked = 0;
  for (const h of trackedHabits(habits)) {
    const v = day[h.id];
    if (!v) continue;
    marked += 1;
    if (v === 'done') done += 1;
  }
  return marked === 0 ? null : done / marked;
}

export interface HabitWeekRate {
  habit: Habit;
  done: number;
  missed: number;
  /** done / (done + missed), or null when nothing was ticked that week. */
  rate: number | null;
}

export interface HabitWeek {
  weekStart: string;
  weekEnd: string;
  rates: HabitWeekRate[];
  /** The habit with the lowest rate among those ticked at all (null when none were). */
  weakest: HabitWeekRate | null;
  /** True when every ticked habit reached 5/7; null when nothing was ticked. */
  allFormed: boolean | null;
}

export function weekRates(checks: HabitChecks, habits: Habit[], weekStart: string): HabitWeek {
  const weekEnd = addDaysToKey(weekStart, 6);
  const days = Object.keys(checks).filter((d) => d >= weekStart && d <= weekEnd);
  const rates = trackedHabits(habits).map((habit) => {
    let done = 0;
    let missed = 0;
    for (const d of days) {
      const v = checks[d][habit.id];
      if (v === 'done') done += 1;
      else if (v === 'missed') missed += 1;
    }
    return { habit, done, missed, rate: done + missed === 0 ? null : done / (done + missed) };
  });
  const ticked = rates.filter((r) => r.rate !== null);
  const weakest = ticked.length === 0 ? null : ticked.reduce((a, b) => (b.rate! < a.rate! ? b : a));
  return { weekStart, weekEnd, rates, weakest, allFormed: weakest === null ? null : weakest.rate! >= FORMED_RATE };
}

/** Every week from the first ticked day to the week of `todayKey`, newest first. Empty when nothing was ever ticked. */
export function buildHabitWeeks(checks: HabitChecks, habits: Habit[], todayKey: string): HabitWeek[] {
  const ticked = Object.keys(checks).filter((d) => Object.keys(checks[d]).length > 0).sort();
  if (ticked.length === 0) return [];
  const out: HabitWeek[] = [];
  const last = mondayOf(todayKey > ticked[ticked.length - 1] ? todayKey : ticked[ticked.length - 1]);
  for (let w = mondayOf(ticked[0]); w <= last; w = addDaysToKey(w, 7)) out.push(weekRates(checks, habits, w));
  return out.reverse();
}

/** Days in a row a habit was done, counting back from today (or from yesterday while today is still unticked). */
export function streak(checks: HabitChecks, habitId: string, todayKey: string): number {
  let day = checks[todayKey]?.[habitId] ? todayKey : addDaysToKey(todayKey, -1);
  let n = 0;
  while (checks[day]?.[habitId] === 'done') {
    n += 1;
    day = addDaysToKey(day, -1);
  }
  return n;
}
