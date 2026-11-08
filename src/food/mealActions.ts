import { discardExtraPhotos, useNutritionStore } from '../store/useNutritionStore';
import { showToast } from '../store/useToastStore';
import { discardWorkoutPhotos, useWorkoutStore } from '../store/useWorkoutStore';
import type { ExtraFoodItem, ExtraMealTime, MealSlot } from '../types';
import { loggedAtFor, type Clock } from '../utils/mealClock';

/* Deleting and logging again from the detail sheets, each with a "Hoàn tác" toast instead of a confirm (README §2, decision 3). A deleted
 * item keeps its photos until the toast goes away, so the undo brings it back whole; only then are the photos (proofs + files) thrown away. */

/** Deletes a logged food and shows `text` with "Hoàn tác", which puts it back where it was. Returns false when there was no such food. */
export function deleteExtraWithUndo(dateKey: string, itemId: string, text: string): boolean {
  const items = useNutritionStore.getState().logs[dateKey]?.extraItems ?? [];
  const index = items.findIndex((i) => i.id === itemId);
  if (index < 0) return false;
  const item = items[index];
  useNutritionStore.getState().removeExtraItem(dateKey, itemId, { keepPhotos: true });
  showToast({
    text,
    undo: () => useNutritionStore.getState().restoreExtraItem(dateKey, item, index),
    onExpire: () => discardExtraPhotos(item),
  });
  return true;
}

/** Un-ticks a plan meal eaten that day, with "Hoàn tác" (its photos stay with the slot either way). */
export function unmarkPlanMealWithUndo(dateKey: string, slot: MealSlot, text: string): boolean {
  const store = useNutritionStore.getState();
  if (!store.logs[dateKey]?.mealsEaten[slot]) return false;
  store.toggleMeal(dateKey, slot);
  showToast({
    text,
    undo: () => {
      if (!useNutritionStore.getState().logs[dateKey]?.mealsEaten[slot]) useNutritionStore.getState().toggleMeal(dateKey, slot);
    },
  });
  return true;
}

/** Deletes a workout and shows `text` with "Hoàn tác", which brings it back with its photo. */
export function deleteWorkoutWithUndo(entryId: string, text: string): boolean {
  const entries = useWorkoutStore.getState().entries;
  const index = entries.findIndex((e) => e.id === entryId);
  if (index < 0) return false;
  const entry = entries[index];
  useWorkoutStore.getState().removeEntry(entryId, { keepPhotos: true });
  showToast({
    text,
    undo: () => useWorkoutStore.getState().restoreEntry(entry, index),
    onExpire: () => discardWorkoutPhotos(entry.id),
  });
  return true;
}

/** Logs a food again on `dateKey` (same figures and parts, no photo) with "Hoàn tác" removing exactly the new entry. Returns its id. */
export function logExtraAgain(dateKey: string, item: ExtraFoodItem, mealTime: ExtraMealTime | null, text: string): string {
  const id = useNutritionStore.getState().addExtra(dateKey, item.name, item.calories, item.proteinG, mealTime, {
    purineMg: item.purineMg,
    saltG: item.saltG,
    sugarG: item.sugarG,
    junk: item.junk,
    waterMl: item.waterMl,
    fromFoodDb: true,
    parts: item.parts,
  });
  showToast({ text, undo: () => useNutritionStore.getState().removeExtraItem(dateKey, id) });
  return id;
}

/** "Sửa bữa & giờ" of a logged food: files it under another meal and/or time of the same day (the time typed, else the meal's usual
 *  time) and, when given, sets how much of it counts as water. Returns false when there was no such food. */
export function editExtraWhen(dateKey: string, itemId: string, next: { mealTime: ExtraMealTime | null; clock: Clock | null; waterMl?: number }, now: Date = new Date()): boolean {
  const store = useNutritionStore.getState();
  const item = store.logs[dateKey]?.extraItems?.find((i) => i.id === itemId);
  if (!item) return false;
  // Nothing new picked and no time typed: the food keeps its own time instead of jumping to "now" or midday.
  const same = next.mealTime === item.mealTime && !next.clock;
  store.updateExtra(dateKey, itemId, {
    mealTime: next.mealTime,
    loggedAtISO: same ? item.loggedAtISO : loggedAtFor(dateKey, next.mealTime, now, next.clock),
    ...(next.waterMl !== undefined ? { waterMl: next.waterMl } : {}),
  });
  return true;
}
