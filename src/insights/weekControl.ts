import type { MainMealRecord } from '../feedback/flex';
import { addDaysToKey, avg, dayNumber, mondayOf } from './dateMath';
import type { DayRow } from './days';
import type { Thresholds } from './thresholds';

/** Share of main meals that may be flexible (the 80/20 rule), and meals in a full week (3 a day). */
export const FLEX_SHARE = 0.2;
export const MEALS_PER_WEEK = 21;

export type DeficitStatus = 'done' | 'ended' | 'risk' | 'push' | 'onTrack';
export type QuotaStatus = 'over' | 'used' | 'ok';

/** Where the current week stands: the weekly deficit target and the 80/20 allowance. */
export interface WeekControl {
  weekStart: string;
  weekEnd: string;
  /** The latest day with a log in this week. */
  lastDataKey: string;
  daysWithData: number;
  daysLeft: number;
  targetDeficit: number;
  achieved: number;
  short: number;
  pctTarget: number;
  /** Average deficit still needed per remaining day (null when the week is over). */
  neededPerDay: number | null;
  /** The most deficit a day can safely hold: TDEE minus the minimum kcal. */
  safeMaxPerDay: number;
  /** Best share of the target still reachable if every remaining day runs at the safe maximum. */
  maxPossiblePct: number | null;
  deficitStatus: DeficitStatus;
  mainMeals: number;
  flexible: number;
  onPlan: number;
  skipped: number;
  quota: number;
  quotaLeft: number;
  pctOnPlan: number | null;
  quotaStatus: QuotaStatus;
  surplusDays: number;
  lowKcalDays: number;
  purineOverDays: number;
  avgSodiumMg: number | null;
}

const countClass = (meals: MainMealRecord[], cls: MainMealRecord['cls']) => meals.filter((m) => m.cls === cls).length;

/** The week that contains the latest logged day. Null with nothing logged. */
export function buildWeekControl(rows: DayRow[], meals: MainMealRecord[], tdeeNow: number, th: Thresholds): WeekControl | null {
  if (rows.length === 0) return null;
  const lastDataKey = rows[rows.length - 1].dateKey;
  const weekStart = mondayOf(lastDataKey);
  const weekEnd = addDaysToKey(weekStart, 6);
  const week = rows.filter((r) => r.dateKey >= weekStart && r.dateKey <= weekEnd);
  const wm = meals.filter((m) => m.dateKey >= weekStart && m.dateKey <= weekEnd);

  const targetDeficit = 7 * th.deficitOk;
  const achieved = week.reduce((s, r) => s + r.deficit, 0);
  const short = Math.max(0, targetDeficit - achieved);
  const daysLeft = dayNumber(weekEnd) - dayNumber(lastDataKey);
  const safeMaxPerDay = tdeeNow - th.minKcal;
  const neededPerDay = daysLeft === 0 ? null : short / daysLeft;

  let deficitStatus: DeficitStatus;
  if (daysLeft === 0) deficitStatus = achieved >= targetDeficit ? 'done' : 'ended';
  else if (short === 0) deficitStatus = 'done';
  else if (neededPerDay! > safeMaxPerDay) deficitStatus = 'risk';
  else if (neededPerDay! > th.deficitOk) deficitStatus = 'push';
  else deficitStatus = 'onTrack';

  const onPlan = countClass(wm, 'onPlan');
  const flexible = countClass(wm, 'flexible');
  const skipped = countClass(wm, 'skipped');
  const quota = Math.round(MEALS_PER_WEEK * FLEX_SHARE);
  return {
    weekStart,
    weekEnd,
    lastDataKey,
    daysWithData: week.length,
    daysLeft,
    targetDeficit,
    achieved,
    short,
    pctTarget: targetDeficit > 0 ? achieved / targetDeficit : 0,
    neededPerDay,
    safeMaxPerDay,
    maxPossiblePct: daysLeft === 0 ? null : Math.min(1, (achieved + daysLeft * safeMaxPerDay) / targetDeficit),
    deficitStatus,
    mainMeals: wm.length,
    flexible,
    onPlan,
    skipped,
    quota,
    quotaLeft: quota - flexible,
    pctOnPlan: wm.length > 0 ? onPlan / wm.length : null,
    quotaStatus: flexible > quota ? 'over' : flexible === quota ? 'used' : 'ok',
    surplusDays: week.filter((r) => r.deficit < 0).length,
    lowKcalDays: week.filter((r) => r.complete && r.kcal < th.minKcal).length,
    purineOverDays: week.filter((r) => r.purineMg > th.purineMax).length,
    avgSodiumMg: week.length > 0 ? avg(week.map((r) => r.sodiumMg)) : null,
  };
}

export type QuotaVerdict = 'ok' | 'fair' | 'bad';

/** One past (or current) week against the 80/20 rule. */
export interface WeekQuota {
  weekStart: string;
  weekEnd: string;
  dataDays: number;
  totalDeficit: number;
  /** Total deficit as a share of days x daily target. */
  pctTarget: number;
  mainMeals: number;
  flexible: number;
  pctOnPlan: number | null;
  surplusDays: number;
  /** Flexible meals allowed for the meals logged that week. */
  allowed: number;
  /** Flexible meals above the allowance (0 when within it). */
  over: number;
  verdict: QuotaVerdict;
}

/** The 80/20 record of every logged week, oldest first. Up to 2 flexible meals over the allowance is "fair". */
export function buildWeekQuotas(rows: DayRow[], meals: MainMealRecord[], th: Thresholds): WeekQuota[] {
  const weeks = [...new Set(rows.map((r) => mondayOf(r.dateKey)))].sort();
  return weeks.map((weekStart) => {
    const weekEnd = addDaysToKey(weekStart, 6);
    const week = rows.filter((r) => r.dateKey >= weekStart && r.dateKey <= weekEnd);
    const wm = meals.filter((m) => m.dateKey >= weekStart && m.dateKey <= weekEnd);
    const flexible = countClass(wm, 'flexible');
    const total = week.reduce((s, r) => s + r.deficit, 0);
    const allowed = Math.round(wm.length * FLEX_SHARE);
    const over = Math.max(0, flexible - allowed);
    return {
      weekStart,
      weekEnd,
      dataDays: week.length,
      totalDeficit: total,
      pctTarget: total / (week.length * th.deficitOk),
      mainMeals: wm.length,
      flexible,
      pctOnPlan: wm.length > 0 ? countClass(wm, 'onPlan') / wm.length : null,
      surplusDays: week.filter((r) => r.deficit < 0).length,
      allowed,
      over,
      verdict: over === 0 ? 'ok' : over <= 2 ? 'fair' : 'bad',
    };
  });
}
