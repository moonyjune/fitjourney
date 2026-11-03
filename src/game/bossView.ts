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
  if (today?.cheat) reason = g('boss.detail.hitCheat');
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
