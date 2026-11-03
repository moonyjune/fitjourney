import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../sync/cloudSync', () => ({}));

import { allEaten, planMealFoodName, planMealOutcome, swapIsComplete, type PlanItemChoice } from '../../food/planMeal';
import { showToast, useToastStore } from '../../store/useToastStore';

const meal = {
  items: [
    { name: 'Cơm gạo lứt', calories: 180 },
    { name: '150g ức gà áp chảo', calories: 290 },
    { name: 'Rau luộc', calories: 70 },
  ],
  calories: 540,
  proteinG: 54,
};

describe('plan meal choices', () => {
  it('every dish eaten is the plan meal as planned, with the plan totals', () => {
    const out = planMealOutcome(meal, allEaten(meal), null);
    expect(out).toMatchObject({ asPlanned: true, kcal: 540, proteinG: 54 });
    expect(out.parts).toHaveLength(3);
  });

  it('a dish not eaten drops out; protein is each dish’s share of the meal by kcal', () => {
    const choices: PlanItemChoice[] = [{ kind: 'eaten' }, { kind: 'skipped' }, { kind: 'eaten' }];
    const out = planMealOutcome(meal, choices, null);
    expect(out.asPlanned).toBe(false);
    expect(out.kcal).toBe(250);
    expect(out.proteinG).toBe(25); // 54 × 250 / 540
    expect(planMealFoodName(out.parts)).toBe('Cơm gạo lứt, Rau luộc');
  });

  it('a swap counts once it has a name and kcal', () => {
    const half: PlanItemChoice = { kind: 'swap', name: 'Cá hồi', kcal: '', protein: '' };
    expect(swapIsComplete(half)).toBe(false);
    expect(planMealOutcome(meal, [{ kind: 'eaten' }, half, { kind: 'eaten' }], null).kcal).toBe(250);
    const full: PlanItemChoice = { kind: 'swap', name: ' Cá hồi ', kcal: '300,5', protein: '30' };
    const out = planMealOutcome(meal, [{ kind: 'eaten' }, full, { kind: 'eaten' }], null);
    expect(out.kcal).toBe(551); // 180 + 301 + 70
    expect(out.parts[1]).toEqual({ name: 'Cá hồi', calories: 301, proteinG: 30 });
  });

  it('a suggested dish replaces the whole meal', () => {
    const out = planMealOutcome(meal, allEaten(meal), { name: 'Bún chả', calories: 450, proteinG: 32 });
    expect(out).toMatchObject({ asPlanned: false, kcal: 450, proteinG: 32, parts: [{ name: 'Bún chả', calories: 450, proteinG: 32 }] });
  });

  it('keeps the purine estimate of the plan dishes eaten', () => {
    expect(planMealOutcome(meal, allEaten(meal), null).purineMg).toBeGreaterThan(0);
    expect(planMealOutcome(meal, [{ kind: 'eaten' }, { kind: 'skipped' }, { kind: 'eaten' }], null).purineMg).toBeLessThan(
      planMealOutcome(meal, allEaten(meal), null).purineMg
    );
  });
});

describe('toast onExpire', () => {
  afterEach(() => {
    jest.useRealTimers();
    useToastStore.setState({ toast: null });
  });

  it('runs when the toast times out, is closed or is replaced, but not after its undo', () => {
    jest.useFakeTimers();
    const expired: string[] = [];
    showToast({ text: 'a', undo: () => {}, onExpire: () => expired.push('a') });
    jest.advanceTimersByTime(5000);
    expect(expired).toEqual(['a']);

    showToast({ text: 'b', undo: () => {}, onExpire: () => expired.push('b') });
    showToast({ text: 'c', undo: () => {}, onExpire: () => expired.push('c') });
    expect(expired).toEqual(['a', 'b']); // b was replaced
    useToastStore.getState().hide();
    expect(expired).toEqual(['a', 'b', 'c']);

    const undone = jest.fn();
    showToast({ text: 'd', undo: undone, onExpire: () => expired.push('d') });
    useToastStore.getState().undo();
    jest.advanceTimersByTime(6000);
    expect(undone).toHaveBeenCalledTimes(1);
    expect(expired).toEqual(['a', 'b', 'c']);
  });
});
