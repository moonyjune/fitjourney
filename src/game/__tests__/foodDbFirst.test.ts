import { describe, expect, it } from '@jest/globals';
import { resolveFromDb } from '../../ai/textMeal';
import { lookupQuantified } from '../../food/dbLookup';
import { rememberableFood } from '../../food/remember';
import type { FoodEntry } from '../../food/types';

const food = (over: Partial<FoodEntry>): FoodEntry => ({
  id: 'x', name: 'x', group: 'starch', unit: 'g', unitG: 1, kcal: 100, proteinG: 10, purineMg: 20, sugarG: 0, sodiumMg: 400, confidence: 'high', ...over,
});
const rice = food({ id: 'r', name: 'Cơm trắng', kcal: 130, proteinG: 2.7 });
const egg = food({ id: 'e', name: 'Trứng gà (quả ≈50 g)', unit: 'quả', unitG: 50, kcal: 143, proteinG: 12.6 });
const pho = food({ id: 'p', name: 'Phở bò', unit: 'phần', unitG: 100, kcal: 450, proteinG: 20, auto: true });
const foods = [rice, egg, pho];

describe('lookupQuantified', () => {
  it('computes a weight food from grams typed before or after the name', () => {
    expect(lookupQuantified('150g cơm trắng', foods)).toMatchObject({ calories: 195, proteinG: 4.1, name: '150 g Cơm trắng' });
    expect(lookupQuantified('cơm trắng 150 g', foods)?.calories).toBe(195);
  });
  it('counts pieces of a countable food, by its unit or none', () => {
    expect(lookupQuantified('2 quả trứng gà', foods)).toMatchObject({ calories: 143, name: '2 quả Trứng gà' });
    expect(lookupQuantified('2 trứng gà', foods)?.calories).toBe(143);
    expect(lookupQuantified('100g trứng gà', foods)?.calories).toBe(143);
  });
  it('multiplies a remembered portion', () => {
    expect(lookupQuantified('2 phở bò', foods)).toMatchObject({ calories: 900 });
  });
  it('gives up when the name is unknown, the amount is missing, or a weight food has no unit', () => {
    expect(lookupQuantified('2 bánh mì', foods)).toBeNull();
    expect(lookupQuantified('cơm trắng', foods)).toBeNull();
    expect(lookupQuantified('150 cơm trắng', foods)).toBeNull();
    expect(lookupQuantified('2 lít trứng gà', foods)).toBeNull();
  });
});

describe('resolveFromDb', () => {
  it('answers what it can and leaves the rest for the AI', () => {
    const r = resolveFromDb('phở bò, 150g cơm trắng, bún chả', foods)!;
    expect(r.rows.map((x) => [x.name, x.calories, x.fromDb])).toEqual([['Phở bò', '450', true], ['150 g Cơm trắng', '195', true]]);
    expect(r.unknown).toEqual(['bún chả']);
  });
  it('has nothing unknown when the database covers everything', () => {
    expect(resolveFromDb('2 quả trứng gà', foods)!.unknown).toEqual([]);
  });
});

describe('remembering', () => {
  it('does not save a database food with an amount as a new food', () => {
    expect(rememberableFood({ name: '150 g Cơm trắng', calories: 195, proteinG: 4 }, foods)).toBeNull();
    expect(rememberableFood({ name: 'Bún chả', calories: 600, proteinG: 25 }, foods)).not.toBeNull();
  });
});
