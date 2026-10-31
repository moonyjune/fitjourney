import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

/** Days kept: a cheat day older than this no longer matters to any colour. */
const KEEP_DAYS = 400;

interface CheatDayState {
  /** Date keys (YYYY-MM-DD) the user marked as a cheat day: a small or missing deficit there is not "quá lố". */
  days: string[];
  isCheat: (dateKey: string) => boolean;
  toggle: (dateKey: string) => void;
}

/** Newest first, no duplicates, at most KEEP_DAYS. */
export function cleanCheatDays(days: unknown): string[] {
  if (!Array.isArray(days)) return [];
  const keys = days.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  return [...new Set(keys)].sort().reverse().slice(0, KEEP_DAYS);
}

export const useCheatDayStore = create<CheatDayState>()(
  persist(
    (set, get) => ({
      days: [],
      isCheat: (dateKey) => get().days.includes(dateKey),
      toggle: (dateKey) => {
        const days = get().days.includes(dateKey) ? get().days.filter((d) => d !== dateKey) : cleanCheatDays([...get().days, dateKey]);
        set({ days });
        void pushUserData(USER_DATA_KEYS.cheatDays, { days });
      },
    }),
    { name: 'cheat-day-store', storage: createJSONStorage(() => appStorage), partialize: (s) => ({ days: s.days }) }
  )
);
