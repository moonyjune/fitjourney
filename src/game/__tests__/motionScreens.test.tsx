import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
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
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
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

import CampScreen from '../../../app/(tabs)/index';
import LevelUpScreen from '../../../app/level-up';
import { QuestTabBar } from '../../components/quest/QuestTabBar';
import { useCelebrationStore } from '../../store/useCelebrationStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
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
const hasText = (r: ReactTestRenderer, value: string) => r.root.findAllByType(Text).some((t) => [t.props.children].flat(5).join('') === value);

let renderer: ReactTestRenderer | undefined;
async function mount(el: React.ReactElement, reduced = false) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
  await act(async () => {
    renderer = create(el);
  });
  return renderer!;
}
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
/** Opacities of every fading wrapper on the screen. */
function opacities(r: ReactTestRenderer): number[] {
  return r.root
    .findAll((n) => (n.type as unknown) === 'View' && typeof StyleSheet.flatten(n.props.style)?.opacity === 'number' && Array.isArray(StyleSheet.flatten(n.props.style)?.transform))
    .map((n) => StyleSheet.flatten(n.props.style).opacity as number);
}

/** pointerEvents lives in the style now (the prop form is deprecated on web). */
const pointer = (props: { pointerEvents?: string; style?: unknown }) => props.pointerEvents ?? (StyleSheet.flatten(props.style as never) as { pointerEvents?: string } | undefined)?.pointerEvents;

describe('motion on the FitQuest screens', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    Object.values(mockRouter).forEach((m) => m.mockClear());
    mockParams = {};
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106 }] });
    useWorkoutStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: {} });
    useCelebrationStore.setState({ seenLevel: 1 });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Camp', () => {
    it('has every card and mission in the tree from the first render, then everything fades in fully', async () => {
      const r = await mount(<CampScreen />);
      const text = allText(r);
      expect(text).toContain('Quái Một Ký Mỡ'); // boss card
      expect(text).toContain('Nhiệm vụ hôm nay'); // missions
      expect(text).toContain('Tập luyện');
      expect(Math.min(...opacities(r))).toBeLessThan(1); // still fading in...
      await advance(2000);
      expect(Math.min(...opacities(r))).toBe(1); // ...and fully visible afterwards
    });

    it('is fully visible straight away with reduced motion', async () => {
      const r = await mount(<CampScreen />, true);
      expect(opacities(r).length).toBeGreaterThan(5);
      expect(Math.min(...opacities(r))).toBe(1);
      expect(allText(r)).toContain('Nhiệm vụ hôm nay');
    });

    it('floats "+60 XP" when logging a workout completes the workout mission', async () => {
      const r = await mount(<CampScreen />);
      await advance(2000);
      expect(hasText(r, '+60 XP')).toBe(false);
      await act(async () => {
        useWorkoutStore.setState({ entries: [{ id: 'x', dateISO: '2026-10-23T15:00:00', templateId: null, label: 'Ngày A', durationMin: 20, caloriesBurned: 300 }] });
      });
      expect(hasText(r, '+60 XP')).toBe(true);
      await advance(1500);
      expect(hasText(r, '+60 XP')).toBe(false);
    });

    it('never leaves a looping animation running after the screen is gone', async () => {
      const r = await mount(<CampScreen />);
      await advance(3000);
      act(() => r.unmount());
      renderer = undefined;
      await advance(200);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('Level-up sheet', () => {
    it('shows its text immediately and bursts sparkles that clear themselves', async () => {
      mockParams = { from: '1', to: '2' };
      const r = await mount(<LevelUpScreen />);
      expect(allText(r)).toContain('Cấp 2!');
      const sparkles = () => r.root.findAll((n) => pointer(n.props) === 'none' && n.props.importantForAccessibility === 'no-hide-descendants').length;
      expect(sparkles()).toBeGreaterThan(0);
      await advance(2500);
      expect(sparkles()).toBe(0);
      expect(allText(r)).toContain('Cấp 2!');
    });

    it('draws no sparkles with reduced motion', async () => {
      mockParams = { from: '1', to: '2' };
      const r = await mount(<LevelUpScreen />, true);
      expect(r.root.findAll((n) => pointer(n.props) === 'none' && n.props.importantForAccessibility === 'no-hide-descendants')).toHaveLength(0);
      expect(allText(r)).toContain('Cấp 2!');
    });
  });

  describe('Tab bar', () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    function bar(focused: string) {
      const names = ['index', 'workout', 'map', 'profile'];
      const routes = names.map((name) => ({ key: `${name}-k`, name }));
      const descriptors: Record<string, { options: object }> = {};
      for (const r of routes) descriptors[r.key] = { options: {} };
      const props = { state: { index: names.indexOf(focused), routes }, descriptors, navigation: { navigate, emit }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
      return <QuestTabBar {...(props as unknown as React.ComponentProps<typeof QuestTabBar>)} />;
    }
    const marks = (r: ReactTestRenderer) =>
      r.root
        .findAll((n) => (n.type as unknown) === 'View' && pointer(n.props) === 'none' && typeof StyleSheet.flatten(n.props.style)?.opacity === 'number')
        .map((n) => StyleSheet.flatten(n.props.style).opacity as number);

    it('shows the indicator only above the active tab and moves it when the tab changes', async () => {
      const r = await mount(bar('index'));
      await advance(600);
      expect(marks(r).filter((o) => o === 1)).toHaveLength(1);
      await act(async () => r.update(bar('map')));
      await advance(600);
      expect(marks(r).filter((o) => o === 1)).toHaveLength(1);
      expect(marks(r).filter((o) => o === 0)).toHaveLength(3);
    });

    it('still navigates through the press-scale wrapper', async () => {
      const r = await mount(bar('index'));
      const tab = r.root.findAll((n) => n.props.accessibilityLabel === 'Hồ sơ' && typeof n.props.onPress === 'function')[0];
      act(() => tab.props.onPress());
      expect(navigate).toHaveBeenCalledWith('profile');
      const fab = r.root.findAll((n) => n.props.accessibilityLabel === 'Ghi nhanh' && typeof n.props.onPress === 'function')[0];
      act(() => fab.props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/quick-add');
    });
  });
});
