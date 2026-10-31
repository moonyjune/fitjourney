import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { WeeklyReport } from '../ai/weeklyReport';

export interface StoredReport {
  report: WeeklyReport;
  /** When it was written. The numbers beside it on screen are always current; the text is as of this time. */
  generatedAtISO: string;
  /** Fingerprint of the week's data it was written from (`weekInputFingerprint`). Absent on reviews from before this field, or fetched
   *  from another device: those count as possibly outdated. */
  dataFp?: string;
}

/** How many weeks of reviews are kept on the device. */
export const REPORTS_KEEP = 8;

interface ReportState {
  /** Weekly reviews by week start (Monday, YYYY-MM-DD). */
  weekly: Record<string, StoredReport>;
  saveWeekly: (periodKey: string, report: WeeklyReport, generatedAtISO?: string, dataFp?: string) => void;
}

/** Weekly AI reviews kept on the device so they open offline, and so the dev account (no cloud) keeps them. The server keeps
 *  its own copy per week; this one is cleared on sign-out with the rest of the account's data. */
export const useAiReportStore = create<ReportState>()(
  persist(
    (set) => ({
      weekly: {},
      saveWeekly: (periodKey, report, generatedAtISO = new Date().toISOString(), dataFp) =>
        set((s) => {
          const next = { ...s.weekly, [periodKey]: dataFp ? { report, generatedAtISO, dataFp } : { report, generatedAtISO } };
          const keys = Object.keys(next).sort();
          for (const old of keys.slice(0, Math.max(0, keys.length - REPORTS_KEEP))) delete next[old];
          return { weekly: next };
        }),
    }),
    { name: 'ai-report-store', storage: createJSONStorage(() => appStorage) }
  )
);
