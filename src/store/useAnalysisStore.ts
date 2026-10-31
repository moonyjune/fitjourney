import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { ANALYSIS_SCOPES, liveDays, type AnalysisMode, type AnalysisScope, type DayData, type DayStamp, type LiveDay } from '../insights/snapshot';
import { useNutritionStore } from './useNutritionStore';
import { usePlanStore } from './usePlanStore';
import { useWeightStore } from './useWeightStore';
import { useWorkoutStore } from './useWorkoutStore';

type Stamps = Record<string, DayStamp>;

interface AnalysisState {
  /** The user's choice (Analysis screen, top): saved to the cloud with their other settings. Auto by default. */
  mode: AnalysisMode;
  /** Per part of the Analysis screen: when each day was analysed and with which data. */
  scopes: Record<AnalysisScope, Stamps>;
  /** The data of each analysed day, by fingerprint (shared by the parts that analysed the same data). */
  data: Record<string, DayData>;
  /** When the diary was last brought in from the cloud for the Analysis screen. */
  pulledAtISO: string | null;
  /** When the AI weekly review was last refreshed automatically, by week start. */
  aiAutoAtISO: Record<string, string>;
  setMode: (mode: AnalysisMode) => void;
  /** Keeps the analysis in step with the diary: in auto mode every changed day is analysed again now; in manual mode only days
   *  never analysed are taken in (a changed day keeps its old analysis and shows as outdated). */
  sync: (live: Map<string, LiveDay>, now?: Date) => void;
  /** Analyses again the given days (all when omitted) of the given parts with the data as it is now. */
  refresh: (scopes: AnalysisScope[], dateKeys?: string[], now?: Date, live?: Map<string, LiveDay>) => void;
  markPulled: (now?: Date) => void;
  markAiAuto: (weekStart: string, now?: Date) => void;
}

const emptyScopes = (): Record<AnalysisScope, Stamps> => ({ overview: {}, periods: {}, move: {}, feedback: {} });

/** The diary as it is now on this device, by day. */
export function readLiveDays(): Map<string, LiveDay> {
  return liveDays(useNutritionStore.getState().logs, useWorkoutStore.getState().entries, useWeightStore.getState().entries, usePlanStore.getState().plan.mealTemplates);
}

/** Drops stored day data no part refers to any more. */
function prune(scopes: Record<AnalysisScope, Stamps>, data: Record<string, DayData>): Record<string, DayData> {
  const used = new Set<string>();
  for (const s of ANALYSIS_SCOPES) for (const st of Object.values(scopes[s] ?? {})) used.add(st.fp);
  const out: Record<string, DayData> = {};
  for (const fp of used) if (data[fp]) out[fp] = data[fp];
  return out;
}

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      mode: 'auto',
      scopes: emptyScopes(),
      data: {},
      pulledAtISO: null,
      aiAutoAtISO: {},
      setMode: (mode) => {
        set({ mode });
        pushUserData(USER_DATA_KEYS.analysisMode, { mode });
      },
      sync: (live, now = new Date()) => {
        const { mode, scopes, data } = get();
        const atISO = now.toISOString();
        let changed = false;
        const nextScopes = emptyScopes();
        const nextData = { ...data };
        for (const scope of ANALYSIS_SCOPES) {
          const stamps: Stamps = { ...(scopes[scope] ?? {}) };
          for (const [key, day] of live) {
            const old = stamps[key];
            if (old && (old.fp === day.fp || mode === 'manual')) continue;
            stamps[key] = { fp: day.fp, atISO };
            nextData[day.fp] = day.data;
            changed = true;
          }
          if (mode === 'auto') {
            for (const key of Object.keys(stamps)) {
              if (!live.has(key)) {
                delete stamps[key];
                changed = true;
              }
            }
          }
          nextScopes[scope] = stamps;
        }
        if (changed) set({ scopes: nextScopes, data: prune(nextScopes, nextData) });
      },
      refresh: (which, dateKeys, now = new Date(), live = readLiveDays()) => {
        const { scopes, data } = get();
        const atISO = now.toISOString();
        const nextScopes = { ...emptyScopes(), ...scopes };
        const nextData = { ...data };
        for (const scope of which) {
          const stamps: Stamps = { ...(scopes[scope] ?? {}) };
          const keys = dateKeys ?? [...new Set([...live.keys(), ...Object.keys(stamps)])];
          for (const key of keys) {
            const day = live.get(key);
            if (day) {
              stamps[key] = { fp: day.fp, atISO };
              nextData[day.fp] = day.data;
            } else delete stamps[key];
          }
          nextScopes[scope] = stamps;
        }
        set({ scopes: nextScopes, data: prune(nextScopes, nextData) });
      },
      markPulled: (now = new Date()) => set({ pulledAtISO: now.toISOString() }),
      markAiAuto: (weekStart, now = new Date()) => set((s) => ({ aiAutoAtISO: { ...s.aiAutoAtISO, [weekStart]: now.toISOString() } })),
    }),
    {
      name: 'analysis-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ mode: s.mode, scopes: s.scopes, data: s.data, aiAutoAtISO: s.aiAutoAtISO }),
    }
  )
);

/** Clears the analysis of the account on sign-out / account switch (the choice of mode goes back to the default too). */
export function resetAnalysisStore(): void {
  useAnalysisStore.setState({ mode: 'auto', scopes: emptyScopes(), data: {}, pulledAtISO: null, aiAutoAtISO: {} });
}
