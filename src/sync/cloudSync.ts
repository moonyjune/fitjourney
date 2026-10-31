import { supabase } from '../lib/supabase';
import type { CheckValue, Habit } from '../habits/types';
import type { UricReading } from '../uric/types';
import { useAiPhotoStore } from '../store/useAiPhotoStore';
import { useAuthStore } from '../store/useAuthStore';
import type { BodyProfile } from '../ai/bodyProfile';
import type { CoachContext } from '../ai/coachContext';
import type { WeekInput } from '../ai/weeklyReport';
import type { DinnerBrief, DinnerIdea } from '../ai/dinner';
import { cleanSearch, pickShared, SHARED_COOKBOOK_COLUMNS } from '../cookbook/shared';
import { cookbookRows } from '../../supabase/functions/_shared/cookbook';
import type { ClientRows } from '../ai/coachDigest';
import type { SwapContext, SwapItem } from '../food/swaps';
import { DEV_ANALYSIS_DELAY_MS, fakeDigest, fakeDinner, fakeMealText, fakeNutritionLabel, fakePhotoAnalysis, fakeSwaps, fakeWeeklyReport } from '../ai/devPhotoAnalysis';
import { DEFAULT_PLAN } from '../constants/plan';
import { generateCoachCode } from '../utils/coachCode';
import { foodKey } from '../food/remember';
import { toDateKey } from '../utils/date';
import { DEFAULT_TARGET_DAILY_DEFICIT_KCAL } from '../utils/tdee';
import { currentDay, isOnline, opKey, useSyncQueueStore, type NewSyncOp } from './syncQueue';
import type {
  ActivityLevel,
  ChatRole,
  ChatSessionSummary,
  CoachClientSummary,
  CoachFeedback,
  DailyNutritionLog,
  FeedbackPeriodType,
  FeelingRecord,
  Gender,
  MealRecipeSuggestion,
  Mood,
  PlanData,
  ProofPhoto,
  StoredChatMessage,
  UserRole,
  UserSettings,
  WeightEntry,
  WorkoutCondition,
  WorkoutLogEntry,
} from '../types';

/** The signed-in Supabase user id, or null when signed out or on the offline dev login (no network access at all). */
export function currentUserId(): string | null {
  const { session, devMode } = useAuthStore.getState();
  // The dev login is offline-only: pretending to be signed out makes every push/pull a no-op.
  return devMode ? null : (session?.user.id ?? null);
}

function logSyncError(context: string, error: unknown) {
  // Best-effort sync: never block the local-first UX on a network/backend error.
  console.warn(`[cloudSync] ${context} failed:`, error);
}

/**
 * Runs a Supabase write, queuing it for retry instead of silently dropping it when offline or
 * when the request itself fails (most commonly a flaky connection). See sync/syncQueue.ts.
 */
async function pushOrQueue(
  op: NewSyncOp,
  attempt: () => PromiseLike<{ error: unknown }>,
  context: string
): Promise<void> {
  const task = tryPush(op, attempt, context);
  inFlightPushes.add(task);
  try {
    await task;
  } finally {
    inFlightPushes.delete(task);
  }
}

async function tryPush(op: NewSyncOp, attempt: () => PromiseLike<{ error: unknown }>, context: string): Promise<void> {
  const startedMs = Date.now();
  if (!(await isOnline())) {
    useSyncQueueStore.getState().enqueue(op);
    return;
  }
  try {
    const { error } = await attempt();
    if (error) throw error;
    // The record as it is now reached the cloud: an older write of it still waiting would only undo this one.
    useSyncQueueStore.getState().settled(opKey(op), startedMs);
  } catch (error) {
    logSyncError(context, error);
    useSyncQueueStore.getState().enqueue(op);
  }
}

const inFlightPushes = new Set<Promise<void>>();

/** Resolves once every write started so far has either reached the cloud or been put in the retry queue. */
export async function whenPushesSettled(): Promise<void> {
  while (inFlightPushes.size > 0) await Promise.all([...inFlightPushes]);
}

export interface RemoteProfile {
  startWeightKg: number;
  goalWeightKg: number;
  heightCm: number | null;
  age: number | null;
  gender: Gender | null;
  activityLevel: ActivityLevel | null;
  calorieTargetKcal: number;
  targetDailyDeficitKcal: number;
  proteinTargetG: number;
  waterTargetMl: number;
  startDateISO: string;
  remindersEnabled: boolean;
  role: UserRole;
  clientSetupDone: boolean;
  coachEnabled: boolean;
  coachId: string | null;
  coachCode: string | null;
}

/** Returns the remote profile if role-select was already completed on another device, else null. */
export async function pullProfile(): Promise<RemoteProfile | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    const clientSetupDone = data?.start_weight_kg != null && data?.goal_weight_kg != null;
    const coachEnabled = data?.coach_code != null;
    // Either capability having been set up is evidence role-select already happened on another device.
    if (!data || (!clientSetupDone && !coachEnabled)) return null;

    // PostgREST returns `numeric` columns as strings (to avoid float precision loss), not JS
    // numbers — every numeric field below must be explicitly coerced, or e.g.
    // calorieTargetKcal + targetDailyDeficitKcal silently does STRING CONCATENATION ("1950" +
    // "1100" -> "19501100") instead of addition once both operands are strings. This is exactly
    // the kind of wildly-wrong TDEE a user would immediately notice and report as "tính sai".
    return {
      startWeightKg: Number(data.start_weight_kg ?? 110),
      goalWeightKg: Number(data.goal_weight_kg ?? 95),
      heightCm: data.height_cm != null ? Number(data.height_cm) : null,
      age: data.age != null ? Number(data.age) : null,
      gender: (data.gender as Gender) ?? null,
      activityLevel: (data.activity_level as ActivityLevel) ?? null,
      calorieTargetKcal: Number(data.calorie_target_kcal ?? 1950),
      targetDailyDeficitKcal: Number(data.target_daily_deficit_kcal ?? DEFAULT_TARGET_DAILY_DEFICIT_KCAL),
      proteinTargetG: Number(data.protein_target_g ?? 200),
      waterTargetMl: Number(data.water_target_ml ?? 4500),
      startDateISO: data.start_date ? new Date(data.start_date).toISOString() : new Date().toISOString(),
      remindersEnabled: data.reminders_enabled ?? true,
      role: (data.role as UserRole) ?? 'client',
      clientSetupDone,
      coachEnabled,
      coachId: data.coach_id,
      coachCode: data.coach_code,
    };
  } catch (error) {
    logSyncError('pullProfile', error);
    return null;
  }
}

