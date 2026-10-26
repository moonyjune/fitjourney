import { isEveningNote } from '../insights/weights';
import type { WeightEntry, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import type { HabitAuto } from './types';

export const WATER_HABIT_ML = 3000;
export const WALK_HABIT_MIN = 15;

/** What the app's own data says about the habits it can judge, for one day. */
export function autoSignals(
  dateKey: string,
  data: { waterMl: number; weights: WeightEntry[]; workouts: WorkoutLogEntry[] }
): Record<HabitAuto, boolean> {
  return {
    water: data.waterMl >= WATER_HABIT_ML,
    weigh: data.weights.some((w) => toDateKey(new Date(w.dateISO)) === dateKey && !isEveningNote(w.note)),
    walk: data.workouts.some((w) => toDateKey(new Date(w.dateISO)) === dateKey && w.durationMin >= WALK_HABIT_MIN && /đi bộ|walk/i.test(w.label)),
  };
}
