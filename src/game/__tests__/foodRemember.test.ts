import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushUserData = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
  pushNutritionLog: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { amountOf } from '../../food/calc';
import { BUILT_IN_FOODS } from '../../food/foodData';
import { findRememberedFood, foodKey, guessGroup, portionOf, rememberableFood } from '../../food/remember';
import { mergeFoods, useFoodDbStore, validateFood } from '../../store/useFoodDbStore';
import { useNutritionStore } from '../../store/useNutritionStore';

const none: never[] = [];

beforeEach(() => {
  mockPushUserData.mockClear();
  useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
  useNutritionStore.setState({ logs: {} });
});

describe('foodKey', () => {
  it('ignores case, accents, doubled spaces and the portion hint in brackets', () => {
    expect(foodKey('  Bánh  BAO nhà làm ')).toBe('banh bao nha lam');
    expect(foodKey('Trứng gà (quả ≈50 g)')).toBe(foodKey('trung ga'));
    expect(foodKey('Đậu phụ')).toBe('dau phu');
  });
});

describe('rememberableFood', () => {
  const item = { name: 'Bánh bao nhà làm', calories: 320, proteinG: 9, purineMg: 40, saltG: 1, sugarG: 6 };

  it('saves a portion so that one portion adds up to exactly what was logged', () => {
    const food = rememberableFood(item, none)!;
    expect(food).toMatchObject({ name: 'Bánh bao nhà làm', unit: 'phần', unitG: 100, auto: true, confidence: 'low' });
    const a = amountOf(food, 1);
    expect([a.kcal, a.proteinG, a.purineMg, a.saltG, a.sugarG].map((n) => Math.round(n * 100) / 100)).toEqual([320, 9, 40, 1, 6]);
    expect(portionOf(food)).toEqual({ calories: 320, proteinG: 9, purineMg: 40, saltG: 1, sugarG: 6 });
  });

  it('keeps per-100 figures possible for a very big meal (over 900 kcal) by using a bigger nominal portion', () => {
    const food = rememberableFood({ ...item, name: 'Lẩu cả nhà', calories: 2000, proteinG: 80, purineMg: 500, saltG: 9, sugarG: 20 }, none)!;
    expect(food.unitG).toBe(300);
    expect(food.kcal).toBeLessThanOrEqual(900);
    expect(amountOf(food, 1).kcal).toBeCloseTo(2000, 1);
    expect(portionOf(food)).toEqual({ calories: 2000, proteinG: 80, purineMg: 500, saltG: 9, sugarG: 20 });
    // The database screen accepts it (it checks the same limits when editing).
    expect(validateFood(food, [])).toBeNull();
  });

  it('missing purine, salt and sugar are saved as 0 and the note says so', () => {
    const food = rememberableFood({ name: 'Chè đậu', calories: 200, proteinG: 4 }, none)!;
    expect([food.purineMg, food.sugarG, food.sodiumMg]).toEqual([0, 0, 0]);
    expect(food.note).toContain('Purine, muối, đường chỉ có nếu bạn đã nhập');
  });

  it.each([
    ['an empty name', { ...item, name: '   ' }],
    ['a name with only punctuation', { ...item, name: '()' }],
    ['a name that is far too long', { ...item, name: 'x'.repeat(81) }],
    ['no calories and no protein', { ...item, calories: 0, proteinG: 0 }],
    ['a negative figure', { ...item, saltG: -1 }],
    ['a figure that is not a number', { ...item, calories: Number.NaN }],
  ])('does not save %s', (_label, bad) => {
    expect(rememberableFood(bad, none)).toBeNull();
  });

  it('does not save a food the database already has, whether built in, the user’s own or edited', () => {
    const builtIn = BUILT_IN_FOODS[0];
    expect(rememberableFood({ ...item, name: builtIn.name.toUpperCase() }, mergeFoods([], {}))).toBeNull();
    const own = rememberableFood(item, none)!;
    expect(rememberableFood({ ...item, name: 'banh bao nha lam' }, [{ ...own, id: 'c-1' }])).toBeNull();
  });

  it('files foods in a sensible group by whole words only', () => {
    expect(guessGroup('Phở bò tái')).toBe('soup');
    expect(guessGroup('Cà phê sữa')).toBe('drink');
    expect(guessGroup('Cơm gà xối mỡ')).toBe('poultry');
    expect(guessGroup('Cơm tấm')).toBe('starch');
    expect(guessGroup('Salad rau củ')).toBe('vegetable');
    expect(guessGroup('Bánh bao nhà làm')).toBe('processed'); // "bao" must not match "ba"/"bo"
    expect(guessGroup('Xoài chín')).toBe('fruit');
  });
});

describe('the food database remembers logged meals', () => {
  const log = (name: string, calories = 400, extras: Record<string, unknown> = {}) =>
    useNutritionStore.getState().addExtra('2026-10-23', name, calories, 20, 'lunch', extras);

  it('adding an off-plan meal saves a new food once', () => {
    log('Bún đậu mắm tôm', 650);
    log('bún đậu mắm tôm', 700);
    const { custom } = useFoodDbStore.getState();
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({ name: 'Bún đậu mắm tôm', auto: true });
    expect(portionOf(custom[0]).calories).toBe(650);
  });

  it('carries the purine, salt and sugar the user entered', () => {
    log('Cơm tấm sườn', 800, { purineMg: 210, saltG: 3.2, sugarG: 8 });
    expect(portionOf(useFoodDbStore.getState().custom[0])).toMatchObject({ calories: 800, purineMg: 210, saltG: 3.2, sugarG: 8 });
  });

  it('does not save when the figures came straight from a food in the database', () => {
    log('Ức gà + cơm (tra cứu)', 500, { fromFoodDb: true });
    expect(useFoodDbStore.getState().custom).toHaveLength(0);
    expect(mockPushUserData).not.toHaveBeenCalled();
  });

  it('does not save an item without a name (a quick calorie entry), and still logs the meal', () => {
    log('', 300);
    expect(useFoodDbStore.getState().custom).toHaveLength(0);
    expect(useNutritionStore.getState().logs['2026-10-23'].extraItems).toHaveLength(1);
  });

  it('a remembered food is found by name (accent-insensitive) but a built-in one is not "remembered"', () => {
    log('Mì quảng', 550);
    const foods = mergeFoods(useFoodDbStore.getState().custom, {});
    expect(findRememberedFood(foods, 'MI QUANG')?.auto).toBe(true);
    expect(findRememberedFood(foods, BUILT_IN_FOODS[0].name)).toBeUndefined();
  });

  it('is saved to the cloud settings, and removing it there is possible', () => {
    log('Mì quảng', 550);
    expect(mockPushUserData).toHaveBeenLastCalledWith('foodDb', expect.objectContaining({ custom: [expect.objectContaining({ name: 'Mì quảng' })] }));
    const id = useFoodDbStore.getState().custom[0].id;
    useFoodDbStore.getState().removeCustom(id);
    expect(mockPushUserData).toHaveBeenLastCalledWith('foodDb', { custom: [], overrides: {} });
    // After the user deleted it, logging the same meal again remembers it again.
    log('Mì quảng', 560);
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
  });
});
