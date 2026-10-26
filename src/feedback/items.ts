import { getDayType } from '../constants/plan';
import { sumItemNutrients } from '../game/nutrients';
import { PLAN_SLOT_MEAL } from '../insights/days';
import { SODIUM_MG_PER_SALT_G } from '../insights/thresholds';
import type { DailyNutritionLog, ExtraMealTime, PlanData } from '../types';

/** One thing eaten, flattened from the diary so it can be commented on and counted. */
export interface DiaryItem {
  id: string;
  dateKey: string;
  /** Description used for matching: the food name, or the plan meal's dishes. */
  text: string;
  mealTime: ExtraMealTime | null;
  kcal: number;
  proteinG: number;
  purineMg: number;
  sugarG: number;
  sodiumMg: number;
}

export const isMainMeal = (mealTime: ExtraMealTime | null): boolean => mealTime === 'breakfast' || mealTime === 'lunch' || mealTime === 'dinner';

/** Everything on record for the given days: off-plan foods, plus the plan's meals that were ticked. Oldest day first. */
export function buildDiaryItems(logs: Record<string, DailyNutritionLog>, mealTemplates: PlanData['mealTemplates']): DiaryItem[] {
  const out: DiaryItem[] = [];
  for (const dateKey of Object.keys(logs).sort()) {
    const log = logs[dateKey];
    for (const m of mealTemplates[getDayType(new Date(dateKey))]) {
      if (!log.mealsEaten[m.slot]) continue;
      const n = sumItemNutrients(m.items).total;
      out.push({
        id: `${dateKey}:${m.slot}`,
        dateKey,
        text: m.items.map((i) => i.name).join('; '),
        mealTime: PLAN_SLOT_MEAL[m.slot],
        kcal: m.calories,
        proteinG: m.proteinG,
        purineMg: n.purineMg,
        sugarG: 0,
        sodiumMg: n.saltG * SODIUM_MG_PER_SALT_G,
      });
    }
    for (const e of log.extraItems ?? []) {
      out.push({
        id: e.id,
        dateKey,
        text: e.name,
        mealTime: e.mealTime,
        kcal: e.calories,
        proteinG: e.proteinG,
        purineMg: e.purineMg ?? 0,
        sugarG: e.sugarG ?? 0,
        sodiumMg: (e.saltG ?? 0) * SODIUM_MG_PER_SALT_G,
      });
    }
  }
  return out;
}
