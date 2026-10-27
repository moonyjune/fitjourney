import { describe, expect, it } from '@jest/globals';
import { editPartPatch, formatQty, partQuantity, scalePart } from '../../food/partScale';
import { weekShiftFor } from '../../utils/swipe';
import type { ExtraFoodItem } from '../../types';

describe('partQuantity / scalePart', () => {
  it('reads the amount written in a name', () => {
    expect(partQuantity('Yến mạch 30g')).toEqual({ qty: 30, written: true });
    expect(partQuantity('2 quả Trứng gà')).toEqual({ qty: 2, written: true });
    expect(partQuantity('Sữa 1,5 hộp')).toEqual({ qty: 1.5, written: true });
    expect(partQuantity('Cơm')).toEqual({ qty: 1, written: false });
    expect(formatQty(45)).toBe('45');
    expect(formatQty(1.25)).toBe('1.3');
  });

  it('scales every figure in proportion and rewrites the amount in the name', () => {
    const part = { name: 'Yến mạch 30g', calories: 110, proteinG: 4, purineMg: 20, saltG: 0.3, sugarG: 1 };
    expect(scalePart(part, 45)).toEqual({ name: 'Yến mạch 45g', calories: 165, proteinG: 6, purineMg: 30, saltG: 0.45, sugarG: 1.5 });
    expect(scalePart({ name: 'Cơm', calories: 200, proteinG: 4 }, 2)).toEqual({ name: '2 × Cơm', calories: 400, proteinG: 8 });
  });

  it('refuses an unusable amount', () => {
    const part = { name: 'Cơm 100g', calories: 130, proteinG: 3 };
    expect(scalePart(part, 0)).toBeNull();
    expect(scalePart(part, -5)).toBeNull();
    expect(scalePart(part, Number.NaN)).toBeNull();
    expect(scalePart(part, 99999)).toBeNull();
  });
});

describe('editPartPatch', () => {
  const item: ExtraFoodItem = {
    id: 'x',
    name: 'Yến mạch 30g, Sữa chua 100g',
    calories: 180,
    proteinG: 9,
    purineMg: 25,
    mealTime: null,
    loggedAtISO: '2026-10-23T05:00:00.000Z',
    parts: [
      { name: 'Yến mạch 30g', calories: 110, proteinG: 4, purineMg: 15 },
      { name: 'Sữa chua 100g', calories: 70, proteinG: 5 },
    ],
  };

  it('moves the totals by exactly the difference and keeps the meal-level figures', () => {
    const patch = editPartPatch(item, 0, 60)!;
    expect(patch.calories).toBe(290);
    expect(patch.proteinG).toBe(13);
    expect(patch.purineMg).toBe(40); // 25 for the meal + 15 more from the doubled oats
    expect(patch.name).toBe('Yến mạch 60g, Sữa chua 100g');
    expect(patch.parts?.[0].name).toBe('Yến mạch 60g');
  });

  it('keeps a title that was written by hand', () => {
    expect(editPartPatch({ ...item, name: 'Bữa sáng của tôi' }, 1, 200)!.name).toBeUndefined();
  });

  it('returns null for a missing part or an unusable amount', () => {
    expect(editPartPatch(item, 5, 10)).toBeNull();
    expect(editPartPatch(item, 0, 0)).toBeNull();
    expect(editPartPatch({ ...item, parts: undefined }, 0, 10)).toBeNull();
  });
});

describe('weekShiftFor', () => {
  it('goes back a week on a drag to the right and forward on a drag to the left', () => {
    expect(weekShiftFor(80, 0.1)).toBe(-1);
    expect(weekShiftFor(-80, -0.1)).toBe(1);
  });
  it('counts a fast flick, and ignores a short slow drag', () => {
    expect(weekShiftFor(20, 0.9)).toBe(-1);
    expect(weekShiftFor(-20, -0.9)).toBe(1);
    expect(weekShiftFor(30, 0.2)).toBe(0);
    expect(weekShiftFor(0, 0)).toBe(0);
  });
});
