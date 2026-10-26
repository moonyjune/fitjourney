import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime, MealPart, MealSlot } from '../types';
import { toDateKey } from '../utils/date';
import { loggedAtFor, type Clock } from '../utils/mealClock';
import { cleanParts } from '../food/mealParts';
import { pushNutritionLog } from '../sync/cloudSync';
import { useFoodDbStore } from './useFoodDbStore';
import { useProofStore } from './useProofStore';
import { deletePersistedPhoto } from '../utils/photoStorage';
import { extraProofRef } from '../types';

interface NutritionState {
  logs: Record<string, DailyNutritionLog>;
  /** The "3 L a day until 25/10" default has been written once on this device. */
  waterDefaultDone: boolean;
  /** Gives every day of the diary period that has no water figure the default 3 L, once. Returns the days changed. */
  applyWaterDefault: () => number;
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
    extras?: Pick<ExtraFoodItem, 'purineMg' | 'saltG' | 'sugarG' | 'junk' | 'photoUri'> & {
      /** The figures came straight from a food in the database, so there is nothing new to remember. */
      fromFoodDb?: boolean;
      /** The time of day the user said they ate it; without it the meal's usual time (or now) is used. */
      clock?: Clock | null;
      /** The meal's breakdown, when it has one (2 or more parts); kept only when it is well-formed. */
      parts?: MealPart[];
    }
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

/** Diary period with no water figures: each such day counts as 3 L drunk (the user's rule, until 25/10). */
export const WATER_DEFAULT_FROM = '2026-09-21';
export const WATER_DEFAULT_TO = '2026-10-25';
export const WATER_DEFAULT_ML = 3000;

function dayNumber(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
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

/** Removes the photo attached to an off-plan food item: the proof entry and the persisted file. */
function discardExtraPhoto(item: Pick<ExtraFoodItem, 'id' | 'photoUri'>): void {
  const proofs = useProofStore.getState();
  const ref = extraProofRef(item.id);
  const linked = proofs.photos.filter((x) => x.taskType === 'meal' && x.taskRefId === ref);
  for (const p of linked) proofs.removeProof(p.id); // also deletes the file
  // No proof entry left for it (removed on its own earlier): still don't leave the file behind.
  if (linked.length === 0 && item.photoUri) deletePersistedPhoto(item.photoUri).catch(() => {});
}

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set, get) => ({
      logs: {},
      waterDefaultDone: false,
      applyWaterDefault: () => {
        if (get().waterDefaultDone) return 0;
        let days = 0;
        for (let n = dayNumber(WATER_DEFAULT_FROM); n <= dayNumber(WATER_DEFAULT_TO); n += 1) {
          const dateKey = new Date(n * 86400000).toISOString().slice(0, 10);
          if (get().getLog(dateKey).waterMl > 0) continue;
          get().addWater(dateKey, WATER_DEFAULT_ML);
          days += 1;
        }
        set({ waterDefaultDone: true });
        return days;
      },
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
      addExtra: (dateKey, name, calories, proteinG, mealTime, extras) => {
        const item: ExtraFoodItem = { id: `${Date.now()}`, name, calories, proteinG, mealTime, loggedAtISO: loggedAtFor(dateKey, mealTime, new Date(), extras?.clock) };
        if (extras?.purineMg) item.purineMg = extras.purineMg;
        if (extras?.saltG) item.saltG = extras.saltG;
        if (extras?.sugarG) item.sugarG = extras.sugarG;
        if (extras?.junk) item.junk = true;
        if (extras?.photoUri) item.photoUri = extras.photoUri;
        const parts = cleanParts(extras?.parts);
        if (parts.length > 0) item.parts = parts;
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const updated = {
            ...current,
            extraItems: [...(current.extraItems ?? []), item],
            extraCalories: current.extraCalories + calories,
            extraProteinG: current.extraProteinG + proteinG,
          };
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        });
        // A food the database does not know yet is remembered, so next time it needs neither typing nor an AI call.
        if (!extras?.fromFoodDb) useFoodDbStore.getState().remember(item);
        // The photo also goes through the proof pipeline so it syncs and the coach sees it next to the plan meals.
        if (item.photoUri) {
          useProofStore.getState().addProof({
            taskType: 'meal',
            taskRefId: extraProofRef(item.id),
            photoUri: item.photoUri,
            note: name,
            dateISO: item.loggedAtISO,
          });
        }
      },
      removeExtraItem: (dateKey, itemId) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const item = (current.extraItems ?? []).find((i) => i.id === itemId);
          if (!item) return state;
          discardExtraPhoto(item);
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
          // Items dropped by this edit take their photo (file + proof) with them.
          const kept = new Set(patch.extraItems.map((i) => i.id));
          for (const old of current.extraItems ?? []) if (!kept.has(old.id)) discardExtraPhoto(old);
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
