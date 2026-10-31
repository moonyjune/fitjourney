import { addDaysToKey, dayNumber } from '../insights/dateMath';
import { FORMED_RATE, streak, trackedHabits } from './rates';
import type { FormationLevel, Habit, HabitAuto, HabitChecks } from './types';

/**
 * When a habit counts as formed, judged only from its ✔/✘ ticks (habit research puts automaticity at roughly 3–10 weeks;
 * we use the low end with a high bar):
 * - `new`       fewer than 5 ticks in the last 28 days: not enough data to judge.
 * - `unstable`  under 50 % done in the last 28 days, or 3+ days missed in a row right now.
 * - `formed`    tracked for at least 21 days, at least 14 ticks in the last 28 days and at least 80 % of them done.
 * - `building`  everything else (progress = days tracked / 21 and done rate / 80 %).
 * Unticked days count neither way.
 */
export const FORMATION = {
  windowDays: 28,
  minDaysTracked: 21,
  minTicksInWindow: 14,
  formedRate: 0.8,
  minTicksForVerdict: 5,
  unstableRate: 0.5,
  unstableMissRun: 3,
  /** Weekday failures are looked for over the last 8 weeks. */
  weekdayDays: 56,
} as const;

export interface Tally {
  done: number;
  missed: number;
  /** done / (done + missed), null when nothing was ticked. */
  rate: number | null;
}

export interface WeekdayMiss {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  missed: number;
  ticked: number;
}

export interface AutoCompare {
  /** Days the tick and the app's data agree (✔ with data, or ✘ without). */
  agree: number;
  /** Days the data shows it was done but the tick is ✘ or missing. */
  forgot: number;
  /** Days ticked ✔ although the data does not show it. */
  unconfirmed: number;
  /** Days looked at (a tick or a data signal). */
  days: number;
}

export interface HabitStats {
  habit: Habit;
  firstTick: string | null;
  /** Days from the first tick to today, inclusive (0 when never ticked). */
  daysTracked: number;
  window: Tally;
  last7: Tally;
  prev7: Tally;
  streak: number;
  bestStreak: number;
  /** Days missed in a row, counting back from today (or yesterday while today is unticked). */
  missRun: number;
  worstWeekday: WeekdayMiss | null;
  auto: AutoCompare | null;
  /** What the ticks say. */
  suggested: FormationLevel;
  /** The user's mark (formedMark, or a diary status of `formed`), null = follow the data. */
  manual: boolean | null;
  /** What to show: the manual mark wins over the suggestion. */
  verdict: FormationLevel;
  /** The manual mark and the data disagree. */
  disagree: boolean;
  /** Formed, but the last 7 days fell under 5/7 or it was missed 2 days running. */
  slipping: boolean;
  /** 0..1 toward `formed`. */
  progress: number;
}

export interface HabitPair {
  a: Habit;
  b: Habit;
  /** Days both were ticked ✘ in the last 28 days. */
  both: number;
  aMissed: number;
  bMissed: number;
}

export interface HabitOverview {
  stats: HabitStats[];
  last7: Tally;
  prev7: Tally;
  worstWeekday: WeekdayMiss | null;
  pair: HabitPair | null;
}

export type SignalFor = (dateKey: string) => Record<HabitAuto, boolean>;

export const weekdayOf = (dateKey: string): number => (dayNumber(dateKey) + 3) % 7;

const tally = (done: number, missed: number): Tally => ({ done, missed, rate: done + missed === 0 ? null : done / (done + missed) });

function count(checks: HabitChecks, habitId: string, from: string, to: string): Tally {
  let done = 0;
  let missed = 0;
  for (let d = from; d <= to; d = addDaysToKey(d, 1)) {
    const v = checks[d]?.[habitId];
    if (v === 'done') done += 1;
    else if (v === 'missed') missed += 1;
  }
  return tally(done, missed);
}

/** The user's mark: `formedMark` when set, else a diary/form status of `formed` counts as "formed". */
export const manualMark = (habit: Habit): boolean | null => (habit.formedMark ?? null) !== null ? habit.formedMark! : habit.status === 'formed' ? true : null;

function worstWeekday(misses: number[], ticks: number[]): WeekdayMiss | null {
  const total = ticks.reduce((s, v) => s + v, 0);
  const missedAll = misses.reduce((s, v) => s + v, 0);
  if (total === 0 || missedAll === 0) return null;
  const overall = missedAll / total;
  let best: WeekdayMiss | null = null;
  for (let w = 0; w < 7; w++) {
    if (misses[w] < 2 || ticks[w] === 0) continue;
    const r = misses[w] / ticks[w];
    if (r < 0.5 || r <= overall) continue;
    if (!best || r > best.missed / best.ticked || (r === best.missed / best.ticked && misses[w] > best.missed)) best = { weekday: w, missed: misses[w], ticked: ticks[w] };
  }
  return best;
}

