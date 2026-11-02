import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../types';
import { addDays } from '../utils/milestones';
import { toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { bossClock, bossForWeek, type BossState } from './boss';
import { BOSS_DEFEAT_XP, type Limits } from './constants';
import { levelProgress, type LevelProgress } from './level';
import { evaluateDay, type DayEvaluation } from './missions';

export interface GameInputs {
  now: Date;
  startDateISO: string;
  logs: Record<string, DailyNutritionLog>;
  workoutEntries: WorkoutLogEntry[];
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>;
  /** Today's TDEE is applied to every past day too — the same simplification the streak makes. */
  tdeeKcal: number;
  proteinTargetG: number;
  limits?: Partial<Limits>;
  /** Days marked as a cheat day: they keep their food but have no deficit (no boss damage, no deficit XP). */
  cheatDays?: readonly string[];
  /** XP earned outside the replayed logs (the temptation challenge's resisted pop-ups). */
  bonusXp?: number;
  /** The daily deficit target (sizes the meals still to come in today's estimate). */
  targetDeficitKcal?: number;
  /** Meals skipped on purpose, by date: no longer missing or still to come (so a day with only skipped meals left is settled). */
  skippedMeals?: Readonly<Record<string, readonly string[]>>;
}

export interface GameState {
  today: DayEvaluation;
  boss: BossState;
  totalXp: number;
  level: LevelProgress;
  bossesDefeated: number;
  perfectDays: number;
  /** One entry per week since the start (newest first); the first is the live current-week boss. */
  bossHistory: BossState[];
  /** Every replayed day, oldest first — the raw material for the achievements. */
  days: DayEvaluation[];
}

/** The deficit a day brings to the boss: the real one once the day is settled, the end-of-day estimate (pending damage) before. */
export const bossDeficitOf = (e: DayEvaluation): number | null => (e.settled ? e.deficitKcal : e.projectedDeficitKcal);

/** Hard cap on how far back we replay, so a corrupt start date can never loop for years. */
const MAX_REPLAY_DAYS = 1100;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Derives all game progress (XP, level, boss defeats) by replaying the user's own logs day by day.
 * Nothing about the game is stored, so it can never drift out of sync with the real data or between
 * devices: delete a logged meal and the XP it earned goes with it.
 */
export function computeGameState(input: GameInputs): GameState {
  const { now, startDateISO, logs, workoutEntries, mealTemplatesByDayType, tdeeKcal, proteinTargetG, limits } = input;
  const cheatDays = new Set(input.cheatDays ?? []);

  const workoutsByDay = new Map<string, WorkoutLogEntry[]>();
  for (const entry of workoutEntries) {
    const key = toDateKey(new Date(entry.dateISO));
    const list = workoutsByDay.get(key);
    if (list) list.push(entry);
    else workoutsByDay.set(key, [entry]);
  }

  const today = startOfDay(now);
  let first = startOfDay(new Date(startDateISO));
  if (Number.isNaN(first.getTime()) || first.getTime() > today.getTime()) first = today;
  const spanDays = Math.round((today.getTime() - first.getTime()) / 86400000);
  if (spanDays > MAX_REPLAY_DAYS) first = addDays(today, -MAX_REPLAY_DAYS);

  const evaluations = new Map<string, DayEvaluation>();
  for (let d = new Date(first); d.getTime() <= today.getTime(); d = addDays(d, 1)) {
    const dateKey = toDateKey(d);
    evaluations.set(
      dateKey,
      evaluateDay({
        dateKey,
        now,
        log: logs[dateKey],
        mealTemplatesByDayType,
        workouts: workoutsByDay.get(dateKey) ?? [],
        tdeeKcal,
        proteinTargetG,
        limits,
        cheat: cheatDays.has(dateKey),
        targetDeficitKcal: input.targetDeficitKcal,
        skippedMealIds: input.skippedMeals?.[dateKey],
      })
    );
  }

  // A day still being eaten into (today, meals to come) gives the boss its end-of-day estimate, as pending damage.
  const deficitFor = (dateKey: string) => {
    const e = evaluations.get(dateKey);
    return e == null ? null : bossDeficitOf(e);
  };
  const isSettled = (dateKey: string) => evaluations.get(dateKey)?.settled ?? true;
  const isCheatDay = (dateKey: string) => cheatDays.has(dateKey);
  const burnedFor = (dateKey: string) => evaluations.get(dateKey)?.burnedKcal ?? 0;

  let totalXp = 0;
  let perfectDays = 0;
  for (const evaluation of evaluations.values()) {
    totalXp += evaluation.earnedXp;
    if (evaluation.perfect) perfectDays += 1;
  }

  // One defeat bonus per week whose boss reached 0 HP. Past weeks are judged on their full seven
  // days (evaluated as of that Sunday); the current week as of now.
  let bossesDefeated = 0;
  const bossHistory: BossState[] = [];
  const currentWeek = weekStartKey(bossClock(now));
  const seenWeeks = new Set<string>();
  for (const dateKey of evaluations.keys()) {
    const week = weekStartKey(new Date(`${dateKey}T12:00:00`));
    if (seenWeeks.has(week)) continue;
    seenWeeks.add(week);
    const asOf = week === currentWeek ? now : addDays(new Date(`${week}T12:00:00`), 6);
    const weekBoss = bossForWeek(asOf, deficitFor, undefined, isCheatDay, burnedFor, isSettled);
    if (weekBoss.defeated) bossesDefeated += 1;
    bossHistory.push(weekBoss);
  }
  bossHistory.sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));
  totalXp += bossesDefeated * BOSS_DEFEAT_XP;
  totalXp += Math.max(0, Math.round(input.bonusXp ?? 0));

  const boss = bossForWeek(now, deficitFor, undefined, isCheatDay, burnedFor, isSettled);
  return {
    today: evaluations.get(toDateKey(today))!,
    boss,
    totalXp,
    level: levelProgress(totalXp),
    bossesDefeated,
    perfectDays,
    bossHistory,
    days: [...evaluations.values()],
  };
}
