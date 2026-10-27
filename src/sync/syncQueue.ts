import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { CheckValue, Habit } from '../habits/types';
import type { UricReading } from '../uric/types';
import type { DailyNutritionLog, FeelingRecord, PlanData, ProofPhoto, UserSettings, WeightEntry, WorkoutLogEntry } from '../types';

/**
 * Every mutating action already updates the local store first (local-first UX), then tries to
 * push to Supabase. Previously a failed push (most commonly: device is offline) was just logged
 * and dropped — the change would never reach the server unless the exact same field happened to
 * be re-pushed later by chance. This queue persists failed/offline pushes and replays them once
 * connectivity returns, so nothing is silently lost. The cloud is the source of truth: a waiting write only says "this record changed
 * here"; it is sent with the record as it is on the device at that moment, never an old copy, so it cannot undo a later change.
 */
export type SyncOp =
  | { id: string; type: 'weightEntry'; payload: WeightEntry }
  | { id: string; type: 'workoutEntry'; payload: WorkoutLogEntry }
  | { id: string; type: 'nutritionLog'; payload: DailyNutritionLog }
  | { id: string; type: 'proofPhoto'; payload: ProofPhoto }
  | { id: string; type: 'proofDelete'; payload: { proofId: string } }
  | { id: string; type: 'plan'; payload: { plan: PlanData; updatedAtISO: string; targetUserId?: string } }
  | { id: string; type: 'profile'; payload: UserSettings }
  | { id: string; type: 'feelingRecord'; payload: FeelingRecord }
  | { id: string; type: 'feelingDelete'; payload: { recordId: string } }
  | { id: string; type: 'weightDelete'; payload: { entryId: string } }
  | { id: string; type: 'workoutDelete'; payload: { entryId: string } }
  | { id: string; type: 'habit'; payload: Habit }
  | { id: string; type: 'uricReading'; payload: UricReading }
  | { id: string; type: 'uricDelete'; payload: { readingId: string } }
  | { id: string; type: 'userData'; payload: { key: string; value: unknown } }
  | { id: string; type: 'habitCheck'; payload: { habitId: string; dateKey: string; value: CheckValue | null } };

/** A write to queue (the queue gives it its id). */
export type NewSyncOp = SyncOp extends infer T ? (T extends SyncOp ? Omit<T, 'id'> : never) : never;

/** The record a queued write is about. Two writes with the same key are about the same record: only the newest one is worth sending,
 *  so the queue keeps one per key (and a delete replaces a waiting save of the same record). */
export function opKey(op: NewSyncOp | SyncOp): string {
  switch (op.type) {
    case 'weightEntry':
      return `weight:${op.payload.id}`;
    case 'weightDelete':
      return `weight:${op.payload.entryId}`;
    case 'workoutEntry':
      return `workout:${op.payload.id}`;
    case 'workoutDelete':
      return `workout:${op.payload.entryId}`;
    case 'nutritionLog':
      return `day:${op.payload.dateISO.slice(0, 10)}`;
    case 'proofPhoto':
      return `proof:${op.payload.id}`;
    case 'proofDelete':
      return `proof:${op.payload.proofId}`;
    case 'plan':
      return `plan:${op.payload.targetUserId ?? 'own'}`;
    case 'profile':
      return 'profile';
    case 'feelingRecord':
      return `feeling:${op.payload.id}`;
    case 'feelingDelete':
      return `feeling:${op.payload.recordId}`;
    case 'habit':
      return `habit:${op.payload.id}`;
    case 'habitCheck':
      return `check:${op.payload.habitId}:${op.payload.dateKey}`;
    case 'uricReading':
      return `uric:${op.payload.id}`;
    case 'uricDelete':
      return `uric:${op.payload.readingId}`;
    case 'userData':
      return `data:${op.payload.key}`;
  }
}

interface SyncQueueState {
  pending: SyncOp[];
  enqueue: (op: NewSyncOp) => void;
  dequeue: (id: string) => void;
  /** A write of this record reached the cloud: whatever was waiting for it from before `sinceMs` is out of date and dropped. */
  settled: (key: string, sinceMs: number) => void;
}

/** When a queued write was made (its id starts with the time). */
export const opTime = (op: SyncOp): number => Number(op.id.split('-')[0]) || 0;

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set) => ({
      pending: [],
      enqueue: (op) =>
        set((state) => {
          const key = opKey(op);
          const next = { ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` } as SyncOp;
          return { pending: [...state.pending.filter((p) => opKey(p) !== key), next] };
        }),
      dequeue: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
      settled: (key, sinceMs) =>
        set((state) => {
          const pending = state.pending.filter((p) => opKey(p) !== key || opTime(p) > sinceMs);
          return pending.length === state.pending.length ? state : { pending };
        }),
    }),
    {
      name: 'sync-queue-store',
      storage: createJSONStorage(() => appStorage),
      // Version 1: the cloud is the source of truth. Food days queued before it are copies of a day from back then, which would now be
      // sent as "the newest" and undo later changes (the cloud already has every change that reached it); they are dropped once.
      version: 1,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { pending?: SyncOp[] };
        const pending = Array.isArray(state.pending) ? state.pending : [];
        return { ...state, pending: version < 1 ? pending.filter((op) => op.type !== 'nutritionLog') : pending } as SyncQueueState;
      },
    }
  )
);

/** Keys of every record that has a write waiting: on those the device's copy is newer than the cloud's. */
export function pendingKeys(): Set<string> {
  return new Set(useSyncQueueStore.getState().pending.map(opKey));
}

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

let dayReader: (dateKey: string) => DailyNutritionLog | undefined = () => undefined;

/** The nutrition store tells the queue how to read a day as it is now (set once by the store, avoids an import cycle). */
export function setDayReader(read: (dateKey: string) => DailyNutritionLog | undefined): void {
  dayReader = read;
}

export const currentDay = (dateKey: string): DailyNutritionLog | undefined => dayReader(dateKey);
