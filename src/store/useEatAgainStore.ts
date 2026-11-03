import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

/** Most dishes kept in the hidden list (the oldest drop off). */
const MAX_HIDDEN = 200;

interface EatAgainState {
  /** Dishes (`dishKey`) left out of the quick-add "Ăn lại" row. On this device only. */
  hidden: string[];
  hide: (key: string) => void;
  unhide: (key: string) => void;
}

export const useEatAgainStore = create<EatAgainState>()(
  persist(
    (set) => ({
      hidden: [],
      hide: (key) => set((s) => (s.hidden.includes(key) ? s : { hidden: [...s.hidden, key].slice(-MAX_HIDDEN) })),
      unhide: (key) => set((s) => ({ hidden: s.hidden.filter((k) => k !== key) })),
    }),
    { name: 'eat-again-store', storage: createJSONStorage(() => appStorage) }
  )
);
