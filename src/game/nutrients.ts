import type { ExtraFoodItem, MealFoodItem } from '../types';

/**
 * ROUGH per-food estimates of purine and salt, used only to drive the in-game "stay under the
 * line" missions. They are approximations from commonly published food tables, NOT medical data:
 * real values vary with cut, brand and cooking, and seasoning added at the table or in the pan is
 * not tracked. Anyone managing gout or hypertension should follow their doctor's numbers instead.
 *
 * Sugar is deliberately *free sugar* (added sugar / syrups / juice). Whole foods in the plan
 * (banana, plain yoghurt, oats) contribute 0; only logged extras can add to it.
 */
export interface Nutrients {
  purineMg: number;
  saltG: number;
  sugarG: number;
}

export const ZERO_NUTRIENTS: Nutrients = { purineMg: 0, saltG: 0, sugarG: 0 };

interface FoodRule {
  /** Matched against the item name lower-cased with Vietnamese diacritics stripped. */
  match: RegExp;
  purinePer100g: number;
  saltPer100g: number;
  /** Grams of one counted unit ("2 quả", "1 lát"), used when no explicit "<n>g" is in the name. */
  unitG: number;
  /** Grams assumed when the name has neither grams nor a count. */
  defaultG: number;
}

// Order matters: specific rules must come before the generic ones they overlap with.
const RULES: FoodRule[] = [
  { match: /xuc xich/, purinePer100g: 110, saltPer100g: 2.0, unitG: 40, defaultG: 100 },
  { match: /long trang/, purinePer100g: 3, saltPer100g: 0.4, unitG: 33, defaultG: 66 },
  { match: /trung/, purinePer100g: 5, saltPer100g: 0.35, unitG: 50, defaultG: 100 },
  { match: /ca (hoi|basa|thu|ngu|loc)/, purinePer100g: 170, saltPer100g: 0.2, unitG: 100, defaultG: 150 },
  { match: /(uc|luon|dui|canh|thit) ga|ga (luoc|nuong|ap chao|xe|ran|kho)/, purinePer100g: 170, saltPer100g: 0.4, unitG: 100, defaultG: 150 },
  // A line that merely *starts* with veg ("Rau cải, mộc nhĩ, nước dùng gà") is vegetables + broth,
  // not chicken, so this sits after the chicken-meat rule but before any looser chicken match.
  { match: /^(\S+\s+){0,2}(salad|rau)/, purinePer100g: 25, saltPer100g: 0.1, unitG: 150, defaultG: 150 },
  { match: /banh mi/, purinePer100g: 25, saltPer100g: 1.0, unitG: 30, defaultG: 30 },
  { match: /sua chua/, purinePer100g: 8, saltPer100g: 0.15, unitG: 100, defaultG: 100 },
  { match: /yen mach/, purinePer100g: 50, saltPer100g: 0.02, unitG: 30, defaultG: 30 },
  { match: /chuoi/, purinePer100g: 10, saltPer100g: 0.02, unitG: 100, defaultG: 50 },
  { match: /hanh nhan/, purinePer100g: 35, saltPer100g: 0.02, unitG: 1.2, defaultG: 10 },
  { match: /mien/, purinePer100g: 10, saltPer100g: 0.1, unitG: 40, defaultG: 40 },
  { match: /khoai/, purinePer100g: 15, saltPer100g: 0.1, unitG: 150, defaultG: 150 },
  { match: /sua tuoi|sua /, purinePer100g: 1, saltPer100g: 0.1, unitG: 200, defaultG: 200 },
];

function stripDiacritics(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** Pulls a gram weight or a counted amount out of a plan item name like "120g xúc xích gà". */
function parseGrams(name: string, rule: FoodRule): number {
  const grams = name.match(/(\d+(?:[.,]\d+)?)\s*g\b/);
  if (grams) return parseFloat(grams[1].replace(',', '.'));
  const count = name.match(/(\d+(?:[.,]\d+)?)\s*(qua|lat|hat|hu|ly|bat|phan|long)\b/);
  if (count) return parseFloat(count[1].replace(',', '.')) * rule.unitG;
  if (/1\/2/.test(name)) return rule.unitG * 0.5;
  return rule.defaultG;
}

/** Estimates purine/salt for one plan food line. Returns null when no rule matches the name. */
export function estimateItemNutrients(item: Pick<MealFoodItem, 'name'>): Nutrients | null {
  const name = stripDiacritics(item.name);
  const rule = RULES.find((r) => r.match.test(name));
  if (!rule) return null;
  const grams = parseGrams(name, rule);
  return {
    purineMg: (rule.purinePer100g * grams) / 100,
    saltG: (rule.saltPer100g * grams) / 100,
    sugarG: 0,
  };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { purineMg: a.purineMg + b.purineMg, saltG: a.saltG + b.saltG, sugarG: a.sugarG + b.sugarG };
}

/** Totals the estimates for a list of plan items; unmatched items are counted in `unknownItems`. */
export function sumItemNutrients(items: Pick<MealFoodItem, 'name'>[]): { total: Nutrients; unknownItems: number } {
  let total = ZERO_NUTRIENTS;
  let unknownItems = 0;
  for (const item of items) {
    const estimate = estimateItemNutrients(item);
    if (estimate) total = addNutrients(total, estimate);
    else unknownItems += 1;
  }
  return { total, unknownItems };
}

/** Nutrients the user entered by hand on an off-plan item (all optional). */
export function extraItemNutrients(item: Pick<ExtraFoodItem, 'purineMg' | 'saltG' | 'sugarG'>): Nutrients {
  return { purineMg: item.purineMg ?? 0, saltG: item.saltG ?? 0, sugarG: item.sugarG ?? 0 };
}
