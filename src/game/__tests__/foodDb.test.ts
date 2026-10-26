import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

import { amountOf, baseName, baseUnit, defaultQty, describeLine, purineLevel, sumAmounts, ZERO_AMOUNT } from '../../food/calc';
import { BUILT_IN_FOODS } from '../../food/foodData';
import { fold, searchFoods } from '../../food/search';
import { formatFoodText, GROUP_LABEL, unitLabel } from '../../food/strings';
import { FOOD_GROUPS, type FoodEntry } from '../../food/types';
import { mergeFoods, useFoodDbStore, validateFood, type FoodFields } from '../../store/useFoodDbStore';
import { resetAllLocalStores } from '../../store/resetLocalStores';

const byName = (name: string): FoodEntry => {
  const hit = BUILT_IN_FOODS.find((f) => f.name === name);
  if (!hit) throw new Error(`no food "${name}"`);
  return hit;
};

describe('built-in food table', () => {
  it('has every food once, with sensible per-100 values and a known group', () => {
    expect(BUILT_IN_FOODS.length).toBe(114);
    expect(new Set(BUILT_IN_FOODS.map((f) => f.id)).size).toBe(BUILT_IN_FOODS.length);
    expect(new Set(BUILT_IN_FOODS.map((f) => f.name)).size).toBe(BUILT_IN_FOODS.length);
    for (const f of BUILT_IN_FOODS) {
      expect(FOOD_GROUPS).toContain(f.group);
      expect(f.unit.length).toBeGreaterThan(0);
      expect(f.unitG).toBeGreaterThan(0);
      for (const n of [f.kcal, f.proteinG, f.purineMg, f.sugarG, f.sodiumMg]) expect(n).toBeGreaterThanOrEqual(0);
      expect(f.kcal).toBeLessThanOrEqual(900);
      expect(['high', 'medium', 'low']).toContain(f.confidence);
      // by-weight foods are counted in grams or ml, one unit = 1 g
      if (f.unit === 'g' || f.unit === 'ml') expect(f.unitG).toBe(1);
    }
  });

  it('keeps the values of the diary workbook for foods it was built from', () => {
    expect(byName('Lòng trắng trứng')).toMatchObject({ group: 'eggDairy', unit: 'g', kcal: 52, proteinG: 11, purineMg: 0, sugarG: 0, sodiumMg: 166, confidence: 'high' });
    expect(byName('Mì gói (gói ≈75 g, cả gia vị)')).toMatchObject({ unit: 'gói', unitG: 75, kcal: 450, sodiumMg: 2300 });
    expect(byName('Nước mắm (thìa canh 15 ml)')).toMatchObject({ unit: 'thìa canh', unitG: 15, sodiumMg: 8000 });
    expect(byName('Măng').note).toBe('Hay khởi phát cơn gout');
    expect(byName('Ức gà chín (áp chảo/nướng/luộc)')).toMatchObject({ kcal: 165, proteinG: 31, purineMg: 175, sodiumMg: 80 });
  });

  it('covers every group the screen offers a filter for', () => {
    for (const g of FOOD_GROUPS) expect(BUILT_IN_FOODS.some((f) => f.group === g)).toBe(true);
    for (const lang of ['vi', 'en'] as const) for (const g of FOOD_GROUPS) expect(GROUP_LABEL[lang][g].length).toBeGreaterThan(1);
  });
});

