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
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
// Charts need SVG measurements that do not exist under the test renderer; render a marker that keeps the data.
jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  return { LineChart: (props: Record<string, unknown>) => <View testID="LineChart" {...props} /> };
});

import InsightsScreen from '../../../app/insights';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

const dayKey = (i: number) => `2026-10-${String(1 + i).padStart(2, '0')}`;
const items = (kcal: number): ExtraFoodItem[] =>
  (['breakfast', 'lunch', 'dinner'] as const).map((m, i) => ({ id: `${m}-${kcal}-${i}`, name: m, calories: kcal / 3, proteinG: 40, loggedAtISO: '2026-10-01T05:00:00.000Z', mealTime: m, purineMg: 100, saltG: 1.5, sugarG: 5 }));
function fillLogs(kcal: number, days = 15) {
  const logs: Record<string, DailyNutritionLog> = {};
  for (let i = 0; i < days; i++) logs[dayKey(i)] = { dateISO: dayKey(i), mealsEaten: {}, extraCalories: kcal, extraProteinG: 120, extraItems: items(kcal).map((x) => ({ ...x, id: `${x.id}-${i}` })), waterMl: 0 };
  useNutritionStore.setState({ logs });
}

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}
const tap = async (r: ReactTestRenderer, label: string) => {
  const hit = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  await act(async () => (hit.props.onPress as () => void)());
};

describe('Analysis screen', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<InsightsScreen />);
    });
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', startWeightKg: 110, goalWeightKg: 95, calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110, gender: null, age: null, heightCm: null, activityLevel: null });
    useLimitsStore.setState({ purineMg: 600, saltG: 5, sugarG: 35 });
    useWorkoutStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: {} });
    useWeightStore.setState({
      entries: [
        { id: 'a', dateISO: '2026-10-01T12:00:00', weightKg: 110 },
        { id: 'b', dateISO: '2026-10-08T12:00:00', weightKg: 107.5 },
        { id: 'c', dateISO: '2026-10-15T12:00:00', weightKg: 105 },
      ],
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('asks for data instead of showing empty numbers', async () => {
    const r = await mount();
    expect(allText(r)).toContain('Chưa đủ dữ liệu');
    expect(allText(r)).not.toContain('Dự báo cân nặng');
  });

  it('overview: fat versus water, the look-back table, efficiency and the forecast, from the logged data', async () => {
    fillLogs(1500);
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Cân nặng: mỡ thật hay nước?');
    expect(text).toContain('Cân giảm 5,0 kg trên cân'); // 110 -> 105
    expect(text).toContain('Nhìn lại');
    for (const w of ['7 ngày', '14 ngày', '30 ngày', 'Toàn bộ']) expect(text).toContain(w);
    expect(text).toContain('1.500'); // kcal eaten
    expect(text).toContain('Mục tiêu thâm hụt: 1.000 kcal/ngày');
    expect(text).toContain('Hệ số');
    expect(text).toContain('Dự báo cân nặng');
    expect(text).toContain('cân mục tiêu 95,0 kg');
    expect(text).toContain('1 tuần');
    expect(text).toContain('3 tháng');
    // the chart gets the actual weight and the fat line, one point per weigh-in
    const chart = r.root.findAll((n) => n.props.testID === 'LineChart')[0];
    expect(chart.props.data.datasets).toHaveLength(2);
    expect(chart.props.data.datasets[0].data).toHaveLength(3);
    expect(chart.props.data.datasets[0].data[0]).toBe(110);
  });

  it('flags a day under 1,300 kcal as a gout risk', async () => {
    fillLogs(1200);
    const r = await mount();
    expect(allText(r)).toContain('dưới 1.300 kcal');
  });

  it('weekly and monthly tabs: one card per period with strengths, things to improve and one change', async () => {
    fillLogs(1500);
    const r = await mount();
    await tap(r, 'Tuần/tháng');
    let text = allText(r);
    expect(text).toContain('Tuần 12/10–18/10');
    expect(text).toContain('Tuần 05/10–11/10');
    expect(text).toContain('Điểm mạnh');
    expect(text).toContain('Cần cải thiện');
    expect(text).toContain('KAIZEN');
    expect(text).toContain('Natri TB'); // 3 x 1.5 g salt = 4.5 g/day = 1,800 mg... shown as a figure in the card
    await tap(r, 'Tháng');
    text = allText(r);
    expect(text).toContain('Tháng 10/2026');
    expect(text).not.toContain('Tuần 12/10–18/10');
  });

  it('exercise tab: sizes the shortfall and offers the suggested set and the catalogue', async () => {
    fillLogs(2200); // far above the plan: the deficit is well under 1,000
    const r = await mount();
    await tap(r, 'Vận động');
    const text = allText(r);
    expect(text).toContain('Bù khoảng thiếu bằng vận động');
    expect(text).toContain('còn thiếu');
    expect(text).toContain('bước mỗi ngày');
    expect(text).toContain('Bộ gợi ý mỗi ngày');
    expect(text).toContain('Đi bộ nhanh');
    expect(text).toContain('Danh mục bài tập');
    expect(text).toContain('Thân thiện gối/gout');
    expect(text).toContain('Tránh khi đau');
  });

  it('exercise tab: says so when the deficit target is already met', async () => {
    fillLogs(1200);
    const r = await mount();
    await tap(r, 'Vận động');
    expect(allText(r)).toContain('đang đạt mục tiêu thâm hụt');
  });

  it('follows the app language', async () => {
    fillLogs(1500);
    useSettingsStore.setState({ language: 'en' });
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Analysis');
    expect(text).toContain('Weight: real fat or water?');
    expect(text).toContain('The scale is down 5.0 kg');
    expect(text).toContain('Weight forecast');
    expect(text).not.toContain('Dự báo');
  });

  it('goes back', async () => {
    fillLogs(1500);
    const r = await mount();
    await tap(r, 'Quay lại');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
