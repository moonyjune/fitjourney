import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: (...a: unknown[]) => mockPush(...a),
  pushProofPhoto: jest.fn(),
  pushUserData: jest.fn(),
  deleteProofPhoto: jest.fn(async () => undefined),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { editPartPatch } from '../../food/partScale';
import { uniqueExtraIds } from '../../utils/extraIds';
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

describe('editing a food of a saved meal', () => {
  it('is kept after a reload and is what gets saved to the cloud', async () => {
    useNutritionStore.setState({ logs: {} });
    useNutritionStore.getState().addExtra(D, 'Thịt 150g, Cơm 100g', 705, 40, 'lunch', {
      parts: [{ name: 'Thịt 150g', calories: 450, proteinG: 30 }, { name: 'Cơm 100g', calories: 255, proteinG: 10 }],
    });
    const id = useNutritionStore.getState().logs[D].extraItems[0].id;
    const item = useNutritionStore.getState().logs[D].extraItems[0];
    useNutritionStore.getState().updateExtra(D, id, editPartPatch(item, 0, 75)!);

    expect(useNutritionStore.getState().logs[D].extraCalories).toBe(480);
    expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ extraCalories: 480, extraItems: [expect.objectContaining({ calories: 480 })] }));
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await AsyncStorage.getItem('nutrition-store')) as string);
    expect(stored.state.logs[D].extraItems[0].calories).toBe(480);
    await useNutritionStore.persist.rehydrate();
    expect(useNutritionStore.getState().logs[D].extraItems[0].calories).toBe(480);
  });
});

describe('two foods that were saved under one id (the 26/10 day)', () => {
  const dup = (name: string, calories: number, id: string) => ({ id, name, calories, proteinG: 1, mealTime: 'breakfast' as const, loggedAtISO: `${D}T01:00:00.000Z` });
  const day = () => [dup('Yến mạch', 114, '1793010836970'), dup('Sữa tươi', 32, '1793010836972'), dup('Táo', 95, '1793010836972')];

  it('uniqueExtraIds keeps the first id and gives the repeats their own', () => {
    const { items, changed } = uniqueExtraIds(day());
    expect(changed).toBe(true);
    expect(items.map((i) => i.id)).toEqual(['1793010836970', '1793010836972', '1793010836972-2']);
    expect(uniqueExtraIds(items).changed).toBe(false);
  });

  it('a reload repairs the day and saves the repaired day; then deleting one food leaves the other', async () => {
    useNutritionStore.setState({ logs: { [D]: { dateISO: D, mealsEaten: {}, extraCalories: 241, extraProteinG: 3, waterMl: 0, extraItems: day() } } });
    await AsyncStorage.setItem('nutrition-store', JSON.stringify({ state: { logs: useNutritionStore.getState().logs, waterDefaultDone: false }, version: 0 }));
    mockPush.mockClear();
    await useNutritionStore.persist.rehydrate();
    const ids = useNutritionStore.getState().logs[D].extraItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ dateISO: D }));
    const taken = useNutritionStore.getState().logs[D].extraItems.find((i) => i.name === 'Táo')!;
    useNutritionStore.getState().removeExtraItem(D, taken.id);
    expect(useNutritionStore.getState().logs[D].extraItems.map((i) => i.name)).toEqual(['Yến mạch', 'Sữa tươi']);
    expect(useNutritionStore.getState().logs[D].extraCalories).toBe(146);
  });

  it('foods logged within the same millisecond get different ids', () => {
    useNutritionStore.setState({ logs: {} });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1793010836972);
    for (const n of ['a', 'b', 'c']) useNutritionStore.getState().addExtra(D, n, 10, 1, null);
    now.mockRestore();
    const ids = useNutritionStore.getState().logs[D].extraItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });
});