describe('amounts', () => {
  it('turns a quantity into nutrition, matching the workbook’s per-unit columns', () => {
    const egg = amountOf(byName('Trứng gà (quả ≈50 g)'), 2); // 2 eggs = 100 g
    expect(egg.grams).toBe(100);
    expect(egg.kcal).toBeCloseTo(143, 6);
    expect(egg.proteinG).toBeCloseTo(12.6, 6);
    const noodles = amountOf(byName('Mì gói (gói ≈75 g, cả gia vị)'), 1);
    expect(noodles.kcal).toBeCloseTo(337.5, 6); // sheet: 337.5 kcal per pack
    expect(noodles.sodiumMg).toBeCloseTo(1725, 6); // sheet: 1,725 mg per pack
    const sauce = amountOf(byName('Nước mắm (thìa canh 15 ml)'), 1);
    expect(sauce.sodiumMg).toBeCloseTo(1200, 6);
    expect(sauce.saltG).toBeCloseTo(3, 6); // 1,200 mg sodium = 3 g salt
    const chicken = amountOf(byName('Ức gà chín (áp chảo/nướng/luộc)'), 150);
    expect(chicken).toMatchObject({ grams: 150 });
    expect(chicken.kcal).toBeCloseTo(247.5, 6);
    expect(chicken.proteinG).toBeCloseTo(46.5, 6);
    expect(chicken.purineMg).toBeCloseTo(262.5, 6);
  });

  it('treats a missing, negative or invalid quantity as nothing eaten', () => {
    const food = byName('Cơm trắng chín');
    for (const q of [0, -5, NaN, Infinity]) expect(amountOf(food, q)).toEqual(ZERO_AMOUNT);
  });

  it('adds amounts up', () => {
    const total = sumAmounts([amountOf(byName('Cơm trắng chín'), 150), amountOf(byName('Lòng trắng trứng'), 100)]);
    expect(total.kcal).toBeCloseTo(195 + 52, 6);
    expect(total.proteinG).toBeCloseTo(4.05 + 11, 6);
    expect(total.grams).toBe(250);
    expect(sumAmounts([])).toEqual(ZERO_AMOUNT);
  });

  it('bands purine as low under 50 mg, high from 160 mg per 100 g', () => {
    expect(purineLevel(0)).toBe('low');
    expect(purineLevel(49.9)).toBe('low');
    expect(purineLevel(50)).toBe('medium');
    expect(purineLevel(159)).toBe('medium');
    expect(purineLevel(160)).toBe('high');
    // the table is labelled the same way: tôm chín (180) high, tôm sống (150) medium, đậu phụ (30) low
    expect(purineLevel(byName('Tôm chín bóc vỏ').purineMg)).toBe('high');
    expect(purineLevel(byName('Tôm sống bóc vỏ').purineMg)).toBe('medium');
    expect(purineLevel(byName('Đậu phụ').purineMg)).toBe('low');
  });

  it('names the food without its portion hint and describes a line of a meal', () => {
    expect(baseName('Trứng gà (quả ≈50 g)')).toBe('Trứng gà');
    expect(baseName('Mì gói (gói ≈75 g, cả gia vị)')).toBe('Mì gói');
    expect(baseName('Măng')).toBe('Măng');
    expect(describeLine(byName('Trứng gà (quả ≈50 g)'), 2)).toBe('2 quả Trứng gà');
    expect(describeLine(byName('Ức gà chín (áp chảo/nướng/luộc)'), 150.04)).toBe('150 g Ức gà chín');
    expect(defaultQty(byName('Lòng trắng trứng'))).toBe(100);
    expect(defaultQty(byName('Sữa tươi không đường'))).toBe(100);
    expect(defaultQty(byName('Trứng gà (quả ≈50 g)'))).toBe(1);
    expect(baseUnit(byName('Coca thường (lon 330 ml)'))).toBe('ml');
    expect(baseUnit(byName('Phở bò (bát ≈600 g cả nước)'))).toBe('g');
  });
});

describe('search', () => {
  it('ignores accents and case, and needs every word', () => {
    expect(fold('Đậu phụ Ức GÀ')).toBe('dau phu uc ga');
    expect(searchFoods(BUILT_IN_FOODS, 'uc ga').map((f) => f.name)).toEqual(expect.arrayContaining(['Ức gà sống', 'Ức gà chín (áp chảo/nướng/luộc)']));
    expect(searchFoods(BUILT_IN_FOODS, 'ga chin').every((f) => fold(f.name).includes('ga') && fold(f.name).includes('chin'))).toBe(true);
    expect(searchFoods(BUILT_IN_FOODS, 'dau phu').map((f) => f.name)).toContain('Đậu phụ');
    expect(searchFoods(BUILT_IN_FOODS, 'zzzz')).toEqual([]);
  });

  it('lists names that start with the query first, can narrow to a group, and returns everything for an empty query', () => {
    const r = searchFoods(BUILT_IN_FOODS, 'ga');
    const firstContaining = r.findIndex((f) => !fold(f.name).startsWith('ga'));
    const lastStarting = r.map((f) => fold(f.name).startsWith('ga')).lastIndexOf(true);
    if (firstContaining !== -1 && lastStarting !== -1) expect(lastStarting).toBeLessThan(firstContaining);
    expect(searchFoods(BUILT_IN_FOODS, '')).toHaveLength(BUILT_IN_FOODS.length);
    expect(searchFoods(BUILT_IN_FOODS, '', 'seafood').every((f) => f.group === 'seafood')).toBe(true);
    expect(searchFoods(BUILT_IN_FOODS, 'ga', 'poultry').every((f) => f.group === 'poultry')).toBe(true);
  });
});

const fields = (over: Partial<FoodFields> = {}): FoodFields => ({
  name: 'Bánh gạo',
  group: 'starch',
  unit: 'g',
  unitG: 1,
  kcal: 360,
  proteinG: 6,
  purineMg: 10,
  sugarG: 1,
  sodiumMg: 20,
  confidence: 'medium',
  ...over,
});

