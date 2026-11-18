import type { ExtraFoodItem, MealPart } from '../types';
import type { ExtraPatch } from '../store/useNutritionStore';
import { joinTitle, partsMatchTotals, sumParts } from './mealParts';

/* "Ăn vặt" per food (1.5). Until 1.4 the check step had one "Ăn vặt" chip for the whole meal (it set `junk` on the one entry saved).
 * Now each food line has its own toggle: the foods ticked are saved as entries of their own, marked `snack` (and `junk`, which is what
 * the "Không đồ ăn vặt" mission counts), so the day lists them as snacks, one by one, with their kcal still counted; a snack never
 * makes a main meal "eaten" (coveredMealIds, the day rows' missing meals, the 80/20 meals). In a logged meal's detail the same toggle
 * takes one food out of the meal as a snack entry of its own (or marks / unmarks a single food).
 *
 * Old data needs no migration: a whole meal marked `junk` before 1.5 stays one junk entry (shown as "Ăn vặt", counted by the mission as
 * before) and, without `snack`, still covers its meal, so no past day changes; the snack meal times ("Bữa phụ") remain times of day. */

/** Shown as "Ăn vặt" (a food marked as a snack, or one marked junk before 1.5). */
export const isSnackItem = (item: Pick<ExtraFoodItem, 'snack' | 'junk'>): boolean => !!item.snack || !!item.junk;

/** Whether a logged food can make a main meal "eaten": every food except one marked as a snack on its own (1.5). */
export const coversMeal = (item: Pick<ExtraFoodItem, 'snack'>): boolean => !item.snack;

/** One entry the check step saves: the meal (the foods not ticked "Ăn vặt", together) or one snack food. */
export interface SaveEntry {
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
  /** The breakdown, for a meal of 2 foods or more. */
  parts?: MealPart[];
  snack: boolean;
  /** The lines it is made of. */
  keys: string[];
}

/** What "Lưu bữa" saves from the check step's lines: the lines not ticked "Ăn vặt" as one meal (named `title` when the user typed one
 *  for a meal of several foods, else after its foods), then each ticked line as a snack of its own. With nothing ticked this is the one
 *  meal saved before 1.5. */
export function planSaveEntries(rows: { key: string; part: MealPart }[], snackKeys: ReadonlySet<string>, title?: string | null): SaveEntry[] {
  const main = rows.filter((r) => !snackKeys.has(r.key));
  const snacks = rows.filter((r) => snackKeys.has(r.key));
  const out: SaveEntry[] = [];
  if (main.length > 0) {
    const parts = main.map((r) => r.part);
    const name = main.length >= 2 ? (title?.trim() || joinTitle(parts.map((p) => p.name))) : parts[0].name.trim();
    out.push({ name: name.slice(0, 300), ...sumParts(parts), ...(main.length >= 2 ? { parts } : {}), snack: false, keys: main.map((r) => r.key) });
  }
  for (const r of snacks) out.push({ name: r.part.name.trim().slice(0, 300), ...sumParts([r.part]), snack: true, keys: [r.key] });
  return out;
}

/** What the "Ăn vặt" toggle of food `index` in a logged meal's detail does:
 *  - a single food (or a meal whose parts no longer add up): marks or unmarks the food itself (`flag`);
 *  - one food of a meal of several: takes it out of the meal (`split`): the meal keeps the others (totals moved by exactly that food, its
 *    title following when it was just the foods' names) and the food is saved as a snack entry of its own. */
export function snackTogglePlan(
  item: ExtraFoodItem,
  index: number
): { kind: 'flag'; on: boolean; patch: Pick<ExtraFoodItem, 'snack' | 'junk'> } | { kind: 'split'; patch: ExtraPatch; part: MealPart } | null {
  if (partsMatchTotals(item)) {
    const parts = item.parts!;
    const part = parts[index];
    if (!part) return null;
    const rest = parts.filter((_, i) => i !== index);
    const before = sumParts(parts);
    const after = sumParts(rest);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const patch: ExtraPatch = {
      calories: Math.max(0, Math.round(item.calories + after.calories - before.calories)),
      proteinG: Math.max(0, r1(item.proteinG + after.proteinG - before.proteinG)),
      purineMg: Math.max(0, Math.round((item.purineMg ?? 0) + after.purineMg - before.purineMg)),
      saltG: Math.max(0, Math.round(((item.saltG ?? 0) + after.saltG - before.saltG) * 100) / 100),
      sugarG: Math.max(0, r1((item.sugarG ?? 0) + after.sugarG - before.sugarG)),
      // One food left: no breakdown is kept (the store keeps one only from 2 parts); the food is the meal.
      parts: rest.length >= 2 ? rest : undefined,
    };
    if (item.name === joinTitle(parts.map((p) => p.name))) patch.name = rest.length >= 2 ? joinTitle(rest.map((p) => p.name)) : rest[0].name;
    return { kind: 'split', patch, part };
  }
  if (index !== 0) return null;
  const on = !isSnackItem(item);
  return { kind: 'flag', on, patch: on ? { snack: true, junk: true } : { snack: undefined, junk: undefined } };
}

/** Which foods of a logged meal's detail show "Ăn vặt" on: a single food marked as one; never a food inside a meal of several (a
 *  snack is always an entry of its own). */
export function snackMarks(item: ExtraFoodItem, listed: number): boolean[] {
  if (partsMatchTotals(item)) return Array.from({ length: listed }, () => false);
  return Array.from({ length: listed }, (_, i) => i === 0 && isSnackItem(item));
}
