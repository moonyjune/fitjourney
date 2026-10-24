import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import { pushWorkoutEntry } from '../sync/cloudSync';
import { useProofStore } from './useProofStore';

/** What can be changed on a logged workout. The id never changes; `templateId` stays so a plan template's step
 *  breakdown keeps showing for an entry whose numbers were corrected. */
export type WorkoutEntryPatch = Partial<Pick<WorkoutLogEntry, 'label' | 'durationMin' | 'caloriesBurned' | 'dateISO'>>;

interface WorkoutState {
  entries: WorkoutLogEntry[];
  /** Returns the entry that was created (callers that don't need it can ignore it). */
  addEntry: (entry: Omit<WorkoutLogEntry, 'id' | 'dateISO'>, dateISO?: string) => WorkoutLogEntry;
  /** Removes the entry together with its photo (the proof entry and the persisted file). */
  removeEntry: (id: string) => void;
  /** Changes an existing entry and syncs it like a new one (the cloud write upserts by id). Returns the updated entry,
   *  or undefined when the id is unknown. Everything derived from the logs (missions, XP, streak) follows by itself. */
  updateEntry: (id: string, patch: WorkoutEntryPatch) => WorkoutLogEntry | undefined;
  /** Overwrites an entry's calories-burned once an AI photo analysis (or manual edit) refines it. */
  updateEntryCaloriesBurned: (id: string, caloriesBurned: number) => void;
  /** Returns a new array each call — filter `entries` in a component's own useMemo instead of using this as a hook selector. */
  entriesForDateKey: (dateKey: string) => WorkoutLogEntry[];
}

/** Drops the photo(s) attached to a workout entry: the proof entries (which also delete their file). */
function discardWorkoutPhotos(entryId: string): void {
  const proofs = useProofStore.getState();
  for (const p of proofs.photos.filter((x) => x.taskType === 'workout' && x.taskRefId === entryId)) {
    proofs.removeProof(p.id);
  }
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (entry, dateISO) => {
        const fullEntry: WorkoutLogEntry = { ...entry, id: `${Date.now()}`, dateISO: dateISO ?? new Date().toISOString() };
        pushWorkoutEntry(fullEntry);
        set((state) => ({ entries: [...state.entries, fullEntry] }));
        return fullEntry;
      },
      removeEntry: (id) => {
        discardWorkoutPhotos(id);
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
      },
      updateEntry: (id, patch) => {
        const entry = get().entries.find((e) => e.id === id);
        if (!entry) return undefined;
        const updated: WorkoutLogEntry = { ...entry, ...patch };
        pushWorkoutEntry(updated);
        set((state) => ({ entries: state.entries.map((e) => (e.id === id ? updated : e)) }));
        return updated;
      },
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
