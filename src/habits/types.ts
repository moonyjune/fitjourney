/** `formed` = already a routine, `building` = being built, `todo` = still to start. */
export type HabitStatus = 'formed' | 'building' | 'todo';

/** Habits the app can judge from what it already knows: water drunk, a morning weigh-in, a walk of 15 minutes or more. */
export type HabitAuto = 'water' | 'weigh' | 'walk';

export interface Habit {
  id: string;
  name: string;
  status: HabitStatus;
  /** How it is going, in the user's words. */
  assessment: string;
  /** The next small upgrade ("kaizen"). */
  kaizen: string;
  /** What to look at to know whether it is working. */
  measuredBy: string;
  /** Ticked day by day (✔/✘). Untracked habits are only listed. */
  tracked: boolean;
  auto: HabitAuto | null;
  sort: number;
  /** A removed habit: hidden everywhere, its past ticks are kept. */
  archived: boolean;
}

export type CheckValue = 'done' | 'missed';

/** Ticks by day, then by habit id. */
export type HabitChecks = Record<string, Record<string, CheckValue>>;

export const HABIT_STATUSES: HabitStatus[] = ['formed', 'building', 'todo'];
