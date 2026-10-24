import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CelebrationState {
  /** Highest level whose celebration was already shown (or that existed when tracking began); null = not tracking yet.
   *  Level itself is derived from the logs, so this is the only thing that remembers what the user has seen. */
  seenLevel: number | null;
  markSeen: (level: number) => void;
}

export const useCelebrationStore = create<CelebrationState>()(
  persist(
    (set) => ({
      seenLevel: null,
      markSeen: (level) => set({ seenLevel: level }),
    }),
    { name: 'celebration-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
