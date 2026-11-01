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
  /** Changes a check-in's answers (its time stays). One the cloud had without a device id is re-sent under a new id and its old row
   *  deleted, so the edit never leaves a duplicate behind. */
  updateRecord: (id: string, patch: Pick<FeelingRecord, 'cravingLevel' | 'hungerLevel' | 'mood' | 'workoutCondition' | 'note'>) => void;
  removeRecord: (id: string) => void;
  /** The device's check-ins were compared with the cloud once (those it never got were sent up then). */
  cloudChecked: boolean;
}

export const useFeelingStore = create<FeelingState>()(
  persist(
    (set, get) => ({
      records: [],
      cloudChecked: false,
      addRecord: ({ loggedAtISO, ...input }) => {
        const record: FeelingRecord = { id: `${Date.now()}`, loggedAtISO: loggedAtISO ?? new Date().toISOString(), ...input };
        set((state) => ({ records: [...state.records, record] }));
        pushFeelingRecord(record);
      },
      updateRecord: (id, patch) => {
        const current = get().records.find((r) => r.id === id);
        if (!current) return;
        const fromCloud = id.startsWith('cloud-');
        const updated: FeelingRecord = { ...current, ...patch, id: fromCloud ? `${Date.now()}` : id };
        set((state) => ({ records: state.records.map((r) => (r.id === id ? updated : r)) }));
        pushFeelingRecord(updated);
        if (fromCloud) deleteFeelingRecord(id);
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
