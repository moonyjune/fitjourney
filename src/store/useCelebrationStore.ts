import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

interface CelebrationState {
  /** Highest level whose celebration was already shown (or that existed when tracking began); null = not tracking yet.
   *  Level itself is derived from the logs, so this is the only thing that remembers what the user has seen. */
  seenLevel: number | null;
  markSeen: (level: number) => void;
  /** Monday key of the last week whose "Tổng kết tuần" card on Camp was closed or whose weekly report was opened; null = none. */
  weeklyDoneKey: string | null;
  markWeeklyDone: (weekKey: string) => void;
}

export const useCelebrationStore = create<CelebrationState>()(
  persist(
    (set) => ({
      seenLevel: null,
      markSeen: (level) => set({ seenLevel: level }),
      weeklyDoneKey: null,
      markWeeklyDone: (weekKey) => set({ weeklyDoneKey: weekKey }),
    }),
    { name: 'celebration-store', storage: createJSONStorage(() => appStorage) }
  )
);
