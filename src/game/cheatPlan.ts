import { KCAL_PER_KG_FAT } from '../utils/tdee';
import { BOSS_MAX_HP } from './constants';

/* Cheat meal and cheat day (1.5): how to count the kcal, with the player's own numbers. Pure; the guide is CheatGuide in the Ghi bữa
 * screen.
 *
 * - Cheat meal: a restaurant / party meal is under-estimated (oil, sauces, bigger portions), so the estimate of a typical restaurant
 *   portion is multiplied by CHEAT_MEAL_BUFFER (×1.3) when it is saved, and the guide reminds to log the drinks and sauces. It is a
 *   food like any other in the day (kcal counted, missions as usual) and is the 80/20 rule's flexible meal (feedback/flex.ts).
 * - Cheat day: the day's budget is the maintenance (TDEE), not TDEE − the deficit target. It is the existing cheat-day mark
 *   (useCheatDayStore, Journal and here): the day is left out of the calorie math (no boss damage or heal, no deficit XP, the streak
 *   neither breaks nor grows, never "Ăn dư"). What it costs the week is the deficit that day would have brought (the target) plus
 *   anything eaten over the TDEE; it can be won back over the next RECOVERY_MIN_DAYS–RECOVERY_MAX_DAYS days with at most
 *   RECOVERY_MAX_PER_DAY kcal of extra deficit a day (what is left beyond that is let go: the weekly boss resets on Monday). */

/** A cheat meal's estimate = a typical restaurant portion × this. */
export const CHEAT_MEAL_BUFFER = 1.3;
/** At most this much extra deficit a day to win a cheat day back. */
export const RECOVERY_MAX_PER_DAY = 300;
/** The cost is spread over 2 days, 3 when it is bigger. */
export const RECOVERY_MIN_DAYS = 2;
export const RECOVERY_MAX_DAYS = 3;

/** A cheat meal's kcal: the estimate given, the buffered figure saved, and the difference. */
export function cheatMealKcal(baseKcal: number): { base: number; buffered: number; extra: number } {
  const base = Math.max(0, Math.round(baseKcal));
  const buffered = Math.round(base * CHEAT_MEAL_BUFFER);
  return { base, buffered, extra: buffered - base };
}

/** A part's (or a meal's) kcal with the cheat-meal buffer. */
export const bufferedKcal = (kcal: number): number => Math.round(Math.max(0, kcal) * CHEAT_MEAL_BUFFER);

/** How a cost is won back: over `days` days, `perDayKcal` of extra deficit each (rounded up to 10 kcal, at most RECOVERY_MAX_PER_DAY),
 *  `leftKcal` that does not fit and is let go. Nothing to win back: 0 days. */
export function recoveryPlan(costKcal: number): { days: number; perDayKcal: number; coveredKcal: number; leftKcal: number } {
  const cost = Math.max(0, Math.round(costKcal));
  if (cost === 0) return { days: 0, perDayKcal: 0, coveredKcal: 0, leftKcal: 0 };
  const days = cost <= RECOVERY_MIN_DAYS * RECOVERY_MAX_PER_DAY ? RECOVERY_MIN_DAYS : RECOVERY_MAX_DAYS;
  const perDayKcal = Math.min(RECOVERY_MAX_PER_DAY, Math.ceil(cost / days / 10) * 10);
  const coveredKcal = Math.min(cost, perDayKcal * days);
  return { days, perDayKcal, coveredKcal, leftKcal: cost - coveredKcal };
}

export interface CheatDayPlan {
  tdeeKcal: number;
  targetDeficitKcal: number;
  /** A normal day's intake: TDEE − the deficit target. */
  normalBudgetKcal: number;
  /** A cheat day's budget: the TDEE (maintenance). */
  budgetKcal: number;
  /** How much more than a normal day the cheat day allows (= the deficit target). */
  extraKcal: number;
  /** Eaten so far that day, and how much of it is over the TDEE. */
  eatenKcal: number;
  overKcal: number;
  /** Left of the cheat-day budget (0 once it is used up). */
  leftKcal: number;
  /** What the day costs the week: the deficit it would have brought plus anything over the TDEE. */
  weekCostKcal: number;
  /** That cost as a share of the weekly boss's HP (BOSS_MAX_HP = 1 kg of fat), in %. */
  weekCostPct: number;
  /** Grams of fat the part over the TDEE stands for. */
  overFatG: number;
  /** How to win the cost back, and each recovery day's intake (normal budget − the extra deficit). */
  recovery: ReturnType<typeof recoveryPlan> & { dayBudgetKcal: number };
}

/** The cheat-day numbers for a player: their TDEE, deficit target and what they ate that day so far. */
export function cheatDayPlan(input: { tdeeKcal: number; targetDeficitKcal: number; eatenKcal: number }): CheatDayPlan {
  const tdeeKcal = Math.max(0, Math.round(input.tdeeKcal));
  const targetDeficitKcal = Math.max(0, Math.round(input.targetDeficitKcal));
  const eatenKcal = Math.max(0, Math.round(input.eatenKcal));
  const normalBudgetKcal = Math.max(0, tdeeKcal - targetDeficitKcal);
  const overKcal = Math.max(0, eatenKcal - tdeeKcal);
  const weekCostKcal = targetDeficitKcal + overKcal;
  const recovery = recoveryPlan(weekCostKcal);
  return {
    tdeeKcal,
    targetDeficitKcal,
    normalBudgetKcal,
    budgetKcal: tdeeKcal,
    extraKcal: targetDeficitKcal,
    eatenKcal,
    overKcal,
    leftKcal: Math.max(0, tdeeKcal - eatenKcal),
    weekCostKcal,
    weekCostPct: Math.round((weekCostKcal / BOSS_MAX_HP) * 100),
    overFatG: Math.round((overKcal / KCAL_PER_KG_FAT) * 1000),
    recovery: { ...recovery, dayBudgetKcal: Math.max(0, normalBudgetKcal - recovery.perDayKcal) },
  };
}
