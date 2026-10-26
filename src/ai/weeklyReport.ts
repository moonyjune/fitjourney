import { IF_EATING_END_HOUR, getDayType } from '../constants/plan';
import { bossForWeek, type BossState } from '../game/boss';
import { DAILY_DAMAGE_CAP_KCAL, type MissionId } from '../game/constants';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import { KCAL_PER_KG_FAT } from '../utils/tdee';
import { weekStartKey } from '../utils/weekKey';
import { evaluatorFor, makeDayEvaluator, type DaySource } from './coachContext';

/** Where the week stands against the boss, decided here in code (the AI is told it, never asked to guess it). */
export type BossStatus = 'defeated' | 'on_track' | 'behind' | 'far';

/** defeated: HP is 0. on_track: the damage still needed per remaining day is within the daily deficit target. behind: it is
 *  more than the target but still within what one day can deal (the daily cap). far: it is more than a day can deal. */
export function bossStatusOf(boss: Pick<BossState, 'defeated' | 'neededPerRemainingDay'>, dailyDeficitKcal: number): BossStatus {
  if (boss.defeated) return 'defeated';
  if (boss.neededPerRemainingDay > DAILY_DAMAGE_CAP_KCAL) return 'far';
  return boss.neededPerRemainingDay <= dailyDeficitKcal ? 'on_track' : 'behind';
}

export interface WeekDay {
  date: string;
  /** Anything was logged to eat that day. */
  logged: boolean;
  /** TDEE + exercise − eaten; omitted when no food was logged. */
  deficitKcal?: number;
  /** Damage dealt to the boss that day. */
  damage: number;
  eatenKcal: number;
  proteinG: number;
  burnedKcal: number;
  waterMl: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
  workouts: number;
  junkCount: number;
  /** Hour (0-23) of the last meal or snack of the day, when there was one. */
  lastMealHour?: number;
  /** Missions that ended the day missed (or are already broken today). */
  missed: MissionId[];
}

export interface WeekPatterns {
  daysLogged: number;
  avgDeficitKcal?: number;
  avgProteinG?: number;
  workoutDays: number;
  proteinMissDays: number;
  saltOverDays: number;
  purineOverDays: number;
  sugarOverDays: number;
  junkDays: number;
  waterShortDays: number;
  lateMealDays: number;
}

