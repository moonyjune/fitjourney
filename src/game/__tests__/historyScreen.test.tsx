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
import { useProofStore } from '../../store/useProofStore';
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

  it('can delete every food of a day one by one, saving each time, and the table stays usable', async () => {
    const k = dayKey(1);
    const item = (id: string, calories: number) => ({ id, name: `Món ${id}`, calories, proteinG: 5, mealTime: null, loggedAtISO: `${k}T05:00:00.000Z` });
    useNutritionStore.setState({
      logs: { [k]: { dateISO: k, mealsEaten: {}, extraCalories: 300, extraProteinG: 10, extraItems: [item('a', 100), item('b', 200)], waterMl: 0 } },
    });
    const r = await render();
    await act(async () => byLabel(r, /Xem chi tiết/).props.onPress());
    const crosses = () => r.root.findAll((n) => n.props.accessibilityLabel === '✕' && typeof n.props.onPress === 'function');
    const save = () => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => (c.type as unknown) === 'Text' && [c.props.children].flat().join('').startsWith('Lưu')).length > 0).pop()!;

    await act(async () => crosses()[0].props.onPress());
    await act(async () => save().props.onPress());
    expect(useNutritionStore.getState().logs[k].extraItems.map((i) => i.id)).toEqual(['b']);

    await act(async () => crosses()[0].props.onPress()); // the last one
    expect(text(r)).toContain('Tổng cộng');
    await act(async () => save().props.onPress());
    expect(useNutritionStore.getState().logs[k].extraItems).toEqual([]);
    expect(useNutritionStore.getState().logs[k].extraCalories).toBe(0);

    // Nothing left in the table is stuck: a plan meal can still be switched on and saved.
    const meal = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => (c.type as unknown) === 'Text' && [c.props.children].flat().join('').startsWith('Bữa')).length > 0)[0];
    await act(async () => meal.props.onPress());
    await act(async () => save().props.onPress());
    expect(Object.values(useNutritionStore.getState().logs[k].mealsEaten).some(Boolean)).toBe(true);
  });

  it('a day emptied of everything can be filled again: add a food, restore removed meals, and see the day photos', async () => {
    const k = dayKey(1);
    useNutritionStore.setState({ logs: { [k]: { dateISO: k, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 500, removedMealSlots: ['meal1', 'meal2'] } } });
    const r = await render();
    await act(async () => byLabel(r, /Xem chi tiết/).props.onPress());
    const press = (re: RegExp) =>
      r.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => (c.type as unknown) === 'Text' && re.test([c.props.children].flat(Infinity).join(''))).length > 0).pop()!;
    await act(async () => press(/Khôi phục 2 bữa/).props.onPress());
    await act(async () => press(/Thêm món/).props.onPress());
    const inputs = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.placeholder !== undefined);
    await act(async () => inputs[0].props.onChangeText('Bún bò'));
    const kcal = r.root.findAll((n) => n.props.accessibilityLabel === 'Kcal' && typeof n.props.onChangeText === 'function')[0];
    await act(async () => kcal.props.onChangeText('450'));
    await act(async () => press(/^Lưu/).props.onPress());
    const saved = useNutritionStore.getState().logs[k];
    expect(saved.removedMealSlots).toEqual([]);
    expect(saved.extraItems).toHaveLength(1);
    expect(saved.extraItems[0]).toMatchObject({ name: 'Bún bò', calories: 450 });
    expect(saved.extraCalories).toBe(450);
  });

  it('shows "N ảnh minh chứng" as an underlined link that opens the photos of that day', async () => {
    const k = dayKey(0);
    useNutritionStore.setState({ logs: { [k]: log(k) } });
    useProofStore.setState({ photos: [{ id: 'p1', dateISO: `${k}T05:00:00.000Z`, taskType: 'meal', taskRefId: 'extra:1', photoUri: 'file:///a.jpg', note: 'Bữa sáng', createdAtISO: `${k}T05:00:00.000Z` }, { id: 'p2', dateISO: `${k}T06:00:00.000Z`, taskType: 'meal', taskRefId: 'extra:2', photoUri: 'file:///b.jpg', note: 'Bữa trưa', createdAtISO: `${k}T06:00:00.000Z` }] });
    const r = await render();
    const link = r.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function')[0];
    expect(link.props.accessibilityLabel).toContain('2 ảnh minh chứng');
    expect(link.findAll((n) => n.props.style && JSON.stringify(n.props.style).includes('underline')).length).toBeGreaterThan(0);
    await act(async () => link.props.onPress());
    const uris = r.root.findAll((n) => n.props.source?.uri).map((n) => n.props.source.uri);
    expect(uris).toEqual(expect.arrayContaining(['file:///a.jpg', 'file:///b.jpg']));
    useProofStore.setState({ photos: [] });
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
