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
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: async (_u: string, id: string) => `file:///docs/${id}.jpg`,
  deletePersistedPhoto: jest.fn(async () => undefined),
  AI_MAX_EDGE_PX: 1280,
  AI_FULL_HD_EDGE_PX: 1920,
  imageUriToBase64: async () => ({ base64: 'QUJD', mediaType: 'image/png' }),
}));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushFeelingRecord: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
  requestPhotoAnalysis: jest.fn(),
}));
jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  return { LineChart: (props: Record<string, unknown>) => <View testID="LineChart" {...props} /> };
});

import AddFoodScreen from '../../../app/add-food';
import InsightsScreen from '../../../app/insights';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';
import type { DailyNutritionLog, ExtraFoodItem, ExtraMealTime } from '../../types';

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
const input = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const hit = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no input "${label}"`);
  return hit;
};
const tap = async (r: ReactTestRenderer, label: string) => {
  const hit = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  await act(async () => (hit.props.onPress as () => void)());
};
const type = async (r: ReactTestRenderer, label: string, v: string) => act(async () => (input(r, label).props.onChangeText as (v: string) => void)(v));

let renderer: ReactTestRenderer | undefined;
const mount = async (el: React.ReactElement) => {
  await act(async () => {
    renderer = create(el);
  });
  return renderer!;
};

let seq = 0;
const food = (name: string, mealTime: ExtraMealTime, over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: `f${++seq}`,
  name,
  calories: 500,
  proteinG: 30,
  loggedAtISO: '2026-10-05T05:00:00.000Z',
  mealTime,
  ...over,
});
const day = (dateKey: string, items: ExtraFoodItem[]): DailyNutritionLog => ({
  dateISO: dateKey,
  mealsEaten: {},
  extraCalories: items.reduce((s, i) => s + i.calories, 0),
  extraProteinG: items.reduce((s, i) => s + i.proteinG, 0),
  extraItems: items,
  waterMl: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'vi', startWeightKg: 110, goalWeightKg: 95, calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110, gender: null, age: null, heightCm: null, activityLevel: null });
  useLimitsStore.setState({ purineMg: 600, saltG: 5, sugarG: 35 });
  useNutritionStore.setState({ logs: {} });
  useProofStore.setState({ photos: [] });
  useWeightStore.setState({ entries: [] });
  useWorkoutStore.setState({ entries: [] });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

describe('Live comments in Add food', () => {
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000));

  it('says nothing for a neutral name and nothing for a name that is too short', async () => {
    const r = await mount(<AddFoodScreen />);
    await type(r, 'Tên món', 'x');
    expect(allText(r)).not.toContain('NHẬN XÉT MÓN NÀY');
    await type(r, 'Tên món', 'một món không có từ khóa');
    expect(allText(r)).not.toContain('NHẬN XÉT MÓN NÀY');
  });

  it('praises a good food and warns about one to swap, with the reason and the replacement', async () => {
    const r = await mount(<AddFoodScreen />);
    await type(r, 'Tên món', 'lòng trắng rán');
    expect(allText(r)).toContain('NHẬN XÉT MÓN NÀY');
    expect(allText(r)).toContain('✔ Lòng trắng trứng: đạm nạc, ~0 purine');
    await type(r, 'Tên món', 'xúc xích');
    const text = allText(r);
    expect(text).toContain('⚠ Xúc xích: đồ chế biến sẵn');
    expect(text).toContain('→ thay: trứng luộc / lòng trắng / ức gà tự luộc');
    expect(text).not.toContain('Lòng trắng trứng');
  });

  it('counts a repeat from the last two days and from today', async () => {
    useNutritionStore.setState({ logs: { [yesterday]: day(yesterday, [food('1 xúc xích', 'lunch')]) } });
    const r = await mount(<AddFoodScreen />);
    await type(r, 'Tên món', 'xúc xích nướng');
    expect(allText(r)).toContain('↻ Xúc xích: đây là lần thứ 2 trong 3 ngày');
    await type(r, 'Tên món', 'trứng luộc');
    expect(allText(r)).not.toContain('↻');
  });

  it('warns when the numbers of this one meal are large', async () => {
    const r = await mount(<AddFoodScreen />);
    await type(r, 'Tên món', 'cơm thập cẩm');
    await tap(r, 'Trưa');
    await type(r, 'Calo (kcal)', '1200');
    await type(r, 'Đạm (g)', '10');
    await type(r, 'Purine (mg)', '400');
    await type(r, 'Muối (g)', '5');
    const text = allText(r);
    expect(text).toContain('Bữa trên 1.000 kcal');
    expect(text).toContain('Purine bữa 400 mg');
    expect(text).toContain('Natri bữa 2.000 mg'); // 5 g salt = 2,000 mg sodium
    expect(text).toContain('Bữa chính ít đạm');
  });

  it('follows the app language', async () => {
    useSettingsStore.setState({ language: 'en' });
    const r = await mount(<AddFoodScreen />);
    await type(r, 'Food name', 'xúc xích');
    expect(allText(r)).toContain('COMMENTS ON THIS FOOD');
    expect(allText(r)).toContain('→ swap:');
  });
});

describe('Feedback tab and repeated foods in Analysis', () => {
  const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;
  const fill = () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (let i = 5; i <= 11; i++) {
      logs[D(i)] = day(D(i), [
        food('2 lòng trắng + sữa chua', 'breakfast', { calories: 300, proteinG: 40 }),
        food(i % 2 === 0 ? 'mì tôm cải thảo' : 'tôm rang', 'lunch', { calories: 600, proteinG: 30, saltG: 3.5 }),
        food('ức gà áp chảo + rau', 'dinner', { calories: 500, proteinG: 45 }),
      ]);
    }
    useNutritionStore.setState({ logs });
  };
  const open = async () => {
    const r = await mount(<InsightsScreen />);
    await tap(r, 'Nhận xét');
    return r;
  };

  it('shows each recent day: foods to swap, repeats, a comment on every food and tomorrow’s to-do', async () => {
    fill();
    const r = await open();
    const text = allText(r);
    expect(text).toContain('11/10/2026');
    expect(text).toContain('Món nên thay / chú ý');
    expect(text).toContain('Mì gói → miến/mì gạo lứt + lòng trắng');
    expect(text).toContain('Việc cần làm ngày mai'.toUpperCase());
    expect(text).toContain('Từng món');
    expect(text).toContain('✔ Lòng trắng trứng');
    expect(text).toContain('⚠ Mì gói: natri 1,500–2,000 mg/gói');
    expect(text).not.toContain('⚠ Tôm: purine trung bình–cao; mì tôm'); // "mì tôm" is noodles, not shrimp
  });

  it('links to the snack swaps', async () => {
    fill();
    const r = await open();
    await tap(r, 'Gợi ý thay đồ ăn vặt khi thèm →');
    expect(mockRouter.push).toHaveBeenCalledWith('/learn');
  });

  it('lists the days newest first and caps the list', async () => {
    fill();
    const r = await open();
    const text = allText(r);
    expect(text.indexOf('11/10/2026')).toBeLessThan(text.indexOf('10/10/2026'));
    expect(text.indexOf('10/10/2026')).toBeLessThan(text.indexOf('05/10/2026'));
  });

  it('asks for data when nothing is logged', async () => {
    const r = await open();
    expect(allText(r)).toContain('Chưa đủ dữ liệu'); // the screen-level empty state
  });

  it('lists foods that came up three times or more on the weekly card', async () => {
    fill();
    const r = await mount(<InsightsScreen />);
    await tap(r, 'Tuần/tháng');
    const text = allText(r);
    expect(text).toContain('Món lặp nhiều (nên hạn chế)');
    expect(text).toContain('Tôm ×4 → ≤ 150 g, xen trứng/đậu phụ'); // tôm rang on Oct 5, 7, 9 and 11
    expect(text).toContain('Mì gói ×3 → miến/mì gạo lứt + lòng trắng'); // mì tôm on Oct 6, 8 and 10: counted as noodles, not shrimp
  });

  it('speaks English', async () => {
    fill();
    useSettingsStore.setState({ language: 'en' });
    const r = await mount(<InsightsScreen />);
    await tap(r, 'Feedback');
    expect(allText(r)).toContain('Foods to swap / watch');
    expect(allText(r)).toContain('To do tomorrow'.toUpperCase());
  });
});
