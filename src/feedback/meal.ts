import type { Thresholds } from '../insights/thresholds';
import { matchRules } from './match';
import type { FoodRule, RuleKind } from './types';

/** One comment on a food: a good choice, something to be careful with, or something to swap. */
export interface MealLine {
  kind: RuleKind;
  short: string;
  why: string;
  replaceWith: string;
}

/** Comments for a food description. Good choices come first so a meal reads "what is fine, then what to change". */
export function commentMeal(text: string, rules?: FoodRule[]): MealLine[] {
  const lines = matchRules(text, rules).map((r) => ({ kind: r.kind, short: r.short, why: r.why, replaceWith: r.replaceWith }));
  return [...lines.filter((l) => l.kind === 'good'), ...lines.filter((l) => l.kind !== 'good')];
}

export interface MealNumbers {
  kcal: number;
  proteinG: number;
  purineMg: number;
  sugarG: number;
  sodiumMg: number;
  /** Breakfast, lunch or dinner (not a snack). */
  main: boolean;
}

export type MealWarningKey = 'sodium' | 'purine' | 'sugar' | 'heavy' | 'lowProtein';
export interface MealWarning {
  key: MealWarningKey;
  value: number;
}

/** A single meal over these shares of the daily limits is flagged: sodium over 75%, purine over 50%, sugar over 15 g
 *  (scaled to the sugar limit), more than 1,000 kcal, or a main meal with little protein. */
export function mealWarnings(n: MealNumbers, th: Thresholds): MealWarning[] {
  const out: MealWarning[] = [];
  if (n.sodiumMg > 0.75 * th.sodiumMax) out.push({ key: 'sodium', value: n.sodiumMg });
  if (n.purineMg > 0.5 * th.purineMax) out.push({ key: 'purine', value: n.purineMg });
  if (n.sugarG > (th.sugarMax * 15) / 35) out.push({ key: 'sugar', value: n.sugarG });
  if (n.kcal > 1000) out.push({ key: 'heavy', value: n.kcal });
  if (n.main && n.kcal > 250 && n.proteinG < 15) out.push({ key: 'lowProtein', value: n.proteinG });
  return out;
}
