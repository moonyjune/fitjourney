import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: (...a: unknown[]) => mockPush(...a),
  pushProofPhoto: jest.fn(),
  deleteProofPhoto: jest.fn(async () => undefined),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { useNutritionStore } from '../../store/useNutritionStore';

const D = '2026-10-26';
const item = (id: string, calories: number) => ({ id, name: `Món ${id}`, calories, proteinG: 10, mealTime: null, loggedAtISO: `${D}T05:00:00.000Z` });

beforeEach(() => {
  mockPush.mockClear();
  useNutritionStore.setState({
    logs: { [D]: { dateISO: D, mealsEaten: { meal1: true }, extraCalories: 900, extraProteinG: 20, waterMl: 0, extraItems: [item('a', 500), item('b', 400)] } },
  });
});

describe('deleting a day of food', () => {
  it('deleting every item from the diary table clears the calories too, and saves that to the cloud', () => {
    useNutritionStore.getState().saveDayLog(D, { mealsEaten: {}, extraItems: [], removedMealSlots: [] });
    const log = useNutritionStore.getState().logs[D];
    expect(log.extraItems).toEqual([]);
    expect(log.extraCalories).toBe(0);
    expect(log.extraProteinG).toBe(0);
    expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ extraCalories: 0, extraItems: [] }));
  });

  it('removing the last item one by one does the same', () => {
    useNutritionStore.getState().removeExtraItem(D, 'a');
    expect(useNutritionStore.getState().logs[D].extraCalories).toBe(400);
    useNutritionStore.getState().removeExtraItem(D, 'b');
    expect(useNutritionStore.getState().logs[D].extraCalories).toBe(0);
  });

  it('keeps an older total that has no items when the day is saved for another reason, and drops it when the user clears it', () => {
    useNutritionStore.setState({ logs: { [D]: { dateISO: D, mealsEaten: {}, extraCalories: 800, extraProteinG: 30, waterMl: 0, extraItems: [] } } });
    useNutritionStore.getState().saveDayLog(D, { mealsEaten: { meal1: true }, extraItems: [], removedMealSlots: [] });
    expect(useNutritionStore.getState().logs[D].extraCalories).toBe(800);
    useNutritionStore.getState().saveDayLog(D, { mealsEaten: {}, extraItems: [], removedMealSlots: [], clearTotals: true });
    expect(useNutritionStore.getState().logs[D].extraCalories).toBe(0);
    expect(useNutritionStore.getState().logs[D].extraProteinG).toBe(0);
  });
});
