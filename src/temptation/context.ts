import { foodCategory, habitProfile, slotOf, type HabitEntry, type HabitProfile, type MealState } from '../../supabase/functions/_shared/temptPick';
import { analyzeDiary, WEEK_DAYS, type DiaryEntry, type HabitSummary } from '../../supabase/functions/_shared/eatingHabits';
import { learnSummary, type Interaction } from '../../supabase/functions/_shared/temptLearn';
import { cleanArea, type TemptArea } from '../../supabase/functions/_shared/temptShops';
import { makeDayEvaluator } from '../ai/coachContext';
import { useTemptationStore } from '../store/useTemptationStore';
import type { TemptSettings } from './schedule';
import type { TemptHistoryEntry } from './stats';
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

// ----- 1.7: the diary summary, the area and what the boss learned (sent to tempt-me / tempt-chat; only summaries leave the device) -----

/** The log of the last `days` days (today included) as the diary analysis reads it. */
export function diaryEntriesFrom(now: Date, logs: Record<string, DailyNutritionLog>, days = WEEK_DAYS): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  for (let i = 0; i < days; i++) {
    const key = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    for (const item of logs[key]?.extraItems ?? []) {
      if (!item.name || /^không ăn$/i.test(item.name.trim())) continue;
      const snack = isSnackEntry(item);
      out.push({
        date: key,
        name: item.name,
        kcal: item.calories,
        minutes: minutesOf(item.loggedAtISO),
        meal: snack ? null : mainMealOf(item),
        snack,
        ...(item.sugarG !== undefined ? { sugarG: item.sugarG } : {}),
        ...(item.saltG !== undefined ? { saltG: item.saltG } : {}),
      });
    }
  }
  return out;
}

/** The diary summary for `now` (today, yesterday, the week; snacks, favourites, leanings, late-night eating). */
export function diarySummaryFrom(now: Date, logs: Record<string, DailyNutritionLog>, targetKcal: number | null, dayKcal?: (date: string) => number | null): HabitSummary {
  return analyzeDiary({ today: toDateKey(now), nowMinutes: now.getHours() * 60 + now.getMinutes(), entries: diaryEntriesFrom(now, logs), targetKcal, categorize: foodCategory, dayKcal });
}

/** The same, read from this device's stores now (the day's kcal as the app counts them, the target in the settings); null when the
 *  log cannot be read. */
export function diaryNow(now: Date): HabitSummary | null {
  try {
    const { evaluate, logs, settings } = makeDayEvaluator(now);
    const dayKcal = (date: string) => {
      try {
        return Math.round(evaluate(date).eatenKcal);
      } catch {
        return null;
      }
    };
    return diarySummaryFrom(now, logs, settings.calorieTargetKcal > 0 ? settings.calorieTargetKcal : null, dayKcal);
  } catch {
    return null;
  }
}

/** "Khu vực của tôi" as it may leave the device: district and city only, the position rounded to ~1 km; null when not set. */
export function areaFromSettings(s: Pick<TemptSettings, 'district' | 'city' | 'coords'>): TemptArea | null {
  return cleanArea({ district: s.district, city: s.city, ...(s.coords ? { lat: s.coords.lat, lon: s.coords.lon } : {}) });
}

/** What the boss learned from the device's own record (for the offline pick): the answers of the history as interactions. */
export function localLearned(history: TemptHistoryEntry[], now: Date = new Date()): Record<string, number> {
  const list: Interaction[] = history.map((h) => {
    const at = new Date(h.at);
    return {
      shownAt: h.at,
      poolId: null,
      name: h.name,
      cat: foodCategory(h.name),
      kind: 'food',
      context: { slot: slotOf(at.getHours() * 60 + at.getMinutes()), weekday: at.getDay(), weather: [], tempC: null, kcalLeft: null, sinceMealMin: null, area: '', shop: '' },
      outcome: h.outcome === 'resisted' ? 'resisted' : 'gave_in',
      turns: [],
      bonusXp: 0,
      model: '',
      angle: '',
    };
  });
  return learnSummary(list, now).catBoost;
}

/** Everything 1.7 adds to a temptation request: the diary summary and the area. */
export function liveExtrasNow(now: Date): { diary?: HabitSummary; area?: TemptArea } {
  const diary = diaryNow(now);
  let area: TemptArea | null = null;
  try {
    area = areaFromSettings(useTemptationStore.getState().settings);
  } catch {
    area = null;
  }
  return { ...(diary ? { diary } : {}), ...(area ? { area } : {}) };
}
