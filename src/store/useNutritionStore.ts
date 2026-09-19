import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyNutritionLog, MealSlot } from '../types';
import { toDateKey } from '../utils/date';

interface NutritionState {
  logs: Record<string, DailyNutritionLog>;
  getLog: (dateKey: string) => DailyNutritionLog;
  toggleMeal: (dateKey: string, slot: MealSlot) => void;
  addWater: (dateKey: string, ml: number) => void;
  resetWater: (dateKey: string) => void;
  addExtra: (dateKey: string, calories: number, proteinG: number) => void;
}

function emptyLog(dateKey: string): DailyNutritionLog {
  return { dateISO: dateKey, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, waterMl: 0 };
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
          return { logs: { ...state.logs, [dateKey]: { ...current, mealsEaten } } };
        }),
      addWater: (dateKey, ml) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const waterMl = Math.max(0, current.waterMl + ml);
          return { logs: { ...state.logs, [dateKey]: { ...current, waterMl } } };
        }),
      resetWater: (dateKey) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          return { logs: { ...state.logs, [dateKey]: { ...current, waterMl: 0 } } };
        }),
      addExtra: (dateKey, calories, proteinG) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          return {
            logs: {
              ...state.logs,
              [dateKey]: {
                ...current,
                extraCalories: current.extraCalories + calories,
                extraProteinG: current.extraProteinG + proteinG,
              },
            },
          };
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
