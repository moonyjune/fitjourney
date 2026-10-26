import { IF_EATING_END_HOUR, getDayType } from '../constants/plan';
import { bossForWeek } from '../game/boss';
import { evaluateDay, type DayEvaluation } from '../game/missions';
import { useLimitsStore } from '../store/useLimitsStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import { resolveTdeeKcal } from '../utils/tdee';
import type { DailyNutritionLog, PlanData, WorkoutLogEntry } from '../types';

/** How many days back the AI sees (today not included). The server enforces the same cap. */
export const COACH_HISTORY_DAYS = 7;

export interface CoachDay {
  date: string;
  eatenKcal: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
  waterMl: number;
  burnedKcal: number;
  workouts: number;
  /** TDEE + exercise − eaten; omitted when nothing was logged that day. */
  deficitKcal?: number;
}

/** What the AI is told about the user's situation so its advice fits the plan. Numbers and dates only: no names, emails,
 *  ids or free text from the user's logs. */
export interface CoachContext {
  now: { date: string; time: string; eatingWindowEndsAtHour: number; eatingClosed: boolean };
  targets: {
    tdeeKcal: number;
    dailyDeficitKcal: number;
    calorieTargetKcal: number;
    proteinTargetG: number;
    waterTargetMl: number;
    purineLimitMg: number;
    saltLimitG: number;
    sugarLimitG: number;
    goalWeightKg: number;
  };
  today: CoachDay & { plannedMealsLeft: { label: string; time: string; kcal: number; proteinG: number }[] };
  week: {
    bossMaxHp: number;
    bossHpLeft: number;
    damageSoFar: number;
    defeated: boolean;
    daysUntilReset: number;
    neededDamagePerRemainingDay: number;
  };
  recentDays: CoachDay[];
  recentWeights: { date: string; kg: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toCoachDay(e: DayEvaluation, waterMl: number, workouts: number): CoachDay {
  const day: CoachDay = {
    date: e.dateKey,
    eatenKcal: Math.round(e.eatenKcal),
    proteinG: Math.round(e.proteinG),
    purineMg: Math.round(e.nutrients.purineMg),
    saltG: r1(e.nutrients.saltG),
    sugarG: r1(e.nutrients.sugarG),
    waterMl: Math.round(waterMl),
    burnedKcal: Math.round(e.burnedKcal),
    workouts,
  };
  if (e.deficitKcal != null) day.deficitKcal = Math.round(e.deficitKcal);
  return day;
}

/** Everything the day rules need, wherever it came from (this device's stores, or a client's rows read by their coach). */
export interface DaySource {
  logs: Record<string, DailyNutritionLog>;
  workoutEntries: WorkoutLogEntry[];
  mealTemplates: PlanData['mealTemplates'];
  tdeeKcal: number;
  proteinTargetG: number;
  limits: { purineMg: number; saltG: number; sugarG: number };
}

/** A day evaluator (missions, deficit, nutrients: the game's own rules) over a source, plus its workouts grouped by day. */
export function evaluatorFor(source: DaySource, now: Date) {
  const byDay = new Map<string, WorkoutLogEntry[]>();
  for (const e of source.workoutEntries) {
    const key = toDateKey(new Date(e.dateISO));
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }
  const evaluate = (dateKey: string) =>
    evaluateDay({
      dateKey,
      now,
      log: source.logs[dateKey],
      mealTemplatesByDayType: source.mealTemplates,
      workouts: byDay.get(dateKey) ?? [],
      tdeeKcal: source.tdeeKcal,
      proteinTargetG: source.proteinTargetG,
      limits: source.limits,
    });
  return { evaluate, byDay };
}

/** The user's data and a day evaluator (the same rules as the game: missions, deficit, nutrients) for the given moment.
 *  Shared by the coach snapshot and the weekly review so both read the logs the same way. */
export function makeDayEvaluator(now: Date) {
  const settings = useSettingsStore.getState();
  const limits = useLimitsStore.getState();
  const logs = useNutritionStore.getState().logs;
  const workoutEntries = useWorkoutStore.getState().entries;
  const weights = useWeightStore.getState().entries;
  const plan = usePlanStore.getState().plan;

  const latestWeight = useWeightStore.getState().latest();
  const weightKg = latestWeight?.weightKg ?? settings.startWeightKg;
  const tdeeKcal = resolveTdeeKcal({
    gender: settings.gender,
    age: settings.age,
    heightCm: settings.heightCm,
    activityLevel: settings.activityLevel,
    weightKg,
    calorieTargetKcal: settings.calorieTargetKcal,
    targetDailyDeficitKcal: settings.targetDailyDeficitKcal,
  }).tdeeKcal;

  const { evaluate, byDay } = evaluatorFor(
    { logs, workoutEntries, mealTemplates: plan.mealTemplates, tdeeKcal, proteinTargetG: settings.proteinTargetG, limits: { purineMg: limits.purineMg, saltG: limits.saltG, sugarG: limits.sugarG } },
    now
  );
  return { evaluate, byDay, logs, weights, plan, settings, limits, tdeeKcal };
}

/** Reads the stores and builds the snapshot sent with a photo analysis: the last up-to-7 days of intake and workouts,
 *  today so far, the daily/weekly targets and the state of this week's boss. */
export function buildCoachContext(now: Date = new Date()): CoachContext {
  const { evaluate, byDay, logs, weights, plan, settings, limits, tdeeKcal } = makeDayEvaluator(now);
  const dayOf = (dateKey: string) => toCoachDay(evaluate(dateKey), logs[dateKey]?.waterMl ?? 0, byDay.get(dateKey)?.length ?? 0);

  const todayKey = toDateKey(now);
  const todayEval = evaluate(todayKey);
  const meals = plan.mealTemplates[getDayType(now)];
  const todayLog = logs[todayKey];
  const removed = new Set(todayLog?.removedMealSlots ?? []);
  const plannedMealsLeft = meals
    .filter((m) => !todayLog?.mealsEaten[m.slot] && !removed.has(m.slot))
    .map((m) => ({ label: m.label, time: `${pad(m.startHour)}:${pad(m.startMinute)}`, kcal: m.calories, proteinG: m.proteinG }));

  // Only days that hold something are worth sending; an empty day says nothing about intake.
  const recentDays: CoachDay[] = [];
  for (let i = COACH_HISTORY_DAYS; i >= 1; i--) {
    const day = dayOf(toDateKey(addDays(now, -i)));
    if (day.eatenKcal > 0 || day.burnedKcal > 0 || day.waterMl > 0) recentDays.push(day);
  }

  const boss = bossForWeek(now, (key) => evaluate(key).deficitKcal);
  const since = toDateKey(addDays(now, -COACH_HISTORY_DAYS));

  return {
    now: { date: todayKey, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, eatingWindowEndsAtHour: IF_EATING_END_HOUR, eatingClosed: todayEval.eatingClosed },
    targets: {
      tdeeKcal: Math.round(tdeeKcal),
      dailyDeficitKcal: Math.round(settings.targetDailyDeficitKcal),
      calorieTargetKcal: Math.round(settings.calorieTargetKcal),
      proteinTargetG: Math.round(settings.proteinTargetG),
      waterTargetMl: Math.round(settings.waterTargetMl),
      purineLimitMg: Math.round(limits.purineMg),
      saltLimitG: r1(limits.saltG),
      sugarLimitG: r1(limits.sugarG),
      goalWeightKg: r1(settings.goalWeightKg),
    },
    today: { ...toCoachDay(todayEval, todayLog?.waterMl ?? 0, byDay.get(todayKey)?.length ?? 0), plannedMealsLeft },
    week: {
      bossMaxHp: Math.round(boss.maxHp),
      bossHpLeft: Math.round(boss.hpLeft),
      damageSoFar: Math.round(boss.totalDamage),
      defeated: boss.defeated,
      daysUntilReset: boss.daysUntilReset,
      neededDamagePerRemainingDay: Math.round(boss.neededPerRemainingDay),
    },
    recentDays,
    recentWeights: weights
      .map((w) => ({ date: toDateKey(new Date(w.dateISO)), kg: r1(w.weightKg) }))
      .filter((w) => w.date >= since && w.date <= todayKey)
      .slice(-COACH_HISTORY_DAYS),
  };
}
