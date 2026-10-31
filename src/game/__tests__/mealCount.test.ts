import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({ pushNutritionLog: jest.fn() }));

import { mealsLogged } from '../../food/mealCount';
import type { ExtraFoodItem } from '../../types';

const item = (id: string, at: string, patch: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id,
  name: 'Món',
  calories: 300,
  proteinG: 10,
  loggedAtISO: new Date(`2026-10-31T${at}:00`).toISOString(),
  ...patch,
  mealTime: patch.mealTime ?? null,
});

describe('meals counted from what was logged', () => {
  it('counts each meal time with food, so a 4-meal day is 4 (not tied to the plan)', () => {
    expect(
      mealsLogged({
        mealsEaten: {},
        extraItems: [
          item('a', '07:30', { mealTime: 'breakfast' }),
          item('b', '07:40', { mealTime: 'breakfast' }), // same meal, two foods
          item('c', '10:00', { mealTime: 'morning_snack' }),
          item('d', '12:15'), // no chip: lunch by its time
          item('e', '19:00', { mealTime: 'dinner' }),
        ],
      })
    ).toBe(4);
  });

  it('counts a ticked plan meal as its main meal, never twice with food at the same meal, and not a "Không ăn" mark', () => {
    expect(
      mealsLogged({
        mealsEaten: { meal1: true },
        extraItems: [item('a', '08:00', { mealTime: 'breakfast' }), item('s', '12:00', { name: 'Không ăn', calories: 0, mealTime: 'lunch' }), item('k', '15:30')],
      })
    ).toBe(2); // breakfast + the afternoon snack
    expect(mealsLogged(undefined)).toBe(0);
  });
});
