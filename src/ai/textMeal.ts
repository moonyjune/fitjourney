import { lookupQuantified, type QuantifiedFood } from '../food/dbLookup';
import { findRememberedFood, portionOf } from '../food/remember';
import type { FoodEntry } from '../food/types';
import type { ExtraMealTime } from '../types';
import type { MealTextItem, MealTextResult } from '../sync/cloudSync';
import { accuracyOf } from './accuracy';
import { aiNumberText } from './useAiFields';

/** One line of the review list: every figure is text so the user can edit it before anything is saved. */
export interface TextMealRow {
  key: string;
  name: string;
  calories: string;
  protein: string;
  purine: string;
  salt: string;
  sugar: string;
  /** The AI's accuracy for this line (0-100), or null (saved figures, or none given). */
  accuracy: number | null;
  /** The figures came from the user's own food database. */
  fromDb: boolean;
  /** Calories the AI estimated for this line (0 for saved figures), kept to learn how far off the AI is. */
  aiCalories: number;
  /** `name|calories` as first filled in: unchanged at save time means the figures still are the database's. */
  baseline: string;
}

export const MEAL_TIMES: ExtraMealTime[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'late_afternoon_snack', 'dinner', 'evening_snack'];
const MAX_ROWS = 12;

export function validMealTime(value: unknown): ExtraMealTime | null {
  return MEAL_TIMES.includes(value as ExtraMealTime) ? (value as ExtraMealTime) : null;
}

/** The separate foods named in a sentence: split at commas, semicolons, "+", "và" and new lines. */
export function splitMealText(text: string): string[] {
  return text
    .split(/[,;+\n]|\s+và\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

const hasQuantity = (name: string) => /\d/.test(name);

function savedRow(key: string, name: string, food: FoodEntry): TextMealRow {
  const p = portionOf(food);
  return {
    key,
    name: food.name,
    calories: String(p.calories),
    protein: String(p.proteinG),
    purine: p.purineMg > 0 ? String(p.purineMg) : '',
    salt: p.saltG > 0 ? String(p.saltG) : '',
    sugar: p.sugarG > 0 ? String(p.sugarG) : '',
    accuracy: null,
    fromDb: true,
    aiCalories: 0,
    baseline: `${food.name}|${p.calories}`,
  };
}

function quantifiedRow(key: string, q: QuantifiedFood): TextMealRow {
  return {
    key,
    name: q.name,
    calories: String(q.calories),
    protein: String(q.proteinG),
    purine: q.purineMg > 0 ? String(q.purineMg) : '',
    salt: q.saltG > 0 ? String(q.saltG) : '',
    sugar: q.sugarG > 0 ? String(q.sugarG) : '',
    accuracy: null,
    fromDb: true,
    aiCalories: 0,
    baseline: `${q.name}|${q.calories}`,
  };
}

/** The foods of a sentence the user's database can answer (a saved food by name, or any database food with its amount typed:
 *  "150g cơm", "2 quả trứng"), in order, and the parts it cannot answer, which are the only ones the AI is asked about. */
export function resolveFromDb(text: string, foods: FoodEntry[]): { rows: TextMealRow[]; unknown: string[] } | null {
  const parts = splitMealText(text);
  if (parts.length === 0 || parts.length > MAX_ROWS) return null;
  const rows: TextMealRow[] = [];
  const unknown: string[] = [];
  for (const [i, part] of parts.entries()) {
    const saved = hasQuantity(part) ? undefined : findRememberedFood(foods, part);
    const counted = saved ? null : lookupQuantified(part, foods);
    if (saved) rows.push(savedRow(`saved-${i}`, part, saved));
    else if (counted) rows.push(quantifiedRow(`db-${i}`, counted));
    else unknown.push(part);
  }
  return { rows, unknown };
}

/** When every food in the sentence is one the user saved before (and no quantity is typed), the rows come straight from
 *  their own food database and the AI is not needed. Null otherwise. */
export function rowsFromSaved(text: string, foods: FoodEntry[]): TextMealRow[] | null {
  const parts = splitMealText(text);
  if (parts.length === 0 || parts.length > MAX_ROWS) return null;
  const rows: TextMealRow[] = [];
  for (const [i, part] of parts.entries()) {
    const food = hasQuantity(part) ? undefined : findRememberedFood(foods, part);
    if (!food) return null;
    rows.push(savedRow(`saved-${i}`, part, food));
  }
  return rows;
}

/** The review rows for an AI answer. A food the user saved before keeps their own figures (unless the AI named a quantity,
 *  which their one-portion figures do not cover). Nonsense numbers become empty fields. */
export function rowsFromResult(result: MealTextResult, foods: FoodEntry[]): TextMealRow[] {
  const items = Array.isArray(result.items) ? result.items.slice(0, MAX_ROWS) : [];
  const rows: TextMealRow[] = [];
  for (const [i, item] of items.entries()) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const known = hasQuantity(name) ? undefined : findRememberedFood(foods, name);
    if (known) {
      rows.push(savedRow(`ai-${i}`, name, known));
      continue;
    }
    const it = item as MealTextItem;
    const calories = aiNumberText(it.caloriesKcal) ?? '';
    rows.push({
      key: `ai-${i}`,
      name,
      calories,
      protein: aiNumberText(it.proteinG, 1) ?? '',
      purine: aiNumberText(it.purineMg) ?? '',
      salt: aiNumberText(it.saltG, 1) ?? '',
      sugar: aiNumberText(it.sugarG, 1) ?? '',
      accuracy: accuracyOf(it.accuracyPercent),
      fromDb: false,
      aiCalories: Number(calories) || 0,
      baseline: `${name}|${calories}`,
    });
  }
  return rows;
}
