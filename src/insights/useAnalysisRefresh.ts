import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readLiveDays, useAnalysisStore } from '../store/useAnalysisStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { restoreOwnData } from '../sync/restore';
import { addDaysToKey } from './dateMath';
import { liveDays, type AnalysisScope } from './snapshot';

/** In auto mode the Analysis screen brings in what was logged elsewhere (another device, the coach) when it opens, at most this often. */
export const AUTO_PULL_EVERY_MS = 5 * 60_000;

/** Every day from `fromKey` to `toKey`. */
export function daysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let d = fromKey; d <= toKey; d = addDaysToKey(d, 1)) out.push(d);
  return out;
}

/** Brings in the latest diary from the cloud, then analyses again the given days (all when omitted) of the given parts. Resolves
 *  with whether the cloud could be read (when not, the analysis is still redone with what is on this device). */
export async function reanalyse(scopes: AnalysisScope[], dateKeys?: string[]): Promise<boolean> {
  let ok = false;
  try {
    ok = (await restoreOwnData()).ok;
  } catch {
    ok = false;
  }
  useAnalysisStore.getState().markPulled();
  useAnalysisStore.getState().refresh(scopes, dateKeys, new Date(), readLiveDays());
  return ok;
}

/** Keeps the Analysis screen's stored analysis in step with the diary while it is open (see `useAnalysisStore.sync`), and in auto
 *  mode brings in the cloud's diary when it opens so food logged on another device is analysed too. */
export function useAnalysisSync(): void {
  const logs = useNutritionStore((s) => s.logs);
  const workouts = useWorkoutStore((s) => s.entries);
  const weights = useWeightStore((s) => s.entries);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const mode = useAnalysisStore((s) => s.mode);
  const live = useMemo(() => liveDays(logs, workouts, weights, mealTemplates), [logs, workouts, weights, mealTemplates]);
  useEffect(() => {
    useAnalysisStore.getState().sync(live);
  }, [live, mode]);

  useEffect(() => {
    if (mode !== 'auto') return;
    const pulled = useAnalysisStore.getState().pulledAtISO;
    if (pulled && Date.now() - new Date(pulled).getTime() < AUTO_PULL_EVERY_MS) return;
    useAnalysisStore.getState().markPulled();
    restoreOwnData().catch(() => undefined);
  }, [mode]);
}

export type RefreshState = { state: 'busy' } | { state: 'done' | 'local'; atISO: string } | null;

/** A "analyse again" button's state: busy while the cloud is read, then whether it could be (with the time). */
export function useReanalyse(): { run: (scopes: AnalysisScope[], dateKeys?: string[]) => void; result: RefreshState } {
  const [result, setResult] = useState<RefreshState>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = useCallback((scopes: AnalysisScope[], dateKeys?: string[]) => {
    setResult({ state: 'busy' });
    reanalyse(scopes, dateKeys).then((ok) => {
      if (alive.current) setResult({ state: ok ? 'done' : 'local', atISO: new Date().toISOString() });
    });
  }, []);
  return { run, result };
}
