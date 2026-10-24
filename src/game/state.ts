import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../types';
import { addDays } from '../utils/milestones';
import { toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { bossForWeek, type BossState } from './boss';
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
      })
    );
  }

  const deficitFor = (dateKey: string) => evaluations.get(dateKey)?.deficitKcal ?? null;

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
  const currentWeek = weekStartKey(now);
  const seenWeeks = new Set<string>();
  for (const dateKey of evaluations.keys()) {
    const week = weekStartKey(new Date(`${dateKey}T12:00:00`));
    if (seenWeeks.has(week)) continue;
    seenWeeks.add(week);
    const asOf = week === currentWeek ? now : addDays(new Date(`${week}T12:00:00`), 6);
    const weekBoss = bossForWeek(asOf, deficitFor);
    if (weekBoss.defeated) bossesDefeated += 1;
    bossHistory.push(weekBoss);
  }
  bossHistory.sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));
  totalXp += bossesDefeated * BOSS_DEFEAT_XP;

  const boss = bossForWeek(now, deficitFor);
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