export function habitStats(checks: HabitChecks, habit: Habit, todayKey: string, signalFor?: SignalFor): HabitStats {
  const days = Object.keys(checks)
    .filter((d) => d <= todayKey && checks[d][habit.id])
    .sort();
  const firstTick = days[0] ?? null;
  const daysTracked = firstTick ? dayNumber(todayKey) - dayNumber(firstTick) + 1 : 0;
  const windowStart = addDaysToKey(todayKey, -(FORMATION.windowDays - 1));
  const window = count(checks, habit.id, windowStart, todayKey);
  const last7 = count(checks, habit.id, addDaysToKey(todayKey, -6), todayKey);
  const prev7 = count(checks, habit.id, addDaysToKey(todayKey, -13), addDaysToKey(todayKey, -7));

  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    const v = checks[d][habit.id];
    if (v === 'done') run = prev !== null && addDaysToKey(prev, 1) === d && checks[prev][habit.id] === 'done' ? run + 1 : 1;
    else run = 0;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }

  let missRun = 0;
  for (let d = checks[todayKey]?.[habit.id] ? todayKey : addDaysToKey(todayKey, -1); checks[d]?.[habit.id] === 'missed'; d = addDaysToKey(d, -1)) missRun += 1;

  const misses = [0, 0, 0, 0, 0, 0, 0];
  const ticks = [0, 0, 0, 0, 0, 0, 0];
  for (let d = addDaysToKey(todayKey, -(FORMATION.weekdayDays - 1)); d <= todayKey; d = addDaysToKey(d, 1)) {
    const v = checks[d]?.[habit.id];
    if (!v) continue;
    const w = weekdayOf(d);
    ticks[w] += 1;
    if (v === 'missed') misses[w] += 1;
  }

  let auto: AutoCompare | null = null;
  if (habit.auto && signalFor) {
    auto = { agree: 0, forgot: 0, unconfirmed: 0, days: 0 };
    for (let d = windowStart; d <= todayKey; d = addDaysToKey(d, 1)) {
      const v = checks[d]?.[habit.id];
      const sig = signalFor(d)[habit.auto];
      if (!v && !sig) continue;
      auto.days += 1;
      if ((v === 'done' && sig) || (v === 'missed' && !sig)) auto.agree += 1;
      else if (sig) auto.forgot += 1;
      else auto.unconfirmed += 1;
    }
  }

  const ticked = window.done + window.missed;
  const rate = window.rate ?? 0;
  let suggested: FormationLevel;
  if (!habit.tracked) suggested = 'untracked';
  else if (ticked < FORMATION.minTicksForVerdict) suggested = 'new';
  else if (rate < FORMATION.unstableRate || missRun >= FORMATION.unstableMissRun) suggested = 'unstable';
  else if (daysTracked >= FORMATION.minDaysTracked && ticked >= FORMATION.minTicksInWindow && rate >= FORMATION.formedRate) suggested = 'formed';
  else suggested = 'building';
  const progress = suggested === 'formed' ? 1 : Math.min(1, daysTracked / FORMATION.minDaysTracked) * Math.min(1, rate / FORMATION.formedRate);

  const manual = manualMark(habit);
  const verdict: FormationLevel = manual === true ? 'formed' : manual === false && suggested === 'formed' ? 'building' : suggested;
  const judged = suggested !== 'new' && suggested !== 'untracked';
  const disagree = judged && ((manual === true && suggested !== 'formed') || (manual === false && suggested === 'formed'));
  const slipping = verdict === 'formed' && habit.tracked && ((last7.rate !== null && last7.done + last7.missed >= 3 && last7.rate < FORMED_RATE) || missRun >= 2);

  return {
    habit,
    firstTick,
    daysTracked,
    window,
    last7,
    prev7,
    streak: streak(checks, habit.id, todayKey),
    bestStreak,
    missRun,
    worstWeekday: worstWeekday(misses, ticks),
    auto,
    suggested,
    manual,
    verdict,
    disagree,
    slipping,
    progress,
  };
}

/** Pairs of tracked habits ticked ✘ on the same days: at least 3 shared misses and ≥ 60 % of the rarer one's misses. */
function slipTogether(checks: HabitChecks, habits: Habit[], todayKey: string): HabitPair | null {
  const from = addDaysToKey(todayKey, -(FORMATION.windowDays - 1));
  const missedDays = new Map<string, Set<string>>();
  for (const h of habits) missedDays.set(h.id, new Set());
  for (let d = from; d <= todayKey; d = addDaysToKey(d, 1)) for (const h of habits) if (checks[d]?.[h.id] === 'missed') missedDays.get(h.id)!.add(d);
  let best: HabitPair | null = null;
  for (let i = 0; i < habits.length; i++)
    for (let j = i + 1; j < habits.length; j++) {
      const A = missedDays.get(habits[i].id)!;
      const B = missedDays.get(habits[j].id)!;
      let both = 0;
      for (const d of A) if (B.has(d)) both += 1;
      if (both < 3 || both / Math.min(A.size, B.size) < 0.6) continue;
      if (!best || both > best.both) best = { a: habits[i], b: habits[j], both, aMissed: A.size, bMissed: B.size };
    }
  return best;
}

export function analyzeHabits(checks: HabitChecks, habits: Habit[], todayKey: string, signalFor?: SignalFor): HabitOverview {
  const tracked = trackedHabits(habits);
  const active = habits.filter((h) => !h.archived).sort((a, b) => a.sort - b.sort);
  const stats = active.map((h) => habitStats(checks, h, todayKey, signalFor));
  const sum = (pick: (s: HabitStats) => Tally) => {
    const ts = stats.filter((s) => s.habit.tracked).map(pick);
    return tally(
      ts.reduce((a, t) => a + t.done, 0),
      ts.reduce((a, t) => a + t.missed, 0)
    );
  };
  const misses = [0, 0, 0, 0, 0, 0, 0];
  const ticks = [0, 0, 0, 0, 0, 0, 0];
  for (let d = addDaysToKey(todayKey, -(FORMATION.weekdayDays - 1)); d <= todayKey; d = addDaysToKey(d, 1))
    for (const h of tracked) {
      const v = checks[d]?.[h.id];
      if (!v) continue;
      ticks[weekdayOf(d)] += 1;
      if (v === 'missed') misses[weekdayOf(d)] += 1;
    }
  return { stats, last7: sum((s) => s.last7), prev7: sum((s) => s.prev7), worstWeekday: worstWeekday(misses, ticks), pair: slipTogether(checks, tracked, todayKey) };
}
