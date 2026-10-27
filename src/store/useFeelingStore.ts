import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { FeelingRecord, Mood, WorkoutCondition } from '../types';
import { deleteFeelingRecord, pushFeelingRecord } from '../sync/cloudSync';

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
  /** The device's check-ins were compared with the cloud once (those it never got were sent up then). */
  cloudChecked: boolean;
}

export const useFeelingStore = create<FeelingState>()(
  persist(
    (set) => ({
      records: [],
      cloudChecked: false,
      addRecord: ({ loggedAtISO, ...input }) => {
        const record: FeelingRecord = { id: `${Date.now()}`, loggedAtISO: loggedAtISO ?? new Date().toISOString(), ...input };
        set((state) => ({ records: [...state.records, record] }));
        pushFeelingRecord(record);
      },
      removeRecord: (id) => {
        set((state) => ({ records: state.records.filter((r) => r.id !== id) }));
        deleteFeelingRecord(id);
      },
    }),
    {
      name: 'feeling-store',
      storage: createJSONStorage(() => appStorage),
    }
  )
);
