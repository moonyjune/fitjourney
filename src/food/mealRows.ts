import type { TextMealRow } from '../ai/textMeal';
import type { MealPart } from '../types';
import { formatQty, partQuantity, scalePart } from './partScale';

/** One food line of the Add food screen: the text fields of a TextMealRow, plus the amount being typed and the figures it is
 *  scaled from (kept so typing 1 → 15 → 150 never compounds rounding). */
export interface MealRow extends TextMealRow {
  /** The amount as typed in the amount field; undefined = read from the name. */
  qty?: string;
  /** The line as it was before the amount was first changed; scaling always starts from it. Cleared by a hand edit. */
  base?: MealPart;
}

const UNIT = /\d+(?:[.,]\d+)?\s*([A-Za-zÀ-ỹ]+)/;

/** Non-negative number from a text field; empty or invalid input counts as 0. */
export function num(text: string): number {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const text = (n: number | undefined) => (n && n > 0 ? String(n) : '');

export function emptyRow(key: string, name = ''): MealRow {
  return { key, name, calories: '', protein: '', purine: '', salt: '', sugar: '', accuracy: null, fromDb: false, aiCalories: 0, baseline: '' };
}

/** A line filled with known figures (the food database, a nutrition label, a swap, a dish handed over by the route). */
export function rowFromFigures(key: string, part: MealPart, fromDb: boolean): MealRow {
  const calories = text(part.calories);
  return {
    ...emptyRow(key, part.name),
    calories,
    protein: text(part.proteinG),
    purine: text(part.purineMg),
    salt: text(part.saltG),
    sugar: text(part.sugarG),
    fromDb,
    baseline: fromDb ? `${part.name}|${calories}` : '',
  };
}

export function rowPart(row: MealRow): MealPart {
  return { name: row.name.trim(), calories: num(row.calories), proteinG: num(row.protein), purineMg: num(row.purine), saltG: num(row.salt), sugarG: num(row.sugar) };
}

/** Nothing typed or found yet: no name and no figure. */
export const rowIsEmpty = (r: MealRow) => !r.name.trim() && !r.calories.trim() && !r.protein.trim();
/** Has calories or protein, so it counts and can be saved (a name is optional, as it always was for a food typed by hand). */
export const rowIsSavable = (r: MealRow) => num(r.calories) > 0 || num(r.protein) > 0;
/** No calories and no protein typed (a name alone at most). */
export const rowHasNoFigures = (r: MealRow) => !r.calories.trim() && !r.protein.trim();

/** The amount field of a line: what is being typed, else the number in its name ("Cơm 150g" → 150), else 1 portion; and the
 *  unit written after it ("g", "ml", "quả", "bát"), empty when the name has none. */
export function rowAmount(row: MealRow): { qty: string; unit: string } {
  const found = partQuantity(row.name);
  const unit = found.written ? UNIT.exec(row.name)?.[1] ?? '' : '';
  return { qty: row.qty ?? formatQty(found.qty), unit };
}

/** The line with another amount typed: name and every figure scaled in proportion from `base` (offline, no AI). An amount that
 *  cannot be used (empty, 0, too large) only changes the field and leaves the figures as they are. */
export function scaleRow(row: MealRow, qtyText: string): MealRow {
  const base = row.base ?? rowPart(row);
  const scaled = base.name ? scalePart(base, parseFloat(qtyText.replace(',', '.'))) : null;
  if (!scaled) return { ...row, qty: qtyText, base };
  return {
    ...row,
    qty: qtyText,
    base,
    name: scaled.name,
    calories: text(scaled.calories),
    protein: text(scaled.proteinG),
    purine: text(scaled.purineMg),
    salt: text(scaled.saltG),
    sugar: text(scaled.sugarG),
  };
}
