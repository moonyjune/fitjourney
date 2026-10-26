import { describe, expect, it } from '@jest/globals';
import { MEAL_TIMES, rowsFromResult, rowsFromSaved, splitMealText, validMealTime } from '../../ai/textMeal';
import type { FoodEntry } from '../../food/types';
import type { MealTextResult } from '../../sync/cloudSync';

const saved = (name: string, kcal: number, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `c-${name}`, name, group: 'soup', unit: 'phần', unitG: 100, kcal, proteinG: 20, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true, ...extra,
});
const builtIn = (name: string): FoodEntry => saved(name, 100, { auto: undefined, unit: 'g', unitG: 100 });

describe('splitMealText', () => {
  it('splits at commas, semicolons, plus, "và" and new lines, dropping empties', () => {
    expect(splitMealText('Phở bò, trà đá; bánh mì + cà phê và chuối\nsữa ,, ')).toEqual(['Phở bò', 'trà đá', 'bánh mì', 'cà phê', 'chuối', 'sữa']);
    expect(splitMealText('   ')).toEqual([]);
  });
  it('does not split inside a word that contains "và"', () => {
    expect(splitMealText('hoa vài ba')).toEqual(['hoa vài ba']);
  });
});

describe('rowsFromSaved', () => {
  const foods = [saved('Phở bò', 450), saved('Trà đá', 5, { purineMg: 0, sodiumMg: 0, sugarG: 0 }), builtIn('Cơm')];
  it('builds rows from the saved foods when every part is one of them (accents and case ignored)', () => {
    const rows = rowsFromSaved('PHO BO, tra da', foods)!;
    expect(rows.map((r) => [r.name, r.calories, r.fromDb])).toEqual([['Phở bò', '450', true], ['Trà đá', '5', true]]);
    expect(rows[0]).toMatchObject({ protein: '20', purine: '90', salt: '2', sugar: '2', accuracy: null });
  });
  it('returns null when any part is unknown, a built-in food (not saved), has a quantity, or the text is empty', () => {
    expect(rowsFromSaved('phở bò, bún chả', foods)).toBeNull();
    expect(rowsFromSaved('cơm', foods)).toBeNull();
    expect(rowsFromSaved('2 phở bò', foods)).toBeNull();
    expect(rowsFromSaved('phở bò (2 bát)', foods)).toBeNull(); // a quantity in brackets is not the one-portion figure
    expect(rowsFromSaved(' , ', foods)).toBeNull();
  });
  it('gives up on more than 12 foods', () => {
    const many = Array.from({ length: 13 }, () => 'phở bò').join(', ');
    expect(rowsFromSaved(many, foods)).toBeNull();
  });
});

describe('rowsFromResult', () => {
  const foods = [saved('Phở bò', 450)];
  const result = (items: unknown[]): MealTextResult => ({ items: items as never, reasoning: 'x' });

  it('keeps the user\'s saved figures for a saved food, but the AI figures when it names a quantity', () => {
    const rows = rowsFromResult(result([
      { name: 'Phở bò', caloriesKcal: 700, proteinG: 30, accuracyPercent: 60 },
      { name: 'Phở bò (2 bát)', caloriesKcal: 900, proteinG: 60, accuracyPercent: 62 },
    ]), foods);
    expect(rows[0]).toMatchObject({ calories: '450', fromDb: true, accuracy: null });
    expect(rows[1]).toMatchObject({ name: 'Phở bò (2 bát)', calories: '900', fromDb: false, accuracy: 62 });
  });

  it('turns numbers into editable text, clamps accuracy, and blanks nonsense or missing figures', () => {
    const [row] = rowsFromResult(result([{ name: ' Bún chả ', caloriesKcal: 612.4, proteinG: 38.46, purineMg: 180.6, saltG: 2.34, sugarG: -3, accuracyPercent: 140 }]), foods);
    expect(row).toMatchObject({ name: 'Bún chả', calories: '612', protein: '38.5', purine: '181', salt: '2.3', sugar: '', accuracy: 100, fromDb: false });
    const [bad] = rowsFromResult(result([{ name: 'Gì đó', caloriesKcal: 'many', proteinG: NaN, accuracyPercent: 'high' }]), foods);
    expect(bad).toMatchObject({ calories: '', protein: '', accuracy: null });
  });

  it('skips lines without a name, tolerates a missing list, and caps at 12 lines', () => {
    expect(rowsFromResult(result([{ name: '  ', caloriesKcal: 100 }, null, { caloriesKcal: 5 }]), foods)).toEqual([]);
    expect(rowsFromResult({ reasoning: 'x' } as never, foods)).toEqual([]);
    expect(rowsFromResult(result(Array.from({ length: 20 }, (_, i) => ({ name: `Món ${i}`, caloriesKcal: 100 }))), foods)).toHaveLength(12);
  });
});

describe('validMealTime', () => {
  it('accepts the known meal times and nothing else', () => {
    for (const t of MEAL_TIMES) expect(validMealTime(t)).toBe(t);
    expect(validMealTime('brunch')).toBeNull();
    expect(validMealTime(undefined)).toBeNull();
  });
});
