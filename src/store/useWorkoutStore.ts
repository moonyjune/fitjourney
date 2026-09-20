import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import { pushWorkoutEntry } from '../sync/cloudSync';

interface WorkoutState {
  entries: WorkoutLogEntry[];
  addEntry: (entry: Omit<WorkoutLogEntry, 'id' | 'dateISO'>, dateISO?: string) => void;
  removeEntry: (id: string) => void;
  /** Overwrites an entry's calories-burned once an AI photo analysis (or manual edit) refines it. */
  updateEntryCaloriesBurned: (id: string, caloriesBurned: number) => void;
  /** Returns a new array each call — filter `entries` in a component's own useMemo instead of using this as a hook selector. */
  entriesForDateKey: (dateKey: string) => WorkoutLogEntry[];
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (entry, dateISO) =>
        set((state) => {
          const fullEntry = { ...entry, id: `${Date.now()}`, dateISO: dateISO ?? new Date().toISOString() };
          pushWorkoutEntry(fullEntry);
          return { entries: [...state.entries, fullEntry] };
        }),
      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
      updateEntryCaloriesBurned: (id, caloriesBurned) =>
        set((state) => {
          const entry = state.entries.find((e) => e.id === id);
          if (!entry) return state;
          const updated = { ...entry, caloriesBurned };
          pushWorkoutEntry(updated);
          return { entries: state.entries.map((e) => (e.id === id ? updated : e)) };
        }),
      entriesForDateKey: (dateKey) => get().entries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey),
    }),
    {
      name: 'workout-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
