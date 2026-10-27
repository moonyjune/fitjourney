import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

/** What the user wants out of one meal, for the meal ideas. Empty = let the app size meals from what is left of the day. */
export interface MealPrefs {
  /** Calories wanted per meal; ideas land within ±10% of it. */
  kcal: number | null;
  /** Protein wanted per meal (g); ideas land within ±10% of it. */
  proteinG: number | null;
  /** Never suggest more calories than the meal's target. */
  strictKcal: boolean;
}

export const NO_MEAL_PREFS: MealPrefs = { kcal: null, proteinG: null, strictKcal: false };
export const MEAL_KCAL_RANGE = { min: 100, max: 1500 };
export const MEAL_PROTEIN_RANGE = { min: 5, max: 150 };

/** A saved value only when it is a number in range; anything else means "not set". */
export function cleanPref(value: unknown, range: { min: number; max: number }): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max ? Math.round(value) : null;
}

export function cleanMealPrefs(raw: unknown): MealPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { kcal: cleanPref(o.kcal, MEAL_KCAL_RANGE), proteinG: cleanPref(o.proteinG, MEAL_PROTEIN_RANGE), strictKcal: o.strictKcal === true };
}

interface MealPrefState extends MealPrefs {
  setPrefs: (patch: Partial<MealPrefs>) => void;
}

export const useMealPrefStore = create<MealPrefState>()(
  persist(
    (set, get) => ({
      ...NO_MEAL_PREFS,
      setPrefs: (patch) => {
        const next = cleanMealPrefs({ ...pick(get()), ...patch });
        set(next);
        pushUserData(USER_DATA_KEYS.mealPrefs, next);
      },
    }),
    { name: 'meal-pref-store', storage: createJSONStorage(() => appStorage) }
  )
);

export const pick = (s: MealPrefs): MealPrefs => ({ kcal: s.kcal, proteinG: s.proteinG, strictKcal: s.strictKcal });
