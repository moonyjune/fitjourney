import { amountOf, baseName, describeLine } from './calc';
import { foodKey, portionOf, PORTION_UNIT } from './remember';
import { fold } from './search';
import type { FoodEntry } from './types';

/** A typed food with an amount ("150g cơm", "2 quả trứng gà", "phở bò 2") that the food database can answer on its own. */
export interface QuantifiedFood {
  food: FoodEntry;
  /** The line as a meal row names it: "150 g Cơm", "2 quả Trứng gà". */
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
}

const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const LEADING = new RegExp(`^${NUMBER}\\s*(.+)$`);
const TRAILING = new RegExp(`^(.+?)\\s+${NUMBER}\\s*([a-zA-ZÀ-ỹđĐ]+)?$`);

const GRAM_UNITS = new Set(['g', 'gr', 'gram', 'grams']);
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Reading {
  qty: number;
  unit: string;
  name: string;
}

/** Every way to read the amount in "2 quả trứng gà" / "150g cơm" / "phở bò 2": the first word after a leading number may be a
 *  unit or already the food's name, so both readings are offered. */
function readings(part: string): Reading[] {
  const text = part.trim();
  const out: Reading[] = [];
  const lead = LEADING.exec(text);
  if (lead) {
    const qty = parseFloat(lead[1].replace(',', '.'));
    const rest = lead[2].trim();
    const [first, ...others] = rest.split(/\s+/);
    if (others.length > 0) out.push({ qty, unit: fold(first), name: others.join(' ') });
    out.push({ qty, unit: '', name: rest });
  }
  const trail = TRAILING.exec(text);
  if (trail) out.push({ qty: parseFloat(trail[2].replace(',', '.')), unit: fold(trail[3] ?? ''), name: trail[1].trim() });
  return out;
}

/** The food named in `part` with the amount typed beside it, worked out from the food database; null when the name is not
 *  in the database, the amount is missing/zero, or its unit does not fit the food (then the AI is asked). */
export function lookupQuantified(part: string, foods: FoodEntry[]): QuantifiedFood | null {
  for (const q of readings(part)) {
    const found = lookupReading(q, foods);
    if (found) return found;
  }
  return null;
}

function lookupReading(q: Reading, foods: FoodEntry[]): QuantifiedFood | null {
  if (!(q.qty > 0) || q.qty > 5000) return null;
  const key = foodKey(q.name);
  if (!key) return null;
  const food = foods.find((f) => foodKey(f.name) === key);
  if (!food) return null;

  const byWeight = food.unit === 'g' || food.unit === 'ml';
  let count: number;
  if (food.auto) {
    // A remembered meal is one portion; only a count of portions makes sense.
    if (q.unit && q.unit !== fold(PORTION_UNIT)) return null;
    count = q.qty;
  } else if (byWeight) {
    // Weight foods need their unit typed ("150g cơm"): a bare number could be grams or pieces.
    const wanted = food.unit === 'ml' ? ['ml'] : [...GRAM_UNITS];
    if (!wanted.includes(q.unit)) return null;
    count = q.qty / food.unitG;
  } else if (!q.unit || q.unit === fold(food.unit)) {
    count = q.qty;
  } else if (GRAM_UNITS.has(q.unit) || q.unit === 'ml') {
    count = q.qty / food.unitG;
  } else {
    return null;
  }

  if (food.auto) {
    const one = portionOf(food);
    return {
      food,
      name: `${q.qty} ${food.unit} ${baseName(food.name)}`,
      calories: Math.round(one.calories * count),
      proteinG: r1(one.proteinG * count),
      purineMg: Math.round(one.purineMg * count),
      saltG: r1(one.saltG * count),
      sugarG: r1(one.sugarG * count),
    };
  }
  const a = amountOf(food, count);
  const named = byWeight ? describeLine(food, q.qty) : GRAM_UNITS.has(q.unit) || q.unit === 'ml' ? `${q.qty} ${q.unit} ${baseName(food.name)}` : describeLine(food, q.qty);
  return {
    food,
    name: named,
    calories: Math.round(a.kcal),
    proteinG: r1(a.proteinG),
    purineMg: Math.round(a.purineMg),
    saltG: r1(a.saltG),
    sugarG: r1(a.sugarG),
  };
}

/** Is this name just a food the database has with an amount, and are these figures what the database works out for it? A line
 *  whose figures were changed by hand is a different food and is not covered. */
export function isKnownWithQuantity(name: string, foods: FoodEntry[], calories: number): boolean {
  const known = lookupQuantified(name, foods);
  return !!known && Math.abs(known.calories - calories) <= Math.max(5, calories * 0.03);
}
