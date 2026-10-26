import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { from?: string; to?: string } = {};
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

import LevelUpScreen from '../../../app/level-up';
import { useCelebrationStore } from '../../store/useCelebrationStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return parts.join(' ');
}

describe('Level-up sheet', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<LevelUpScreen />);
    });
    renderer = r;
    return r;
  };
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    Object.values(mockRouter).forEach((m) => m.mockClear());
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00' });
    useNutritionStore.setState({ logs: {} });
    useWorkoutStore.setState({ entries: [] });
    useCelebrationStore.setState({ seenLevel: 1 });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('announces the new level and marks it seen so it is never replayed', () => {
    mockParams = { from: '1', to: '2' };
    const text = allText(render());
    expect(text).toContain('Cấp 2!');
    expect(text).toContain('Cấp 1 → cấp 2');
    expect(text).not.toContain('Danh hiệu mới'); // levels 1-4 share the same title
    expect(useCelebrationStore.getState().seenLevel).toBe(2);
  });

  it('names the new title when the level crosses a title boundary, and counts several levels at once', () => {
    mockParams = { from: '3', to: '5' };
    const text = allText(render());
    expect(text).toContain('Lên 2 cấp một lúc: cấp 3 → cấp 5');
    expect(text).toContain('Danh hiệu mới: Fit Warrior');
    expect(useCelebrationStore.getState().seenLevel).toBe(5);
  });

  it('closes with the button', () => {
    mockParams = { from: '1', to: '2' };
    const r = render();
    act(() => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Tiếp tục')[0].props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('speaks English', () => {
    useSettingsStore.setState({ language: 'en' });
    mockParams = { from: '4', to: '5' };
    const text = allText(render());
    expect(text).toContain('Level 5!');
    expect(text).toContain('New title: Fit Warrior');
  });
});
