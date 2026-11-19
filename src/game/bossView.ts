import type { BossDay, BossState } from './boss';
import { DAILY_DAMAGE_CAP_KCAL } from './constants';
import { mealNames } from './deficitView';
import type { DayEvaluation } from './missions';
import type { GameKey } from './strings';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

export const bossNum = (n: number) => Math.round(n).toLocaleString('en-US');

/** A day's deficit split into its two sources: eating below (or above) the TDEE, and training. Eating counts for at most
 *  DAILY_DAMAGE_CAP_KCAL of the damage, training on top. */
export function deficitSplitText(d: BossDay, g: Translate): string {
  if (d.deficitKcal == null) return '';
  const diet = Math.round(d.deficitKcal - d.burnedKcal);
  const parts = [
    diet >= 0
      ? g(diet > DAILY_DAMAGE_CAP_KCAL ? 'boss.detail.fromDietCapped' : 'boss.detail.fromDiet', { n: bossNum(diet), cap: bossNum(DAILY_DAMAGE_CAP_KCAL) })
      : g('boss.detail.overDiet', { n: bossNum(-diet) }),
  ];
  if (d.burnedKcal > 0) parts.push(g('boss.detail.fromTraining', { n: bossNum(Math.round(d.burnedKcal)) }));
  return parts.join(' · ');
}

/** Today's hit on the weekly boss: the headline ("Thâm hụt dự kiến 960 kcal → ~960 sát thương, chờ chốt") and why it is what it is
 *  (cheat day, nothing logged, eating over, capped, meals still to come). Either can be empty. */
export function bossHitTexts(boss: BossState, todayEval: Pick<DayEvaluation, 'pendingMeals'>, g: Translate): { headline: string; reason: string } {
  const today = boss.days[boss.days.length - 1];
  let reason: string;
  if (today?.cheat) reason = today.damage > 0 ? g('bossX.hitCheat', { n: bossNum(today.damage) }) : g('boss.detail.hitCheat');
  else if (today?.pending && today.deficitKcal != null && today.deficitKcal > 0) reason = g('boss.detail.hitPendingNote', { meals: mealNames(todayEval.pendingMeals, g) });
  else if (!today || today.deficitKcal == null) reason = g('boss.detail.hitNone');
  else if (today.deficitKcal <= 0) reason = g('boss.detail.hitSurplus');
  else if (today.capped) reason = g('boss.detail.hitCap', { cap: bossNum(DAILY_DAMAGE_CAP_KCAL) });
  else reason = '';
  const headline =
    today && today.deficitKcal != null && today.deficitKcal > 0
      ? today.pending
        ? g('boss.detail.hitPending', { def: bossNum(today.deficitKcal), dmg: bossNum(today.pendingDamage) })
        : g('boss.detail.hit', { def: bossNum(today.deficitKcal), dmg: bossNum(today.damage) })
      : '';
  return { headline, reason };
}

/** The status line under the HP: beaten, last day, or the days left and the average needed per day. */
export function bossStatusText(boss: BossState, g: Translate): string {
  if (boss.defeated) return g('boss.detail.beaten');
  if (boss.daysUntilReset <= 1) return g('boss.detail.leftLast', { n: bossNum(boss.hpLeft) });
  return g('boss.detail.left', { d: boss.daysUntilReset - 1, n: bossNum(boss.neededPerRemainingDay) });
}

/** The AI weekly review of the week that starts on `weekKey` (its Monday): the route the week's entry points open, so a past week
 *  shows its own review, not this week's. */
export const weeklyReportHref = (weekKey: string) => ({ pathname: '/weekly-report' as const, params: { week: weekKey } });

/** A whole number for the boss's own lines: dots between thousands in Vietnamese ("6.420"), commas in English ("6,420"). */
export function kcalNum(n: number, language: 'vi' | 'en' = 'vi'): string {
  const r = Math.round(n);
  const digits = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, language === 'en' ? ',' : '.');
  return `${r < 0 ? '−' : ''}${digits}`;
}

/** The week's total deficit so far, from the boss's days: each settled day's deficit (a surplus counts against it), a cheat day as
 *  the hit it deals (the daily target; its own kcal are not counted), and today's end-of-day estimate apart while it is pending
 *  (like the "~" in the day cells). */
export function weekDeficitTotal(boss: Pick<BossState, 'days'>): { kcal: number; pendingKcal: number; cheatDays: number; cheatKcal: number } {
  let kcal = 0;
  let pendingKcal = 0;
  let cheatDays = 0;
  let cheatKcal = 0;
  for (const d of boss.days) {
    if (d.cheat) {
      cheatDays += 1;
      cheatKcal += d.damage;
      kcal += d.damage;
    } else if (d.deficitKcal != null) {
      if (d.pending) pendingKcal += d.deficitKcal;
      else kcal += d.deficitKcal;
    }
  }
  return { kcal: Math.round(kcal), pendingKcal: Math.round(pendingKcal), cheatDays, cheatKcal: Math.round(cheatKcal) };
}

/** "Tổng thâm hụt: 6.420 kcal · dự kiến thêm ~900 hôm nay · gồm 1 ngày cheat (1.100)". */
export function weekDeficitText(boss: Pick<BossState, 'days'>, g: Translate, language: 'vi' | 'en' = 'vi'): string {
  const t = weekDeficitTotal(boss);
  const parts = [g('bossX.weekTotal', { n: kcalNum(t.kcal, language) })];
  if (t.pendingKcal !== 0) parts.push(g('bossX.weekTotalPending', { n: kcalNum(t.pendingKcal, language) }));
  if (t.cheatDays > 0 && t.cheatKcal > 0) parts.push(g('bossX.weekTotalCheat', { c: t.cheatDays, n: kcalNum(t.cheatKcal, language) }));
  return parts.join(' · ');
}

/** A cheat day's line in the boss's day list: "🎉 Cheat day: −1.100 HP (miễn trừ 1 ngày)". */
export function cheatHitText(d: Pick<BossDay, 'damage'>, g: Translate, language: 'vi' | 'en' = 'vi'): string {
  return d.damage > 0 ? g('bossX.cheatHit', { n: kcalNum(d.damage, language) }) : g('boss.detail.cheat');
}
