import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeelingRecord, Mood, WorkoutCondition } from '../types';
import { pushFeelingRecord } from '../sync/cloudSync';

interface FeelingState {
  records: FeelingRecord[];
  addRecord: (input: {
    cravingLevel: number;
    hungerLevel: number;
    mood: Mood;
    workoutCondition: WorkoutCondition | null;
    note: string;
    /** Backdate the check-in (e.g. logging it after the fact) — defaults to now. */
    loggedAtISO?: string;
  }) => void;
  removeRecord: (id: string) => void;
}

export const useFeelingStore = create<FeelingState>()(
  persist(
    (set) => ({
      records: [],
      addRecord: ({ loggedAtISO, ...input }) => {
        const record: FeelingRecord = { id: `${Date.now()}`, loggedAtISO: loggedAtISO ?? new Date().toISOString(), ...input };
        set((state) => ({ records: [...state.records, record] }));
        pushFeelingRecord(record);
      },
      removeRecord: (id) => set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
    }),
    {
      name: 'feeling-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
