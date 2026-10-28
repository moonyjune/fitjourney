import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { acceptDinner, cleanAiDinner, dinnerIdeasFromFoods, dinnerVerdict, MAX_DINNER_IDEAS, type DinnerBrief } from '../../ai/dinner';
import { fakeDinner } from '../../ai/devPhotoAnalysis';
import { parsePrefill } from '../../food/prefill';
import type { FoodEntry } from '../../food/types';

const BRIEF: DinnerBrief = {
  hour: 16,
  budgetKcal: 600,
  proteinLeftG: 100,
  headroom: { purine: 800, salt: 5, sugar: 20 },
  limits: { purine: 1200, salt: 7, sugar: 25 },
  planMeal: { label: 'Bữa 3', kcal: 713, proteinG: 86 },
};
const idea = (over: Partial<Record<'calories' | 'proteinG' | 'purineMg' | 'saltG' | 'sugarG', number>> = {}) => ({ calories: 550, proteinG: 45, purineMg: 300, saltG: 2, sugarG: 3, ...over });

describe('dinnerVerdict', () => {
  it('light under 150 kcal left; the plan\'s dinner fits within 100 kcal of slack, otherwise it is over by the difference', () => {
    expect(dinnerVerdict({ ...BRIEF, budgetKcal: 149 })).toEqual({ kind: 'light' });
    expect(dinnerVerdict({ ...BRIEF, budgetKcal: 150, planMeal: { label: 'x', kcal: 250, proteinG: 1 } })).toEqual({ kind: 'fits' });
    expect(dinnerVerdict({ ...BRIEF, budgetKcal: 613 })).toEqual({ kind: 'fits' }); // 713 − 613 = 100: still fine
    expect(dinnerVerdict({ ...BRIEF, budgetKcal: 612 })).toEqual({ kind: 'over', overKcal: 101 });
  });
});

describe('acceptDinner', () => {
  it('accepts a dinner within the budget with enough protein and every limit in its room', () => {
    expect(acceptDinner(BRIEF, idea())).toBe(true);
  });

  it('calories: at most 110% of the budget, at least 40% of it', () => {
    expect(acceptDinner(BRIEF, idea({ calories: 660 }))).toBe(true);
    expect(acceptDinner(BRIEF, idea({ calories: 661 }))).toBe(false);
    expect(acceptDinner(BRIEF, idea({ calories: 240 }))).toBe(true);
    expect(acceptDinner(BRIEF, idea({ calories: 239 }))).toBe(false);
  });

  it('with almost nothing left (under 150 kcal) the dinner must be a light one: at most 200 kcal', () => {
    const light = { ...BRIEF, budgetKcal: 100 };
    expect(acceptDinner(light, idea({ calories: 200, proteinG: 30 }))).toBe(true);
    expect(acceptDinner(light, idea({ calories: 201, proteinG: 30 }))).toBe(false);
    expect(acceptDinner(light, idea({ calories: 20, proteinG: 30 }))).toBe(true); // no lower bound for a light dinner
  });

  it('protein: 60% of what is missing, but never more than 30 g asked', () => {
    expect(acceptDinner(BRIEF, idea({ proteinG: 30 }))).toBe(true);
    expect(acceptDinner(BRIEF, idea({ proteinG: 29.9 }))).toBe(false); // 60% of 100 g is 60 → capped at 30
    const little = { ...BRIEF, proteinLeftG: 20 };
    expect(acceptDinner(little, idea({ proteinG: 12 }))).toBe(true);
    expect(acceptDinner(little, idea({ proteinG: 11.9 }))).toBe(false);
  });

  it('each limit must fit its room; with no room left it may take at most 10% of the limit', () => {
    expect(acceptDinner(BRIEF, idea({ purineMg: 800 }))).toBe(true);
    expect(acceptDinner(BRIEF, idea({ purineMg: 801 }))).toBe(false);
    expect(acceptDinner(BRIEF, idea({ saltG: 5.1 }))).toBe(false);
    expect(acceptDinner(BRIEF, idea({ sugarG: 20.1 }))).toBe(false);
    const full = { ...BRIEF, headroom: { purine: -50, salt: 0, sugar: 20 } };
    expect(acceptDinner(full, idea({ purineMg: 120, saltG: 0.7 }))).toBe(true); // 10% of 1200 and 10% of 7
    expect(acceptDinner(full, idea({ purineMg: 121 }))).toBe(false);
    expect(acceptDinner(full, idea({ saltG: 0.8 }))).toBe(false);
  });

  it('rejects negative or NaN figures', () => {
    expect(acceptDinner(BRIEF, idea({ calories: -1 }))).toBe(false);
    expect(acceptDinner(BRIEF, idea({ proteinG: NaN }))).toBe(false);
  });
});

const food = (name: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: name, name, group: 'poultry', unit: 'g', unitG: 1, kcal: 165, proteinG: 31, purineMg: 100, sugarG: 0, sodiumMg: 70, confidence: 'high', ...over,
});

