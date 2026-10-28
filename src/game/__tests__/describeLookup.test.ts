import { describe, expect, it } from '@jest/globals';
import { lookupDescribedFood } from '../../food/describeLookup';
import { BUILT_IN_FOODS } from '../../food/foodData';
import type { FoodEntry } from '../../food/types';

const match = (text: string, foods: FoodEntry[] = BUILT_IN_FOODS) => {
  const r = lookupDescribedFood(text, foods);
  if (r.kind !== 'match') throw new Error(`no match for "${text}" (${r.kind})`);
  return r.item;
};

describe('lookupDescribedFood', () => {
  it('scales a counted food by the amount typed, without accents', () => {
    const egg = match('2 qua trung ga');
    expect(egg.food.name).toBe('Trứng gà (quả ≈50 g)');
    expect(egg.calories).toBe(143); // 2 x 50 g x 143 kcal/100 g
    expect(match('2 bát phở bò').calories).toBe(900);
    expect(match('phở bò 2').calories).toBe(900);
  });

  it('scales a food sold by weight by grams, and uses 100 g when no amount is typed', () => {
    expect(match('150g cơm trắng chín')).toMatchObject({ calories: 195, name: '150 g Cơm trắng chín' });
    expect(match('Cơm trắng chín').calories).toBe(130);
    // every typed word in exactly one food's name is a confident match too
    expect(match('cơm trắng').food.name).toBe('Cơm trắng chín');
  });

  it('one portion of a counted food when no amount is typed', () => {
    expect(match('Trứng gà').calories).toBe(72);
    expect(match('phở bò').calories).toBe(450);
  });

  it('never guesses several foods', () => {
    for (const text of ['phở bò, trứng gà', 'cơm trắng chín + trứng gà', 'cơm trắng chín và trứng gà', 'bánh mì với pate']) {
      expect(lookupDescribedFood(text, BUILT_IN_FOODS).kind).toBe('multiple');
    }
  });

  it('never guesses an unknown, ambiguous or badly measured food', () => {
    expect(lookupDescribedFood('bánh xèo', BUILT_IN_FOODS).kind).toBe('none');
    expect(lookupDescribedFood('ức gà', BUILT_IN_FOODS).kind).toBe('none'); // raw, cooked and packaged chicken breast
    expect(lookupDescribedFood('1 bát cơm trắng chín', BUILT_IN_FOODS).kind).toBe('none'); // rice is by weight
    expect(lookupDescribedFood('   ', BUILT_IN_FOODS).kind).toBe('none');
  });

  it('a food remembered from the diary counts in portions', () => {
    const saved: FoodEntry = { id: 'c-1', name: 'Bún chả Hàng Mành', group: 'soup', unit: 'phần', unitG: 100, kcal: 550, proteinG: 25, purineMg: 120, sugarG: 8, sodiumMg: 800, confidence: 'low', auto: true };
    expect(match('bún chả hàng mành', [saved]).calories).toBe(550);
    expect(match('2 phần bún chả hàng mành', [saved]).calories).toBe(1100);
  });
});
