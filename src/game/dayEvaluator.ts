import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import type { Limits } from './constants';
import { evaluateDay, type DayEvaluation } from './missions';

export interface DayEvaluatorInput {
  now: Date;
  logs: Record<string, DailyNutritionLog>;
  workouts: WorkoutLogEntry[];
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>;
  tdeeKcal: number;
  proteinTargetG: number;
  limits: Partial<Limits>;
  /** Days marked as a cheat day (left out of the calorie math); a coach viewing a client passes none. */
  cheatDays?: readonly string[];
  /** The daily deficit target (sizes the meals still to come in today's estimate). */
  targetDeficitKcal?: number;
  /** Meals skipped on purpose, by date; a coach viewing a client passes none. */
  skippedMeals?: Readonly<Record<string, readonly string[]>>;
}

/** A function that evaluates the missions of any calendar day from the given records (no store involved), so the same rules serve
 *  the signed-in user's own diary and a coach looking at a client's. */
export function buildDayEvaluator(input: DayEvaluatorInput): (dateKey: string) => DayEvaluation {
  const { now, logs, workouts, mealTemplatesByDayType, tdeeKcal, proteinTargetG, limits } = input;
  const cheat = new Set(input.cheatDays ?? []);
  const byDay = new Map<string, WorkoutLogEntry[]>();
  for (const e of workouts) {
    const key = toDateKey(new Date(e.dateISO));
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }
  return (dateKey) => evaluateDay({ dateKey, now, log: logs[dateKey], mealTemplatesByDayType, workouts: byDay.get(dateKey) ?? [], tdeeKcal, proteinTargetG, limits, cheat: cheat.has(dateKey), targetDeficitKcal: input.targetDeficitKcal, skippedMealIds: input.skippedMeals?.[dateKey] });
}
