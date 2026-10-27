import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

export interface AiEstimate {
  /** Calories the AI estimated. */
  ai: number;
  /** Calories the user saved in the end. */
  final: number;
}

/** How many past estimates are kept, and how many are needed before the figure is shown. */
export const CALIBRATION_KEEP = 100;
export const CALIBRATION_MIN = 5;

interface CalibrationState {
  estimates: AiEstimate[];
  /** Remembers one AI estimate next to what the user saved. Nonsense or zero values are ignored. */
  record: (ai: number, final: number) => void;
  clear: () => void;
}

/** Local-only memory of how far the AI's calorie estimates were from what the user finally saved, so the app can say how
 *  much to trust them ("usually off by ~X%"). Device-local: it never leaves the phone. */
export const useAiCalibrationStore = create<CalibrationState>()(
  persist(
    (set) => ({
      estimates: [],
      record: (ai, final) => {
        if (![ai, final].every((n) => Number.isFinite(n) && n > 0)) return;
        set((s) => ({ estimates: [...s.estimates, { ai, final }].slice(-CALIBRATION_KEEP) }));
      },
      clear: () => set({ estimates: [] }),
    }),
    { name: 'ai-calibration-store', storage: createJSONStorage(() => appStorage) }
  )
);

/** Median of |AI − final| / final as a whole percent over the kept estimates, or null until there are enough of them. */
export function calibrationSummary(estimates: AiEstimate[]): { pct: number; n: number } | null {
  if (estimates.length < CALIBRATION_MIN) return null;
  const errors = estimates.map((e) => Math.abs(e.ai - e.final) / e.final).sort((a, b) => a - b);
  const mid = Math.floor(errors.length / 2);
  const median = errors.length % 2 === 1 ? errors[mid] : (errors[mid - 1] + errors[mid]) / 2;
  return { pct: Math.round(median * 100), n: estimates.length };
}
