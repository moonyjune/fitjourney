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
const mockRestore = jest.fn(async () => ({ ok: true, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 }));
jest.mock('../../sync/restore', () => ({ restoreOwnData: () => mockRestore() }));
jest.mock('../../sync/cloudSync', () => ({
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
}));
const mockPushUserData = jest.fn();
// Charts need SVG measurements that do not exist under the test renderer; render a marker that keeps the data.
jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  return { LineChart: (props: Record<string, unknown>) => <View testID="LineChart" {...props} /> };
});

import InsightsScreen from '../../../app/insights';
import { useLimitsStore } from '../../store/useLimitsStore';
import { resetAnalysisStore, useAnalysisStore } from '../../store/useAnalysisStore';
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
    resetAnalysisStore();
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

  it('week card: names each day and meal that is missing, and "not eaten" completes the day', async () => {
    fillLogs(1500, 7); // 1-7 Oct, all three meals
    const logs = useNutritionStore.getState().logs;
    // 6 Oct: no breakfast and no dinner on record.
    useNutritionStore.setState({ logs: { ...logs, [dayKey(5)]: { ...logs[dayKey(5)], extraItems: logs[dayKey(5)].extraItems.filter((i) => i.mealTime === 'lunch') } } });
    const r = await mount();
    await tap(r, 'Tuần/tháng');
    let text = allText(r);
    expect(text).toContain('Bữa thiếu cần kiểm tra');
    expect(text).toContain('06/10: thiếu sáng, tối');
    expect(text).toContain('Chưa ghi gì: 08/10, 09/10, 10/10, 11/10'); // the rest of that week, with nothing logged
    await tap(r, 'Đánh dấu không ăn bữa sáng ngày 06/10');
    text = allText(r);
    expect(text).toContain('06/10: thiếu tối');
    const added = useNutritionStore.getState().logs[dayKey(5)].extraItems.find((i) => i.mealTime === 'breakfast')!;
    expect(added).toMatchObject({ name: 'Không ăn', calories: 0, proteinG: 0 });
    await tap(r, 'Đánh dấu không ăn bữa tối ngày 06/10');
    text = allText(r);
    expect(text).not.toContain('06/10: thiếu');
  });

  it('week card: "analyse again" fetches the latest data from the cloud and says when', async () => {
    fillLogs(1500, 7);
    const r = await mount();
    expect(mockRestore).toHaveBeenCalledTimes(1); // auto mode: opening brings in what was logged on other devices
    await tap(r, 'Tuần/tháng');
    await tap(r, 'Phân tích lại Tuần 05/10–11/10');
    expect(mockRestore).toHaveBeenCalledTimes(2);
    expect(allText(r)).toMatch(/Đã phân tích lại lúc \d\d:\d\d với dữ liệu mới nhất\./);
    mockRestore.mockResolvedValueOnce({ ok: false, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 });
    await tap(r, 'Phân tích lại Tuần 05/10–11/10');
    expect(allText(r)).toContain('Không lấy được dữ liệu từ cloud');
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

  it('says when each part was analysed, and defaults to automatic updates', async () => {
    fillLogs(1500, 7);
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Cập nhật phân tích');
    expect(text).toMatch(/Phân tích lúc \d\d\/\d\d \d\d:\d\d/);
    expect(text).toContain('Mọi tab đã phân tích với dữ liệu mới nhất.');
    const radio = (name: string) => r.root.findAll((n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === name)[0];
    expect(radio('Tự động').props.accessibilityState).toEqual({ checked: true });
    expect(radio('Thủ công').props.accessibilityState).toEqual({ checked: false });
    await tap(r, 'Tuần/tháng');
    expect(allText(r)).toMatch(/Phân tích lúc \d\d\/\d\d \d\d:\d\d/);
    await tap(r, 'Nhận xét');
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Phân tích lại ngày 07/10/2026' && typeof n.props.onPress === 'function')).toHaveLength(1);
  });

  it('auto: logging the missing breakfast updates the week card and the comments at once', async () => {
    fillLogs(1500, 7);
    const logs = useNutritionStore.getState().logs;
    useNutritionStore.setState({ logs: { ...logs, [dayKey(5)]: { ...logs[dayKey(5)], extraItems: logs[dayKey(5)].extraItems.filter((i) => i.mealTime !== 'breakfast') } } });
    const r = await mount();
    await tap(r, 'Tuần/tháng');
    expect(allText(r)).toContain('06/10: thiếu sáng');
    // breakfast logged without choosing the meal, at 7:30: it counts as breakfast
    await act(async () => {
      useNutritionStore.getState().addExtra(dayKey(5), 'Phở bò', 450, 25, null, { clock: [7, 30], fromFoodDb: true });
    });
    expect(allText(r)).not.toContain('06/10: thiếu');
    expect(allText(r)).not.toContain('Cũ — dữ liệu đã thay đổi');
  });

  it('manual: keeps the analysis, marks it outdated when data changes, and each button analyses its own part again', async () => {
    fillLogs(1500, 7);
    const logs = useNutritionStore.getState().logs;
    useNutritionStore.setState({ logs: { ...logs, [dayKey(5)]: { ...logs[dayKey(5)], extraItems: logs[dayKey(5)].extraItems.filter((i) => i.mealTime !== 'breakfast') } } });
    const r = await mount();
    const radio = r.root.findAll((n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'Thủ công')[0];
    await act(async () => (radio.props.onPress as () => void)());
    expect(useAnalysisStore.getState().mode).toBe('manual');
    expect(mockPushUserData).toHaveBeenCalledWith('analysisMode', { mode: 'manual' });
    expect(allText(r)).toContain('Phân tích giữ nguyên đến khi bạn bấm');
    await tap(r, 'Tuần/tháng');
    await act(async () => {
      useNutritionStore.getState().addExtra(dayKey(5), 'Phở bò', 450, 25, 'breakfast', { fromFoodDb: true });
    });
    let text = allText(r);
    expect(text).toContain('06/10: thiếu sáng'); // still the analysis made before
    expect(text).toContain('Cũ — dữ liệu đã thay đổi sau lần phân tích (06/10).');
    expect(text).toContain('Có dữ liệu mới chưa phân tích ở: Tổng quan, Tuần/tháng, Vận động, Nhận xét.');
    await tap(r, 'Phân tích lại Tuần 05/10–11/10');
    text = allText(r);
    expect(text).not.toContain('06/10: thiếu');
    expect(text).toContain('Có dữ liệu mới chưa phân tích ở: Tổng quan, Vận động, Nhận xét.');
    // the comments tab still has the old analysis of that day, with its own button
    await tap(r, 'Nhận xét');
    expect(allText(r)).toContain('Bổ sung bữa còn thiếu (1)');
    await tap(r, 'Phân tích lại ngày 06/10/2026');
    expect(allText(r)).not.toContain('Bổ sung bữa còn thiếu');
    // and one button for everything
    await tap(r, 'Phân tích lại tất cả');
    expect(allText(r)).toContain('Mọi tab đã phân tích với dữ liệu mới nhất.');
  });

  it('manual: "not eaten" on a missing meal is analysed at once', async () => {
    fillLogs(1500, 7);
    const logs = useNutritionStore.getState().logs;
    useNutritionStore.setState({ logs: { ...logs, [dayKey(5)]: { ...logs[dayKey(5)], extraItems: logs[dayKey(5)].extraItems.filter((i) => i.mealTime !== 'breakfast') } } });
    useAnalysisStore.setState({ mode: 'manual' });
    const r = await mount();
    await tap(r, 'Tuần/tháng');
    await tap(r, 'Đánh dấu không ăn bữa sáng ngày 06/10');
    expect(allText(r)).not.toContain('06/10: thiếu');
    expect(allText(r)).not.toContain('Cũ — dữ liệu');
  });

  it('goes back', async () => {
    fillLogs(1500);
    const r = await mount();
    await tap(r, 'Quay lại');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
