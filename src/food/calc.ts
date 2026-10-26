import { SODIUM_MG_PER_SALT_G } from '../insights/thresholds';
import type { FoodEntry, PurineLevel } from './types';

export type FoodNutrition = Pick<FoodEntry, 'unitG' | 'kcal' | 'proteinG' | 'purineMg' | 'sugarG' | 'sodiumMg'>;

/** What an eaten amount of a food adds up to. */
export interface FoodAmount {
  /** Weight (g) or volume (ml) eaten. */
  grams: number;
  kcal: number;
  proteinG: number;
  purineMg: number;
  sugarG: number;
  sodiumMg: number;
  /** The same sodium as table salt (1 g sodium = 2.5 g salt), the unit the app's salt limit uses. */
  saltG: number;
}

export const ZERO_AMOUNT: FoodAmount = { grams: 0, kcal: 0, proteinG: 0, purineMg: 0, sugarG: 0, sodiumMg: 0, saltG: 0 };

/** Nutrition of `qty` units of a food (qty is grams/ml for 'g'/'ml' foods, otherwise a count of the food's unit). */
export function amountOf(food: FoodNutrition, qty: number): FoodAmount {
  const q = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const grams = q * food.unitG;
  const k = grams / 100;
  const sodiumMg = food.sodiumMg * k;
  return {
    grams,
    kcal: food.kcal * k,
    proteinG: food.proteinG * k,
    purineMg: food.purineMg * k,
    sugarG: food.sugarG * k,
    sodiumMg,
    saltG: sodiumMg / SODIUM_MG_PER_SALT_G,
  };
}

export function sumAmounts(list: FoodAmount[]): FoodAmount {
  return list.reduce(
    (t, a) => ({
      grams: t.grams + a.grams,
      kcal: t.kcal + a.kcal,
      proteinG: t.proteinG + a.proteinG,
      purineMg: t.purineMg + a.purineMg,
      sugarG: t.sugarG + a.sugarG,
      sodiumMg: t.sodiumMg + a.sodiumMg,
      saltG: t.saltG + a.saltG,
    }),
    ZERO_AMOUNT
  );
}

/** Purine per 100 g: under 50 mg is low, from 160 mg high (the usual gout-diet bands). */
export function purineLevel(purineMgPer100: number): PurineLevel {
  return purineMgPer100 < 50 ? 'low' : purineMgPer100 < 160 ? 'medium' : 'high';
}

/** The food's name without the portion hint in brackets: "Trứng gà (quả ≈50 g)" -> "Trứng gà". */
export function baseName(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, '').trim() || name;
}

const trimNumber = (n: number): string => String(Math.round(n * 10) / 10);

/** One line of a meal description: "150 g Ức gà chín", "2 quả Trứng gà". */
export function describeLine(food: Pick<FoodEntry, 'name' | 'unit'>, qty: number): string {
  return `${trimNumber(qty)} ${food.unit} ${baseName(food.name)}`;
}

/** Default quantity when a food is first added: 100 for by-weight foods, one portion otherwise. */
export const defaultQty = (food: Pick<FoodEntry, 'unit'>): number => (food.unit === 'g' || food.unit === 'ml' ? 100 : 1);

/** What the per-100 figures are per: millilitres for drinks and 'ml' foods, grams for everything else. */
export const baseUnit = (food: Pick<FoodEntry, 'unit' | 'group'>): 'g' | 'ml' => (food.unit === 'ml' || food.group === 'drink' ? 'ml' : 'g');
