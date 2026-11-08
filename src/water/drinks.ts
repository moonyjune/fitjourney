import type { DailyNutritionLog, ExtraFoodItem, MealPart } from '../types';

/** One glass, cup, box or bottle of a drink whose name gives no millilitres ("Cà phê sữa", "1 hộp sữa đậu nành"). */
export const DRINK_SERVING_ML = 250;
/** The most one food can add to the day's water: a typo ("25000 ml") must not fill the day. */
export const MAX_DRINK_ML = 3000;

/** Drinks by name (Vietnamese without accents, and English). Yoghurt, fish sauce, broth and alcohol are not water. */
const DRINK = /\b(sua|ca phe|cafe|coffee|latte|cappuccino|americano|espresso|matcha|tra|nuoc ep|nuoc cam|nuoc dua|nuoc chanh|nuoc mia|nuoc loc|nuoc khoang|sinh to|smoothie|juice|kombucha|soda|coca|pepsi|tea|milk|whey|protein shake|shake)\b/;
const NOT_DRINK = /\b(sua chua(?! uong)|sua dac|ca tra|banh|nuoc mam|nuoc cham|nuoc dung|nuoc leo|bia|ruou|beer|wine|tra sua tran chau)\b/;
const MILLILITRES = /(\d+(?:[.,]\d+)?)\s*(ml|l|lit|lít)\b/i;
const SERVINGS = /(\d+(?:[.,]\d+)?)\s*(ly|coc|hop|chai|lon|tach|cup|glass|box|bottle|can)\b/;

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

/** The water a food adds to the day, read from its name: the millilitres written in it ("Sữa đậu nành 250ml", "0,5 l nước cam"), else
 *  one glass per glass/cup/box counted ("2 ly cà phê") for a name that is a drink; 0 for anything else (food, yoghurt, broth, beer). */
export function drinkMlOf(name: string): number {
  const text = plain(name);
  if (!DRINK.test(text) || NOT_DRINK.test(text)) return 0;
  const ml = MILLILITRES.exec(text);
  if (ml) {
    const n = parseFloat(ml[1].replace(',', '.'));
    return Math.min(MAX_DRINK_ML, Math.round(ml[2].toLowerCase() === 'ml' ? n : n * 1000));
  }
  const servings = SERVINGS.exec(text);
  const count = servings ? parseFloat(servings[1].replace(',', '.')) : 1;
  return Math.min(MAX_DRINK_ML, Math.round((count > 0 ? count : 1) * DRINK_SERVING_ML));
}

/** The water a meal of several parts adds (each drink in it), or the one food's own. */
export function suggestedDrinkMl(parts: Pick<MealPart, 'name'>[]): number {
  return Math.min(MAX_DRINK_ML, parts.reduce((sum, p) => sum + drinkMlOf(p.name), 0));
}

/** The water logged with the day's foods (drinks counted as water). */
export function drinksWaterMl(items: readonly Pick<ExtraFoodItem, 'waterMl'>[] | undefined): number {
  return (items ?? []).reduce((sum, i) => sum + (i.waterMl && i.waterMl > 0 ? i.waterMl : 0), 0);
}

/** All the water of a day: what was logged as water plus the drinks logged as food that count as water. */
export function dayWaterMl(log: Pick<DailyNutritionLog, 'waterMl' | 'extraItems'> | undefined | null): number {
  if (!log) return 0;
  return Math.max(0, log.waterMl ?? 0) + drinksWaterMl(log.extraItems);
}
