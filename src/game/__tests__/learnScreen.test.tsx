import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

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
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  return { LineChart: (props: Record<string, unknown>) => <View testID="LineChart" {...props} /> };
});

import LearnScreen from '../../../app/learn';
import { useLearnStore } from '../../store/useLearnStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const hit = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  return hit;
};
const tap = async (r: ReactTestRenderer, label: string) => act(async () => (pressable(r, label).props.onPress as () => void)());
const type = async (r: ReactTestRenderer, label: string, v: string) => {
  const hit = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no input "${label}"`);
  await act(async () => (hit.props.onChangeText as (v: string) => void)(v));
};
const labelled = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.accessibilityLabel === label);

let renderer: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => {
    renderer = create(<LearnScreen />);
  });
  return renderer!;
};

const food = (name: string, mealTime: ExtraFoodItem['mealTime'], over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({ id: `${name}-${Math.random()}`, name, calories: 500, proteinG: 40, loggedAtISO: '2026-10-05T05:00:00.000Z', mealTime, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'vi', startWeightKg: 110, goalWeightKg: 95, calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110, gender: null, age: null, heightCm: null, activityLevel: null });
  useLimitsStore.setState({ purineMg: 600, saltG: 5, sugarG: 35 });
  useNutritionStore.setState({ logs: {} });
  useWeightStore.setState({ entries: [] });
  useWorkoutStore.setState({ entries: [] });
  useLearnStore.setState({ notes: {} });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

describe('Knowledge screen: theory', () => {
  it('lists the 26 topics closed, with their number and an evidence marker', async () => {
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Nguyên lý giảm mỡ: cân bằng năng lượng');
    expect(text).toContain('Vì sao cần giảm muối (natri)');
    expect(text).not.toContain('Mỡ chỉ giảm khi năng lượng ăn vào'); // closed
    expect(labelled(r, 'Bằng chứng mạnh').length).toBeGreaterThan(5);
    expect(labelled(r, 'Bằng chứng hạn chế').length).toBeGreaterThan(0);
    expect(text).toContain('Mức độ bằng chứng: Mạnh');
  });

  it('opens a topic to show its text, closes it again, and shows one at a time', async () => {
    const r = await mount();
    await tap(r, 'Nguyên lý giảm mỡ: cân bằng năng lượng');
    expect(allText(r)).toContain('Mỡ chỉ giảm khi năng lượng ăn vào thấp hơn');
    expect(allText(r)).toContain('Bằng chứng mạnh');
    await tap(r, 'Vì sao cần giảm muối (natri)');
    expect(allText(r)).not.toContain('Mỡ chỉ giảm khi năng lượng ăn vào thấp hơn');
    expect(allText(r)).toContain('Natri cao làm cơ thể giữ nước');
    await tap(r, 'Vì sao cần giảm muối (natri)');
    expect(allText(r)).not.toContain('Natri cao làm cơ thể giữ nước');
  });

  it('searches without accents and narrows to a section with its chip', async () => {
    const r = await mount();
    await type(r, 'Tìm chủ đề (vd: muối, giấc ngủ)', 'giac ngu');
    expect(allText(r)).toContain('Giấc ngủ hiệu quả');
    expect(allText(r)).not.toContain('Vì sao cần giảm muối');
    await type(r, 'Tìm chủ đề (vd: muối, giấc ngủ)', 'zzzz');
    expect(allText(r)).toContain('Không tìm thấy.');
    await type(r, 'Tìm chủ đề (vd: muối, giấc ngủ)', '');
    await tap(r, 'Gout & vận động');
    expect(allText(r)).toContain('Vì sao cần cân bằng giữa giảm mỡ và thải axit uric');
    expect(allText(r)).not.toContain('Vì sao cần giảm muối');
    await tap(r, 'Tất cả');
    expect(allText(r)).toContain('Vì sao cần giảm muối');
  });

  it('shows the owner’s note under a topic only when a diary has been loaded, with a warning that it may be out of date', async () => {
    let r = await mount();
    await tap(r, 'Vì sao cần giảm muối (natri)');
    expect(allText(r)).not.toContain('GHI CHÚ THEO NHẬT KÝ CỦA BẠN');
    act(() => renderer?.unmount());
    useLearnStore.setState({ notes: { '6': 'Natri TB của bạn ~3,400 mg/ngày.' } });
    r = await mount();
    await tap(r, 'Vì sao cần giảm muối (natri)');
    expect(allText(r)).toContain('GHI CHÚ THEO NHẬT KÝ CỦA BẠN');
    expect(allText(r)).toContain('Natri TB của bạn ~3,400 mg/ngày.');
    expect(allText(r)).toContain('có thể đã cũ');
  });

  it('shows the user’s current numbers under the topics they bear on', async () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (let i = 0; i < 15; i++) {
      const key = `2026-10-${String(1 + i).padStart(2, '0')}`;
      const items = [food('a', 'breakfast', { saltG: 2, sugarG: 10, calories: 400 }), food('b', 'lunch', { saltG: 3, sugarG: 10, calories: 600 }), food('c', 'dinner', { saltG: 1, sugarG: 20, calories: 500 })];
      logs[key] = { dateISO: key, mealsEaten: {}, extraCalories: 1500, extraProteinG: 120, extraItems: items, waterMl: 3000 };
    }
    useNutritionStore.setState({ logs });
    useWeightStore.setState({ entries: [{ id: 'a', dateISO: '2026-10-01T12:00:00', weightKg: 110 }, { id: 'b', dateISO: '2026-10-15T12:00:00', weightKg: 107 }] });
    const r = await mount();
    await tap(r, 'Vì sao cần giảm muối (natri)');
    expect(allText(r)).toContain('SỐ LIỆU HIỆN TẠI CỦA BẠN');
    expect(allText(r)).toContain('Natri TB 2.400 mg/ngày (14 ngày gần nhất), mục tiêu ≤ 2.000; 14/14 ngày vượt.');
    await tap(r, 'Vì sao cần giảm muối (natri)');
    await tap(r, 'Vì sao cần uống đủ và nhiều nước mỗi ngày');
    expect(allText(r)).toContain('Nước uống TB 3,0 L/ngày');
    await tap(r, 'Vì sao cần uống đủ và nhiều nước mỗi ngày');
    await tap(r, 'Vì sao lòng trắng trứng tốt cho giảm cân (và cho gout)');
    expect(allText(r)).not.toContain('SỐ LIỆU HIỆN TẠI CỦA BẠN'); // no figure for this topic
  });

  it('shows no figures at all when nothing has been logged', async () => {
    const r = await mount();
    await tap(r, 'Vì sao cần giảm muối (natri)');
    expect(allText(r)).not.toContain('SỐ LIỆU HIỆN TẠI CỦA BẠN');
  });
});

describe('Knowledge screen: snack swaps', () => {
  it('lists the cravings with their swap, portion, note and a colour-coded kcal chip', async () => {
    const r = await mount();
    await tap(r, 'Thay snack');
    const text = allText(r);
    expect(text).toContain('Snack khoai tây, đồ giòn mặn');
    expect(text).toContain('Dưa chuột / cà rốt que chấm sữa chua không đường + chút tiêu');
    expect(text).toContain('Khẩu phần: 1 đĩa + 100 g sữa chua');
    expect(text).toContain('0 purine, ít muối');
    expect(text).toContain('80 kcal');
    expect(text).toContain('Màu kcal: xanh');
    expect(labelled(r, '80 kcal: ăn vặt thoải mái').length).toBeGreaterThan(0);
    expect(labelled(r, '160 kcal: 1 lần mỗi ngày').length).toBeGreaterThan(0);
    expect(labelled(r, '250 kcal: thay bữa phụ').length).toBeGreaterThan(0);
    expect(labelled(r, '400 kcal: thay bữa phụ').length).toBeGreaterThan(0);
  });

  it('searches the cravings without accents, and has its own empty state', async () => {
    const r = await mount();
    await tap(r, 'Thay snack');
    await type(r, 'Tìm món đang thèm (vd: snack, trà sữa)', 'tra sua');
    expect(allText(r)).toContain('Trà sữa, cacao latte, cà phê sữa ngọt');
    expect(allText(r)).not.toContain('Snack khoai tây');
    await type(r, 'Tìm món đang thèm (vd: snack, trà sữa)', 'zzzz');
    expect(allText(r)).toContain('Không tìm thấy.');
  });

  it('clears the search when you switch tabs', async () => {
    const r = await mount();
    await type(r, 'Tìm chủ đề (vd: muối, giấc ngủ)', 'giac ngu');
    await tap(r, 'Thay snack');
    expect(allText(r)).toContain('Snack khoai tây, đồ giòn mặn');
    await tap(r, 'Lý thuyết');
    expect(allText(r)).toContain('Vì sao cần giảm muối');
  });
});

describe('Knowledge screen: language and navigation', () => {
  it('translates the screen but not the articles', async () => {
    useSettingsStore.setState({ language: 'en' });
    const r = await mount();
    expect(allText(r)).toContain('Knowledge');
    expect(allText(r)).toContain('Basics');
    expect(allText(r)).toContain('Level of evidence: Strong');
    expect(allText(r)).toContain('Nguyên lý giảm mỡ'); // the article titles stay Vietnamese
    await tap(r, 'Snack swaps');
    expect(allText(r)).toContain('When a craving hits');
    expect(labelled(r, '80 kcal: nibble freely').length).toBeGreaterThan(0);
  });

  it('goes back', async () => {
    const r = await mount();
    await tap(r, 'Quay lại');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
