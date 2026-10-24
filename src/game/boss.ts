import { addDays } from '../utils/milestones';
import { toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { BOSS_MAX_HP, DAILY_DAMAGE_CAP_KCAL } from './constants';

export interface BossDay {
  dateKey: string;
  /** Damage dealt that day (0 when the day has no data). */
  damage: number;
  /** Raw deficit before the daily cap, or null when the day has no logged food. */
  deficitKcal: number | null;
  capped: boolean;
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

/** Damage for one day: its deficit clamped to [0, DAILY_DAMAGE_CAP]. A day without data deals 0. */
export function damageForDeficit(deficitKcal: number | null): { damage: number; capped: boolean } {
  if (deficitKcal == null || deficitKcal <= 0) return { damage: 0, capped: false };
  const capped = deficitKcal > DAILY_DAMAGE_CAP_KCAL;
  return { damage: Math.round(capped ? DAILY_DAMAGE_CAP_KCAL : deficitKcal), capped };
}

/**
 * Builds the boss for the week containing `now`. Only days up to and including today deal damage;
 * today's damage is live (it grows as the day's deficit grows), matching how the streak treats it.
 */
export function bossForWeek(
  now: Date,
  deficitForDateKey: (dateKey: string) => number | null,
  maxHp: number = BOSS_MAX_HP
): BossState {
  const weekKey = weekStartKey(now);
  const monday = new Date(`${weekKey}T12:00:00`);
  const todayKey = toDateKey(now);

  const days: BossDay[] = [];
  for (let i = 0; i < 7; i++) {
    const dateKey = toDateKey(addDays(monday, i));
    if (dateKey > todayKey) break;
    const deficitKcal = deficitForDateKey(dateKey);
    const { damage, capped } = damageForDeficit(deficitKcal);
    days.push({ dateKey, damage, deficitKcal, capped });
  }

  const totalDamage = days.reduce((s, d) => s + d.damage, 0);
  const hpLeft = Math.max(0, maxHp - totalDamage);
  const defeated = hpLeft === 0;
  const dayIndexToday = days.length; // 1 = Monday … 7 = Sunday
  const daysUntilReset = 8 - dayIndexToday;
  // Today's damage is already counted in hpLeft, so only the days after today still add to it;
  // on Sunday there are none left, so the whole remainder has to land today.
  const remainingDays = Math.max(1, 7 - dayIndexToday);
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
