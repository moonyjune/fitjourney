import { describe, expect, it } from '@jest/globals';
import { hasDishDetails, isDetailPart, resolveFromDb, rowsFromResult, splitMealText } from '../../ai/textMeal';
import { fakeMealText } from '../../ai/devPhotoAnalysis';
import { describeLine } from '../../food/calc';
import { defaultForgotMeal, forgotMealKcal, isForgotMealItem, FORGOT_MEAL_NAME, targetIntakeKcal } from '../../food/forgotMeal';
import { hasMeasure, scaleApprox, withMeasure } from '../../food/measure';
import { scalePart } from '../../food/partScale';
import type { FoodEntry } from '../../food/types';
import type { MealTextResult } from '../../sync/cloudSync';

const food = (name: string, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `f-${name}`, name, group: 'redMeat', unit: 'g', unitG: 1, kcal: 250, proteinG: 26, purineMg: 120, sugarG: 0, sodiumMg: 60, note: '', confidence: 'medium', ...extra,
});

describe('one dish with its details is never split into several foods', () => {
  it('keeps what is in brackets with its dish', () => {
    expect(splitMealText('1 bát phở bò (200 g bánh, 80 g thịt), 1 ly trà đá')).toEqual(['1 bát phở bò (200 g bánh, 80 g thịt)', '1 ly trà đá']);
    expect(splitMealText('cơm tấm [sườn, chả] và trà')).toEqual(['cơm tấm [sườn, chả]', 'trà']);
  });

  it('tells notes and the weighed ingredients of a bowl from separate foods', () => {
    const parts = splitMealText('1 bát bún bò, 100g thịt bò, ít đường');
    expect(parts).toEqual(['1 bát bún bò', '100g thịt bò', 'ít đường']);
    expect(parts.map((_, i) => isDetailPart(parts, i))).toEqual([false, true, true]);
    for (const note of ['không ăn nước dùng', 'bỏ da', 'ít đường', 'k hành', 'thêm rau']) expect(hasDishDetails(`phở bò, ${note}`)).toBe(true);
    expect(hasDishDetails('1 bát phở bò (200 g bánh, 80 g thịt)')).toBe(true);
    expect(hasDishDetails('1 tô phở bò, 200 g bánh phở')).toBe(true);
    // Separate foods stay separate: no shared word, or no bowl before the weighed food.
    expect(hasDishDetails('1 bát cơm, 100g ức gà')).toBe(false);
    expect(hasDishDetails('150g cơm trắng, 2 quả trứng gà')).toBe(false);
    expect(hasDishDetails('trà không đường, bánh mì')).toBe(false);
  });

  it('does not answer a dish with details from the database (the beef would be counted twice)', () => {
    const foods = [food('Thịt bò'), food('Cơm trắng', { group: 'starch', kcal: 130, proteinG: 2.7, purineMg: 20 })];
    expect(resolveFromDb('1 bát bún bò, 100g thịt bò, ít đường', foods)).toBeNull();
    expect(resolveFromDb('100g thịt bò, ít muối', foods)).toBeNull();
    expect(resolveFromDb('150g cơm trắng (ít)', foods)).toBeNull();
    // A plain list still uses the database.
    expect(resolveFromDb('150g cơm trắng, 100g thịt bò', foods)!.unknown).toEqual([]);
  });

  it('the offline stand-in keeps the details with the dish too', () => {
    expect(fakeMealText('1 bát bún bò, 100g thịt bò, ít đường').items.map((i) => i.name)).toEqual(['1 bát bún bò']);
    expect(fakeMealText('phở, trà').items).toHaveLength(2);
  });
});

