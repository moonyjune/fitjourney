import { useCallback, useEffect, useRef, useState } from 'react';
import { requestNutritionLabel } from '../sync/cloudSync';
import { AI_FULL_HD_EDGE_PX, imageUriToBase64 } from '../utils/photoStorage';
import { cleanLabel, type NutritionLabel } from './nutritionLabel';
import type { AnalysisFailure, AnalysisStatus } from './usePhotoAnalysis';

/** Labels hold small print, so the photo is always sent at the larger size (1920 px), whatever the Full HD switch says. */
export function useLabelReading() {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [label, setLabel] = useState<NutritionLabel | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [error, setError] = useState<AnalysisFailure | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = useCallback(async (uri: string): Promise<NutritionLabel | null> => {
    if (busy.current) return null;
    busy.current = true;
    setStatus('analyzing');
    setError(null);
    setUnreadable(false);
    try {
      const { base64, mediaType } = await imageUriToBase64(uri, { maxEdge: AI_FULL_HD_EDGE_PX });
      const outcome = await requestNutritionLabel(base64, mediaType);
      if (!outcome.ok) {
        if (mounted.current) {
          setError({ kind: outcome.kind, message: outcome.message });
          setStatus('error');
        }
        return null;
      }
      const cleaned = cleanLabel(outcome.label);
      if (!mounted.current) return cleaned;
      if (!cleaned) {
        setUnreadable(true);
        setStatus('error');
        return null;
      }
      setLabel(cleaned);
      setStatus('done');
      return cleaned;
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
    setLabel(null);
    setUnreadable(false);
    setError(null);
  }, []);

  return { read, reset, status, label, unreadable, error, reading: status === 'analyzing' };
}
