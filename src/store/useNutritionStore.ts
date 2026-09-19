import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyNutritionLog, MealSlot } from '../types';
import { toDateKey } from '../utils/date';
import { pushNutritionLog } from '../sync/cloudSync';

interface NutritionState {
  logs: Record<string, DailyNutritionLog>;
  getLog: (dateKey: string) => DailyNutritionLog;
  toggleMeal: (dateKey: string, slot: MealSlot) => void;
  addWater: (dateKey: string, ml: number) => void;
  resetWater: (dateKey: string) => void;
  addExtra: (dateKey: string, calories: number, proteinG: number) => void;
}

// Cached per dateKey so `getLog` returns a stable reference when no log exists yet.
// Without this, a fallback object created fresh on every call would break selector
// equality checks (useSyncExternalStore) and cause an infinite render loop.
const emptyLogCache = new Map<string, DailyNutritionLog>();
function emptyLog(dateKey: string): DailyNutritionLog {
  let log = emptyLogCache.get(dateKey);
  if (!log) {
    log = { dateISO: dateKey, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, waterMl: 0 };
    emptyLogCache.set(dateKey, log);
  }
  return log;
}

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set, get) => ({
      logs: {},
      getLog: (dateKey) => get().logs[dateKey] ?? emptyLog(dateKey),
      toggleMeal: (dateKey, slot) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const mealsEaten = { ...current.mealsEaten, [slot]: !current.mealsEaten[slot] };
          const updated = { ...current, mealsEaten };
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
      addWater: (dateKey, ml) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const waterMl = Math.max(0, current.waterMl + ml);
          const updated = { ...current, waterMl };
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
      resetWater: (dateKey) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const updated = { ...current, waterMl: 0 };
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
      addExtra: (dateKey, calories, proteinG) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const updated = {
            ...current,
            extraCalories: current.extraCalories + calories,
            extraProteinG: current.extraProteinG + proteinG,
          };
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
    }),
    {
      name: 'nutrition-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export function todayKey(): string {
  return toDateKey(new Date());
}
