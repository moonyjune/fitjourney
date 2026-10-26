import type { FoodEntry, FoodGroup } from './types';
import { SODIUM_MG_PER_SALT_G } from '../insights/thresholds';
import { foodKey, guessGroup, portionOf } from './remember';

/** The three limits a swap is about. */
export type SwapNutrient = 'purine' | 'salt' | 'sugar';

export interface SwapItem {
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
}

export interface SwapContext {
  /** The limits this item would break. */
  exceeded: SwapNutrient[];
  /** Room left in each limit before this item (limit minus the day so far); zero or negative when it is already full. */
  headroom: Record<SwapNutrient, number>;
}

export interface SwapOption extends SwapItem {
  /** How the swap was found: from the user's food database or by the AI. */
  source: 'db' | 'ai';
  /** The amount to eat, e.g. "150 g" or "1.5 bát" (database swaps). */
  amount?: string;
  /** Short how-to or why, written by the AI (AI swaps). */
  how?: string;
  /** The AI's accuracy for this swap's figures (0-100). */
  accuracy?: number;
  /** By how much each exceeded limit goes down against the original, in whole percent. */
  reductions: { nutrient: SwapNutrient; pct: number }[];
}

const FIELD: Record<SwapNutrient, 'purineMg' | 'saltG' | 'sugarG'> = { purine: 'purineMg', salt: 'saltG', sugar: 'sugarG' };
const NUTRIENTS: SwapNutrient[] = ['purine', 'salt', 'sugar'];

/** A swap keeps the meal about the same size and protein. */
const KCAL_MIN = 0.4;
const KCAL_MAX = 1.15;
const PROTEIN_MIN = 0.6;
/** A limit that is still broken or already full must come down by at least this share of the original item. */
const MIN_REDUCTION = 0.5;
/** Float slack so a figure exactly on a boundary (115% of 400 is 459.99999999999994) is not turned away. */
const EPS = 1e-9;
export const MAX_SWAPS = 3;
/** Fewer database swaps than this and the AI button is offered. */
export const MIN_DB_SWAPS = 3;

/** Does `swap` really solve the problem: same size, enough protein, every exceeded limit fits in the room left (or, when
 *  there is no room, is at least halved), and no other limit is newly broken. Used on the AI's swaps too: the AI proposes,
 *  this decides. */
export function acceptSwap(item: SwapItem, swap: SwapItem, ctx: SwapContext): boolean {
  if (![swap.calories, swap.proteinG, swap.purineMg, swap.saltG, swap.sugarG].every((n) => Number.isFinite(n) && n >= 0)) return false;
  if (item.calories > 0 && (swap.calories < item.calories * KCAL_MIN - EPS || swap.calories > item.calories * KCAL_MAX + EPS)) return false;
  if (swap.proteinG < item.proteinG * PROTEIN_MIN - EPS) return false;
  for (const n of NUTRIENTS) {
    const field = FIELD[n];
    const room = ctx.headroom[n];
    if (ctx.exceeded.includes(n)) {
      if (swap[field] > item[field] * (1 - MIN_REDUCTION) + EPS) return false;
      if (room > 0 && swap[field] > room) return false;
    } else if (room >= 0 && swap[field] > room) {
      return false; // would break a limit the original did not
    }
  }
  return true;
}

export function reductionsOf(item: SwapItem, swap: SwapItem, ctx: SwapContext): { nutrient: SwapNutrient; pct: number }[] {
  return ctx.exceeded
    .filter((n) => item[FIELD[n]] > 0)
    .map((n) => ({ nutrient: n, pct: Math.max(0, Math.round((1 - swap[FIELD[n]] / item[FIELD[n]]) * 100)) }));
}

