import { habitProfile, type HabitEntry, type HabitProfile, type MealState } from '../../supabase/functions/_shared/temptPick';
import { mainMealOf } from '../insights/days';
import { useNutritionStore } from '../store/useNutritionStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../types';
import { toDateKey } from '../utils/date';

// What the temptation pick reads about the player's eating (1.5): how long since their last main meal and last food today (just ate →
// a dessert or a drink; a long gap → a snack), and their snacking habits mined from the food log (what they log as snacks and when),
// so similar pool items rank higher. Only categories, slots and a few food names leave the device. Pure except `pickExtrasNow`.

/** Days of the food log mined for habits. */
export const HABIT_DAYS = 30;
/** A food counts as a main meal from this many kcal (a coffee at lunch time is not lunch). */
export const MAIN_MEAL_KCAL = 200;

const SNACK_TIMES = new Set(['morning_snack', 'afternoon_snack', 'late_afternoon_snack', 'evening_snack']);

/** Whether a logged food was a snack / treat: a snack meal time, marked "ăn vặt" (`snack`, read defensively) or junk, or sweet. */
export function isSnackEntry(item: ExtraFoodItem): boolean {
  if ((item as ExtraFoodItem & { snack?: unknown }).snack === true) return true;
  if (item.mealTime && SNACK_TIMES.has(item.mealTime)) return true;
  if (item.junk) return true;
  if (!item.mealTime && mainMealOf(item) === null) return true;
  return (item.sugarG ?? 0) >= 20 && item.calories < 600;
}

const minutesOf = (iso: string): number | null => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.getHours() * 60 + d.getMinutes() : null;
};

/** Minutes since the last main meal and since any food on the day of `now` (eaten before `now`); null when none. */
export function mealStateFrom(now: Date, logs: Record<string, DailyNutritionLog>): MealState {
  const items = (logs[toDateKey(now)]?.extraItems ?? []).filter((i) => i.name && !/^không ăn$/i.test(i.name.trim()));
  let lastMeal: number | null = null;
  let lastFood: number | null = null;
  for (const i of items) {
    const t = Date.parse(i.loggedAtISO);
    if (!Number.isFinite(t) || t > now.getTime()) continue;
    lastFood = Math.max(lastFood ?? 0, t);
    if (!isSnackEntry(i) && mainMealOf(i) !== null && i.calories >= MAIN_MEAL_KCAL) lastMeal = Math.max(lastMeal ?? 0, t);
  }
  const since = (t: number | null) => (t === null ? null : Math.max(0, Math.round((now.getTime() - t) / 60_000)));
  return { sinceMealMin: since(lastMeal), sinceFoodMin: since(lastFood) };
}

/** The player's snack entries of the last HABIT_DAYS days, as the habit miner reads them. */
export function habitEntriesFrom(now: Date, logs: Record<string, DailyNutritionLog>, days = HABIT_DAYS): HabitEntry[] {
  const out: HabitEntry[] = [];
  for (let i = 0; i <= days; i++) {
    const key = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    for (const item of logs[key]?.extraItems ?? []) {
      if (!item.name || /^không ăn$/i.test(item.name.trim())) continue;
      out.push({ name: item.name, minutes: minutesOf(item.loggedAtISO), snack: isSnackEntry(item) });
    }
  }
  return out;
}

/** What the pick reads about the player's eating, from the logs. */
export function pickExtrasFrom(now: Date, logs: Record<string, DailyNutritionLog>): { meal: MealState; habits: HabitProfile } {
  return { meal: mealStateFrom(now, logs), habits: habitProfile(habitEntriesFrom(now, logs)) };
}

/** The same, read from this device's food log now (empty when it cannot be read). */
export function pickExtrasNow(now: Date): { meal: MealState; habits: HabitProfile } {
  try {
    return pickExtrasFrom(now, useNutritionStore.getState().logs);
  } catch {
    return { meal: { sinceMealMin: null, sinceFoodMin: null }, habits: { total: 0, cats: {}, names: [] } };
  }
}
