import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime } from '../types';

/** How many dishes the "Ăn lại" row of the quick-add sheet shows at most (README §3.2: 3–6). */
export const EAT_AGAIN_MAX = 6;

/** A dish logged before, offered again with one tap. */
export interface RecentDish {
  /** The dish name as last logged. */
  name: string;
  /** Its key in the hidden list (`dishKey`). */
  key: string;
  calories: number;
  proteinG: number;
  purineMg?: number;
  saltG?: number;
  sugarG?: number;
  junk?: boolean;
  mealTime: ExtraMealTime | null;
  /** The day it was last logged on and the item itself (its photo is looked up from it). */
  dateKey: string;
  item: ExtraFoodItem;
}

/** The same dish whatever its case and spacing ("Phở bò" = " phở  Bò"). */
export function dishKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The latest distinct dishes logged (newest first), skipping hidden ones, records with no calories ("Không ăn") and empty names. */
export function recentDishes(logs: Record<string, DailyNutritionLog>, hidden: readonly string[] = [], limit = EAT_AGAIN_MAX): RecentDish[] {
  const all: { dateKey: string; item: ExtraFoodItem }[] = [];
  for (const [dateKey, log] of Object.entries(logs)) for (const item of log.extraItems ?? []) all.push({ dateKey, item });
  all.sort((a, b) => (a.item.loggedAtISO < b.item.loggedAtISO ? 1 : a.item.loggedAtISO > b.item.loggedAtISO ? -1 : 0));
  const seen = new Set(hidden);
  const out: RecentDish[] = [];
  for (const { dateKey, item } of all) {
    const key = dishKey(item.name ?? '');
    if (!key || !(item.calories > 0) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: item.name.trim(),
      key,
      calories: item.calories,
      proteinG: item.proteinG,
      purineMg: item.purineMg,
      saltG: item.saltG,
      sugarG: item.sugarG,
      junk: item.junk,
      mealTime: item.mealTime ?? null,
      dateKey,
      item,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** The meal a food eaten at this time of day belongs to (the clock times of `MEAL_CLOCK`, split half way between them). */
export function mealTimeAt(date: Date): ExtraMealTime {
  const min = date.getHours() * 60 + date.getMinutes();
  if (min < 9 * 60) return 'breakfast';
  if (min < 11 * 60) return 'morning_snack';
  if (min < 13 * 60) return 'lunch';
  if (min < 15 * 60) return 'afternoon_snack';
  if (min < 17 * 60 + 30) return 'late_afternoon_snack';
  if (min < 21 * 60) return 'dinner';
  return 'evening_snack';
}

/** The meal a dish eaten again goes to: the meal of the moment when it is logged for today, the meal it was logged in before for another day. */
export function eatAgainMealTime(dish: Pick<RecentDish, 'mealTime'>, isToday: boolean, now: Date): ExtraMealTime | null {
  return isToday ? mealTimeAt(now) : dish.mealTime;
}
