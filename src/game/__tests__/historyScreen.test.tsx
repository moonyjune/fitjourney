import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
// Charts are drawn with SVG measurements that don't exist under the test renderer; render a marker instead.
jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  const make = (name: string) => (props: Record<string, unknown>) => <View testID={name} {...props} />;
  return { LineChart: make('LineChart'), BarChart: make('BarChart'), PieChart: make('PieChart') };
});
jest.mock('../../sync/cloudSync', () => ({
  fetchFeedback: jest.fn(async () => []),
  fetchWeeklySuggestion: jest.fn(async () => null),
  pushWeeklySuggestion: jest.fn(),
  requestWeeklySuggestion: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
}));

import HistoryScreen from '../../../app/(tabs)/history';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';

const dayKey = (back: number) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return toDateKey(d);
};
const log = (k: string) => ({ dateISO: k, mealsEaten: { meal1: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 1200 });

describe('History screen (FitQuest)', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<HistoryScreen />);
    });
    renderer = r;
    return r;
  };
  const text = (r: ReactTestRenderer) =>
    r.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .map((n) => [n.props.children].flat(Infinity).join(''))
      .join(' | ');
  const byLabel = (r: ReactTestRenderer, re: RegExp) =>
    r.root.findAll((n) => typeof n.props.onPress === 'function' && re.test(String(n.props.accessibilityLabel ?? '')))[0];

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', startDateISO: new Date(Date.now() - 5 * 864e5).toISOString() });
    useNutritionStore.setState({ logs: {} });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the empty states and no charts when nothing is logged', async () => {
    const r = await render();
    const out = text(r);
    expect(out).toContain('Chưa có dữ liệu.');
    expect(out).toContain('Cần ít nhất 2 ngày có dữ liệu để vẽ biểu đồ.');
    expect(r.root.findAll((n) => n.props.testID === 'BarChart')).toHaveLength(0);
  });

  it('lists logged days and draws the charts once there are two days', async () => {
    useNutritionStore.setState({ logs: { [dayKey(1)]: log(dayKey(1)), [dayKey(0)]: log(dayKey(0)) } });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: new Date().toISOString(), weightKg: 106.2 }] });
    useWorkoutStore.setState({ entries: [{ id: 'a', dateISO: `${dayKey(1)}T15:00:00`, templateId: null, label: 'x', durationMin: 30, caloriesBurned: 300 }] });
    const r = await render();
    const out = text(r);
    expect(out).not.toContain('Chưa có dữ liệu.');
    expect(out).toContain('1200ml nước');
    expect(out).toContain('106.2 kg');
    expect(r.root.findAll((n) => n.props.testID === 'LineChart').length).toBeGreaterThanOrEqual(2);
  });

  it('expands and collapses a day to show its editable meal table', async () => {
    useNutritionStore.setState({ logs: { [dayKey(0)]: log(dayKey(0)) } });
    const r = await render();
    expect(text(r)).toContain('Xem chi tiết');
    await act(async () => byLabel(r, /Xem chi tiết/).props.onPress());
    expect(text(r)).toContain('Thu gọn');
    await act(async () => byLabel(r, /Thu gọn/).props.onPress());
    expect(text(r)).toContain('Xem chi tiết');
  });

  it('goes back through the header button', async () => {
    const r = await render();
    await act(async () => byLabel(r, /^Quay lại$/).props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await act(async () => byLabel(r, /^Quay lại$/).props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/profile');
  });

  it('follows the app language for the screen title', async () => {
    useSettingsStore.setState({ language: 'en' });
    const r = await render();
    expect(text(r)).toContain('History');
  });
});
