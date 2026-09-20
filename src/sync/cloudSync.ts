import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { generateCoachCode } from '../utils/coachCode';
import { isOnline, useSyncQueueStore, type SyncOp } from './syncQueue';
import type {
  ChatRole,
  ChatSessionSummary,
  CoachClientSummary,
  CoachFeedback,
  DailyNutritionLog,
  FeedbackPeriodType,
  FeelingRecord,
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

function currentUserId(): string | null {
  return useAuthStore.getState().session?.user.id ?? null;
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
  op: Omit<SyncOp, 'id'>,
  attempt: () => PromiseLike<{ error: unknown }>,
  context: string
): Promise<void> {
  if (!(await isOnline())) {
    useSyncQueueStore.getState().enqueue(op);
    return;
  }
  try {
    const { error } = await attempt();
    if (error) throw error;
  } catch (error) {
    logSyncError(context, error);
    useSyncQueueStore.getState().enqueue(op);
  }
}

export interface RemoteProfile {
  startWeightKg: number;
  goalWeightKg: number;
  heightCm: number | null;
  calorieTargetKcal: number;
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

    return {
      startWeightKg: data.start_weight_kg ?? 110,
      goalWeightKg: data.goal_weight_kg ?? 95,
      heightCm: data.height_cm,
      calorieTargetKcal: data.calorie_target_kcal ?? 1950,
      proteinTargetG: data.protein_target_g ?? 200,
      waterTargetMl: data.water_target_ml ?? 4500,
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
          calorie_target_kcal: settings.calorieTargetKcal,
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

/** Generates a unique coach code and saves it to the caller's own profile (retries once on collision). */
export async function ensureCoachCode(): Promise<string | null> {
  const userId = currentUserId();
  if (!userId) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCoachCode();
    const { error } = await supabase.from('profiles').update({ role: 'coach', coach_code: code }).eq('id', userId);
    if (!error) return code;
    // 23505 = unique_violation (rare code collision) — try again with a new code.
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
      supabase.from('weight_entries').insert({
        user_id: userId,
        entry_date: entry.dateISO.slice(0, 10),
        weight_kg: entry.weightKg,
        note: entry.note ?? null,
      }),
    'pushWeightEntry'
  );
}

export async function pushWorkoutEntry(entry: WorkoutLogEntry): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'workoutEntry', payload: entry },
    () =>
      supabase.from('workout_entries').insert({
        user_id: userId,
        entry_date: entry.dateISO.slice(0, 10),
        template_id: entry.templateId,
        label: entry.label,
        duration_min: entry.durationMin,
        calories_burned: entry.caloriesBurned,
      }),
    'pushWorkoutEntry'
  );
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
          water_ml: log.waterMl,
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

export async function pushPlan(plan: PlanData, updatedAtISO: string, targetUserId?: string): Promise<void> {
  const userId = targetUserId ?? currentUserId();
  if (!userId) return;
  await pushOrQueue(
    { type: 'plan', payload: { plan, updatedAtISO, targetUserId } },
    () => supabase.from('plans').upsert({ user_id: userId, plan_json: plan, updated_at: updatedAtISO }, { onConflict: 'user_id' }),
    'pushPlan'
  );
}

export async function pushProofPhoto(proof: ProofPhoto): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  if (!(await isOnline())) {
    useSyncQueueStore.getState().enqueue({ type: 'proofPhoto', payload: proof });
    return;
  }
  try {
    const extension = proof.photoUri.split('.').pop()?.split('?')[0] || 'jpg';
    const storagePath = `${userId}/${proof.id}.${extension}`;

    const response = await fetch(proof.photoUri);
    const blob = await response.blob();
    const { error: uploadError } = await supabase.storage
      .from('proofs')
      .upload(storagePath, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from('proof_photos').insert({
      user_id: userId,
      entry_date: proof.dateISO.slice(0, 10),
      task_type: proof.taskType,
      task_ref_id: proof.taskRefId,
      photo_path: storagePath,
      note: proof.note || null,
    });
    if (insertError) throw insertError;
  } catch (error) {
    logSyncError('pushProofPhoto', error);
    useSyncQueueStore.getState().enqueue({ type: 'proofPhoto', payload: proof });
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
      supabase.from('feeling_records').insert({
        user_id: userId,
        logged_at: record.loggedAtISO,
        craving_level: record.cravingLevel,
        hunger_level: record.hungerLevel,
        mood: record.mood,
        workout_condition: record.workoutCondition,
        note: record.note || null,
      }),
    'pushFeelingRecord'
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

/**
 * Replays every queued offline/failed write, in the order they were made. Each op is dequeued
 * before replay and re-enqueued by the underlying push* function if it fails again, so a still-
 * offline device just leaves the (fresh) queue entry in place rather than looping forever here.
 * Call this on app start and whenever connectivity is restored (see sync/syncQueue.ts's listener
 * wiring in app/_layout.tsx).
 */
export async function flushSyncQueue(): Promise<void> {
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
      case 'nutritionLog':
        await pushNutritionLog(op.payload);
        break;
      case 'proofPhoto':
        await pushProofPhoto(op.payload);
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
    }
  }
}
