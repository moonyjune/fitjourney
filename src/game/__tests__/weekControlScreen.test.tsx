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
jest.mock('../../sync/restore', () => ({ restoreOwnData: jest.fn(async () => ({ ok: true })) }));
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
import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime } from '../../types';

const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}`; // 5 Oct 2026 is a Monday
let seq = 0;
const food = (name: string, mealTime: ExtraMealTime, calories: number, over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: `f${++seq}`,
  name,
  calories,
  proteinG: 35,
  loggedAtISO: '2026-10-05T05:00:00.000Z',
  mealTime,
  ...over,
});
function fill(days: number, lunch: (i: number) => ExtraFoodItem) {
  const logs: Record<string, DailyNutritionLog> = {};
  for (let i = 0; i < days; i++) {
    const items = [food('cơm trứng', 'breakfast', 300), lunch(i), food('ức gà + rau', 'dinner', 500)];
    logs[D(5 + i)] = { dateISO: D(5 + i), mealsEaten: {}, extraCalories: items.reduce((s, x) => s + x.calories, 0), extraProteinG: items.reduce((s, x) => s + x.proteinG, 0), extraItems: items, waterMl: 0 };
  }
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

describe('Week control and 80/20 in Analysis', () => {
  let renderer: ReactTestRenderer | undefined;
  const open = async () => {
    await act(async () => {
      renderer = create(<InsightsScreen />);
    });
    await tap(renderer!, 'Tuần/tháng');
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', startWeightKg: 110, goalWeightKg: 95, calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110, gender: null, age: null, heightCm: null, activityLevel: null });
    useLimitsStore.setState({ purineMg: 600, saltG: 5, sugarG: 35 });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: {} });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the weekly deficit, what the remaining days must deliver, and the 80/20 allowance', async () => {
    fill(5, () => food('cơm gà', 'lunch', 600)); // 1,400 kcal a day against a 2,520 TDEE: about 1,120 deficit each day
    const r = await open();
    const text = allText(r);
    expect(text).toContain('Kiểm soát tuần này');
    expect(text).toContain('Tuần 05/10–11/10 · còn 2 ngày');
    expect(text).toContain('Thâm hụt tuần: 5.600 / 7.000 kcal (80%)');
    expect(text).toContain('✔ Đúng hướng: chỉ cần TB 700 kcal thâm hụt/ngày cho 2 ngày còn lại.');
    expect(text).toContain('Bữa chính đã ghi 15 · linh hoạt 0/4 · đúng kế hoạch 100%');
    expect(text).toContain('80/20: đã dùng 0/4 bữa linh hoạt; còn 4 bữa.');
    expect(text).toContain('Quy tắc 80/20');
  });

  it('warns when the flexible meals pass the allowance of 4', async () => {
    fill(5, () => food('1 bát mì tôm cải thảo', 'lunch', 600)); // instant noodles: a flexible lunch every day
    const r = await open();
    const text = allText(r);
    expect(text).toContain('Bữa chính đã ghi 15 · linh hoạt 5/4 · đúng kế hoạch 67%');
    expect(text).toContain('⚠ VƯỢT 80/20: 5 bữa linh hoạt (quota 4)');
    // the same week's own card repeats the verdict
    expect(text).toContain('80/20: 5/15 bữa linh hoạt (67% đúng kế hoạch): Tạm chấp nhận (vượt 2 bữa)');
  });

  it('says the allowance is used up at exactly 4, and warns of a missed weekly target', async () => {
    fill(4, () => food('mì tôm', 'lunch', 600));
    useNutritionStore.setState((s) => ({ logs: { ...s.logs, [D(8)]: { ...s.logs[D(8)], extraCalories: 2900, extraItems: [food('cỗ', 'lunch', 2900)] } } }));
    const r = await open();
    const text = allText(r);
    expect(text).toContain('linh hoạt 4/4');
    expect(text).toContain('⚠ Đã dùng hết quota bữa linh hoạt tuần này');
    expect(text).toContain('⚠ NGUY CƠ KHÔNG ĐẠT MỤC TIÊU TUẦN');
    expect(text).toContain('KHÔNG nhịn ăn');
  });

  it('keeps the control card to the weekly view only', async () => {
    fill(5, () => food('cơm gà', 'lunch', 600));
    const r = await open();
    await tap(r, 'Tháng');
    expect(allText(r)).not.toContain('Kiểm soát tuần này');
    expect(allText(r)).not.toContain('80/20:');
  });

  it('speaks English', async () => {
    fill(5, () => food('1 bát mì tôm', 'lunch', 600));
    useSettingsStore.setState({ language: 'en' });
    await act(async () => {
      renderer = create(<InsightsScreen />);
    });
    await tap(renderer!, 'Periods');
    const text = allText(renderer!);
    expect(text).toContain('This week’s control');
    expect(text).toContain('Week 05/10–11/10 · 2 days left');
    expect(text).toContain('OVER 80/20: 5 flexible meals (allowance 4)');
  });
});
