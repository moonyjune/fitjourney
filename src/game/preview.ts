import type { DailyNutritionLog, ExtraFoodItem, MealSlot } from '../types';
import type { MissionId } from './constants';
import { evaluateDay, type DayEvaluation, type DayInput } from './missions';

export interface DayChangePreview {
  before: DayEvaluation;
  after: DayEvaluation;
  /** Missions not done now that the change would complete. */
  newlyDone: MissionId[];
  /** Missions still alive now that the change would push over their ceiling (purine, salt, ...). */
  newlyMissed: MissionId[];
  /** Change in XP that is earned immediately (limit missions only pay out when the window closes). */
  xpDelta: number;
}

function blankLog(dateKey: string): DailyNutritionLog {
  return { dateISO: dateKey, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 };
}

/** The day's log with one plan meal flipped between eaten / not eaten. Does not touch any store. */
export function logWithMealToggled(log: DailyNutritionLog | undefined, dateKey: string, slot: MealSlot): DailyNutritionLog {
  const base = log ?? blankLog(dateKey);
  return { ...base, mealsEaten: { ...base.mealsEaten, [slot]: !base.mealsEaten[slot] } };
}

/** The day's log with an extra (off-plan) item added, keeping the running totals in lockstep. */
export function logWithExtra(log: DailyNutritionLog | undefined, dateKey: string, item: ExtraFoodItem): DailyNutritionLog {
  const base = log ?? blankLog(dateKey);
  return {
    ...base,
    extraItems: [...(base.extraItems ?? []), item],
    extraCalories: base.extraCalories + item.calories,
    extraProteinG: base.extraProteinG + item.proteinG,
  };
}

/** What would change in today's missions if `input.log` were replaced by `nextLog`. */
export function previewDayChange(input: DayInput, nextLog: DailyNutritionLog): DayChangePreview {
  const before = evaluateDay(input);
  const after = evaluateDay({ ...input, log: nextLog });
  const newlyDone: MissionId[] = [];
  const newlyMissed: MissionId[] = [];
  for (const b of before.missions) {
    const a = after.missions.find((m) => m.id === b.id);
    if (!a) continue;
    if (b.status !== 'done' && a.status === 'done') newlyDone.push(b.id);
    if (b.status !== 'missed' && a.status === 'missed') newlyMissed.push(b.id);
  }
  return { before, after, newlyDone, newlyMissed, xpDelta: after.earnedXp - before.earnedXp };
}
