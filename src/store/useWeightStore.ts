import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { WeightEntry } from '../types';
import { deleteWeightEntry, pushWeightEntry } from '../sync/cloudSync';

interface WeightState {
  entries: WeightEntry[];
  /** Adds a weighing and returns its id (so it can be undone). */
  addEntry: (weightKg: number, note?: string, dateISO?: string) => string;
  removeEntry: (id: string) => void;
  latest: () => WeightEntry | null;
}

export const useWeightStore = create<WeightState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (weightKg, note, dateISO) => {
        const entry: WeightEntry = {
          id: `${Date.now()}`,
          dateISO: dateISO ?? new Date().toISOString(),
          weightKg,
          note,
        };
        set((state) => {
          const entries = [...state.entries, entry].sort(
            (a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
          );
          pushWeightEntry(entry);
          return { entries };
        });
        return entry.id;
      },
      removeEntry: (id) => {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
        deleteWeightEntry(id);
      },
      latest: () => {
        const { entries } = get();
        return entries.length > 0 ? entries[entries.length - 1] : null;
      },
    }),
    {
      name: 'weight-store',
      storage: createJSONStorage(() => appStorage),
    }
  )
);