export async function pushProfile(settings: UserSettings): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'profile', payload: settings },
    () =>
      supabase
        .from('profiles')
        .update({
          start_weight_kg: settings.startWeightKg,
          goal_weight_kg: settings.goalWeightKg,
          height_cm: settings.heightCm,
          age: settings.age,
          gender: settings.gender,
          activity_level: settings.activityLevel,
          calorie_target_kcal: settings.calorieTargetKcal,
          target_daily_deficit_kcal: settings.targetDailyDeficitKcal,
          protein_target_g: settings.proteinTargetG,
          water_target_ml: settings.waterTargetMl,
          start_date: settings.startDateISO.slice(0, 10),
          reminders_enabled: settings.remindersEnabled,
          role: settings.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId),
    'pushProfile'
  );
}

const COACH_CODE_ATTEMPTS = 6;

/** Returns this account's coach code, creating it the first time. The code belongs to the account: an existing one is
 *  never replaced, and uniqueness across accounts comes from the `coach_code` unique constraint (a collision is retried
 *  with a fresh code). Returns null when the backend can't confirm a saved code, so callers never show a code that
 *  isn't actually stored. */
export async function ensureCoachCode(): Promise<string | null> {
  const { devMode } = useAuthStore.getState();
  // Offline dev account: there is no backend row, so a local code is all there is.
  if (devMode) return generateCoachCode();
  const userId = currentUserId();
  if (!userId) return null;

  const readExisting = async (): Promise<string | null> => {
    const { data, error } = await supabase.from('profiles').select('coach_code').eq('id', userId).maybeSingle();
    if (error) {
      logSyncError('ensureCoachCode (read)', error);
      return null;
    }
    return (data?.coach_code as string | null | undefined) ?? null;
  };

  const existing = await readExisting();
  if (existing) return existing;

  for (let attempt = 0; attempt < COACH_CODE_ATTEMPTS; attempt++) {
    const code = generateCoachCode();
    // `is null` makes this a no-op if another device set a code in the meantime; `.select()` proves a row was written
    // (an update that matches no row, e.g. blocked by RLS, returns no error at all).
    const { data, error } = await supabase
      .from('profiles')
      .update({ role: 'coach', coach_code: code })
      .eq('id', userId)
      .is('coach_code', null)
      .select('coach_code');
    if (!error) {
      if (data && data.length > 0) return code;
      return await readExisting(); // lost a race to another device, or no profile row — whatever is stored wins
    }
    // 23505 = unique_violation (code taken by another account) — try again with a new code.
    if (error.code !== '23505') {
      logSyncError('ensureCoachCode', error);
      return null;
    }
  }
  return null;
}

export async function linkToCoach(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('link_to_coach', { p_code: code.trim().toUpperCase() });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export interface CoachLinkInfo {
  email: string | null;
  code: string | null;
  linkedAtISO: string;
}

/** The coach this account is linked to right now (snapshot of their email and code), or null. */
export async function fetchCoachLink(): Promise<CoachLinkInfo | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('coach_links')
      .select('coach_email, coach_code, linked_at')
      .eq('client_id', userId)
      .is('unlinked_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { email: data.coach_email ?? null, code: data.coach_code ?? null, linkedAtISO: new Date(data.linked_at).toISOString() };
  } catch (error) {
    logSyncError('fetchCoachLink', error);
    return null;
  }
}

export async function fetchCoachClients(): Promise<CoachClientSummary[]> {
  const userId = currentUserId();
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, start_weight_kg, goal_weight_kg')
      .eq('coach_id', userId);
    if (error) throw error;

    const clients = data ?? [];
    const summaries: CoachClientSummary[] = [];
    for (const c of clients) {
      const { data: latestWeight } = await supabase
        .from('weight_entries')
        .select('weight_kg')
        .eq('user_id', c.id)
        .order('entry_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      summaries.push({
        id: c.id,
        email: c.email,
        displayName: c.display_name,
        startWeightKg: c.start_weight_kg,
        goalWeightKg: c.goal_weight_kg,
        latestWeightKg: latestWeight?.weight_kg ?? null,
      });
    }
    return summaries;
  } catch (error) {
    logSyncError('fetchCoachClients', error);
    return [];
  }
}

export async function pushWeightEntry(entry: WeightEntry): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'weightEntry', payload: entry },
    () =>
      supabase.from('weight_entries').upsert(
        {
          user_id: userId,
          client_id: entry.id,
          entry_date: entry.dateISO.slice(0, 10),
          logged_at: entry.dateISO,
          weight_kg: entry.weightKg,
          note: entry.note ?? null,
        },
        { onConflict: 'user_id,client_id' }
      ),
    'pushWeightEntry'
  );
}

/** Ids of records that came from the cloud without an id of the device (made before records had one) are `cloud-<row id>`. */
const CLOUD_ROW = 'cloud-';

export async function deleteWeightEntry(entryId: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'weightDelete', payload: { entryId } },
    () => {
      const q = supabase.from('weight_entries').delete().eq('user_id', userId);
      return entryId.startsWith(CLOUD_ROW) ? q.eq('id', entryId.slice(CLOUD_ROW.length)) : q.eq('client_id', entryId);
    },
    'deleteWeightEntry'
  );
}

export async function deleteWorkoutEntry(entryId: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'workoutDelete', payload: { entryId } },
    () => {
      const q = supabase.from('workout_entries').delete().eq('user_id', userId);
      return entryId.startsWith(CLOUD_ROW) ? q.eq('id', entryId.slice(CLOUD_ROW.length)) : q.eq('client_id', entryId);
    },
    'deleteWorkoutEntry'
  );
}

/** PostgREST's answer for a column the table does not have (yet). */
export function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === 'PGRST204' || e?.code === '42703' || /column .* (does not exist|not find)|could not find the .* column/i.test(e?.message ?? '');
}

export async function pushWorkoutEntry(entry: WorkoutLogEntry): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  // The day is the local one (an ISO slice is the UTC day: a 6 am workout in Vietnam landed on the day before).
  const base = {
    user_id: userId,
    client_id: entry.id,
    entry_date: toDateKey(new Date(entry.dateISO)),
    template_id: entry.templateId,
    label: entry.label,
    duration_min: entry.durationMin,
    calories_burned: entry.caloriesBurned,
  };
  const upsert = (row: Record<string, unknown>) => supabase.from('workout_entries').upsert(row, { onConflict: 'user_id,client_id' });
  await pushOrQueue(
    { type: 'workoutEntry', payload: entry },
    async () => {
      const full = await upsert({ ...base, started_at: entry.dateISO, details: entry.details ?? null });
      // Until schema.sql adds started_at / details, write what the table has rather than failing the sync.
      return full.error && isMissingColumn(full.error) ? upsert(base) : full;
    },
    'pushWorkoutEntry'
  );
}

