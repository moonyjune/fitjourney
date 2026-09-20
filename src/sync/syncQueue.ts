import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyNutritionLog, FeelingRecord, PlanData, ProofPhoto, UserSettings, WeightEntry, WorkoutLogEntry } from '../types';

/**
 * Every mutating action already updates the local store first (local-first UX), then tries to
 * push to Supabase. Previously a failed push (most commonly: device is offline) was just logged
 * and dropped — the change would never reach the server unless the exact same field happened to
 * be re-pushed later by chance. This queue persists failed/offline pushes and replays them once
 * connectivity returns, so nothing is silently lost.
 */
export type SyncOp =
  | { id: string; type: 'weightEntry'; payload: WeightEntry }
  | { id: string; type: 'workoutEntry'; payload: WorkoutLogEntry }
  | { id: string; type: 'nutritionLog'; payload: DailyNutritionLog }
  | { id: string; type: 'proofPhoto'; payload: ProofPhoto }
  | { id: string; type: 'plan'; payload: { plan: PlanData; updatedAtISO: string; targetUserId?: string } }
  | { id: string; type: 'profile'; payload: UserSettings }
  | { id: string; type: 'feelingRecord'; payload: FeelingRecord };

interface SyncQueueState {
  pending: SyncOp[];
  enqueue: (op: Omit<SyncOp, 'id'>) => void;
  dequeue: (id: string) => void;
}

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set) => ({
      pending: [],
      enqueue: (op) =>
        set((state) => ({ pending: [...state.pending, { ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` } as SyncOp] })),
      dequeue: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
    }),
    { name: 'sync-queue-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    // NetInfo unavailable (e.g. some web edge cases) — assume online and let the actual
    // request fail/queue on its own if it's not.
    return true;
  }
}
