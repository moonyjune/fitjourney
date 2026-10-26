import { getDayType } from '../constants/plan';
import { sumItemNutrients } from '../game/nutrients';
import type { DailyNutritionLog, ExtraMealTime, MealSlot, PlanData, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import { SODIUM_MG_PER_SALT_G, type Thresholds } from './thresholds';

export type MainMeal = 'breakfast' | 'lunch' | 'dinner';
export const MAIN_MEALS: MainMeal[] = ['breakfast', 'lunch', 'dinner'];
/** The plan's three meals stand in for the three main meals of the day. */
export const PLAN_SLOT_MEAL: Record<MealSlot, MainMeal> = { meal1: 'breakfast', meal2: 'lunch', meal3: 'dinner' };
const EXTRA_MAIN: Partial<Record<ExtraMealTime, MainMeal>> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' };

export interface DayRow {
  dateKey: string;
  kcal: number;
  proteinG: number;
  purineMg: number;
  sugarG: number;
  sodiumMg: number;
  exerciseKcal: number;
  /** Energy the body burns that day without exercise (TDEE at that day's weight). */
  tdee: number;
  deficit: number;
  cumDeficit: number;
  /** All three main meals are on record (a skipped meal logged as "0 kcal" counts). */
  complete: boolean;
  missing: MainMeal[];
}

export interface DayInput {
  logs: Record<string, DailyNutritionLog>;
  mealTemplates: PlanData['mealTemplates'];
  workouts: WorkoutLogEntry[];
  /** TDEE for a given day (already adjusted for that day's body weight). */
  tdeeFor: (dateKey: string) => number;
}

/** One row for every day that has something on record, oldest first, with the running deficit. */
export function buildDayRows(input: DayInput): DayRow[] {
  const exerciseByDay = new Map<string, number>();
  for (const w of input.workouts) {
    const key = toDateKey(new Date(w.dateISO));
    exerciseByDay.set(key, (exerciseByDay.get(key) ?? 0) + w.caloriesBurned);
  }

  const rows: DayRow[] = [];
  let cum = 0;
  for (const dateKey of Object.keys(input.logs).sort()) {
    const log = input.logs[dateKey];
    const extras = log.extraItems ?? [];
    const meals = input.mealTemplates[getDayType(new Date(dateKey))].filter((m) => log.mealsEaten[m.slot]);
    if (extras.length === 0 && meals.length === 0) continue;

    let kcal = log.extraCalories ?? 0;
    let proteinG = log.extraProteinG ?? 0;
    let purineMg = 0;
    let saltG = 0;
    let sugarG = 0;
    for (const e of extras) {
      purineMg += e.purineMg ?? 0;
      saltG += e.saltG ?? 0;
      sugarG += e.sugarG ?? 0;
    }
    for (const m of meals) {
      kcal += m.calories;
      proteinG += m.proteinG;
      const n = sumItemNutrients(m.items).total;
      purineMg += n.purineMg;
      saltG += n.saltG;
    }

    const covered = new Set<MainMeal>();
    for (const e of extras) {
      const main = e.mealTime ? EXTRA_MAIN[e.mealTime] : undefined;
      if (main) covered.add(main);
    }
    for (const m of meals) covered.add(PLAN_SLOT_MEAL[m.slot]);
    const missing = MAIN_MEALS.filter((m) => !covered.has(m));

    const exerciseKcal = exerciseByDay.get(dateKey) ?? 0;
    const tdee = input.tdeeFor(dateKey);
    const deficit = tdee + exerciseKcal - kcal;
    cum += deficit;
    rows.push({
      dateKey,
      kcal,
      proteinG,
      purineMg,
      sugarG,
      sodiumMg: saltG * SODIUM_MG_PER_SALT_G,
      exerciseKcal,
      tdee,
      deficit,
      cumDeficit: cum,
      complete: missing.length === 0,
      missing,
    });
  }
  return rows;
}

export type Verdict = 'ok' | 'fair' | 'bad';

/** Day score used in the weekly view: 2 / 1 / 0 for each of the five indicators, only for complete days. */
export function dayScore(row: DayRow, th: Thresholds): number | null {
  if (!row.complete) return null;
  const scoreHigh = (v: number, ok: number, fair: number) => (v >= ok ? 2 : v >= fair ? 1 : 0);
  const scoreLow = (v: number, ok: number, fair: number) => (v <= ok ? 2 : v <= fair ? 1 : 0);
  return (
    scoreHigh(row.deficit, th.deficitOk, th.deficitFair) +
    scoreHigh(row.proteinG, th.proteinOk, th.proteinFair) +
    scoreLow(row.purineMg, th.purineMax, th.purineFair) +
    scoreLow(row.sugarG, th.sugarMax, th.sugarFair) +
    scoreLow(row.sodiumMg, th.sodiumMax, th.sodiumFair)
  );
}
