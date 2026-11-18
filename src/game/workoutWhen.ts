import { showToast } from '../store/useToastStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { toDateKey } from '../utils/date';
import type { Clock } from '../utils/mealClock';

/** "Sửa ngày & giờ" of a logged workout: the day it was done on and the time it started. */
export interface WorkoutWhen {
  dateKey: string;
  /** The start time typed; null keeps the workout's own time of day (on the new day when the day changes). */
  clock: Clock | null;
}

/** The new start (ISO) of a workout that started at `dateISO`, moved to `next.dateKey` at `next.clock` (or its own time of day when no
 *  time was typed). Null when the result would be in the future (after `now`) or a date is not valid. */
export function movedWorkoutStart(dateISO: string, next: WorkoutWhen, now: Date = new Date()): string | null {
  const old = new Date(dateISO);
  const parts = next.dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const [h, min] = next.clock ?? (Number.isNaN(old.getTime()) ? [12, 0] : [old.getHours(), old.getMinutes()]);
  // Without a typed time the seconds stay too, so an untouched form changes nothing.
  const sec = next.clock || Number.isNaN(old.getTime()) ? 0 : old.getSeconds();
  const at = new Date(y, m - 1, d, h, min, sec, next.clock || Number.isNaN(old.getTime()) ? 0 : old.getMilliseconds());
  if (Number.isNaN(at.getTime()) || toDateKey(at) !== next.dateKey) return null;
  if (at.getTime() > now.getTime()) return null;
  return at.toISOString();
}

/** Moves a logged workout to another day and/or start time (same id, so its photo and the cloud row follow: the sync upserts
 *  `started_at` by id, and the day's totals are derived from `dateISO`). Shows `text` with "Hoàn tác", which puts the old time back.
 *  Returns the new start, or null when there was no such workout, the time would be in the future or nothing changed. */
export function editWorkoutWhen(entryId: string, next: WorkoutWhen, text: string, now: Date = new Date()): string | null {
  const store = useWorkoutStore.getState();
  const entry = store.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  const dateISO = movedWorkoutStart(entry.dateISO, next, now);
  if (!dateISO || dateISO === entry.dateISO) return null;
  const before = entry.dateISO;
  store.updateEntry(entryId, { dateISO });
  showToast({
    text,
    undo: () => {
      const current = useWorkoutStore.getState().entries.find((e) => e.id === entryId);
      if (current && current.dateISO === dateISO) useWorkoutStore.getState().updateEntry(entryId, { dateISO: before });
    },
  });
  return dateISO;
}
