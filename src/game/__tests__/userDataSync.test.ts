import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushUserData = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushUricReading: jest.fn(),
  deleteUricReading: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { resetAllLocalStores } from '../../store/resetLocalStores';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useLearnStore } from '../../store/useLearnStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useUricStore } from '../../store/useUricStore';

const food = { name: 'Bánh mì nhà làm', group: 'starch' as const, unit: 'cái', unitG: 80, kcal: 250, proteinG: 8, purineMg: 20, sugarG: 3, sodiumMg: 400, confidence: 'medium' as const };

beforeEach(() => {
  resetAllLocalStores();
  mockPushUserData.mockClear();
});

describe('settings saved to the cloud', () => {
  it('learn notes: every change saves the whole set', () => {
    useLearnStore.getState().setNotes({ '1': 'a' });
    useLearnStore.getState().setNotes({ '2': 'b' });
    expect(mockPushUserData).toHaveBeenLastCalledWith('learnNotes', { '1': 'a', '2': 'b' });
  });

  it('uric target: each step saves the new value', () => {
    useUricStore.getState().nudgeTarget(-1);
    expect(mockPushUserData).toHaveBeenLastCalledWith('uricTarget', 350);
  });

  it('limits: a step saves all three limits', () => {
    useLimitsStore.getState().nudge('purineMg', -1);
    expect(mockPushUserData).toHaveBeenLastCalledWith('limits', { purineMg: 1150, saltG: 7, sugarG: 25 });
  });

  it('foods: adding, editing, removing and resetting save foods and edits; using a food does not', () => {
    const added = useFoodDbStore.getState().addCustom(food);
    expect(mockPushUserData).toHaveBeenLastCalledWith('foodDb', { custom: [added], overrides: {} });
    useFoodDbStore.getState().updateFood('b-1', { ...food, name: 'Nhãn mới' });
    expect(mockPushUserData).toHaveBeenLastCalledWith('foodDb', expect.objectContaining({ overrides: { 'b-1': expect.objectContaining({ name: 'Nhãn mới' }) } }));
    useFoodDbStore.getState().resetOverride('b-1');
    expect(mockPushUserData).toHaveBeenLastCalledWith('foodDb', { custom: [added], overrides: {} });
    useFoodDbStore.getState().removeCustom(added.id);
    expect(mockPushUserData).toHaveBeenLastCalledWith('foodDb', { custom: [], overrides: {} });
    mockPushUserData.mockClear();
    useFoodDbStore.getState().touchRecent('b-1');
    expect(mockPushUserData).not.toHaveBeenCalled();
  });

  it('clearing the device when the account changes saves nothing (it must not overwrite the cloud copy with defaults)', () => {
    useLimitsStore.getState().nudge('saltG', 1);
    mockPushUserData.mockClear();
    resetAllLocalStores();
    expect(mockPushUserData).not.toHaveBeenCalled();
  });
});
