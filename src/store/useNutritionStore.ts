import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime, MealPart, MealSlot } from '../types';
import { toDateKey } from '../utils/date';
import { loggedAtFor, type Clock } from '../utils/mealClock';
import { cleanParts } from '../food/mealParts';
import { pushNutritionLog } from '../sync/cloudSync';
import { useFoodDbStore } from './useFoodDbStore';
import { useProofStore } from './useProofStore';
import { deletePersistedPhoto } from '../utils/photoStorage';
import { isInlinePhoto } from '../utils/inlinePhoto';
import { extraProofRef } from '../types';
import { withCountersAfterEdit, withIntakeCounters } from '../utils/dayIntake';
import { healLog, newExtraId } from '../utils/extraIds';
import { setDayReader } from '../sync/syncQueue';

export type ExtraPatch = Partial<Pick<ExtraFoodItem, 'name' | 'calories' | 'proteinG' | 'purineMg' | 'saltG' | 'sugarG' | 'parts'>> & {
  photoUri?: string | null;
};

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
  /** Changes a logged off-plan food in place (amounts, totals, breakdown, photo) and saves it, with no AI call. `photoUri: null` removes
   *  the photo; a new one replaces the old (its proof and file go) and is saved as a meal proof. */
  updateExtra: (dateKey: string, itemId: string, patch: ExtraPatch) => void;
  /** Commits a whole diary-table edit session (meal toggles, deleted default meals, edited/removed
   *  extra items) as a single write — the explicit "Save" action for DailyMealBreakdownTable's
   *  draft, instead of pushing on every micro-edit. */
  saveDayLog: (
    dateKey: string,
    patch: { mealsEaten: Partial<Record<MealSlot, boolean>>; extraItems: ExtraFoodItem[]; removedMealSlots: MealSlot[]; clearTotals?: boolean }
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
        const item: ExtraFoodItem = { id: newExtraId((get().logs[dateKey]?.extraItems ?? []).map((i) => i.id)), name, calories, proteinG, mealTime, loggedAtISO: loggedAtFor(dateKey, mealTime, new Date(), extras?.clock) };
        if (extras?.purineMg) item.purineMg = extras.purineMg;
        if (extras?.saltG) item.saltG = extras.saltG;
        if (extras?.sugarG) item.sugarG = extras.sugarG;
        if (extras?.junk) item.junk = true;
        // A photo kept inline (web) lives only in the proof store; a second copy here would fill the browser's storage and stop the day from saving.
        if (extras?.photoUri && !isInlinePhoto(extras.photoUri)) item.photoUri = extras.photoUri;
        const parts = cleanParts(extras?.parts);
        if (parts.length > 0) item.parts = parts;
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const updated = withIntakeCounters({ ...current, extraItems: [...(current.extraItems ?? []), item] });
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        });
        // A food the database does not know yet is remembered, so next time it needs neither typing nor an AI call.
        // A meal entered as several foods adds each food on its own (the one-line total of a combination is no use later).
        if (!extras?.fromFoodDb) {
          const db = useFoodDbStore.getState();
          if (parts.length > 0) for (const part of parts) db.remember(part);
          else db.remember(item);
        }
        // The photo also goes through the proof pipeline so it syncs and the coach sees it next to the plan meals.
        if (extras?.photoUri) {
          useProofStore.getState().addProof({
            taskType: 'meal',
            taskRefId: extraProofRef(item.id),
            photoUri: extras.photoUri,
            note: name,
            dateISO: item.loggedAtISO,
          });
        }
      },
      updateExtra: (dateKey, itemId, patch) => {
        const old = (get().logs[dateKey]?.extraItems ?? []).find((i) => i.id === itemId);
        if (!old) return;
        const { photoUri, ...fields } = patch;
        const next: ExtraFoodItem = { ...old, ...fields };
        for (const key of ['purineMg', 'saltG', 'sugarG'] as const) if (!next[key]) delete next[key];
        const parts = cleanParts(next.parts);
        if (parts.length > 0) next.parts = parts;
        else delete next.parts;
        if (photoUri !== undefined) {
          if (photoUri && !isInlinePhoto(photoUri)) next.photoUri = photoUri;
          else delete next.photoUri;
        }
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const updated = withIntakeCounters({ ...current, extraItems: (current.extraItems ?? []).map((i) => (i.id === itemId ? next : i)) });
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        });
        if (photoUri !== undefined && (photoUri !== old.photoUri || isInlinePhoto(photoUri))) {
          discardExtraPhoto(old);
          if (photoUri) {
            useProofStore.getState().addProof({ taskType: 'meal', taskRefId: extraProofRef(itemId), photoUri, note: next.name, dateISO: next.loggedAtISO });
          }
        }
      },
      removeExtraItem: (dateKey, itemId) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          const item = (current.extraItems ?? []).find((i) => i.id === itemId);
          if (!item) return state;
          discardExtraPhoto(item);
          const updated = withCountersAfterEdit(current, { ...current, extraItems: (current.extraItems ?? []).filter((i) => i.id !== itemId) });
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
      saveDayLog: (dateKey, patch) =>
        set((state) => {
          const current = state.logs[dateKey] ?? emptyLog(dateKey);
          // Items dropped by this edit take their photo (file + proof) with them.
          const kept = new Set(patch.extraItems.map((i) => i.id));
          for (const old of current.extraItems ?? []) if (!kept.has(old.id)) discardExtraPhoto(old);
          const updated: DailyNutritionLog = withCountersAfterEdit(
            current,
            { ...current, mealsEaten: patch.mealsEaten, extraItems: patch.extraItems, removedMealSlots: patch.removedMealSlots },
            patch.clearTotals
          );
          pushNutritionLog(updated);
          return { logs: { ...state.logs, [dateKey]: updated } };
        }),
    }),
    {
      name: 'nutrition-store',
      storage: createJSONStorage(() => appStorage),
      // Photos saved inline by an earlier build are already in the proof store: drop the second copy from the days.
      onRehydrateStorage: () => (state) => {
        // Days saved with two foods under one id (older builds) are repaired, and the repaired day is saved to the cloud.
        if (state) {
          const fixed = Object.entries(state.logs).filter(([, l]) => healLog(l) !== l);
          if (fixed.length > 0) {
            const logs = { ...state.logs };
            for (const [k, l] of fixed) {
              logs[k] = healLog(l);
              pushNutritionLog(logs[k]);
            }
            useNutritionStore.setState({ logs });
          }
        }
        if (!state || !Object.values(state.logs).some((l) => (l.extraItems ?? []).some((i) => isInlinePhoto(i.photoUri)))) return;
        const logs = { ...state.logs };
        for (const [k, l] of Object.entries(logs)) {
          if (!(l.extraItems ?? []).some((i) => isInlinePhoto(i.photoUri))) continue;
          logs[k] = { ...l, extraItems: l.extraItems.map((i) => (isInlinePhoto(i.photoUri) ? (({ photoUri: _p, ...rest }) => rest)(i) : i)) };
        }
        useNutritionStore.setState({ logs });
      },
    }
  )
);

setDayReader((dateKey) => useNutritionStore.getState().logs[dateKey]);

export function todayKey(): string {
  return toDateKey(new Date());
}
