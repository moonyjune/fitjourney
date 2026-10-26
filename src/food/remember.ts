import { SODIUM_MG_PER_SALT_G } from '../insights/thresholds';
import type { ExtraFoodItem } from '../types';
import { baseName } from './calc';
import { fold } from './search';
import type { FoodEntry, FoodGroup } from './types';

/**
 * Meals the user logs are remembered in the food database, so the next time the same food needs no typing and no AI call.
 * A logged meal has figures for the portion that was eaten, not per 100 g, so it is saved as "1 phần": `unitG` is the
 * (nominal) weight of that portion, 100 g unless that would push a per-100 figure past what a food can have (900 kcal).
 */

export const PORTION_UNIT = 'phần';
const MAX_NAME_CHARS = 80;
const MAX_KCAL_PER_100 = 900;

type LoggedFood = Pick<ExtraFoodItem, 'name' | 'calories' | 'proteinG' | 'purineMg' | 'saltG' | 'sugarG'>;

/** The name as used to tell foods apart: no accents, case, punctuation, brackets or doubled spaces. */
export function foodKey(name: string): string {
  return fold(baseName(name)).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findFoodByName(foods: FoodEntry[], name: string): FoodEntry | undefined {
  const key = foodKey(name);
  return key ? foods.find((f) => foodKey(f.name) === key) : undefined;
}

/** Whole words or phrases (accent-free) that put a food in a group; the first group with a hit wins. */
const GROUP_WORDS: [FoodGroup, string[]][] = [
  ['drink', ['nuoc', 'tra', 'ca phe', 'cafe', 'coffee', 'bia', 'ruou', 'sua', 'sinh to', 'coca', 'pepsi', 'soda']],
  ['soup', ['pho', 'bun', 'hu tieu', 'mi', 'canh', 'sup', 'chao', 'lau']],
  ['seafood', ['ca', 'tom', 'cua', 'muc', 'ngheu', 'so', 'oc', 'hai san']],
  ['poultry', ['ga', 'vit', 'chim']],
  ['redMeat', ['bo', 'heo', 'lon', 'thit', 'suon', 'cuu', 'de']],
  ['eggDairy', ['trung', 'sua chua', 'pho mai']],
  ['vegetable', ['rau', 'salad', 'cai', 'bap cai', 'dua chuot', 'ca rot']],
  ['fruit', ['cam', 'tao', 'chuoi', 'xoai', 'dua hau', 'nho', 'oi', 'buoi', 'trai cay']],
  ['sweet', ['banh ngot', 'keo', 'kem', 'che', 'socola', 'chocolate', 'banh quy']],
  ['starch', ['com', 'xoi', 'banh mi', 'khoai', 'ngo', 'yen mach', 'nui']],
];

/** A best guess of the group from the name; only used to file the food, never for any figure. */
export function guessGroup(name: string): FoodGroup {
  const text = ` ${fold(name).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  for (const [group, words] of GROUP_WORDS) if (words.some((w) => text.includes(` ${w} `))) return group;
  return 'processed';
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The food to save for a logged item, or null when it should not be saved (no name or figures, too long, or already known). */
export function rememberableFood(item: LoggedFood, known: FoodEntry[]): Omit<FoodEntry, 'id'> | null {
  const name = item.name.trim();
  if (!name || name.length > MAX_NAME_CHARS || !foodKey(name)) return null;
  const nums = [item.calories, item.proteinG, item.purineMg ?? 0, item.saltG ?? 0, item.sugarG ?? 0];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (item.calories <= 0 && item.proteinG <= 0) return null;
  if (findFoodByName(known, name)) return null;
  const unitG = 100 * Math.max(1, Math.ceil(item.calories / MAX_KCAL_PER_100));
  const k = 100 / unitG;
  return {
    name,
    group: guessGroup(name),
    unit: PORTION_UNIT,
    unitG,
    kcal: round(item.calories * k),
    proteinG: round(item.proteinG * k),
    purineMg: round((item.purineMg ?? 0) * k),
    sugarG: round((item.sugarG ?? 0) * k),
    sodiumMg: round((item.saltG ?? 0) * SODIUM_MG_PER_SALT_G * k),
    note: 'Tự lưu từ nhật ký (1 phần như đã ăn). Purine, muối, đường chỉ có nếu bạn đã nhập khi ghi món.',
    confidence: 'low',
    auto: true,
  };
}

export interface Portion {
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
}

/** What one saved portion of a remembered food adds up to: the figures that were logged for it. */
export function portionOf(food: Pick<FoodEntry, 'unitG' | 'kcal' | 'proteinG' | 'purineMg' | 'sugarG' | 'sodiumMg'>): Portion {
  const k = food.unitG / 100;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    calories: Math.round(food.kcal * k),
    proteinG: r1(food.proteinG * k),
    purineMg: Math.round(food.purineMg * k),
    saltG: r1((food.sodiumMg * k) / SODIUM_MG_PER_SALT_G),
    sugarG: r1(food.sugarG * k),
  };
}

/** A remembered food (saved from the diary) with this name, if any. Built-in foods are per 100 g and never match here. */
export function findRememberedFood(foods: FoodEntry[], name: string): FoodEntry | undefined {
  const f = findFoodByName(foods, name);
  return f?.auto ? f : undefined;
}
