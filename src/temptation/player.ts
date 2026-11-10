import type { TemptPlayer } from '../../supabase/functions/_shared/tempt';
import { makeDayEvaluator } from '../ai/coachContext';
import { useTemptationStore } from '../store/useTemptationStore';
import type { DailyNutritionLog } from '../types';
import { toDateKey } from '../utils/date';
import type { TemptHistoryEntry } from './stats';

/** Days of foods the boss is told about ("món ăn gần đây"). */
export const RECENT_DAYS = 3;
/** Days looked at for the foods the player slips on (junk, sweet, rich). */
export const WEAK_DAYS = 14;
const SKIPPED = /^không ăn$/i;

const DAY_LABEL = ['hôm nay', 'hôm qua', '2 ngày trước', '3 ngày trước'];

function dayKeysBack(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= days; i++) out.push(toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  return out;
}

/** What the boss is told about the player for "AI tương tác": today's kcal and target, the foods of the last RECENT_DAYS days, and their
 *  weak spots: the temptations they gave in to, then the foods they logged most as junk, sweet (≥ 20 g sugar) or rich (≥ 600 kcal) in
 *  the last WEAK_DAYS days. Only food names and figures; pure. */
export function temptPlayerFrom(input: {
  now: Date;
  logs: Record<string, DailyNutritionLog>;
  history: TemptHistoryEntry[];
  streak: number;
  eatenKcal: number | null;
  targetKcal: number | null;
  cheatDay: boolean;
}): TemptPlayer {
  const recentFoods: string[] = [];
  dayKeysBack(input.now, RECENT_DAYS).forEach((key, i) => {
    for (const item of [...(input.logs[key]?.extraItems ?? [])].reverse()) {
      if (!item.name || SKIPPED.test(item.name.trim()) || recentFoods.length >= 12) continue;
      recentFoods.push(`${item.name} (${DAY_LABEL[i]})`);
    }
  });

  const weak = new Map<string, number>();
  const add = (name: string, n: number) => {
    const key = name.trim();
    if (key) weak.set(key, (weak.get(key) ?? 0) + n);
  };
  for (const h of input.history) if (h.outcome === 'gaveIn') add(h.name, 3);
  for (const key of dayKeysBack(input.now, WEAK_DAYS)) {
    for (const item of input.logs[key]?.extraItems ?? []) {
      if (item.junk || (item.sugarG ?? 0) >= 20 || item.calories >= 600) add(item.name, 1);
    }
  }
  const weaknesses = [...weak.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);

  return { eatenKcal: input.eatenKcal, targetKcal: input.targetKcal, recentFoods, weaknesses, streak: input.streak, cheatDay: input.cheatDay };
}

/** The same, read from this device's stores now. */
export function currentTemptPlayer(now: Date): TemptPlayer {
  const { evaluate, isCheatDay, logs, settings } = makeDayEvaluator(now);
  const key = toDateKey(now);
  let eatenKcal: number | null = null;
  try {
    eatenKcal = Math.round(evaluate(key).eatenKcal);
  } catch {
    eatenKcal = null;
  }
  const t = useTemptationStore.getState();
  return temptPlayerFrom({
    now,
    logs,
    history: t.history,
    streak: t.stats.streak,
    eatenKcal,
    targetKcal: settings.calorieTargetKcal > 0 ? Math.round(settings.calorieTargetKcal) : null,
    cheatDay: isCheatDay(key),
  });
}
