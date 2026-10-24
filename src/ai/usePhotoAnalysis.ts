import { useCallback, useEffect, useRef, useState } from 'react';
import { requestPhotoAnalysis, type AiErrorKind, type PhotoAnalysisResult } from '../sync/cloudSync';
import { useGameText, type GameKey } from '../game/strings';
import { imageUriToBase64 } from '../utils/photoStorage';
import { buildBodyProfile } from './bodyProfile';

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface AnalysisFailure {
  kind: AiErrorKind;
  message: string;
}

interface AnalysisContext {
  label?: string;
  plannedCalories?: number;
}

/** Sends one photo to the vision API (together with the user's body data) and keeps the outcome. Shared by every screen
 *  with an "analyze with AI" button. A second call while one is running is ignored. It never throws: a failure is just
 *  `status: 'error'`, and the caller's manual inputs keep working. Nothing is saved here. */
export function usePhotoAnalysis(taskType: 'meal' | 'workout', context: AnalysisContext = {}) {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<PhotoAnalysisResult | null>(null);
  const [error, setError] = useState<AnalysisFailure | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const analyze = useCallback(
    async (uri: string): Promise<PhotoAnalysisResult | null> => {
      if (busy.current) return null;
      busy.current = true;
      setStatus('analyzing');
      setError(null);
      try {
        const { base64, mediaType } = await imageUriToBase64(uri);
        const outcome = await requestPhotoAnalysis(taskType, base64, mediaType, contextRef.current, buildBodyProfile());
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
    },
    [taskType]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return { analyze, reset, status, result, error, analyzing: status === 'analyzing' };
}

/** The short, friendly sentence for a failure kind, in the app language. */
export function useAiErrorText() {
  const g = useGameText();
  return useCallback((kind: AiErrorKind) => g(`ai.err.${kind}` as GameKey), [g]);
}

/** "Confidence: medium" in the app language, or null when the AI gave none. */
export function useConfidenceText() {
  const g = useGameText();
  return useCallback(
    (confidence: PhotoAnalysisResult['confidence']) =>
      confidence ? g('ai.confidence', { level: g(`ai.confidence.${confidence}` as GameKey) }) : null,
    [g]
  );
}
