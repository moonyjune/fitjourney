import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime, MealSlot } from '../types';
import { toDateKey } from '../utils/date';
import { pushNutritionLog } from '../sync/cloudSync';

interface NutritionState {
  logs: Record<string, DailyNutritionLog>;
  getLog: (dateKey: string) => DailyNutritionLog;
  toggleMeal: (dateKey: string, slot: MealSlot) => void;
  addWater: (dateKey: string, ml: number) => void;
  resetWater: (dateKey: string) => void;
  addExtra: (dateKey: string, name: string, calories: number, proteinG: number, mealTime: ExtraMealTime | null) => void;
  removeExtraItem: (dateKey: string, itemId: string) => void;
}

// Cached per dateKey so `getLog` returns a stable reference when no log exists yet.
// Without this, a fallback object created fresh on every call would break selector
// equality checks (useSyncExternalStore) and cause an infinite render loop.
const emptyLogCache = new Map<string, DailyNutritionLog>();
function emptyLog(dateKey: string): DailyNutritionLog {
  let log = emptyLogCache.get(dateKey);
  if (!log) {
    log = { dateISO: dateKey, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 };
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
      addExtra: (dateKey, name, calories, proteinG, mealTime) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const item: ExtraFoodItem = { id: `${Date.now()}`, name, calories, proteinG, mealTime, loggedAtISO: new Date().toISOString() };
          const updated = {
            ...current,
            extraItems: [...(current.extraItems ?? []), item],
            extraCalories: current.extraCalories + calories,
            extraProteinG: current.extraProteinG + proteinG,
          };
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
      removeExtraItem: (dateKey, itemId) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const item = (current.extraItems ?? []).find((i) => i.id === itemId);
          if (!item) return state;
          const updated = {
            ...current,
            extraItems: (current.extraItems ?? []).filter((i) => i.id !== itemId),
            extraCalories: Math.max(0, current.extraCalories - item.calories),
            extraProteinG: Math.max(0, current.extraProteinG - item.proteinG),
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