describe('validating a food', () => {
  it('accepts a complete food and names the first problem otherwise', () => {
    expect(validateFood(fields(), BUILT_IN_FOODS)).toBeNull();
    expect(validateFood(fields({ name: '   ' }), BUILT_IN_FOODS)).toBe('name');
    expect(validateFood(fields({ name: 'lòng trắng trứng' }), BUILT_IN_FOODS)).toBe('duplicate'); // case-insensitive
    expect(validateFood(fields({ unit: ' ' }), BUILT_IN_FOODS)).toBe('unit');
    expect(validateFood(fields({ unitG: 0 }), BUILT_IN_FOODS)).toBe('unit');
    expect(validateFood(fields({ proteinG: -1 }), BUILT_IN_FOODS)).toBe('amount');
    expect(validateFood(fields({ sodiumMg: NaN }), BUILT_IN_FOODS)).toBe('amount');
    expect(validateFood(fields({ kcal: 901 }), BUILT_IN_FOODS)).toBe('kcal');
    expect(validateFood(fields({ kcal: 900 }), BUILT_IN_FOODS)).toBeNull();
  });

  it('lets a food keep its own name while it is being edited', () => {
    const egg = byName('Lòng trắng trứng');
    expect(validateFood(fields({ name: egg.name }), BUILT_IN_FOODS, egg.id)).toBeNull();
    expect(validateFood(fields({ name: egg.name }), BUILT_IN_FOODS)).toBe('duplicate');
  });
});

describe('food store', () => {
  beforeEach(() => {
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
  });

  it('adds the user’s own foods after the built-in ones', () => {
    const added = useFoodDbStore.getState().addCustom(fields({ name: '  Bánh gạo  ' }));
    expect(added.id.startsWith('c-')).toBe(true);
    expect(added.name).toBe('Bánh gạo');
    const all = mergeFoods(useFoodDbStore.getState().custom, useFoodDbStore.getState().overrides);
    expect(all).toHaveLength(115);
    expect(all[all.length - 1].name).toBe('Bánh gạo');
  });

  it('edits a custom food in place and a built-in food as an override that can be undone', () => {
    const mine = useFoodDbStore.getState().addCustom(fields());
    useFoodDbStore.getState().updateFood(mine.id, fields({ kcal: 400 }));
    expect(useFoodDbStore.getState().custom[0]).toMatchObject({ id: mine.id, kcal: 400 });

    const egg = byName('Lòng trắng trứng');
    useFoodDbStore.getState().updateFood(egg.id, { ...egg, kcal: 48, note: 'theo nhãn' });
    let all = mergeFoods(useFoodDbStore.getState().custom, useFoodDbStore.getState().overrides);
    expect(all.find((f) => f.id === egg.id)).toMatchObject({ kcal: 48, note: 'theo nhãn', name: 'Lòng trắng trứng' });
    expect(BUILT_IN_FOODS.find((f) => f.id === egg.id)!.kcal).toBe(52); // the table itself is untouched
    expect(all).toHaveLength(115);

    useFoodDbStore.getState().resetOverride(egg.id);
    all = mergeFoods(useFoodDbStore.getState().custom, useFoodDbStore.getState().overrides);
    expect(all.find((f) => f.id === egg.id)!.kcal).toBe(52);
  });

  it('removes a custom food together with its place in the recent list, and keeps only the last 8 recent foods', () => {
    const mine = useFoodDbStore.getState().addCustom(fields());
    useFoodDbStore.getState().touchRecent(mine.id);
    useFoodDbStore.getState().removeCustom(mine.id);
    expect(useFoodDbStore.getState().custom).toEqual([]);
    expect(useFoodDbStore.getState().recent).toEqual([]);

    for (const f of BUILT_IN_FOODS.slice(0, 10)) useFoodDbStore.getState().touchRecent(f.id);
    useFoodDbStore.getState().touchRecent(BUILT_IN_FOODS[5].id); // moves to the front, no duplicate
    const recent = useFoodDbStore.getState().recent;
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe(BUILT_IN_FOODS[5].id);
    expect(new Set(recent).size).toBe(8);
  });

  it('is cleared when the signed-in account changes', () => {
    useFoodDbStore.getState().addCustom(fields());
    useFoodDbStore.getState().updateFood(BUILT_IN_FOODS[0].id, { ...BUILT_IN_FOODS[0], kcal: 1 });
    useFoodDbStore.getState().touchRecent(BUILT_IN_FOODS[0].id);
    resetAllLocalStores();
    expect(useFoodDbStore.getState()).toMatchObject({ custom: [], overrides: {}, recent: [] });
  });
});

describe('copy', () => {
  it('fills placeholders and shows units in the reader’s language', () => {
    expect(formatFoodText('vi', 'fdb.count', { n: 114 })).toBe('114 món');
    expect(formatFoodText('en', 'fdb.count', { n: 114 })).toBe('114 foods');
    expect(unitLabel('quả', 'vi')).toBe('quả');
    expect(unitLabel('quả', 'en')).toBe('pc');
    expect(unitLabel('thìa canh', 'en')).toBe('tbsp');
    expect(unitLabel('g', 'en')).toBe('g');
    expect(unitLabel('lạ', 'en')).toBe('lạ'); // a unit the user made up stays as typed
  });
});
