import { useEffect } from 'react';
import { useAiReportStore } from '../store/useAiReportStore';
import { useAnalysisStore } from '../store/useAnalysisStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { requestWeeklyReport } from '../sync/cloudSync';
import { buildWeeklyReportInput, cleanReport, weekInputFingerprint } from './weeklyReport';

/** Wait this long after the last change before asking the AI again, so a burst of edits makes one call. */
export const AI_AUTO_DEBOUNCE_MS = 2 * 60_000;
/** At most one automatic rewrite of a week's review this often (a failed try counts too, so an outage is not retried in a loop). */
export const AI_AUTO_MIN_GAP_MS = 30 * 60_000;

/** When the wait for the next automatic rewrite of a week's review ends, from now. */
export function autoRefreshDelay(nowMs: number, lastAutoISO: string | undefined): number {
  const sinceLast = lastAutoISO ? nowMs - new Date(lastAutoISO).getTime() : Infinity;
  return Math.max(AI_AUTO_DEBOUNCE_MS, AI_AUTO_MIN_GAP_MS - sinceLast);
}

/** In auto mode, rewrites this week's AI review when the week's data changed after it was written: only a week that already has a
 *  review (making the first one stays the user's choice), only this week (the only one the review covers), debounced and spaced out
 *  (see the constants above). Manual mode never calls the AI by itself. */
export function useWeeklyReportAutoRefresh(enabled: boolean): void {
  const mode = useAnalysisStore((s) => s.mode);
  const logs = useNutritionStore((s) => s.logs);
  const workouts = useWorkoutStore((s) => s.entries);
  const weights = useWeightStore((s) => s.entries);
  const weekly = useAiReportStore((s) => s.weekly);

  useEffect(() => {
    if (!enabled || mode !== 'auto') return;
    const input = buildWeeklyReportInput(new Date());
    const period = input.week.start;
    const stored = weekly[period];
    if (!stored || input.patterns.daysLogged === 0 || stored.dataFp === weekInputFingerprint(input)) return;
    const wait = autoRefreshDelay(Date.now(), useAnalysisStore.getState().aiAutoAtISO[period]);
    const timer = setTimeout(async () => {
      const fresh = buildWeeklyReportInput(new Date());
      const fp = weekInputFingerprint(fresh);
      const current = useAiReportStore.getState().weekly[period];
      if (fresh.week.start !== period || !current || current.dataFp === fp || useAnalysisStore.getState().mode !== 'auto') return;
      useAnalysisStore.getState().markAiAuto(period);
      const outcome = await requestWeeklyReport(fresh, period, true);
      if (!outcome.ok) return;
      const clean = cleanReport(outcome.report);
      if (clean) useAiReportStore.getState().saveWeekly(period, clean, outcome.generatedAtISO, outcome.cached ? undefined : fp);
    }, wait);
    return () => clearTimeout(timer);
  }, [enabled, mode, logs, workouts, weights, weekly]);
}

/** Mounts the automatic rewrite of the weekly review for the signed-in user (renders nothing). */
export function WeeklyReportAutoRefresh({ enabled }: { enabled: boolean }): null {
  useWeeklyReportAutoRefresh(enabled);
  return null;
}
