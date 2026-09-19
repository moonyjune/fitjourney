import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import type { DailyNutritionLog, ProofPhoto, UserSettings, WeightEntry, WorkoutLogEntry } from '../types';

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
}

/** Returns the remote profile if onboarding was already completed on another device, else null. */
export async function pullProfile(): Promise<RemoteProfile | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    if (!data || data.start_weight_kg == null || data.goal_weight_kg == null) return null;

    return {
      startWeightKg: data.start_weight_kg,
      goalWeightKg: data.goal_weight_kg,
      heightCm: data.height_cm,
      calorieTargetKcal: data.calorie_target_kcal ?? 1950,
      proteinTargetG: data.protein_target_g ?? 200,
      waterTargetMl: data.water_target_ml ?? 4500,
      startDateISO: data.start_date ? new Date(data.start_date).toISOString() : new Date().toISOString(),
      remindersEnabled: data.reminders_enabled ?? true,
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
    const { error } = await supabase.from('profiles').update({
      start_weight_kg: settings.startWeightKg,
      goal_weight_kg: settings.goalWeightKg,
      height_cm: settings.heightCm,
      calorie_target_kcal: settings.calorieTargetKcal,
      protein_target_g: settings.proteinTargetG,
      water_target_ml: settings.waterTargetMl,
      start_date: settings.startDateISO.slice(0, 10),
      reminders_enabled: settings.remindersEnabled,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    if (error) throw error;
  } catch (error) {
    logSyncError('pushProfile', error);
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
