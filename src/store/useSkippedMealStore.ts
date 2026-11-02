import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

/** Days kept: a skip older than this no longer matters to any colour. */
const KEEP_DAYS = 400;

/** Date key (YYYY-MM-DD) → ids of the meals skipped on purpose that day (a normal day's `breakfast` / `lunch` / `dinner`, or a fasting
 *  plan's slot ids). */
export type SkippedMeals = Record<string, string[]>;

interface SkippedMealState {
  days: SkippedMeals;
  isSkipped: (dateKey: string, mealId: string) => boolean;
  /** Marks the meal as skipped that day, or un-marks it when it already is. */
  toggle: (dateKey: string, mealId: string) => void;
}

/** Valid date keys only, each with its unique non-empty ids; empty days dropped; the newest KEEP_DAYS days kept. */
export function cleanSkippedMeals(value: unknown): SkippedMeals {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: SkippedMeals = {};
  const keys = Object.keys(value)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort()
    .reverse()
    .slice(0, KEEP_DAYS);
  for (const k of keys) {
    const ids = (value as Record<string, unknown>)[k];
    if (!Array.isArray(ids)) continue;
    const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort();
    if (clean.length > 0) out[k] = clean;
  }
  return out;
}

/** Both sides joined: a meal skipped on another device is skipped here too (the same rule as cheat days). */
export function mergeSkippedMeals(a: SkippedMeals, b: SkippedMeals): SkippedMeals {
  const joined: Record<string, string[]> = { ...a };
  for (const [k, ids] of Object.entries(b)) joined[k] = [...(joined[k] ?? []), ...ids];
  return cleanSkippedMeals(joined);
}

export const useSkippedMealStore = create<SkippedMealState>()(
  persist(
    (set, get) => ({
      days: {},
      isSkipped: (dateKey, mealId) => (get().days[dateKey] ?? []).includes(mealId),
      toggle: (dateKey, mealId) => {
        const current = get().days[dateKey] ?? [];
        const nextIds = current.includes(mealId) ? current.filter((id) => id !== mealId) : [...current, mealId];
        const days = cleanSkippedMeals({ ...get().days, [dateKey]: nextIds });
        set({ days });
        void pushUserData(USER_DATA_KEYS.skippedMeals, { days });
      },
    }),
    { name: 'skipped-meal-store', storage: createJSONStorage(() => appStorage), partialize: (s) => ({ days: s.days }) }
  )
);
