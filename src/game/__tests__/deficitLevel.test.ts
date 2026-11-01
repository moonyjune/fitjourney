import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({ pushUserData: (...a: unknown[]) => mockPush(...a) }));

import { deficitLevel } from '../deficitLevel';
import { cleanCheatDays, useCheatDayStore } from '../../store/useCheatDayStore';

describe('deficit level against the daily target (1000 kcal)', () => {
  it('follows the four bands', () => {
    expect(deficitLevel(1000, 1000)).toBe('met');
    expect(deficitLevel(900, 1000)).toBe('met'); // within 10 %
    expect(deficitLevel(1300, 1000)).toBe('met');
    expect(deficitLevel(1600, 1000)).toBe('met');
    expect(deficitLevel(1601, 1000)).toBe('excess'); // more than 1.6× the target
    expect(deficitLevel(900, 500)).toBe('met'); // 1.8× but under 1000 kcal
    expect(deficitLevel(1001, 500)).toBe('excess');
    expect(deficitLevel(899, 1000)).toBe('ok');
    expect(deficitLevel(500, 1000)).toBe('ok');
    expect(deficitLevel(499, 1000)).toBe('low');
    expect(deficitLevel(100, 1000)).toBe('low');
    expect(deficitLevel(99, 1000)).toBe('flat');
    expect(deficitLevel(0, 1000)).toBe('flat'); // eating what the body burns
    expect(deficitLevel(-400, 1000)).toBe('over'); // a surplus
  });

  it('a cheat day is always "cheat" (its kcal are not counted); no figure or no target gives no level', () => {
    expect(deficitLevel(-400, 1000, true)).toBe('cheat');
    expect(deficitLevel(950, 1000, true)).toBe('cheat');
    expect(deficitLevel(null, 1000, true)).toBe('cheat');
    expect(deficitLevel(null, 1000)).toBeNull();
    expect(deficitLevel(500, 0)).toBeNull();
  });
});

describe('cheat days', () => {
  it('toggles a day, saves it to the cloud, and keeps the list clean', () => {
    useCheatDayStore.setState({ days: [] });
    useCheatDayStore.getState().toggle('2026-10-31');
    expect(useCheatDayStore.getState().isCheat('2026-10-31')).toBe(true);
    expect(mockPush).toHaveBeenLastCalledWith('cheatDays', { days: ['2026-10-31'] });
    useCheatDayStore.getState().toggle('2026-10-31');
    expect(useCheatDayStore.getState().days).toEqual([]);
    expect(cleanCheatDays(['2026-10-01', 'bad', 3, '2026-10-01', '2026-10-05'])).toEqual(['2026-10-05', '2026-10-01']);
  });
});
