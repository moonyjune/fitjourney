import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

interface LearnState {
  /** The owner's own comment on a reading topic, by topic number (loaded from a diary file). */
  notes: Record<string, string>;
  /** Adds or replaces notes; returns how many were set. */
  setNotes: (notes: Record<string, string>) => number;
}

export const useLearnStore = create<LearnState>()(
  persist(
    (set, get) => ({
      notes: {},
      setNotes: (incoming) => {
        set((s) => ({ notes: { ...s.notes, ...incoming } }));
        pushUserData(USER_DATA_KEYS.learnNotes, get().notes);
        return Object.keys(incoming).length;
      },
    }),
    { name: 'learn-store', storage: createJSONStorage(() => appStorage) }
  )
);
