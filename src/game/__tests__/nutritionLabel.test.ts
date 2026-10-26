import { describe, expect, it } from '@jest/globals';
import { cleanLabel, defaultEaten, labelToFigures, type NutritionLabel } from '../../ai/nutritionLabel';

const LABEL: NutritionLabel = {
  readable: true,
  per100: { energyKcal: 450, proteinG: 7, sugarG: 22, sodiumMg: 380 },
  perServing: { energyKcal: 135, proteinG: 2.1, sugarG: 6.6, sodiumMg: 114 },
  servingSize: { amount: 30, unit: 'g' },
  reasoning: '',
};

describe('cleanLabel', () => {
  it('keeps a readable label with its columns, serving size and product name', () => {
    const out = cleanLabel({ readable: true, productName: '  Bánh quy  ', per100: { energyKcal: 450, proteinG: 7, evil: 'x' }, per100Unit: 'g', perServing: { energyKcal: 135 }, servingSize: { amount: 30, unit: 'g' }, servingsPerPack: 6, accuracyPercent: 91, reasoning: 'ok', extra: 'drop' });
    expect(out).toEqual({ readable: true, productName: 'Bánh quy', per100: { energyKcal: 450, proteinG: 7 }, per100Unit: 'g', perServing: { energyKcal: 135 }, servingSize: { amount: 30, unit: 'g' }, servingsPerPack: 6, accuracyPercent: 91, reasoning: 'ok' });
  });

  it('is null when nothing was readable or no column holds a figure', () => {
    expect(cleanLabel(null)).toBeNull();
    expect(cleanLabel('x')).toBeNull();
    expect(cleanLabel({ readable: false, per100: { energyKcal: 100 }, reasoning: '' })).toBeNull();
    expect(cleanLabel({ readable: 'true', per100: { energyKcal: 100 } })).toBeNull();
    expect(cleanLabel({ readable: true, reasoning: '' })).toBeNull();
    expect(cleanLabel({ readable: true, per100: { energyKcal: 'many' }, perServing: {} })).toBeNull();
  });

  it('drops figures that cannot be on a label: a per-100 column past 950 kcal / 100 g, negatives, NaN, wrong types', () => {
    const out = cleanLabel({ readable: true, per100: { energyKcal: 5000, proteinG: 150, sugarG: -3, saltG: NaN, sodiumMg: 380 }, reasoning: '' });
    expect(out?.per100).toEqual({ sodiumMg: 380 });
  });

  it('lets a per-serving column be bigger than a per-100 one (a whole pack), but not absurd', () => {
    expect(cleanLabel({ readable: true, perServing: { energyKcal: 2000 } })?.perServing).toEqual({ energyKcal: 2000 });
    expect(cleanLabel({ readable: true, perServing: { energyKcal: 99999 } })).toBeNull();
  });

  it('ignores a bad serving size, serving count, unit or accuracy', () => {
    const out = cleanLabel({ readable: true, per100: { energyKcal: 100 }, servingSize: { amount: -5, unit: 'g' }, servingsPerPack: 9999, per100Unit: 'oz', accuracyPercent: 'high', reasoning: 5 })!;
    expect(out.servingSize).toBeUndefined();
    expect(out.servingsPerPack).toBeUndefined();
    expect(out.per100Unit).toBeUndefined();
    expect(out.accuracyPercent).toBeUndefined();
    expect(out.reasoning).toBe('');
    expect(cleanLabel({ readable: true, per100: { energyKcal: 100 }, servingSize: { amount: 30, unit: 'oz' } })!.servingSize).toBeUndefined();
  });
});

describe('labelToFigures', () => {
  it('servings use the per-serving column', () => {
    expect(labelToFigures(LABEL, { servings: 2 })).toEqual({ calories: 270, proteinG: 4.2, saltG: 0.6, sugarG: 13.2 });
  });

  it('servings prefer the printed per-serving column over serving size × per-100 (labels round differently)', () => {
    const l: NutritionLabel = { ...LABEL, perServing: { energyKcal: 140, proteinG: 2, sugarG: 7, sodiumMg: 120 } };
    expect(labelToFigures(l, { servings: 1 })).toEqual({ calories: 140, proteinG: 2, saltG: 0.3, sugarG: 7 });
  });

  it('an amount uses the per-100 column, with salt from sodium / 400', () => {
    expect(labelToFigures(LABEL, { amount: 50 })).toEqual({ calories: 225, proteinG: 3.5, saltG: 0.5, sugarG: 11 });
  });

  it('servings fall back to serving size × the per-100 column when there is no per-serving column', () => {
    const l: NutritionLabel = { ...LABEL, perServing: undefined };
    expect(labelToFigures(l, { servings: 2 })).toEqual({ calories: 270, proteinG: 4.2, saltG: 0.6, sugarG: 13.2 });
  });

  it('an amount falls back to the per-serving column through the serving size when there is no per-100 column', () => {
    const l: NutritionLabel = { ...LABEL, per100: undefined };
    expect(labelToFigures(l, { amount: 60 })).toEqual({ calories: 270, proteinG: 4.2, saltG: 0.6, sugarG: 13.2 });
  });

  it('prefers a printed salt over sodium, and counts a missing figure as 0', () => {
    const l: NutritionLabel = { readable: true, per100: { energyKcal: 100, saltG: 1.5, sodiumMg: 9999 }, reasoning: '' };
    expect(labelToFigures(l, { amount: 100 })).toEqual({ calories: 100, proteinG: 0, saltG: 1.5, sugarG: 0 });
  });

  it('cannot answer without the column it needs, or for a zero/negative/NaN amount', () => {
    expect(labelToFigures({ readable: true, per100: { energyKcal: 100 }, reasoning: '' }, { servings: 1 })).toBeNull(); // no serving size
    expect(labelToFigures({ readable: true, perServing: { energyKcal: 100 }, reasoning: '' }, { amount: 50 })).toBeNull(); // no serving size
    expect(labelToFigures(LABEL, { servings: 0 })).toBeNull();
    expect(labelToFigures(LABEL, { amount: -5 })).toBeNull();
    expect(labelToFigures(LABEL, { amount: NaN })).toBeNull();
  });
});

describe('defaultEaten', () => {
  it('starts at one serving when the label has a serving column or size, else 100 g/ml', () => {
    expect(defaultEaten(LABEL)).toEqual({ servings: 1 });
    expect(defaultEaten({ readable: true, perServing: { energyKcal: 1 }, reasoning: '' })).toEqual({ servings: 1 });
    expect(defaultEaten({ readable: true, per100: { energyKcal: 1 }, servingSize: { amount: 30, unit: 'g' }, reasoning: '' })).toEqual({ servings: 1 });
    expect(defaultEaten({ readable: true, per100: { energyKcal: 1 }, reasoning: '' })).toEqual({ amount: 100 });
  });
});
