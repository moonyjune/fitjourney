import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useFeelingStore } from '../store/useFeelingStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { useProofStore } from '../store/useProofStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { toDateKey } from '../utils/date';
import { currentUserId, whenPushesSettled } from './cloudSync';
import { useSyncQueueStore, type SyncOp } from './syncQueue';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface PurgeResult {
  ok: boolean;
  /** Days of food, weigh-ins, workouts, check-ins and photos removed from this device. */
  days: number;
  weights: number;
  workouts: number;
  feelings: number;
  photos: number;
}

const NONE: PurgeResult = { ok: false, days: 0, weights: 0, workouts: 0, feelings: 0, photos: 0 };

const dayOfISO = (iso: string): string => toDateKey(new Date(iso));

/** The date a queued push is about, or null when it is not about a dated diary record. */
function opDay(op: SyncOp): string | null {
  switch (op.type) {
    case 'weightEntry':
    case 'workoutEntry':
    case 'proofPhoto':
      return op.payload.dateISO.slice(0, 10);
    case 'nutritionLog':
      return op.payload.dateISO.slice(0, 10);
    case 'feelingRecord':
      return dayOfISO(op.payload.loggedAtISO);
    default:
      return null;
  }
}

/** Deletes every diary record dated before `cutoffKey` (YYYY-MM-DD) of the signed-in user, in the cloud first and then on this device,
 *  so a restore cannot bring them back. Nothing is removed on this device when the cloud delete fails. The plan, profile, habits,
 *  settings and everything from the cutoff day on are left alone. */
export async function purgeBefore(cutoffKey: string): Promise<PurgeResult> {
  if (!DAY_KEY.test(cutoffKey)) return NONE;
  const signedIn = !!useAuthStore.getState().session && !useAuthStore.getState().devMode;
  if (signedIn) {
    const userId = currentUserId();
    if (!userId) return NONE;
    await whenPushesSettled();
    const cutoffTime = `${cutoffKey}T00:00:00+07:00`;
    const results = await Promise.all([
      supabase.from('nutrition_logs').delete().eq('user_id', userId).lt('entry_date', cutoffKey),
      supabase.from('weight_entries').delete().eq('user_id', userId).lt('entry_date', cutoffKey),
      supabase.from('workout_entries').delete().eq('user_id', userId).lt('entry_date', cutoffKey),
      supabase.from('proof_photos').delete().eq('user_id', userId).lt('entry_date', cutoffKey),
      supabase.from('feeling_records').delete().eq('user_id', userId).lt('logged_at', cutoffTime),
    ]);
    if (results.some((r) => r.error)) return NONE;
  }

  const result: PurgeResult = { ok: true, days: 0, weights: 0, workouts: 0, feelings: 0, photos: 0 };
  useNutritionStore.setState((s) => {
    const logs: typeof s.logs = {};
    for (const [key, log] of Object.entries(s.logs)) {
      if (key < cutoffKey) result.days += 1;
      else logs[key] = log;
    }
    return { logs };
  });
  useWeightStore.setState((s) => {
    const entries = s.entries.filter((e) => e.dateISO.slice(0, 10) >= cutoffKey);
    result.weights = s.entries.length - entries.length;
    return { entries };
  });
  useWorkoutStore.setState((s) => {
    const entries = s.entries.filter((e) => e.dateISO.slice(0, 10) >= cutoffKey);
    result.workouts = s.entries.length - entries.length;
    return { entries };
  });
  useFeelingStore.setState((s) => {
    const records = s.records.filter((r) => dayOfISO(r.loggedAtISO) >= cutoffKey);
    result.feelings = s.records.length - records.length;
    return { records };
  });
  for (const photo of useProofStore.getState().photos.filter((p) => p.dateISO.slice(0, 10) < cutoffKey)) {
    useProofStore.getState().removeProof(photo.id, { cloud: false });
    result.photos += 1;
  }
  // A push still waiting for a connection would bring a removed day back.
  const queue = useSyncQueueStore.getState();
  for (const op of queue.pending) {
    const day = opDay(op);
    if (day && day < cutoffKey) queue.dequeue(op.id);
  }
  return result;
}