export interface WeekInput {
  week: { start: string; today: string; daysElapsed: number; daysUntilReset: number };
  boss: { maxHp: number; hpLeft: number; damageSoFar: number; defeated: boolean; neededPerRemainingDay: number; status: BossStatus };
  targets: { tdeeKcal: number; dailyDeficitKcal: number; proteinTargetG: number; waterTargetMl: number; purineLimitMg: number; saltLimitG: number; sugarLimitG: number };
  days: WeekDay[];
  patterns: WeekPatterns;
  weight: { startKg?: number; endKg?: number; changeKg?: number; expectedChangeKg?: number; gapKg?: number };
  previousWeek?: { damage: number; daysLogged: number; avgDeficitKcal?: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const WATER_SHORT_RATIO = 0.7;

/** The data a week is built from: the day rules' source plus the weigh-ins and the targets the week is judged by. */
export interface WeekSource extends DaySource {
  weights: { dateISO: string; weightKg: number }[];
  dailyDeficitKcal: number;
  waterTargetMl: number;
}

/** The week source of the signed-in user, read from this device's stores. */
export function weekSourceFromStores(now: Date = new Date()): WeekSource {
  const { logs, weights, plan, settings, limits, tdeeKcal } = makeDayEvaluator(now);
  return {
    logs,
    workoutEntries: useWorkoutStore.getState().entries,
    mealTemplates: plan.mealTemplates,
    tdeeKcal,
    proteinTargetG: settings.proteinTargetG,
    limits: { purineMg: limits.purineMg, saltG: limits.saltG, sugarG: limits.sugarG },
    weights,
    dailyDeficitKcal: settings.targetDailyDeficitKcal,
    waterTargetMl: settings.waterTargetMl,
  };
}

/** Reads this device's logs and builds the weekly review input (see `buildWeekInput`). */
export function buildWeeklyReportInput(now: Date = new Date()): WeekInput {
  return buildWeekInput(weekSourceFromStores(now), now);
}

/** Builds everything the weekly review is based on: the week so far (Monday to today), per day and in
 *  patterns, the boss, the weight trend against the deficit, and last week for comparison. All arithmetic is here; numbers
 *  and dates only (no names, emails, ids or free text). */
export function buildWeekInput(source: WeekSource, now: Date = new Date()): WeekInput {
  const { logs, weights, limits, tdeeKcal } = source;
  const { evaluate, byDay } = evaluatorFor(source, now);
  const settings = { waterTargetMl: source.waterTargetMl, targetDailyDeficitKcal: source.dailyDeficitKcal, proteinTargetG: source.proteinTargetG };
  const todayKey = toDateKey(now);
  const startKey = weekStartKey(now);
  const monday = new Date(`${startKey}T12:00:00`);

  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = toDateKey(addDays(monday, i));
    if (date > todayKey) break;
    const e = evaluate(date);
    const log = logs[date];
    const extras = log?.extraItems ?? [];
    const planned = source.mealTemplates[getDayType(new Date(`${date}T12:00:00`))].filter((m) => log?.mealsEaten[m.slot]).map((m) => m.startHour);
    const hours = [...planned, ...extras.map((x) => new Date(x.loggedAtISO).getHours())].filter((h) => Number.isFinite(h));
    const logged = e.deficitKcal !== null;
    const day: WeekDay = {
      date,
      logged,
      damage: Math.min(Math.max(e.deficitKcal ?? 0, 0), DAILY_DAMAGE_CAP_KCAL),
      eatenKcal: Math.round(e.eatenKcal),
      proteinG: Math.round(e.proteinG),
      burnedKcal: Math.round(e.burnedKcal),
      waterMl: Math.round(log?.waterMl ?? 0),
      purineMg: Math.round(e.nutrients.purineMg),
      saltG: r1(e.nutrients.saltG),
      sugarG: r1(e.nutrients.sugarG),
      workouts: byDay.get(date)?.length ?? 0,
      junkCount: e.junkCount,
      missed: e.missions.filter((m) => m.status === 'missed').map((m) => m.id),
    };
    if (e.deficitKcal !== null) day.deficitKcal = Math.round(e.deficitKcal);
    if (hours.length > 0) day.lastMealHour = Math.max(...hours);
    days.push(day);
  }

  const loggedDays = days.filter((d) => d.logged);
  const count = (pred: (d: WeekDay) => boolean) => loggedDays.filter(pred).length;
  const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : undefined);
  const deficits = loggedDays.map((d) => d.deficitKcal).filter((v): v is number => v !== undefined);
  const patterns: WeekPatterns = {
    daysLogged: loggedDays.length,
    avgDeficitKcal: avg(deficits),
    avgProteinG: avg(loggedDays.map((d) => d.proteinG)),
    workoutDays: days.filter((d) => d.workouts > 0).length,
    proteinMissDays: count((d) => d.missed.includes('protein')),
    saltOverDays: count((d) => d.saltG > limits.saltG),
    purineOverDays: count((d) => d.purineMg > limits.purineMg),
    sugarOverDays: count((d) => d.sugarG > limits.sugarG),
    junkDays: count((d) => d.junkCount > 0),
    waterShortDays: loggedDays.filter((d) => d.waterMl < settings.waterTargetMl * WATER_SHORT_RATIO).length,
    lateMealDays: count((d) => d.lastMealHour !== undefined && d.lastMealHour >= IF_EATING_END_HOUR),
  };

  const boss = bossForWeek(now, (key) => evaluate(key).deficitKcal);

