import { addDays } from '../utils/milestones';
import { toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { BOSS_MAX_HP, dailyDamageCapKcal } from './constants';

export interface BossDay {
  dateKey: string;
  /** Damage dealt that day (0 when the day has no data). */
  damage: number;
  /** Raw deficit before the daily cap, or null when the day has no logged food or is a cheat day. */
  deficitKcal: number | null;
  capped: boolean;
  /** A cheat day: no damage and no heal, whatever was eaten. */
  cheat: boolean;
  /** Kcal burned by exercise that day: the part of the deficit from training (the rest, deficitKcal − burnedKcal, is from eating
   *  below the TDEE, or above it when negative). */
  burnedKcal: number;
}

export interface BossState {
  /** Monday of the week this boss belongs to; it resets at 00:00 on this date each week. */
  weekKey: string;
  maxHp: number;
  hpLeft: number;
  totalDamage: number;
  days: BossDay[];
  defeated: boolean;
  /** Days from today until the next reset (1 on Sunday, 7 on Monday). */
  daysUntilReset: number;
  /** Average damage per day still to come this week needed to defeat it (0 if already beaten). */
  neededPerRemainingDay: number;
}

/** Damage for one day: its deficit clamped to [0, DAILY_DAMAGE_CAP + the day's exercise kcal] (eating alone counts for at most
 *  DAILY_DAMAGE_CAP; training adds on top). A day without data deals 0. */
export function damageForDeficit(deficitKcal: number | null, burnedKcal = 0): { damage: number; capped: boolean } {
  if (deficitKcal == null || deficitKcal <= 0) return { damage: 0, capped: false };
  const cap = dailyDamageCapKcal(burnedKcal);
  const capped = deficitKcal > cap;
  return { damage: Math.round(capped ? cap : deficitKcal), capped };
}

/** The weekly boss resets at 05:00 on Monday, not at midnight (the user's rule, 2026-11-02: time to enjoy a Sunday-night win). */
export const BOSS_RESET_HOUR = 5;

/** The moment the weekly boss is judged at: `now`, except Monday before BOSS_RESET_HOUR, which still belongs to the week before
 *  (judged as the very end of that Sunday; food logged in those hours counts for Monday, so for the new boss from 05:00). */
export function bossClock(now: Date): Date {
  if (now.getDay() !== 1 || now.getHours() >= BOSS_RESET_HOUR) return now;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
}

/**
 * Builds the boss for the week containing `now` (as of `bossClock(now)`: until 05:00 on Monday, the week before). Only days up to and including today deal damage;
 * today's damage is live (it grows as the day's deficit grows), matching how the streak treats it.
 * A cheat day (`isCheatDay`) deals nothing and heals nothing.
 */
export function bossForWeek(
  now: Date,
  deficitForDateKey: (dateKey: string) => number | null,
  maxHp: number = BOSS_MAX_HP,
  isCheatDay: (dateKey: string) => boolean = () => false,
  burnedForDateKey: (dateKey: string) => number = () => 0
): BossState {
  now = bossClock(now);
  const weekKey = weekStartKey(now);
  const monday = new Date(`${weekKey}T12:00:00`);
  const todayKey = toDateKey(now);

  const days: BossDay[] = [];
  for (let i = 0; i < 7; i++) {
    const dateKey = toDateKey(addDays(monday, i));
    if (dateKey > todayKey) break;
    const cheat = isCheatDay(dateKey);
    const deficitKcal = cheat ? null : deficitForDateKey(dateKey);
    const burnedKcal = Math.max(0, burnedForDateKey(dateKey));
    const { damage, capped } = damageForDeficit(deficitKcal, burnedKcal);
    days.push({ dateKey, damage, deficitKcal, capped, cheat, burnedKcal });
  }

  const totalDamage = days.reduce((s, d) => s + d.damage, 0);
  const hpLeft = Math.max(0, maxHp - totalDamage);
  const defeated = hpLeft === 0;
  const dayIndexToday = days.length; // 1 = Monday … 7 = Sunday
  const daysUntilReset = 8 - dayIndexToday;
  // Today's damage is already counted in hpLeft, so only the days after today still add to it, less the cheat days among them
  // (they deal nothing); with none left, the whole remainder has to land today.
  let cheatAhead = 0;
  for (let i = dayIndexToday; i < 7; i++) if (isCheatDay(toDateKey(addDays(monday, i)))) cheatAhead++;
  const remainingDays = Math.max(1, 7 - dayIndexToday - cheatAhead);
  return {
    weekKey,
    maxHp,
    hpLeft,
    totalDamage,
    days,
    defeated,
    daysUntilReset,
    neededPerRemainingDay: defeated ? 0 : Math.ceil(hpLeft / remainingDays),
  };
}
