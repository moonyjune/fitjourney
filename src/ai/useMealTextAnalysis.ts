import { useCallback, useEffect, useRef, useState } from 'react';
import { requestMealText, type MealTextResult } from '../sync/cloudSync';
import { buildBodyProfile } from './bodyProfile';
import { buildCoachContext, type CoachContext } from './coachContext';
import type { AnalysisFailure, AnalysisStatus } from './usePhotoAnalysis';

/** Sends one typed/dictated sentence to the text parser (with the user's body data and the coach snapshot) and keeps the
 *  outcome. One request at a time; never throws; nothing is saved here. */
export function useMealTextAnalysis() {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<MealTextResult | null>(null);
  const [error, setError] = useState<AnalysisFailure | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const analyze = useCallback(async (text: string): Promise<MealTextResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    setStatus('analyzing');
    setError(null);
    try {
      let coach: CoachContext | undefined;
      try {
        coach = buildCoachContext();
      } catch {
        coach = undefined; // advice is a bonus: never block the parsing on it
      }
      const outcome = await requestMealText(text, buildBodyProfile(), coach);
      if (!mounted.current) return outcome.ok ? outcome.result : null;
      if (!outcome.ok) {
        setError({ kind: outcome.kind, message: outcome.message });
        setStatus('error');
        return null;
      }
      setResult(outcome.result);
      setStatus('done');
      return outcome.result;
    } catch (e) {
      if (mounted.current) {
        setError({ kind: 'generic', message: e instanceof Error ? e.message : 'Unknown error' });
        setStatus('error');
      }
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return { analyze, reset, status, result, error, analyzing: status === 'analyzing' };
}
