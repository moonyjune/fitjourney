import { makeDayEvaluator } from '../ai/coachContext';
import { foodKey } from '../food/remember';
import type { DailyNutritionLog } from '../types';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import { cleanWishContext, type CheatWishContext, type WishSlot } from '../../supabase/functions/_shared/places';

// Cheat day > the wish: what the app tells the AI besides the user's own words, so it can read "buồn, muốn ăn gì ấm bụng" well — the
// local time and meal slot, what was eaten lately (not to repeat it), the favourites, and the foods that pushed days over the
// calorie target (the ones a cheat day is for). Food names and kcal only, read from the user's own log: no dates, photos or ids.

/** How far back the log is read (today not included in the over-target count). */
export const WISH_HISTORY_DAYS = 14;
const RECENT_DAYS = 3;

/** The meal slot of an hour: 5–9 breakfast, 10–13 lunch, 14–16 afternoon snack, 17–20 dinner, else a late-night snack. */
export function wishSlot(hour: number): WishSlot {
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'dinner';
  return 'late';
}

export interface WishSource {
  logs: Record<string, DailyNutritionLog>;
  /** kcal eaten on a day (plan meals + extras, the game's own rule). */
  eatenKcal: (dateKey: string) => number;
  calorieTargetKcal: number;
  isCheatDay: (dateKey: string) => boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The context from a source (pure, for tests): the last 3 days' foods newest first, the 8 most frequent of 14 days, and the 2
 *  biggest foods of each past day over the calorie target (cheat days left out), the biggest first. */
export function wishContextFrom(source: WishSource, now: Date): CheatWishContext {
  const recent: string[] = [];
  const recentKeys = new Set<string>();
  const counts = new Map<string, { name: string; n: number }>();
  const over = new Map<string, { name: string; kcal: number }>();
  let loggedDays = 0;
  let overDays = 0;
  for (let i = 0; i <= WISH_HISTORY_DAYS; i++) {
    const key = toDateKey(addDays(now, -i));
    const items = [...(source.logs[key]?.extraItems ?? [])].sort((a, b) => b.loggedAtISO.localeCompare(a.loggedAtISO));
    for (const item of items) {
      const name = item.name.replace(/\s+/g, ' ').trim();
      const k = foodKey(name);
      if (!k) continue;
      if (i <= RECENT_DAYS && !recentKeys.has(k)) {
        recentKeys.add(k);
        recent.push(name);
      }
      const c = counts.get(k) ?? { name, n: 0 };
      c.n += 1;
      counts.set(k, c);
    }
    // Over target: past days only (today is not over yet), never a cheat day.
    if (i === 0 || source.isCheatDay(key)) continue;
    const eaten = source.eatenKcal(key);
    if (eaten <= 0) continue;
    loggedDays += 1;
    if (source.calorieTargetKcal <= 0 || eaten <= source.calorieTargetKcal) continue;
    overDays += 1;
    for (const item of [...items].sort((a, b) => b.calories - a.calories).slice(0, 2)) {
      const k = foodKey(item.name);
      if (!k || item.calories < 150) continue;
      const e = over.get(k);
      if (!e || e.kcal < item.calories) over.set(k, { name: item.name.trim(), kcal: Math.round(item.calories) });
    }
  }
  const favorites = [...counts.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.name);
  return (
    cleanWishContext({
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      weekday: now.getDay(),
      slot: wishSlot(now.getHours()),
      recent,
      favorites,
      overTarget: [...over.values()].sort((a, b) => b.kcal - a.kcal),
      loggedDays,
      overDays,
    }) ?? { time: '00:00', weekday: 0, slot: 'dinner', recent: [], favorites: [], overTarget: [], loggedDays: 0, overDays: 0 }
  );
}

/** The context from this device's stores (the same day rules as the coach and the weekly review). */
export function buildCheatWishContext(now: Date = new Date()): CheatWishContext {
  const { evaluate, isCheatDay, logs, settings } = makeDayEvaluator(now);
  return wishContextFrom({ logs, eatenKcal: (key) => evaluate(key).eatenKcal, calorieTargetKcal: settings.calorieTargetKcal, isCheatDay }, now);
}