describe('every food carries a weight or volume', () => {
  it('knows when a name already has g / ml', () => {
    for (const n of ['Yến mạch 30g', 'Sữa 200 ml', 'Cơm 1,5 kg', 'Bia 0.5 l', 'Nước 1 lít']) expect(hasMeasure(n)).toBe(true);
    for (const n of ['1 hộp sữa chua', '2 cái bánh bao', 'Phở bò 1 bát', '1 gói mì']) expect(hasMeasure(n)).toBe(false);
  });

  it('adds the AI amount only to a name without one', () => {
    expect(withMeasure('1 hộp sữa chua', 100, 'g')).toBe('1 hộp sữa chua (≈100 g)');
    expect(withMeasure('1 ly trà sữa', 500, 'ml')).toBe('1 ly trà sữa (≈500 ml)');
    expect(withMeasure('Yến mạch 30g', 30, 'g')).toBe('Yến mạch 30g');
    expect(withMeasure('1 cái bánh', undefined, 'g')).toBe('1 cái bánh');
    expect(withMeasure('1 cái bánh', -5, 'g')).toBe('1 cái bánh');
  });

  it('AI lines named by a count get their grams', () => {
    const result: MealTextResult = {
      items: [
        { name: '1 hộp cơm gà', caloriesKcal: 650, proteinG: 35, amount: 420, amountUnit: 'g' },
        { name: '1 cốc sữa đậu nành', caloriesKcal: 110, proteinG: 7, amount: 250, amountUnit: 'ml' },
        { name: 'Yến mạch 30g', caloriesKcal: 115, proteinG: 4, amount: 30, amountUnit: 'g' },
      ],
      reasoning: 'x',
    };
    expect(rowsFromResult(result, []).map((r) => r.name)).toEqual(['1 hộp cơm gà (≈420 g)', '1 cốc sữa đậu nành (≈250 ml)', 'Yến mạch 30g']);
  });

  it('a database food counted in pieces, bowls or boxes says its weight; a remembered meal does not', () => {
    expect(describeLine({ name: 'Sữa chua có đường (hộp ≈100 g)', unit: 'hộp', unitG: 100, group: 'eggDairy' }, 2)).toBe('2 hộp Sữa chua có đường (≈200 g)');
    expect(describeLine({ name: 'Sữa đậu nành', unit: 'cốc', unitG: 250, group: 'drink' }, 1)).toBe('1 cốc Sữa đậu nành (≈250 ml)');
    expect(describeLine({ name: 'Cơm trắng', unit: 'g', unitG: 1, group: 'starch' }, 150)).toBe('150 g Cơm trắng');
    expect(describeLine({ name: 'Phở bò', unit: 'phần', unitG: 100, auto: true }, 1)).toBe('1 phần Phở bò');
  });

  it('changing the count changes the weight with it', () => {
    expect(scalePart({ name: '1 hộp cơm gà (≈420 g)', calories: 650, proteinG: 35 }, 2)).toMatchObject({ name: '2 hộp cơm gà (≈840 g)', calories: 1300 });
    expect(scalePart({ name: 'Phở bò 2 bát (~900g)', calories: 900, proteinG: 60 }, 1)).toMatchObject({ name: 'Phở bò 1 bát (~450g)', calories: 450 });
    expect(scalePart({ name: 'Yến mạch 30g', calories: 115, proteinG: 4 }, 60)).toMatchObject({ name: 'Yến mạch 60g', calories: 230 });
    // The amount itself written as "≈N g" is the one number: it is not scaled twice.
    expect(scalePart({ name: 'Phở (≈500 g)', calories: 500, proteinG: 30 }, 250)).toMatchObject({ name: 'Phở (≈250 g)', calories: 250 });
    expect(scaleApprox('Phở (≈500 g)', 6, 2)).toBe('Phở (≈500 g)');
    expect(scaleApprox('1 hộp (≈250 g)', 0, 2)).toBe('1 hộp (≈500 g)');
  });
});

describe('"Không nhớ": one estimated meal', () => {
  it('is a third of the day\'s target intake (TDEE minus the deficit target), rounded to 10 kcal', () => {
    expect(targetIntakeKcal(2600, 700)).toBe(1900);
    expect(forgotMealKcal(2600, 700)).toBe(630);
    expect(forgotMealKcal(400, 700)).toBe(0);
    expect(forgotMealKcal(NaN, 500)).toBe(0);
    expect(forgotMealKcal(2600)).toBeGreaterThan(0); // the deficit mission's bar when no target is set
  });

  it('is named as an estimate and offered for the meal in view', () => {
    expect(FORGOT_MEAL_NAME).toContain('ước tính');
    expect(isForgotMealItem({ name: ` ${FORGOT_MEAL_NAME} ` })).toBe(true);
    expect(defaultForgotMeal('dinner', new Date('2026-11-19T08:00:00'))).toBe('dinner');
    expect(defaultForgotMeal('afternoon_snack', new Date('2026-11-19T08:00:00'))).toBe('breakfast');
    expect(defaultForgotMeal(null, new Date('2026-11-19T13:00:00'))).toBe('lunch');
    expect(defaultForgotMeal(null, new Date('2026-11-19T19:00:00'))).toBe('dinner');
  });
});
