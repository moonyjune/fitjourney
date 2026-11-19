import { describe, expect, it, jest } from '@jest/globals';
import { RefreshControl, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockRestore = jest.fn(async () => ({ ok: true, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 }));
jest.mock('../../sync/restore', () => ({ restoreOwnData: () => mockRestore() }));
jest.mock('../../sync/cloudSync', () => ({ pushUserData: jest.fn(), pushNutritionLog: jest.fn() }));

import { ScreenTemplate } from '../../components/quest/ScreenTemplate';
import { PULL_MAX, PULL_START_SLOP, PULL_TRIGGER, pullDistance, pullPhase, releaseRefreshes } from '../../utils/pullRefresh';

describe('pull to refresh maths (1.7)', () => {
  it('follows half the finger after a small slop, up to a maximum', () => {
    expect(pullDistance(PULL_START_SLOP)).toBe(0);
    expect(pullDistance(PULL_START_SLOP + 40)).toBe(20);
    expect(pullDistance(1000)).toBe(PULL_MAX);
    expect(pullDistance(-50)).toBe(0);
  });
  it('a sideways drag (the Journal day swipe) never starts a pull', () => {
    expect(pullDistance(60, 80)).toBe(0);
    expect(pullDistance(160, 20)).toBeGreaterThan(0);
  });
  it('phases: idle → pulling → armed at the line; refreshing wins', () => {
    expect(pullPhase(0, false)).toBe('idle');
    expect(pullPhase(PULL_TRIGGER - 1, false)).toBe('pulling');
    expect(pullPhase(PULL_TRIGGER, false)).toBe('armed');
    expect(pullPhase(0, true)).toBe('refreshing');
    expect(releaseRefreshes(PULL_TRIGGER - 1)).toBe(false);
    expect(releaseRefreshes(PULL_TRIGGER)).toBe(true);
  });
});

describe('ScreenTemplate pull to refresh (native)', () => {
  it('a tab screen refreshes from the cloud by default', async () => {
    mockRestore.mockClear();
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <ScreenTemplate title="Tập" tabBar>
          <Text>x</Text>
        </ScreenTemplate>
      );
    });
    const control = r.root.findByType(RefreshControl);
    await act(async () => {
      await (control.props.onRefresh as () => Promise<void>)();
    });
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });
  it('a screen outside the tabs has none unless asked; a custom refresh is used when given', async () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <ScreenTemplate title="Cân nặng" onBack={() => undefined}>
          <Text>x</Text>
        </ScreenTemplate>
      );
    });
    expect(r.root.findAllByType(RefreshControl)).toHaveLength(0);
    const own = jest.fn(async () => true);
    act(() => {
      r.update(
        <ScreenTemplate title="Cân nặng" refresh={own}>
          <Text>x</Text>
        </ScreenTemplate>
      );
    });
    await act(async () => {
      await (r.root.findByType(RefreshControl).props.onRefresh as () => Promise<void>)();
    });
    expect(own).toHaveBeenCalledTimes(1);
  });
});