/** Amounts a portion can be scaled to so that it matches the calories of the item. */
export function scaleFood(food: FoodEntry, targetKcal: number): { figures: Omit<SwapItem, 'name'>; amount: string } | null {
  const one = portionOf(food);
  if (one.calories <= 0 && food.kcal <= 0) return null;
  const byWeight = food.unit === 'g' || food.unit === 'ml';
  let k: number;
  let amount: string;
  if (byWeight) {
    const grams = Math.min(400, Math.max(30, Math.round(((targetKcal / Math.max(food.kcal, 1)) * 100) / 10) * 10));
    k = grams / 100;
    amount = `${grams} ${food.unit}`;
  } else {
    const per = Math.max(one.calories, 1);
    const servings = Math.min(4, Math.max(0.5, Math.round((targetKcal / per) * 2) / 2));
    k = (servings * food.unitG) / 100;
    amount = `${servings} ${food.unit}`;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    amount,
    figures: {
      calories: Math.round(food.kcal * k),
      proteinG: r1(food.proteinG * k),
      purineMg: Math.round(food.purineMg * k),
      saltG: r1((food.sodiumMg * k) / SODIUM_MG_PER_SALT_G),
      sugarG: r1(food.sugarG * k),
    },
  };
}

export const NEVER_AS_MEAL: FoodGroup[] = ['seasoning', 'drink', 'sweet', 'snack'];

/** Swaps from the user's own food database: foods of a similar role, scaled to the calories of the item, that pass
 *  `acceptSwap`; the ones that lower the exceeded limits most (and share the item's group) first. No AI involved. */
export function swapsFromFoods(item: SwapItem, ctx: SwapContext, foods: FoodEntry[]): SwapOption[] {
  if (item.calories <= 0 || ctx.exceeded.length === 0) return [];
  const group = guessGroup(item.name);
  const itemKey = foodKey(item.name);
  const scored: { option: SwapOption; score: number }[] = [];
  for (const food of foods) {
    if (foodKey(food.name) === itemKey) continue;
    if (NEVER_AS_MEAL.includes(food.group) && food.group !== group) continue;
    const scaled = scaleFood(food, item.calories);
    if (!scaled) continue;
    const swap: SwapItem = { name: food.name, ...scaled.figures };
    if (!acceptSwap(item, swap, ctx)) continue;
    const reductions = reductionsOf(item, swap, ctx);
    const score = reductions.reduce((s, r) => s + r.pct, 0) + (food.group === group ? 40 : 0) + Math.min(20, swap.proteinG);
    scored.push({ option: { ...swap, source: 'db', amount: scaled.amount, reductions }, score });
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter(({ option }) => {
      const key = foodKey(option.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SWAPS)
    .map((s) => s.option);
}

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/** The AI's swaps reduced to the usable ones: well-formed, in bounds, and passing `acceptSwap`. At most 3. */
export function cleanAiSwaps(raw: unknown, item: SwapItem, ctx: SwapContext): SwapOption[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { swaps?: unknown }).swaps) ? ((raw as { swaps: unknown[] }).swaps) : [];
  const out: SwapOption[] = [];
  const seen = new Set<string>([foodKey(item.name)]);
  for (const entry of list) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const calories = num(o.calories, 5000);
    const proteinG = num(o.proteinG, 500);
    if (!name || calories === null || proteinG === null) continue;
    const swap: SwapItem = { name, calories: Math.round(calories), proteinG: Math.round(proteinG * 10) / 10, purineMg: Math.round(num(o.purineMg, 20000) ?? 0), saltG: Math.round((num(o.saltG, 200) ?? 0) * 10) / 10, sugarG: Math.round((num(o.sugarG, 1000) ?? 0) * 10) / 10 };
    const key = foodKey(name);
    if (!key || seen.has(key) || !acceptSwap(item, swap, ctx)) continue;
    seen.add(key);
    const option: SwapOption = { ...swap, source: 'ai', reductions: reductionsOf(item, swap, ctx) };
    const how = typeof o.how === 'string' && o.how.trim() ? o.how.trim().slice(0, 300) : undefined;
    if (how) option.how = how;
    if (typeof o.accuracyPercent === 'number' && Number.isFinite(o.accuracyPercent)) option.accuracy = Math.max(0, Math.min(100, Math.round(o.accuracyPercent)));
    out.push(option);
    if (out.length === MAX_SWAPS) break;
  }
  return out;
}
