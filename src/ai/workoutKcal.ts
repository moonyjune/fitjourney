import { useCallback, useEffect, useRef, useState } from 'react';
import { requestWorkoutKcal, WORKOUT_KCAL_EMPTY, type AiErrorKind, type WorkoutKcalInput } from '../sync/cloudSync';
import type { WorkoutKcalEstimate } from '../../supabase/functions/_shared/workoutKcal';
import { buildBodyProfile, type BodyProfile } from './bodyProfile';

/** Why no request was sent / no estimate came back, besides the shared AI failures. */
export type WorkoutKcalProblem = 'noLabel' | 'noWeight' | 'noKcal';

/** The request for the workout form's "AI estimate kcal" button: the name field as the description, the typed minutes when they
 *  are a positive number, and the body profile (latest weigh-in, height, age, gender). A problem instead when there is nothing
 *  to describe or no weight to work from (the model is never left to guess a weight). */
export function buildWorkoutKcalInput(
  label: string,
  durationText: string,
  profile: BodyProfile = buildBodyProfile()
): WorkoutKcalInput | { problem: WorkoutKcalProblem } {
  const description = label.trim();
  if (!description) return { problem: 'noLabel' };
  const { weightKg } = profile;
  if (weightKg === undefined) return { problem: 'noWeight' };
  const minutes = parseFloat(durationText.replace(',', '.'));
  return { description, ...(minutes > 0 ? { durationMin: minutes } : {}), profile: { ...profile, weightKg } };
}

type KcalFailure = { problem: WorkoutKcalProblem } | { kind: AiErrorKind; message: string };

/** One estimate at a time for the workout form; never throws, saves nothing. `error` is either one of this feature's problems
 *  or a shared AI failure (shown with `useAiErrorText`). */
export function useWorkoutKcalEstimate() {
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<KcalFailure | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const estimate = useCallback(async (label: string, durationText: string): Promise<WorkoutKcalEstimate | null> => {
    if (busy.current) return null;
    const input = buildWorkoutKcalInput(label, durationText);
    if ('problem' in input) {
      setError({ problem: input.problem });
      return null;
    }
    busy.current = true;
    setEstimating(true);
    setError(null);
    try {
      const outcome = await requestWorkoutKcal(input);
      if (!mounted.current) return null;
      if (outcome.ok) return outcome.result;
      setError(outcome.message === WORKOUT_KCAL_EMPTY ? { problem: 'noKcal' } : { kind: outcome.kind, message: outcome.message });
      return null;
    } catch (e) {
      if (mounted.current) setError({ kind: 'generic', message: e instanceof Error ? e.message : 'Unknown error' });
      return null;
    } finally {
      busy.current = false;
      if (mounted.current) setEstimating(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { estimate, reset, estimating, error };
}