/** A photo kept inline on web (a data: URL, up to hundreds of KB) belongs in the proof storage, not in every day's row. */
function withoutInlinePhotos(items: DailyNutritionLog['extraItems']): DailyNutritionLog['extraItems'] {
  return items?.map((item) => {
    if (!item.photoUri?.startsWith('data:')) return item;
    const { photoUri: _inline, ...rest } = item;
    return rest;
  });
}

export async function pushNutritionLog(log: DailyNutritionLog): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'nutritionLog', payload: log },
    () =>
      supabase.from('nutrition_logs').upsert(
        {
          user_id: userId,
          entry_date: log.dateISO,
          meals_eaten: log.mealsEaten,
          extra_calories: log.extraCalories,
          extra_protein_g: log.extraProteinG,
          extra_items: withoutInlinePhotos(log.extraItems),
          water_ml: log.waterMl,
          removed_meal_slots: log.removedMealSlots ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,entry_date' }
      ),
    'pushNutritionLog'
  );
}

export async function pullPlan(targetUserId?: string): Promise<{ plan: PlanData; updatedAtISO: string } | null> {
  const userId = targetUserId ?? currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('plans').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { plan: data.plan_json as PlanData, updatedAtISO: data.updated_at };
  } catch (error) {
    logSyncError('pullPlan', error);
    return null;
  }
}

/** True for PostgREST's "no such column" errors (PGRST204 from the schema cache, 42703 from Postgres): the cloud table
 *  is older than the app, so a write can be retried without the new field. */
function isMissingHabitColumn(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'PGRST204' || code === '42703';
}

export async function pushHabit(habit: Habit): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const row = {
    user_id: userId,
    client_id: habit.id,
    name: habit.name,
    status: habit.status,
    assessment: habit.assessment,
    kaizen: habit.kaizen,
    measured_by: habit.measuredBy,
    tracked: habit.tracked,
    auto: habit.auto,
    sort: habit.sort,
    archived: habit.archived,
    formed_mark: habit.formedMark ?? null,
    updated_at: new Date().toISOString(),
  };
  await pushOrQueue(
    { type: 'habit', payload: habit },
    async () => {
      const first = await supabase.from('habits').upsert(row, { onConflict: 'user_id,client_id' });
      if (!first.error || !isMissingHabitColumn(first.error)) return first;
      // The `formed_mark` column comes from schema.sql ("Habits formed status"); until it is run, save the rest.
      const { formed_mark: _skip, ...older } = row;
      return supabase.from('habits').upsert(older, { onConflict: 'user_id,client_id' });
    },
    'pushHabit'
  );
}

/** Saves a day's tick for a habit, or removes it when `value` is null (the user cleared it). */
export async function pushHabitCheck(habitId: string, dateKey: string, value: CheckValue | null): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'habitCheck', payload: { habitId, dateKey, value } },
    () =>
      value === null
        ? supabase.from('habit_checks').delete().eq('user_id', userId).eq('habit_client_id', habitId).eq('entry_date', dateKey)
        : supabase.from('habit_checks').upsert(
            { user_id: userId, habit_client_id: habitId, entry_date: dateKey, value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,habit_client_id,entry_date' }
          ),
    'pushHabitCheck'
  );
}

export async function pushUricReading(reading: UricReading): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'uricReading', payload: reading },
    () =>
      supabase.from('uric_readings').upsert(
        {
          user_id: userId,
          client_id: reading.id,
          entry_date: reading.dateKey,
          value_umol: reading.valueUmol,
          note: reading.note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,client_id' }
      ),
    'pushUricReading'
  );
}

export async function deleteUricReading(readingId: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'uricDelete', payload: { readingId } },
    () => supabase.from('uric_readings').delete().eq('user_id', userId).eq('client_id', readingId),
    'deleteUricReading'
  );
}

/** Saves one of the user's own settings blobs (see sync/restore.ts USER_DATA_KEYS) so it survives signing out. */
export async function pushUserData(key: string, value: unknown): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'userData', payload: { key, value } },
    () => supabase.from('user_data').upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }),
    'pushUserData'
  );
}

export async function pushPlan(plan: PlanData, updatedAtISO: string, targetUserId?: string): Promise<void> {
  const userId = targetUserId ?? currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'plan', payload: { plan, updatedAtISO, targetUserId } },
    () => supabase.from('plans').upsert({ user_id: userId, plan_json: plan, updated_at: updatedAtISO }, { onConflict: 'user_id' }),
    'pushPlan'
  );
}

const PROOF_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/** Uploads a proof photo (the file, then its row) and is safe to run again: the same photo always lands on the same storage path
 *  and row, so a retry after a half-finished attempt never doubles it. A photo whose file is gone cannot be uploaded, so it is dropped
 *  instead of being queued forever. */
