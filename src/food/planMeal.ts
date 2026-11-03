import { estimateItemNutrients } from '../game/nutrients';
import type { MealPart, MealTemplate } from '../types';

/* The plan meal screen (dialog 09): each planned dish is marked eaten, not eaten or swapped for another one, or the whole meal is swapped
 * for a suggested dish. Eaten as planned it is the plan meal ticked; otherwise what was really eaten is logged as one food of that meal. */

export type PlanItemChoice = { kind: 'eaten' } | { kind: 'skipped' } | { kind: 'swap'; name: string; kcal: string; protein: string };

/** A dish eaten instead of the whole meal (the suggested recipe). */
export interface PlanMealSwapDish {
  name: string;
  calories: number;
  proteinG: number;
}

export interface PlanMealOutcome {
  /** Every dish eaten and nothing swapped: tick the plan meal itself. */
  asPlanned: boolean;
  kcal: number;
  proteinG: number;
  /** What was eaten, one part per dish (plan dishes keep their names; protein is their share of the meal's by kcal). */
  parts: MealPart[];
  /** Purine / salt / sugar of the plan dishes eaten that the estimate knows (swapped dishes are not known). */
  purineMg: number;
  saltG: number;
  sugarG: number;
}

const num = (text: string) => {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every dish eaten, as the plan says. */
export function allEaten(meal: Pick<MealTemplate, 'items'>): PlanItemChoice[] {
  return meal.items.map(() => ({ kind: 'eaten' }));
}

/** A swapped dish counts once it has a name and some kcal. */
export function swapIsComplete(choice: PlanItemChoice): boolean {
  return choice.kind === 'swap' && choice.name.trim().length > 0 && num(choice.kcal) > 0;
}

/** What the choices add up to. A swap that is not filled in yet counts as nothing eaten for that dish. */
export function planMealOutcome(meal: Pick<MealTemplate, 'items' | 'calories' | 'proteinG'>, choices: PlanItemChoice[], recipe: PlanMealSwapDish | null): PlanMealOutcome {
  const proteinOf = (calories: number) =>
    meal.calories > 0 ? (meal.proteinG * calories) / meal.calories : meal.items.length > 0 ? meal.proteinG / meal.items.length : 0;
  const parts: MealPart[] = [];
  let purineMg = 0;
  let saltG = 0;
  let sugarG = 0;
  if (recipe) {
    parts.push({ name: recipe.name, calories: Math.round(recipe.calories), proteinG: round1(recipe.proteinG) });
  } else {
    meal.items.forEach((item, i) => {
      const choice = choices[i] ?? { kind: 'eaten' };
      if (choice.kind === 'eaten') {
        parts.push({ name: item.name, calories: Math.round(item.calories), proteinG: round1(proteinOf(item.calories)) });
        const n = estimateItemNutrients(item);
        if (n) {
          purineMg += n.purineMg;
          saltG += n.saltG;
          sugarG += n.sugarG;
        }
      } else if (choice.kind === 'swap' && swapIsComplete(choice)) {
        parts.push({ name: choice.name.trim(), calories: Math.round(num(choice.kcal)), proteinG: round1(num(choice.protein)) });
      }
    });
  }
  const asPlanned = !recipe && meal.items.every((_, i) => (choices[i] ?? { kind: 'eaten' }).kind === 'eaten');
  return {
    asPlanned,
    kcal: asPlanned ? meal.calories : parts.reduce((s, p) => s + p.calories, 0),
    proteinG: asPlanned ? meal.proteinG : round1(parts.reduce((s, p) => s + p.proteinG, 0)),
    parts,
    purineMg: Math.round(purineMg),
    saltG: round1(saltG),
    sugarG: round1(sugarG),
  };
}

/** The name of the food logged for a meal not eaten as planned: its dishes, comma separated. */
export function planMealFoodName(parts: MealPart[]): string {
  return parts.map((p) => p.name).join(', ');
}
