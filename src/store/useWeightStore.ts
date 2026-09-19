import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeightEntry } from '../types';
import { pushWeightEntry } from '../sync/cloudSync';

interface WeightState {
  entries: WeightEntry[];
  addEntry: (weightKg: number, note?: string, dateISO?: string) => void;
  removeEntry: (id: string) => void;
  latest: () => WeightEntry | null;
}

export const useWeightStore = create<WeightState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (weightKg, note, dateISO) =>
        set((state) => {
          const entry: WeightEntry = {
            id: `${Date.now()}`,
            dateISO: dateISO ?? new Date().toISOString(),
            weightKg,
            note,
          };
          const entries = [...state.entries, entry].sort(
            (a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
          );
          pushWeightEntry(entry);
          return { entries };
        }),
      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
      latest: () => {
        const { entries } = get();
        return entries.length > 0 ? entries[entries.length - 1] : null;
      },
    }),
    {
      name: 'weight-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
