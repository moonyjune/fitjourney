import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import type { BodyProfile } from '../ai/bodyProfile';
import { DEV_ANALYSIS_DELAY_MS, fakePhotoAnalysis } from '../ai/devPhotoAnalysis';
import { generateCoachCode } from '../utils/coachCode';
import { DEFAULT_TARGET_DAILY_DEFICIT_KCAL } from '../utils/tdee';
import { isOnline, useSyncQueueStore, type SyncOp } from './syncQueue';
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

function currentUserId(): string | null {
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
      supabase.from('workout_entries').upsert(
        {
          user_id: userId,
          client_id: entry.id,
          entry_date: entry.dateISO.slice(0, 10),
          template_id: entry.templateId,
          label: entry.label,
          duration_min: entry.durationMin,
          calories_burned: entry.caloriesBurned,
        },
        { onConflict: 'user_id,client_id' }
      ),
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
          extra_items: log.extraItems,
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

/** Cached alternative-dish suggestion for one meal slot — null if never generated (or not yet
 *  synced; the table is new, so a not-found error here is expected until schema.sql is re-run). */
export async function fetchMealRecipe(dayType: 'training' | 'rest', mealSlot: string): Promise<MealRecipeSuggestion | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('meal_recipe_suggestions')
      .select('dish_name, emoji, duration_minutes, difficulty, calories_kcal, protein_g, ingredients, steps')
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
  avoidDishNames?: string[]
): Promise<{ ok: true; recipe: MealRecipeSuggestion } | { ok: false; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-meal-recipe', {
      body: { mealLabel, dayType, targetCalories, targetProtein, avoidDishNames },
    });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error };
    return { ok: true, recipe: data.recipe as MealRecipeSuggestion };
  } catch (error) {
    return { ok: false, message: await describeFunctionsError(error) };
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

export interface PhotoAnalysisResult {
  // Meal photos
  foodName?: string;
  estimatedCaloriesKcal?: number;
  estimatedProteinG?: number;
  estimatedWaterMl?: number;
  // Workout photos
  activityName?: string;
  durationMin?: number;
  estimatedCaloriesBurned?: number;
  confidence?: 'low' | 'medium' | 'high';
  reasoning: string;
}

/** Why a photo analysis failed, so the UI can say something useful. Manual entry always keeps working. */
export type AiErrorKind = 'notConfigured' | 'offline' | 'auth' | 'generic';

export type PhotoAnalysisOutcome =
  | { ok: true; result: PhotoAnalysisResult }
  | { ok: false; message: string; kind: AiErrorKind };

/** Maps an Edge Function failure to a kind. The server answers 500 with a message naming ANTHROPIC_API_KEY when the
 *  AI key is not configured yet, 401 when the session is not valid; a network failure never reaches the server. */
export function classifyAiError(message: string, status?: number): AiErrorKind {
  const text = message.toLowerCase();
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
 *  The offline dev account never touches the network: it gets a clearly labelled simulated result. */
export async function requestPhotoAnalysis(
  taskType: 'meal' | 'workout',
  imageBase64: string,
  mediaType: string,
  context: { label?: string; plannedCalories?: number },
  profile?: BodyProfile
): Promise<PhotoAnalysisOutcome> {
  if (useAuthStore.getState().devMode) {
    await new Promise((resolve) => setTimeout(resolve, DEV_ANALYSIS_DELAY_MS));
    return { ok: true, result: fakePhotoAnalysis(taskType, profile) };
  }
  if (!(await isOnline())) return { ok: false, message: 'Offline', kind: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('analyze-proof-photo', {
      body: { taskType, imageBase64, mediaType, context, profile },
    });
    if (error) throw error;
    if (data?.error) return { ok: false, message: data.error, kind: classifyAiError(String(data.error)) };
    return { ok: true, result: data.result as PhotoAnalysisResult };
  } catch (error) {
    const message = await describeFunctionsError(error);
    const status = (error as { context?: unknown })?.context instanceof Response ? ((error as { context: Response }).context.status) : undefined;
    return { ok: false, message, kind: classifyAiError(message, status) };
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
