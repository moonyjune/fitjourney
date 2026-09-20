import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Force a fresh login after this much time since the app was last opened/foregrounded. */
export const SESSION_MAX_IDLE_MS = 24 * 60 * 60 * 1000;

interface SessionActivityState {
  lastActiveAtISO: string | null;
  touch: () => void;
}

export const useSessionActivityStore = create<SessionActivityState>()(
  persist(
    (set) => ({
      lastActiveAtISO: null,
      touch: () => set({ lastActiveAtISO: new Date().toISOString() }),
    }),
    { name: 'session-activity-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
