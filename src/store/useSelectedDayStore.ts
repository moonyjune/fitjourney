import { create } from 'zustand';
import { toDateKey } from '../utils/date';
import { oldestLogDateKey } from '../utils/logDate';

interface SelectedDayState {
  /** The day picked in the battle log's week strip; null means today (so it moves on by itself after midnight). Not persisted. */
  selectedKey: string | null;
  select: (dateKey: string, now: Date) => void;
}

export const useSelectedDayStore = create<SelectedDayState>()((set) => ({
  selectedKey: null,
  select: (dateKey, now) => set({ selectedKey: dateKey >= toDateKey(now) ? null : dateKey }),
}));

/** The selected day as a date key: never in the future, today when nothing (or today) is selected. */
export function selectedDayKey(selectedKey: string | null, now: Date): string {
  const today = toDateKey(now);
  return selectedKey && selectedKey < today ? selectedKey : today;
}

/** The day the quick-add sheet and the check-in start on: the selected day when it can still be logged on
 *  (MAX_LOG_DAYS_BACK days back at most), else today. */
export function workingDayKey(selectedKey: string | null, now: Date): string {
  const key = selectedDayKey(selectedKey, now);
  return key >= oldestLogDateKey(now) ? key : toDateKey(now);
}