export async function pushProofPhoto(proof: ProofPhoto): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  if (!(await isOnline())) {
    useSyncQueueStore.getState().enqueue({ type: 'proofPhoto', payload: proof });
    return;
  }
  let blob: Blob;
  try {
    const response = await fetch(proof.photoUri);
    if (!response.ok) throw new Error(`photo not readable (${response.status})`);
    blob = await response.blob();
  } catch (error) {
    logSyncError('pushProofPhoto:read', error);
    return;
  }
  try {
    const extension = PROOF_EXTENSIONS[blob.type] ?? 'jpg';
    const storagePath = `${userId}/${proof.id}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('proofs')
      .upload(storagePath, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const row = {
      user_id: userId,
      entry_date: toDateKey(new Date(proof.dateISO)),
      task_type: proof.taskType,
      task_ref_id: proof.taskRefId,
      photo_path: storagePath,
      note: proof.note || null,
    };
    const { data: existing, error: findError } = await supabase.from('proof_photos').select('id').eq('user_id', userId).eq('photo_path', storagePath).limit(1);
    if (findError) throw findError;
    const { error: writeError } = existing && existing.length > 0 ? await supabase.from('proof_photos').update(row).eq('id', existing[0].id) : await supabase.from('proof_photos').insert(row);
    if (writeError) throw writeError;
  } catch (error) {
    logSyncError('pushProofPhoto', error);
    useSyncQueueStore.getState().enqueue({ type: 'proofPhoto', payload: proof });
  }
}

/** Removes a proof photo from the cloud: its row and its file. Queued while offline and replayed later. */
export async function deleteProofPhoto(proofId: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  if (!(await isOnline())) {
    useSyncQueueStore.getState().enqueue({ type: 'proofDelete', payload: { proofId } });
    return;
  }
  try {
    const pattern = `${userId}/${proofId}.%`;
    const { data, error } = await supabase.from('proof_photos').select('photo_path').eq('user_id', userId).like('photo_path', pattern);
    if (error) throw error;
    const paths = (data ?? []).map((r: { photo_path: string }) => r.photo_path);
    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage.from('proofs').remove(paths);
      if (removeError) throw removeError;
      const { error: deleteError } = await supabase.from('proof_photos').delete().eq('user_id', userId).like('photo_path', pattern);
      if (deleteError) throw deleteError;
    }
  } catch (error) {
    logSyncError('deleteProofPhoto', error);
    useSyncQueueStore.getState().enqueue({ type: 'proofDelete', payload: { proofId } });
  }
}

/** Coach writes a weekly/monthly review for one of their clients. */
export async function pushCoachFeedback(
  clientUserId: string,
  periodType: FeedbackPeriodType,
  periodLabel: string,
  feedbackText: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const coachId = currentUserId();
  if (!coachId) return { ok: false, message: 'Chưa đăng nhập.' };
  const { error } = await supabase.from('coach_feedback').insert({
    user_id: clientUserId,
    coach_id: coachId,
    period_type: periodType,
    period_label: periodLabel,
    feedback_text: feedbackText,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Feedback for a given client, newest first. Works for the client themself or their coach (RLS-scoped). */
export async function fetchFeedback(clientUserId: string): Promise<CoachFeedback[]> {
  try {
    const { data, error } = await supabase
      .from('coach_feedback')
      .select('*')
      .eq('user_id', clientUserId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      coachId: row.coach_id,
      periodType: row.period_type,
      periodLabel: row.period_label,
      feedbackText: row.feedback_text,
      createdAtISO: row.created_at,
    }));
  } catch (error) {
    logSyncError('fetchFeedback', error);
    return [];
  }
}

/**
 * AI plan-chat sessions. `ownerId` is whose plan the chat is about (always the client);
 * the current user is the actor (themself, or that client's coach). Persisting these lets a
 * conversation survive closing the app, and lets the UI reuse an identical prior answer within
 * the same session instead of calling Claude again for a repeated question.
 */
export async function createChatSession(ownerId: string, title: string): Promise<string | null> {
  const actorId = currentUserId();
  if (!actorId) return null;
  try {
    const { data, error } = await supabase
      .from('plan_chat_sessions')
      .insert({ owner_id: ownerId, actor_id: actorId, title })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    logSyncError('createChatSession', error);
    return null;
  }
}

export async function listChatSessions(ownerId: string): Promise<ChatSessionSummary[]> {
  const actorId = currentUserId();
  if (!actorId) return [];
  try {
    const { data, error } = await supabase
      .from('plan_chat_sessions')
      .select('id, title, updated_at')
      .eq('owner_id', ownerId)
      .eq('actor_id', actorId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ id: row.id, title: row.title, updatedAtISO: row.updated_at }));
  } catch (error) {
    logSyncError('listChatSessions', error);
    return [];
  }
}

export async function fetchSessionMessages(sessionId: string): Promise<StoredChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('plan_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      proposedPlan: row.proposed_plan_json ?? null,
      createdAtISO: row.created_at,
    }));
  } catch (error) {
    logSyncError('fetchSessionMessages', error);
    return [];
  }
}

export async function saveChatMessage(
  sessionId: string,
  role: ChatRole,
  content: string,
  proposedPlan?: PlanData | null
): Promise<void> {
  try {
    const { error: insertError } = await supabase.from('plan_chat_messages').insert({
      session_id: sessionId,
      role,
      content,
      proposed_plan_json: proposedPlan ?? null,
    });
    if (insertError) throw insertError;
    await supabase.from('plan_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
  } catch (error) {
    logSyncError('saveChatMessage', error);
  }
}

export async function pushFeelingRecord(record: FeelingRecord): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'feelingRecord', payload: record },
    () =>
      supabase.from('feeling_records').upsert({
        user_id: userId,
        client_id: record.id,
        logged_at: record.loggedAtISO,
        craving_level: record.cravingLevel,
        hunger_level: record.hungerLevel,
        mood: record.mood,
        workout_condition: record.workoutCondition,
        note: record.note || null,
      }, { onConflict: 'user_id,client_id' }),
    'pushFeelingRecord'
  );
}

export async function deleteFeelingRecord(recordId: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'feelingDelete', payload: { recordId } },
    () => {
      const q = supabase.from('feeling_records').delete().eq('user_id', userId);
      return recordId.startsWith(CLOUD_ROW) ? q.eq('id', recordId.slice(CLOUD_ROW.length)) : q.eq('client_id', recordId);
    },
    'deleteFeelingRecord'
  );
}

/** A client's own records, or (RLS-scoped) a client's records as seen by their coach. */
export async function fetchFeelingRecords(userId: string, sinceISO: string): Promise<FeelingRecord[]> {
  try {
    const { data, error } = await supabase
      .from('feeling_records')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', sinceISO)
      .order('logged_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      loggedAtISO: row.logged_at,
      cravingLevel: row.craving_level,
      hungerLevel: row.hunger_level,
      mood: row.mood as Mood,
      workoutCondition: row.workout_condition as WorkoutCondition | null,
      note: row.note ?? '',
    }));
  } catch (error) {
    logSyncError('fetchFeelingRecords', error);
    return [];
  }
}

/** Cached AI weekly suggestion for a given week, if one was already generated. */
export async function fetchWeeklySuggestion(userId: string, weekKey: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('weekly_suggestions')
      .select('suggestion_text')
      .eq('user_id', userId)
      .eq('week_key', weekKey)
      .maybeSingle();
    if (error) throw error;
    return data?.suggestion_text ?? null;
  } catch (error) {
    logSyncError('fetchWeeklySuggestion', error);
    return null;
  }
}

export async function pushWeeklySuggestion(weekKey: string, suggestionText: string): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase
      .from('weekly_suggestions')
      .upsert({ user_id: userId, week_key: weekKey, suggestion_text: suggestionText }, { onConflict: 'user_id,week_key' });
    if (error) throw error;
  } catch (error) {
    logSyncError('pushWeeklySuggestion', error);
  }
}

/** Calls the analyze-weekly-feelings edge function; requires ANTHROPIC_API_KEY to be configured server-side. */
export async function requestWeeklySuggestion(
  feelingRecords: FeelingRecord[],
  weekSummary: { avgCaloriesPerDay: number; totalWorkouts: number; weightChangeKg: number | null }
): Promise<{ ok: true; suggestion: string } | { ok: false; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-weekly-feelings', {
      body: {
        feelingRecords: feelingRecords.map((r) => ({
          loggedAtISO: r.loggedAtISO,
          cravingLevel: r.cravingLevel,
          hungerLevel: r.hungerLevel,
          mood: r.mood,
          workoutCondition: r.workoutCondition,
          note: r.note,
        })),
        weekSummary,
      },
    });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error };
    return { ok: true, suggestion: data.suggestion };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Cached alternative-dish suggestion for one meal slot — null if never generated (or not yet
 *  synced; the table is new, so a not-found error here is expected until schema.sql is re-run). */
export async function fetchMealRecipe(dayType: 'training' | 'rest', mealSlot: string): Promise<MealRecipeSuggestion | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('meal_recipe_suggestions')
      .select('dish_name, emoji, duration_minutes, difficulty, calories_kcal, protein_g, ingredients, steps, equipment, taste_note')
      .eq('user_id', userId)
      .eq('day_type', dayType)
      .eq('meal_slot', mealSlot)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      dishName: data.dish_name,
      emoji: data.emoji,
      durationMinutes: data.duration_minutes,
      difficulty: data.difficulty,
      caloriesKcal: data.calories_kcal,
      proteinG: data.protein_g,
      ingredients: data.ingredients ?? [],
      equipment: data.equipment ?? [],
      ...(data.taste_note ? { tasteNote: data.taste_note } : {}),
      steps: data.steps ?? [],
    };
  } catch (error) {
    logSyncError('fetchMealRecipe', error);
    return null;
  }
}

export async function pushMealRecipe(dayType: 'training' | 'rest', mealSlot: string, recipe: MealRecipeSuggestion): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('meal_recipe_suggestions').upsert(
      {
        user_id: userId,
        day_type: dayType,
        meal_slot: mealSlot,
        dish_name: recipe.dishName,
        emoji: recipe.emoji,
        duration_minutes: recipe.durationMinutes,
        difficulty: recipe.difficulty,
        calories_kcal: recipe.caloriesKcal,
        protein_g: recipe.proteinG,
        ingredients: recipe.ingredients,
        equipment: recipe.equipment ?? [],
        taste_note: recipe.tasteNote ?? null,
        steps: recipe.steps,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,day_type,meal_slot' }
    );
    if (error) throw error;
  } catch (error) {
    logSyncError('pushMealRecipe', error);
  }
}

/** Calls the generate-meal-recipe edge function; requires ANTHROPIC_API_KEY to be configured
 *  server-side. Does not write to the DB itself — the caller does that via pushMealRecipe once it
 *  decides to keep the suggestion (always, in practice, but keeps the same division as the other
 *  AI features: this function only talks to Claude). */
export async function requestMealRecipe(
  mealLabel: string,
  dayType: 'training' | 'rest',
  targetCalories: number,
  targetProtein: number,
  avoidDishNames?: string[],
  taste?: { favorites: string[]; dislikes: string[] }
): Promise<{ ok: true; recipe: MealRecipeSuggestion } | { ok: false; message: string }> {
  const off = aiTurnedOff();
  if (off) return off;
  try {
    const { data, error } = await supabase.functions.invoke('generate-meal-recipe', {
      body: { mealLabel, dayType, targetCalories, targetProtein, avoidDishNames, favorites: taste?.favorites, dislikes: taste?.dislikes },
    });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error };
    return { ok: true, recipe: data.recipe as MealRecipeSuggestion };
  } catch (error) {
    return { ok: false, message: await describeFunctionsError(error) };
  }
}

/** The recipe of one named dish (generate-meal-recipe with `dishName`), for a dish that was saved without one. The answer must be for that dish:
 *  a server that does not know `dishName` yet answers with a dish of its own, which is refused rather than saved under the wrong name. */
export async function requestDishRecipe(
  dishName: string,
  calories: number,
  proteinG: number,
  mealLabel: string
): Promise<{ ok: true; recipe: MealRecipeSuggestion } | { ok: false; message: string; kind: AiErrorKind | 'stale' }> {
  const off = aiTurnedOff();
  if (off) return off;
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('generate-meal-recipe', {
      body: { mealLabel, dayType: 'rest', targetCalories: Math.max(1, calories), targetProtein: Math.max(1, proteinG), dishName },
    });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    const recipe = data.recipe as MealRecipeSuggestion;
    if (!recipe || foodKey(recipe.dishName ?? '') !== foodKey(dishName)) return { ok: false, message: 'The server has not been updated to write a recipe for a named dish.', kind: 'stale' };
    return { ok: true, recipe };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

/** A non-2xx Edge Function response surfaces as a bare "non-2xx status code" FunctionsHttpError —
 *  the actual `{ error: "..." }` body (e.g. "chưa cấu hình ANTHROPIC_API_KEY") is on
 *  `error.context`, a Response, not on the caught error's `message`. Unwrap it when possible. */
async function describeFunctionsError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // context wasn't JSON — fall through to the generic message below.
    }
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

/** The AI's read of the day and what to do next, from the coach snapshot sent with the photo. */
export interface PhotoAdvice {
  verdict: 'on_track' | 'watch' | 'over';
  summary: string;
  nextSteps: string[];
  remainingKcalToEat?: number;
  remainingProteinG?: number;
  extraBurnKcal?: number;
  bossNote?: string;
}

export interface PhotoAnalysisResult {
  // Meal photos
  foodName?: string;
  estimatedCaloriesKcal?: number;
  estimatedProteinG?: number;
  estimatedWaterMl?: number;
  /** Meal photos with 2 or more foods: each food with its amount and figures (raw from the AI; cleaned with `partsFromComponents`). */
  components?: unknown[];
  estimatedPurineMg?: number;
  estimatedSugarG?: number;
  estimatedSaltG?: number;
  advice?: PhotoAdvice;
  /** The AI's own estimate (0-100) of how accurate the numbers are. */
  accuracyPercent?: number;
  // Workout photos
  activityName?: string;
  durationMin?: number;
  estimatedCaloriesBurned?: number;
  confidence?: 'low' | 'medium' | 'high';
  reasoning: string;
}

/** Why a photo analysis failed, so the UI can say something useful. Manual entry always keeps working. */
export type AiErrorKind = 'notConfigured' | 'offline' | 'unreachable' | 'auth' | 'quota' | 'disabled' | 'generic';

export type PhotoAnalysisOutcome =
  | { ok: true; result: PhotoAnalysisResult }
  | { ok: false; message: string; kind: AiErrorKind };

/** Maps an Edge Function failure to a kind. The server answers 500 with a message naming ANTHROPIC_API_KEY when the
 *  AI key is not configured yet, 401 when the session is not valid; a network failure never reaches the server. */
export function classifyAiError(message: string, status?: number): AiErrorKind {
  const text = message.toLowerCase();
  if (status === 429 || text.includes('hết lượt')) return 'quota';
  if (text.includes('tạm tắt') || text.includes('đã tắt')) return 'disabled';
  if (text.includes('anthropic_api_key') || text.includes('chưa cấu hình')) return 'notConfigured';
  if (status === 401 || text.includes('authorization') || text.includes('xác thực')) return 'auth';
  if (
    status === 0 ||
    text.includes('failed to send a request') ||
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('offline')
  ) {
    return 'offline';
  }
  return 'generic';
}

/** Calls the analyze-proof-photo edge function; requires ANTHROPIC_API_KEY to be configured server-side. The photo goes
 *  straight to the vision model (no OCR step) together with the user's body data so the estimate fits the person.
 *  `more` are extra photos of the same meal/session (up to 2), read together with the first as one result.
 *  The offline dev account never touches the network: it gets a clearly labelled simulated result. */
export async function requestPhotoAnalysis(
  taskType: 'meal' | 'workout',
  imageBase64: string,
  mediaType: string,
  context: { label?: string; plannedCalories?: number },
  profile?: BodyProfile,
  coach?: CoachContext,
  more: MealTextImage[] = []
): Promise<PhotoAnalysisOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, result: fakePhotoAnalysis(taskType, profile, coach) };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('analyze-proof-photo', {
      body: { taskType, imageBase64, mediaType, context, profile, coach, ...(more.length > 0 ? { images: more } : {}) },
    });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, result: data.result as PhotoAnalysisResult };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

export interface AiUsageRow {
  feature: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** What this account used of the AI today (per feature): calls, tokens and estimated dollars, from the server's own count.
 *  Null when it cannot be read (offline, dev account, not signed in). */
export async function fetchAiUsageToday(day: string): Promise<AiUsageRow[] | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('ai_usage').select('feature, calls, tokens_in, tokens_out, cost_usd').eq('user_id', userId).eq('day', day);
    if (error) throw error;
    // One row per feature and model: a day on which the model was changed is added up per feature.
    const byFeature = new Map<string, AiUsageRow>();
    for (const r of data ?? []) {
      const feature = String(r.feature);
      const t = byFeature.get(feature) ?? { feature, calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
      byFeature.set(feature, { feature, calls: t.calls + Number(r.calls ?? 0), tokensIn: t.tokensIn + Number(r.tokens_in ?? 0), tokensOut: t.tokensOut + Number(r.tokens_out ?? 0), costUsd: t.costUsd + Number(r.cost_usd ?? 0) });
    }
    return [...byFeature.values()];
  } catch (error) {
    logSyncError('fetchAiUsageToday', error);
    return null;
  }
}

/** Is this account on the server's list (`ai_admins`) allowed to see the app-wide "AI & cost" screen? Fails closed: any error
 *  (offline, not signed in, function missing) means no. */
export async function fetchIsAiAdmin(): Promise<boolean> {
  if (!currentUserId()) return false;
  try {
    const { data, error } = await supabase.rpc('is_ai_admin');
    if (error) throw error;
    return data === true;
  } catch (error) {
    logSyncError('fetchIsAiAdmin', error);
    return false;
  }
}

export interface AiDayTotal {
  day: string;
  users: number;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface AiUserTotal {
  userId: string;
  email: string | null;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** App-wide totals per day (admins only; the server refuses anybody else). Null when it cannot be read. */
export async function fetchAiAdminByDay(today: string, days = 14): Promise<AiDayTotal[] | null> {
  try {
    const { data, error } = await supabase.rpc('ai_admin_by_day', { p_today: today, p_days: days });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({ day: String(r.day), users: Number(r.users ?? 0), calls: Number(r.calls ?? 0), tokensIn: Number(r.tokens_in ?? 0), tokensOut: Number(r.tokens_out ?? 0), costUsd: Number(r.cost_usd ?? 0) }));
  } catch (error) {
    logSyncError('fetchAiAdminByDay', error);
    return null;
  }
}

export interface AiDayModelTotal extends AiDayTotal {
  model: string;
}

/** App-wide totals per day and model (admins only), at the cost recorded when each call was made. Null when it cannot be read. */
export async function fetchAiAdminByDayModel(today: string, days = 14): Promise<AiDayModelTotal[] | null> {
  try {
    const { data, error } = await supabase.rpc('ai_admin_by_day_model', { p_today: today, p_days: days });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({ day: String(r.day), model: String(r.model ?? ''), users: Number(r.users ?? 0), calls: Number(r.calls ?? 0), tokensIn: Number(r.tokens_in ?? 0), tokensOut: Number(r.tokens_out ?? 0), costUsd: Number(r.cost_usd ?? 0) }));
  } catch (error) {
    logSyncError('fetchAiAdminByDayModel', error);
    return null;
  }
}

/** One day split by user (admins only). Null when it cannot be read. */
export async function fetchAiAdminByUser(day: string): Promise<AiUserTotal[] | null> {
  try {
    const { data, error } = await supabase.rpc('ai_admin_by_user', { p_day: day });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({ userId: String(r.user_id), email: r.email ? String(r.email) : null, calls: Number(r.calls ?? 0), tokensIn: Number(r.tokens_in ?? 0), tokensOut: Number(r.tokens_out ?? 0), costUsd: Number(r.cost_usd ?? 0) }));
  } catch (error) {
    logSyncError('fetchAiAdminByUser', error);
    return null;
  }
}

export interface AiUserModelTotal {
  userId: string;
  model: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** One day split by user and model (admins only), at the cost recorded when each call was made. Null when it cannot be read. */
export async function fetchAiAdminByUserModel(day: string): Promise<AiUserModelTotal[] | null> {
  try {
    const { data, error } = await supabase.rpc('ai_admin_by_user_model', { p_day: day });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({ userId: String(r.user_id), model: String(r.model ?? ''), calls: Number(r.calls ?? 0), tokensIn: Number(r.tokens_in ?? 0), tokensOut: Number(r.tokens_out ?? 0), costUsd: Number(r.cost_usd ?? 0) }));
  } catch (error) {
    logSyncError('fetchAiAdminByUserModel', error);
    return null;
  }
}

/** The AI settings an admin chose (model and prices); a key that was never set (or was cleared) is absent. Null when they cannot be read. */
export async function fetchAiSettings(): Promise<Record<string, string> | null> {
  try {
    const { data, error } = await supabase.rpc('ai_admin_get_settings');
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r: Record<string, unknown>) => [String(r.key), String(r.value)]));
  } catch (error) {
    logSyncError('fetchAiSettings', error);
    return null;
  }
}

/** Saves one AI setting (admins only; the server checks and validates). An empty value clears it, back to the server's own setting. */
export async function saveAiSetting(key: 'model' | 'price_in' | 'price_out', value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.rpc('ai_admin_set_setting', { p_key: key, p_value: value });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    logSyncError('saveAiSetting', error);
    return { ok: false, message: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? 'Lỗi không xác định') };
  }
}

/** Classifies a failed AI request, for a device that the connectivity probe has just said is online. A request that "never reached
 *  the server" then is not the user's connection: the function is usually not deployed (the browser reports its 404 preflight as a
 *  network error), or the service is down. That is `unreachable`, with its own message, instead of a misleading "no network". */
function classifyReached(message: string, status?: number): AiErrorKind {
  const kind = classifyAiError(message, status);
  return kind === 'offline' ? 'unreachable' : kind;
}

/** The device switch (Profile) that turns every AI request off; nothing is sent while it is off. */
function aiTurnedOff(): { ok: false; message: string; kind: 'disabled' } | null {
  return useAiPhotoStore.getState().aiEnabled ? null : { ok: false, message: 'AI đã tắt trên thiết bị này.', kind: 'disabled' };
}

export type NutritionLabelOutcome = { ok: true; label: unknown } | { ok: false; message: string; kind: AiErrorKind };

/** Calls the read-nutrition-label edge function: a photo of the facts panel in, the printed numbers out (raw; the caller
 *  cleans them with `cleanLabel`). Same rules as the other AI requests: the device switch, the offline dev account (labelled
 *  simulated answer), offline fails softly, nothing is saved here. */
export async function requestNutritionLabel(imageBase64: string, mediaType: string): Promise<NutritionLabelOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, label: fakeNutritionLabel() };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('read-nutrition-label', { body: { imageBase64, mediaType } });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, label: data.result };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

export type SwapsOutcome = { ok: true; result: unknown } | { ok: false; message: string; kind: AiErrorKind };

export interface SwapRequestInput {
  item: SwapItem;
  context: SwapContext;
  /** What the day's limits are, for the AI to know the scale. */
  limits: { purine: number; salt: number; sugar: number };
  mealTime: string | null;
  /** Names of the foods the user eats most, so swaps fit their taste. */
  favorites: string[];
}

/** Calls the suggest-swap edge function: ideas to replace a food that breaks a limit. The answer is raw; the caller checks each
 *  swap with `cleanAiSwaps`. Same rules as the other AI requests (device switch, dev account simulated, offline fails softly). */
export async function requestSwaps(input: SwapRequestInput): Promise<SwapsOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, result: fakeSwaps(input.item, input.context) };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const body = { item: input.item, exceeded: input.context.exceeded, headroom: input.context.headroom, limits: input.limits, mealTime: input.mealTime ?? undefined, favorites: input.favorites };
    const { data, error } = await supabase.functions.invoke('suggest-swap', { body });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, result: data.result };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

/** One client's rows, as a coach can read them (row-level security: only the coach of that client), from `sinceKey` (YYYY-MM-DD)
 *  on. Null when anything cannot be read, so a half-loaded client is never summarised. */
export async function fetchClientRows(clientId: string, sinceKey: string): Promise<ClientRows | null> {
  if (!currentUserId()) return null;
  try {
    const [profile, plan, weights, nutrition, workouts] = await Promise.all([
      supabase
        .from('profiles')
        .select('start_weight_kg, water_target_ml, protein_target_g, age, gender, height_cm, activity_level, calorie_target_kcal, target_daily_deficit_kcal')
        .eq('id', clientId)
        .maybeSingle(),
      pullPlan(clientId),
      supabase.from('weight_entries').select('entry_date, weight_kg').eq('user_id', clientId).gte('entry_date', sinceKey),
      supabase.from('nutrition_logs').select('*').eq('user_id', clientId).gte('entry_date', sinceKey),
      supabase.from('workout_entries').select('id, entry_date, template_id, label, duration_min, calories_burned').eq('user_id', clientId).gte('entry_date', sinceKey),
    ]);
    for (const res of [profile, weights, nutrition, workouts]) if (res.error) throw res.error;
    return {
      profile: (profile.data as Record<string, unknown> | null) ?? null,
      plan: plan?.plan ?? DEFAULT_PLAN,
      weights: (weights.data ?? []) as ClientRows['weights'],
      nutrition: (nutrition.data ?? []) as ClientRows['nutrition'],
      workouts: (workouts.data ?? []) as ClientRows['workouts'],
    };
  } catch (error) {
    logSyncError('fetchClientRows', error);
    return null;
  }
}

export type DigestOutcome = { ok: true; result: unknown } | { ok: false; message: string; kind: AiErrorKind };

/** Calls the coach-digest edge function for up to 12 clients at once. `items` carry opaque keys (c1, c2...) and each client's
 *  week figures; the answer is raw, the caller reads it with `cleanDigest`. Same rules as the other AI requests. */
export async function requestDigest(items: { key: string; week: WeekInput }[], periodKey: string): Promise<DigestOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, result: fakeDigest(items) };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('coach-digest', { body: { clients: items, periodKey } });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, result: data.result };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

export type DinnerOutcome = { ok: true; result: unknown } | { ok: false; message: string; kind: AiErrorKind };

/** Calls the suggest-dinner edge function: dinner ideas for what is left of today (the brief is worked out on the device). The
 *  answer is raw; the caller checks each idea with `cleanAiDinner`. Same rules as the other AI requests. */
export async function requestDinner(brief: DinnerBrief, favorites: string[], avoidNames: string[] = []): Promise<DinnerOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, result: fakeDinner(brief) };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const body = { budgetKcal: brief.budgetKcal, proteinLeftG: brief.proteinLeftG, headroom: brief.headroom, limits: brief.limits, hour: brief.hour, meal: brief.meal, eatByHour: brief.eatByHour, exact: brief.exact, proteinExact: brief.proteinExact, strictKcal: brief.strictKcal, favorites, avoidNames };
    const { data, error } = await supabase.functions.invoke('suggest-dinner', { body });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, result: data.result };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

/** Adds meal ideas to the cook book shared by all users (a dish whose name is already there is left as it is). The server already
 *  stores every answer of suggest-dinner; this covers ideas shown before it did. Best effort: a failure is logged, never shown. */
export async function shareToCookbook(ideas: DinnerIdea[], meal: DinnerBrief['meal']): Promise<void> {
  const userId = currentUserId();
  if (!userId || ideas.length === 0) return;
  const rows = cookbookRows(ideas, meal, userId);
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from('cookbook_recipes').upsert(rows, { onConflict: 'name_key', ignoreDuplicates: true });
    if (error) throw error;
  } catch (error) {
    logSyncError('shareToCookbook', error);
  }
}

export type SharedCookbookOutcome = { ok: true; ideas: DinnerIdea[] } | { ok: false; kind: 'offline' | 'auth' | 'generic' };

/** Up to 3 dishes of the shared cook book that fit a meal (no AI, no quota): rows whose calories can fit the meal, matching the
 *  search text in the name, description or ingredients when there is one, newest first; then the meal's own check on the device (`pickShared`). */
export async function searchSharedCookbook(brief: DinnerBrief, query: string, skipNames: string[]): Promise<SharedCookbookOutcome> {
  if (!currentUserId()) return { ok: false, kind: 'auth' };
  if (!(await isOnline())) return { ok: false, kind: 'offline' };
  try {
    const maxKcal = Math.max(200, Math.ceil(brief.budgetKcal * 1.1));
    let request = supabase.from('cookbook_recipes').select(SHARED_COOKBOOK_COLUMNS).lte('calories', maxKcal);
    const q = cleanSearch(query);
    if (q) request = request.ilike('search_text', `%${q}%`);
    const { data, error } = await request.order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return { ok: true, ideas: pickShared(data ?? [], brief, skipNames) };
  } catch (error) {
    logSyncError('searchSharedCookbook', error);
    return { ok: false, kind: 'generic' };
  }
}

export type WeeklyReportOutcome =
  | { ok: true; report: unknown; cached: boolean; generatedAtISO?: string }
  | { ok: false; message: string; kind: AiErrorKind };

/** Asks the weekly-report function for the review of the week that starts on `periodKey`. The server returns the stored one
 *  (no AI call, no quota) unless `refresh` is true. The report is raw: the caller cleans it with `cleanReport`. */
export async function requestWeeklyReport(week: WeekInput, periodKey: string, refresh: boolean): Promise<WeeklyReportOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, report: fakeWeeklyReport(week), cached: false };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('weekly-report', { body: { week, periodKey, refresh } });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, report: data.report, cached: data.cached === true, generatedAtISO: typeof data.generatedAt === 'string' ? data.generatedAt : undefined };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

/** The stored weekly review of this account for a week, read straight from `ai_reports` (row-level security: own rows only).
 *  Null when there is none or it cannot be read. */
export async function fetchWeeklyReport(periodKey: string): Promise<{ report: unknown; generatedAtISO: string } | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('ai_reports').select('payload, created_at').eq('user_id', userId).eq('kind', 'weekly').eq('period_key', periodKey).maybeSingle();
    if (error) throw error;
    return data?.payload ? { report: data.payload, generatedAtISO: new Date(data.created_at).toISOString() } : null;
  } catch (error) {
    logSyncError('fetchWeeklyReport', error);
    return null;
  }
}

/** One food found in a typed/dictated sentence. */
export interface MealTextItem {
  name: string;
  caloriesKcal: number;
  proteinG: number;
  purineMg?: number;
  sugarG?: number;
  saltG?: number;
  accuracyPercent?: number;
}

export interface MealTextResult {
  items: MealTextItem[];
  mealTime?: string;
  advice?: PhotoAdvice;
  accuracyPercent?: number;
  reasoning: string;
}

export type MealTextOutcome = { ok: true; result: MealTextResult } | { ok: false; message: string; kind: AiErrorKind };

/** A photo attached to the sentence (a downscaled JPEG, base64 without the data: prefix). */
export interface MealTextImage {
  base64: string;
  mediaType: string;
}

/** Calls the parse-meal-text edge function: a sentence (and optionally up to 3 photos of the meal) in, one editable line per
 *  food out. Same rules as the photo analysis: the offline dev account gets a labelled simulated answer, offline fails softly,
 *  nothing is saved here. Without photos the request body is exactly the text-only one. */
export async function requestMealText(text: string, profile?: BodyProfile, coach?: CoachContext, images?: MealTextImage[]): Promise<MealTextOutcome> {
  const off = aiTurnedOff();
  if (off) return off;
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, result: fakeMealText(text, coach, images?.length ?? 0) };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const body = images && images.length > 0 ? { text, profile, coach, images } : { text, profile, coach };
    const { data, error } = await supabase.functions.invoke('parse-meal-text', { body });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, result: data.result as MealTextResult };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyReached(message, status) };
  }
}

/**
 * Replays every queued offline/failed write, in the order they were made. Each op is dequeued
 * before replay and re-enqueued by the underlying push* function if it fails again, so a still-
 * offline device just leaves the (fresh) queue entry in place rather than looping forever here.
 * Call this on app start and whenever connectivity is restored (see sync/syncQueue.ts's listener
 * wiring in app/_layout.tsx).
 */
let flushing: Promise<void> | null = null;

/** Sends every waiting write (one at a time; a second call while one runs waits for it instead of sending everything twice). */
export function flushSyncQueue(): Promise<void> {
  flushing ??= flushOnce().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function flushOnce(): Promise<void> {
  if (!(await isOnline())) return;
  const { pending, dequeue } = useSyncQueueStore.getState();
  for (const op of pending) {
    dequeue(op.id);
    switch (op.type) {
      case 'weightEntry':
        await pushWeightEntry(op.payload);
        break;
      case 'workoutEntry':
        await pushWorkoutEntry(op.payload);
        break;
      case 'nutritionLog': {
        // The day as it is on the device now, not the copy from when the write first failed; a day no longer here is not sent.
        const day = currentDay(op.payload.dateISO.slice(0, 10));
        if (day) await pushNutritionLog(day);
        break;
      }
      case 'weightDelete':
        await deleteWeightEntry(op.payload.entryId);
        break;
      case 'workoutDelete':
        await deleteWorkoutEntry(op.payload.entryId);
        break;
      case 'feelingDelete':
        await deleteFeelingRecord(op.payload.recordId);
        break;
      case 'proofPhoto':
        await pushProofPhoto(op.payload);
        break;
      case 'proofDelete':
        await deleteProofPhoto(op.payload.proofId);
        break;
      case 'plan':
        await pushPlan(op.payload.plan, op.payload.updatedAtISO, op.payload.targetUserId);
        break;
      case 'profile':
        await pushProfile(op.payload);
        break;
      case 'feelingRecord':
        await pushFeelingRecord(op.payload);
        break;
      case 'habit':
        await pushHabit(op.payload);
        break;
      case 'habitCheck':
        await pushHabitCheck(op.payload.habitId, op.payload.dateKey, op.payload.value);
        break;
      case 'uricReading':
        await pushUricReading(op.payload);
        break;
      case 'uricDelete':
        await deleteUricReading(op.payload.readingId);
        break;
      case 'userData':
        await pushUserData(op.payload.key, op.payload.value);
        break;
    }
  }
}
