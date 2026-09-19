import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { generateCoachCode } from '../utils/coachCode';
import type {
  CoachClientSummary,
  DailyNutritionLog,
  PlanData,
  ProofPhoto,
  UserRole,
  UserSettings,
  WeightEntry,
  WorkoutLogEntry,
} from '../types';

function currentUserId(): string | null {
  return useAuthStore.getState().session?.user.id ?? null;
}

function logSyncError(context: string, error: unknown) {
  // Best-effort sync: never block the local-first UX on a network/backend error.
  console.warn(`[cloudSync] ${context} failed:`, error);
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
  coachId: string | null;
  coachCode: string | null;
}

/** Returns the remote profile if onboarding was already completed on another device, else null. */
export async function pullProfile(): Promise<RemoteProfile | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    // Coaches never fill in weight/goal (they don't follow a plan themselves), so a coach role
    // alone is enough evidence that role-select + setup already happened on another device.
    const alreadyOnboarded = (data?.start_weight_kg != null && data?.goal_weight_kg != null) || data?.role === 'coach';
    if (!data || !alreadyOnboarded) return null;

    return {
      startWeightKg: data.start_weight_kg,
      goalWeightKg: data.goal_weight_kg,
      heightCm: data.height_cm,
      calorieTargetKcal: data.calorie_target_kcal ?? 1950,
      proteinTargetG: data.protein_target_g ?? 200,
      waterTargetMl: data.water_target_ml ?? 4500,
      startDateISO: data.start_date ? new Date(data.start_date).toISOString() : new Date().toISOString(),
      remindersEnabled: data.reminders_enabled ?? true,
      role: (data.role as UserRole) ?? 'client',
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
  try {
    const { error } = await supabase
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
      .eq('id', userId);
    if (error) throw error;
  } catch (error) {
    logSyncError('pushProfile', error);
  }
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
  try {
    const { error } = await supabase.from('weight_entries').insert({
      user_id: userId,
      entry_date: entry.dateISO.slice(0, 10),
      weight_kg: entry.weightKg,
      note: entry.note ?? null,
    });
    if (error) throw error;
  } catch (error) {
    logSyncError('pushWeightEntry', error);
  }
}

export async function pushWorkoutEntry(entry: WorkoutLogEntry): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('workout_entries').insert({
      user_id: userId,
      entry_date: entry.dateISO.slice(0, 10),
      template_id: entry.templateId,
      label: entry.label,
      duration_min: entry.durationMin,
      calories_burned: entry.caloriesBurned,
    });
    if (error) throw error;
  } catch (error) {
    logSyncError('pushWorkoutEntry', error);
  }
}

export async function pushNutritionLog(log: DailyNutritionLog): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('nutrition_logs').upsert(
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
    );
    if (error) throw error;
  } catch (error) {
    logSyncError('pushNutritionLog', error);
  }
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
  try {
    const { error } = await supabase
      .from('plans')
      .upsert({ user_id: userId, plan_json: plan, updated_at: updatedAtISO }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (error) {
    logSyncError('pushPlan', error);
  }
}

export async function pushProofPhoto(proof: ProofPhoto): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
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
  }
}