  // Weight: from the last weigh-in before the week (else the first of the week) to the latest, against what the deficit predicts.
  const points = weights
    .map((w) => ({ date: toDateKey(new Date(w.dateISO)), kg: w.weightKg }))
    .filter((w) => w.date <= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const before = points.filter((p) => p.date < startKey);
  const inWeek = points.filter((p) => p.date >= startKey);
  const start = before.length > 0 ? before[before.length - 1] : inWeek[0];
  const end = inWeek.length > 0 ? inWeek[inWeek.length - 1] : undefined;
  const weight: WeekInput['weight'] = {};
  if (start && end && !(start === end)) {
    weight.startKg = r1(start.kg);
    weight.endKg = r1(end.kg);
    weight.changeKg = r1(end.kg - start.kg);
    weight.expectedChangeKg = r1(-deficits.reduce((s, d) => s + d, 0) / KCAL_PER_KG_FAT);
    weight.gapKg = r1(weight.changeKg - weight.expectedChangeKg);
  }

  // Last week, for comparison: the same rules, ended on its Sunday.
  const prevSunday = addDays(monday, -1);
  prevSunday.setHours(12, 0, 0, 0);
  const prevBoss = bossForWeek(prevSunday, (key) => evaluate(key).deficitKcal);
  const prevDeficits = prevBoss.days.map((d) => d.deficitKcal).filter((v): v is number => v !== null);
  const previousWeek: WeekInput['previousWeek'] =
    prevDeficits.length > 0 ? { damage: Math.round(prevBoss.totalDamage), daysLogged: prevDeficits.length, avgDeficitKcal: avg(prevDeficits) } : undefined;

  return {
    week: { start: startKey, today: todayKey, daysElapsed: days.length, daysUntilReset: boss.daysUntilReset },
    boss: {
      maxHp: Math.round(boss.maxHp),
      hpLeft: Math.round(boss.hpLeft),
      damageSoFar: Math.round(boss.totalDamage),
      defeated: boss.defeated,
      neededPerRemainingDay: Math.round(boss.neededPerRemainingDay),
      status: bossStatusOf(boss, settings.targetDailyDeficitKcal),
    },
    targets: {
      tdeeKcal: Math.round(tdeeKcal),
      dailyDeficitKcal: Math.round(settings.targetDailyDeficitKcal),
      proteinTargetG: Math.round(settings.proteinTargetG),
      waterTargetMl: Math.round(settings.waterTargetMl),
      purineLimitMg: Math.round(limits.purineMg),
      saltLimitG: r1(limits.saltG),
      sugarLimitG: r1(limits.sugarG),
    },
    days,
    patterns,
    weight,
    ...(previousWeek ? { previousWeek } : {}),
  };
}

/** What the AI writes about the week. The numbers and the boss status stay the ones computed above. */
export interface WeeklyReport {
  headline: string;
  causes: { date?: string; text: string }[];
  patterns: string[];
  weightNote?: string;
  nextWeek: { action: string; why?: string }[];
  encouragement?: string;
}

const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The model's answer reduced to what the screen can show: a headline is required, lists are capped (3 causes, 3 patterns,
 *  5 actions), blank or wrongly-typed entries are dropped. Null when it is not usable. */
export function cleanReport(raw: unknown): WeeklyReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const headline = text(r.headline, 200);
  if (!headline) return null;
  const causes = (Array.isArray(r.causes) ? r.causes : [])
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const t = text(o.text, 300);
      if (!t) return null;
      return typeof o.date === 'string' && DATE_RE.test(o.date) ? { date: o.date, text: t } : { text: t };
    })
    .filter((c): c is { date?: string; text: string } => c !== null)
    .slice(0, 3);
  const patterns = (Array.isArray(r.patterns) ? r.patterns : []).map((p) => text(p, 300)).filter((p): p is string => !!p).slice(0, 3);
  const nextWeek = (Array.isArray(r.nextWeek) ? r.nextWeek : [])
    .map((a) => {
      const o = (a ?? {}) as Record<string, unknown>;
      const action = text(o.action, 250);
      if (!action) return null;
      const why = text(o.why, 250);
      return why ? { action, why } : { action };
    })
    .filter((a): a is { action: string; why?: string } => a !== null)
    .slice(0, 5);
  if (causes.length === 0 && patterns.length === 0 && nextWeek.length === 0) return null;
  const report: WeeklyReport = { headline, causes, patterns, nextWeek };
  const weightNote = text(r.weightNote, 400);
  if (weightNote) report.weightNote = weightNote;
  const encouragement = text(r.encouragement, 250);
  if (encouragement) report.encouragement = encouragement;
  return report;
}
