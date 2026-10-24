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
  addExtra: (
    dateKey: string,
    name: string,
    calories: number,
    proteinG: number,
    mealTime: ExtraMealTime | null,
    /** Optional FitQuest fields; omitted ones are simply not stored on the item. */
    extras?: Pick<ExtraFoodItem, 'purineMg' | 'saltG' | 'sugarG' | 'junk'>
  ) => void;
  removeExtraItem: (dateKey: string, itemId: string) => void;
  /** Commits a whole diary-table edit session (meal toggles, deleted default meals, edited/removed
   *  extra items) as a single write — the explicit "Save" action for DailyMealBreakdownTable's
   *  draft, instead of pushing on every micro-edit. */
  saveDayLog: (
    dateKey: string,
    patch: { mealsEaten: Partial<Record<MealSlot, boolean>>; extraItems: ExtraFoodItem[]; removedMealSlots: MealSlot[] }
  ) => void;
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
      addExtra: (dateKey, name, calories, proteinG, mealTime, extras) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const item: ExtraFoodItem = { id: `${Date.now()}`, name, calories, proteinG, mealTime, loggedAtISO: new Date().toISOString() };
          if (extras?.purineMg) item.purineMg = extras.purineMg;
          if (extras?.saltG) item.saltG = extras.saltG;
          if (extras?.sugarG) item.sugarG = extras.sugarG;
          if (extras?.junk) item.junk = true;
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
      saveDayLog: (dateKey, patch) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const updated: DailyNutritionLog = {
            ...current,
            mealsEaten: patch.mealsEaten,
            extraItems: patch.extraItems,
            extraCalories: patch.extraItems.reduce((s, i) => s + i.calories, 0),
            extraProteinG: patch.extraItems.reduce((s, i) => s + i.proteinG, 0),
            removedMealSlots: patch.removedMealSlots,
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
