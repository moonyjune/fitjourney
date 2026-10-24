import { describe, expect, it } from '@jest/globals';
import { DEFAULT_MEAL_TEMPLATES } from '../../constants/plan';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';
import type { DayInput } from '../missions';
import { logWithExtra, logWithMealToggled, previewDayChange } from '../preview';

const DATE = '2026-10-23'; // a Friday: training day, so meal3 = 713 kcal / 86 g protein
const base: Omit<DayInput, 'log'> = {
  dateKey: DATE,
  now: new Date('2026-10-23T18:00:00'),
  mealTemplatesByDayType: DEFAULT_MEAL_TEMPLATES,
  workouts: [],
  tdeeKcal: 2694,
  proteinTargetG: 200,
};

const afterTwoMeals: DailyNutritionLog = {
  dateISO: DATE, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0,
};

describe('previewDayChange', () => {
  it('eating meal 3 completes the protein mission (117 g -> 203 g) and reports the XP it pays at once', () => {
    const next = logWithMealToggled(afterTwoMeals, DATE, 'meal3');
    const preview = previewDayChange({ ...base, log: afterTwoMeals }, next);
    expect(preview.before.proteinG).toBe(117);
    expect(preview.after.proteinG).toBe(203);
    expect(preview.newlyDone).toContain('protein');
    expect(preview.xpDelta).toBeGreaterThanOrEqual(40);
  });

  it('is pure: the original log is never mutated', () => {
    const snapshot = JSON.stringify(afterTwoMeals);
    logWithMealToggled(afterTwoMeals, DATE, 'meal3');
    logWithExtra(afterTwoMeals, DATE, { id: 'x', name: 'x', calories: 1, proteinG: 1, loggedAtISO: 'x', mealTime: null });
    expect(JSON.stringify(afterTwoMeals)).toBe(snapshot);
  });

  it('toggling an eaten meal off reverses it, and a missing log is treated as empty', () => {
    const off = logWithMealToggled(afterTwoMeals, DATE, 'meal1');
    expect(off.mealsEaten.meal1).toBe(false);
    expect(logWithMealToggled(undefined, DATE, 'meal2').mealsEaten).toEqual({ meal2: true });
  });

  it('flags the missions an extra item would break', () => {
    const teaSugar: ExtraFoodItem = {
      id: 't', name: 'Trà sữa', calories: 300, proteinG: 2, loggedAtISO: 'x', mealTime: 'afternoon_snack', sugarG: 40, junk: true,
    };
    const next = logWithExtra(afterTwoMeals, DATE, teaSugar);
    expect(next.extraCalories).toBe(300);
    expect(next.extraProteinG).toBe(2);
    const preview = previewDayChange({ ...base, log: afterTwoMeals }, next);
    expect(preview.newlyMissed).toEqual(expect.arrayContaining(['sugar', 'junk']));
    expect(preview.newlyDone).not.toContain('sugar');
  });

  it('reports nothing when the change is neutral', () => {
    const water = { ...afterTwoMeals, waterMl: 500 };
    const preview = previewDayChange({ ...base, log: afterTwoMeals }, water);
    expect(preview.newlyDone).toEqual([]);
    expect(preview.newlyMissed).toEqual([]);
    expect(preview.xpDelta).toBe(0);
  });
});
