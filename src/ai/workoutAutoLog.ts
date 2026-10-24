import type { PhotoAnalysisResult } from '../sync/cloudSync';
import { aiNumberText } from './useAiFields';

export interface WorkoutValues {
  label: string;
  durationMin: number;
  caloriesBurned: number;
}

/** What the user has typed in the form before the photo arrived; those values always win over the AI's. */
export interface TypedWorkoutValues {
  label?: string;
  durationMin?: number;
  caloriesBurned?: number;
}

export type AutoLogDecision =
  | { ok: true; values: WorkoutValues }
  /** `incomplete`: no minutes or no calories; `lowConfidence`: the AI says it is not sure. Either way: don't log by
   *  itself, fill the form and let the user check it. */
  | { ok: false; reason: 'incomplete' | 'lowConfidence' };

const positive = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Decides whether a workout photo analysis is trustworthy enough to log the workout without asking.
 *  Safety rules: never when the AI reports low confidence, never without minutes AND calories (from the user's own typing
 *  or from the AI). A missing name is not a blocker: the typed name, else the AI's activity, else `fallbackLabel`. */
export function decideWorkoutAutoLog(result: PhotoAnalysisResult, typed: TypedWorkoutValues, fallbackLabel: string): AutoLogDecision {
  if (result.confidence === 'low') return { ok: false, reason: 'lowConfidence' };
  const durationMin = typed.durationMin ?? Number(aiNumberText(result.durationMin, 1));
  const caloriesBurned = typed.caloriesBurned ?? Number(aiNumberText(result.estimatedCaloriesBurned));
  if (!positive(durationMin) || !positive(caloriesBurned)) return { ok: false, reason: 'incomplete' };
  const label = typed.label?.trim() || result.activityName?.trim() || fallbackLabel;
  return { ok: true, values: { label, durationMin, caloriesBurned } };
}
