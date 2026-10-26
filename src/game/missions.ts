import type { DailyNutritionLog, DayType, MealTemplate, WorkoutLogEntry } from '../types';
import { getDayType } from '../constants/plan';
import { eatingEndHour } from '../utils/mealMode';
import { actualDailyDeficitKcal } from '../utils/tdee';
import { toDateKey } from '../utils/date';
import {
  LIMITS,
  MISSION_ORDER,
  MISSION_XP,
  PERFECT_DAY_BONUS_XP,
  WORKOUT_MIN_MINUTES,
  type Limits,
  type MissionId,
} from './constants';
import { ZERO_NUTRIENTS, addNutrients, extraItemNutrients, sumItemNutrients, type Nutrients } from './nutrients';

/**
 * done    – earned (counts toward XP)
 * holding – a "stay under the line" mission that is still within its limit but the day isn't over
 * open    – a "reach the goal" mission not reached yet, day still running
 * missed  – the day closed without earning it, or a ceiling was already exceeded
 */
export type MissionStatus = 'done' | 'holding' | 'open' | 'missed';

export interface MissionResult {
  id: MissionId;
  status: MissionStatus;
  value: number;
  /** Goal (reach missions) or ceiling (limit missions). For `junk` the ceiling is 0 items. */
  target: number;
  xp: number;
}

export interface DayInput {
  dateKey: string;
  now: Date;
  log: DailyNutritionLog | undefined;
  mealTemplatesByDayType: Record<DayType, MealTemplate[]>;
  /** Workout entries for this date only. */
  workouts: WorkoutLogEntry[];
  tdeeKcal: number;
  proteinTargetG: number;
  /** Overrides for the daily limits (e.g. a user-chosen purine ceiling); defaults to LIMITS. */
  limits?: Partial<Limits>;
}

export interface DayEvaluation {
  dateKey: string;
  missions: MissionResult[];
  eatenKcal: number;
  proteinG: number;
  burnedKcal: number;
  /** TDEE + exercise − eaten; null when the day has no logged food at all (no data ≠ big deficit). */
  deficitKcal: number | null;
  nutrients: Nutrients;
  /** Plan food lines the estimator could not recognise (their purine/salt count as 0). */
  unknownItems: number;
  junkCount: number;
  earnedXp: number;
  perfect: boolean;
  /** True once the eating window of this date is over (past day, or today at/after the cut-off). */
  eatingClosed: boolean;
  /** True once the whole calendar day is over. */
  dayOver: boolean;
}

/** Does this day hold any logged food? Mirrors the streak rule so both systems agree. */
function hasFoodLog(log: DailyNutritionLog | undefined): log is DailyNutritionLog {
  if (!log) return false;
  const anyMeal = Object.values(log.mealsEaten).some(Boolean);
  return anyMeal || (log.extraItems?.length ?? 0) > 0 || log.extraCalories > 0;
}

export function evaluateDay(input: DayInput): DayEvaluation {
  const { dateKey, now, log, mealTemplatesByDayType, workouts, tdeeKcal, proteinTargetG } = input;
  const lim: Limits = { ...LIMITS, ...input.limits };

  const todayKey = toDateKey(now);
  const dayOver = dateKey < todayKey;
  const eatingClosed = dayOver || (dateKey === todayKey && now.getHours() >= eatingEndHour());

  const meals = mealTemplatesByDayType[getDayType(new Date(`${dateKey}T12:00:00`))];
  const eatenMeals = meals.filter((m) => log?.mealsEaten[m.slot]);
  const extras = log?.extraItems ?? [];

  const eatenKcal = eatenMeals.reduce((s, m) => s + m.calories, 0) + (log?.extraCalories ?? 0);
  const proteinG = eatenMeals.reduce((s, m) => s + m.proteinG, 0) + (log?.extraProteinG ?? 0);
  const burnedKcal = workouts.reduce((s, w) => s + w.caloriesBurned, 0);
  const workoutMinutes = workouts.reduce((s, w) => s + w.durationMin, 0);

  let nutrients: Nutrients = ZERO_NUTRIENTS;
  let unknownItems = 0;
  for (const meal of eatenMeals) {
    const { total, unknownItems: unknown } = sumItemNutrients(meal.items);
    nutrients = addNutrients(nutrients, total);
    unknownItems += unknown;
  }
  for (const item of extras) nutrients = addNutrients(nutrients, extraItemNutrients(item));
  const junkCount = extras.filter((e) => e.junk).length;

  const hasFood = hasFoodLog(log);
  const deficitKcal = hasFood ? actualDailyDeficitKcal(tdeeKcal, burnedKcal, eatenKcal) : null;

  /** "Reach the goal" mission. */
  function reach(id: MissionId, value: number, target: number, reached: boolean, closed: boolean): MissionResult {
    const status: MissionStatus = reached ? 'done' : closed ? 'missed' : 'open';
    return { id, status, value, target, xp: status === 'done' ? MISSION_XP[id] : 0 };
  }

  /** "Stay under the line" mission: over the ceiling fails at once; otherwise earned when the
   *  eating window closes — and only if the day actually has food logged. */
  function limit(id: MissionId, value: number, ceiling: number): MissionResult {
    const exceeded = value > ceiling;
    let status: MissionStatus;
    if (exceeded) status = 'missed';
    else if (!eatingClosed) status = 'holding';
    else status = hasFood ? 'done' : 'missed';
    return { id, status, value, target: ceiling, xp: status === 'done' ? MISSION_XP[id] : 0 };
  }

  const byId: Record<MissionId, MissionResult> = {
    workout: reach('workout', workoutMinutes, WORKOUT_MIN_MINUTES, workoutMinutes >= WORKOUT_MIN_MINUTES, dayOver),
    deficit: reach(
      'deficit',
      deficitKcal ?? 0,
      lim.deficitKcal,
      deficitKcal != null && deficitKcal >= lim.deficitKcal,
      dayOver
    ),
    protein: reach('protein', proteinG, proteinTargetG, hasFood && proteinG >= proteinTargetG, eatingClosed),
    purine: limit('purine', nutrients.purineMg, lim.purineMg),
    salt: limit('salt', nutrients.saltG, lim.saltG),
    sugar: limit('sugar', nutrients.sugarG, lim.sugarG),
    junk: limit('junk', junkCount, 0),
  };

  const missions = MISSION_ORDER.map((id) => byId[id]);
  const doneCount = missions.filter((m) => m.status === 'done').length;
  const perfect = doneCount === missions.length;
  const earnedXp = missions.reduce((s, m) => s + m.xp, 0) + (perfect ? PERFECT_DAY_BONUS_XP : 0);

  return {
    dateKey,
    missions,
    eatenKcal,
    proteinG,
    burnedKcal,
    deficitKcal,
    nutrients,
    unknownItems,
    junkCount,
    earnedXp,
    perfect,
    eatingClosed,
    dayOver,
  };
}
