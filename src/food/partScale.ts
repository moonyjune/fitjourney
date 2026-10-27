import type { ExtraFoodItem, MealPart } from '../types';
import type { ExtraPatch } from '../store/useNutritionStore';
import { joinTitle, sumParts } from './mealParts';

const NUMBER = /\d+(?:[.,]\d+)?/;
export const MAX_PART_QTY = 5000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The amount written in a part's name ("Yến mạch 30g" → 30, "2 quả Trứng gà" → 2); 1 (one portion) when the name has none. */
export function partQuantity(name: string): { qty: number; written: boolean } {
  const found = NUMBER.exec(name);
  const qty = found ? parseFloat(found[0].replace(',', '.')) : NaN;
  return qty > 0 ? { qty, written: true } : { qty: 1, written: false };
}

/** An amount as it is written in a name: no trailing ".0". */
export function formatQty(qty: number): string {
  return String(r1(qty));
}

/** The same part with another amount: the number in its name is replaced and its calories, protein, purine, salt and sugar are scaled in
 *  proportion, so nothing needs the AI or the network. A name without an amount gets one in front ("2 × Cơm"). Null for an unusable amount. */
export function scalePart(part: MealPart, newQty: number): MealPart | null {
  if (!(newQty > 0) || newQty > MAX_PART_QTY) return null;
  const { qty, written } = partQuantity(part.name);
  const ratio = newQty / qty;
  const name = written ? part.name.replace(NUMBER, formatQty(newQty)) : `${formatQty(newQty)} × ${part.name}`;
  const scaled: MealPart = { name, calories: Math.round(part.calories * ratio), proteinG: r1(part.proteinG * ratio) };
  if (part.purineMg) scaled.purineMg = Math.round(part.purineMg * ratio);
  if (part.saltG) scaled.saltG = Math.round(part.saltG * ratio * 100) / 100;
  if (part.sugarG) scaled.sugarG = r1(part.sugarG * ratio);
  return scaled;
}

/** What to save when part `index` of a logged meal gets another amount: the new parts and the meal's totals moved by exactly the difference
 *  (so figures the parts do not carry, like a purine typed for the whole meal, stay). The title follows when it was just the parts' names. */
export function editPartPatch(item: ExtraFoodItem, index: number, newQty: number): ExtraPatch | null {
  const parts = item.parts;
  if (!parts || !parts[index]) return null;
  const scaled = scalePart(parts[index], newQty);
  if (!scaled) return null;
  const next = parts.map((p, i) => (i === index ? scaled : p));
  const before = sumParts(parts);
  const after = sumParts(next);
  const patch: ExtraPatch = {
    parts: next,
    calories: Math.max(0, Math.round(item.calories + after.calories - before.calories)),
    proteinG: Math.max(0, r1(item.proteinG + after.proteinG - before.proteinG)),
  };
  if (item.purineMg || after.purineMg || before.purineMg) patch.purineMg = Math.max(0, Math.round((item.purineMg ?? 0) + after.purineMg - before.purineMg));
  if (item.saltG || after.saltG || before.saltG) patch.saltG = Math.max(0, Math.round(((item.saltG ?? 0) + after.saltG - before.saltG) * 100) / 100);
  if (item.sugarG || after.sugarG || before.sugarG) patch.sugarG = Math.max(0, r1((item.sugarG ?? 0) + after.sugarG - before.sugarG));
  if (item.name === joinTitle(parts.map((p) => p.name))) patch.name = joinTitle(next.map((p) => p.name));
  return patch;
}
