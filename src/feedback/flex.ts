import { MAIN_MEALS, type MainMeal } from '../insights/days';
import type { Thresholds } from '../insights/thresholds';
import { isMainMeal, type DiaryItem } from './items';
import { isSkippedMeal, matchRules } from './match';

/** How a main meal counts towards the 80/20 rule: eaten as planned, a flexible meal (a party, grilled food, a heavy or salty
 *  meal), or a skipped one. */
export type MealClass = 'onPlan' | 'flexible' | 'skipped';

export interface MainMealRecord {
  dateKey: string;
  slot: MainMeal;
  cls: MealClass;
}

/** A meal over 900 kcal is flexible. */
export const FLEX_KCAL = 900;

/** One record for every main meal on record (breakfast, lunch, dinner; snacks do not count). Items of the same meal are
 *  taken together. A meal is flexible when it is over 900 kcal, over half the daily purine limit, over 75% of the daily
 *  sodium limit, or contains a food the rules mark "to replace". */
export function classifyMainMeals(items: DiaryItem[], th: Thresholds): MainMealRecord[] {
  const groups = new Map<string, DiaryItem[]>();
  for (const item of items) {
    if (!isMainMeal(item.mealTime)) continue;
    const key = `${item.dateKey}|${item.mealTime}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const out: MainMealRecord[] = [];
  for (const [key, list] of groups) {
    const [dateKey, slot] = key.split('|') as [string, MainMeal];
    if (!MAIN_MEALS.includes(slot)) continue;
    if (list.every((i) => isSkippedMeal(i.text))) {
      out.push({ dateKey, slot, cls: 'skipped' });
      continue;
    }
    const eaten = list.filter((i) => !isSkippedMeal(i.text));
    const sum = (pick: (i: DiaryItem) => number) => eaten.reduce((s, i) => s + pick(i), 0);
    const flexible =
      sum((i) => i.kcal) > FLEX_KCAL ||
      sum((i) => i.purineMg) > th.purineMax / 2 ||
      sum((i) => i.sodiumMg) > 0.75 * th.sodiumMax ||
      eaten.some((i) => matchRules(i.text).some((r) => r.kind === 'replace'));
    out.push({ dateKey, slot, cls: flexible ? 'flexible' : 'onPlan' });
  }
  return out.sort((a, b) => (a.dateKey === b.dateKey ? MAIN_MEALS.indexOf(a.slot) - MAIN_MEALS.indexOf(b.slot) : a.dateKey < b.dateKey ? -1 : 1));
}