describe('dinnerIdeasFromFoods', () => {
  it('scales each food to the calories left (at most 700) and keeps the ones that fit, most protein first, 3 at most', () => {
    // budget 600: 600 / 165 per 100 g = 364 g → 360 g: 594 kcal, 111.6 g protein, 360 mg purine.
    const out = dinnerIdeasFromFoods(BRIEF, [food('Ức gà'), food('Cá', { group: 'seafood', proteinG: 20 }), food('Bò', { group: 'redMeat', proteinG: 26 }), food('Tôm', { group: 'seafood', proteinG: 15 })]);
    expect(out).toHaveLength(MAX_DINNER_IDEAS);
    expect(out[0]).toMatchObject({ name: 'Ức gà', source: 'db', amount: '360 g', calories: 594, proteinG: 111.6, purineMg: 360 });
    expect(out.map((o) => o.name)).toEqual(['Ức gà', 'Bò', 'Cá']);
  });

  it('leaves out seasonings, drinks, sweets and snacks, and a food whose purine does not fit the room', () => {
    const out = dinnerIdeasFromFoods(BRIEF, [
      food('Nước mắm', { group: 'seasoning' }),
      food('Trà đá', { group: 'drink' }),
      food('Bánh', { group: 'sweet' }),
      food('Snack', { group: 'snack' }),
      food('Gan', { group: 'redMeat', purineMg: 400 }), // 360 g → 1440 mg: over the 800 mg room
      food('Đậu hũ', { group: 'plantProtein', kcal: 80, proteinG: 8, purineMg: 30, sodiumMg: 10 }),
    ]);
    expect(out.map((o) => o.name)).toEqual(['Đậu hũ']);
  });

  it('with almost nothing left it looks for ~150 kcal portions', () => {
    const out = dinnerIdeasFromFoods({ ...BRIEF, budgetKcal: 100, proteinLeftG: 20 }, [food('Ức gà')]);
    expect(out[0].calories).toBeLessThanOrEqual(200);
    expect(out[0].calories).toBeGreaterThan(100);
  });

  it('gives nothing for an empty database', () => {
    expect(dinnerIdeasFromFoods(BRIEF, [])).toEqual([]);
  });
});

describe('cleanAiDinner', () => {
  const good = { name: ' Cá hấp + rau ', calories: 540, proteinG: 45, purineMg: 300, saltG: 1.5, sugarG: 1, how: ' Hấp 10 phút ', accuracyPercent: 70.4 };

  it('keeps a dinner that fits, trimmed, with the accuracy rounded', () => {
    expect(cleanAiDinner({ options: [good] }, BRIEF)).toEqual([{ name: 'Cá hấp + rau', calories: 540, proteinG: 45, purineMg: 300, saltG: 1.5, sugarG: 1, source: 'ai', how: 'Hấp 10 phút', accuracy: 70 }]);
  });

  it('drops what the AI got wrong: too many calories, not enough protein, over a limit, duplicates, malformed entries; caps at 3', () => {
    const out = cleanAiDinner(
      { options: [
        { ...good, name: 'Quá nhiều', calories: 900 },
        { ...good, name: 'Thiếu đạm', proteinG: 5 },
        { ...good, name: 'Nhiều purine', purineMg: 900 },
        good,
        { ...good, name: 'CÁ HẤP + RAU' },
        { ...good, name: ' ' },
        { ...good, name: 'Không calo', calories: 'a lot' },
        null,
        'x',
        { ...good, name: 'B' }, { ...good, name: 'C' }, { ...good, name: 'D' },
      ] },
      BRIEF
    );
    expect(out.map((o) => o.name)).toEqual(['Cá hấp + rau', 'B', 'C']);
  });

  it('treats missing nutrients as 0, clamps accuracy, ignores a non-list', () => {
    const [o] = cleanAiDinner({ options: [{ name: 'Món', calories: 540, proteinG: 45, accuracyPercent: 250 }] }, BRIEF);
    expect(o).toMatchObject({ purineMg: 0, saltG: 0, sugarG: 0, accuracy: 100 });
    expect(cleanAiDinner({ options: 'no' }, BRIEF)).toEqual([]);
    expect(cleanAiDinner(null, BRIEF)).toEqual([]);
  });
});

describe('offline dev ideas and route prefill', () => {
  it('the dev ideas pass the same checks as a real answer, for a normal budget and for a light one', () => {
    for (const brief of [BRIEF, { ...BRIEF, budgetKcal: 90, proteinLeftG: 15 }]) {
      const ideas = cleanAiDinner(fakeDinner(brief), brief);
      expect(ideas).toHaveLength(3);
      expect(ideas[0].name).toContain('(giả lập)');
    }
  });

  it('parsePrefill reads a food from route params, checks every figure, and never throws', () => {
    expect(parsePrefill({ name: ' Cá hấp <b>\n gừng ', calories: '540', protein: '45.26', purine: '300', salt: '1,5', sugar: '0', mealTime: 'dinner', from: 'db' })).toEqual({
      name: 'Cá hấp b gừng', calories: '540', protein: '45.3', purine: '300', salt: '1.5', sugar: '', mealTime: 'dinner', fromDb: true,
    });
    expect(parsePrefill({ calories: '999999', protein: '-4', purine: 'x', mealTime: 'brunch', from: 'ai' })).toEqual({ name: '', calories: '', protein: '', purine: '', salt: '', sugar: '', mealTime: null, fromDb: false });
    expect(parsePrefill(undefined).name).toBe('');
    expect(parsePrefill({ name: ['A', 'B'], calories: ['100', '200'] })).toMatchObject({ name: 'A', calories: '100' });
  });
});
