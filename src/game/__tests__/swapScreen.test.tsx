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
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

type Outcome = { ok: true; result: unknown } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'quota' | 'disabled' | 'generic' };
const mockSwaps = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
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
  requestSwaps: (...a: unknown[]) => mockSwaps(...a),
}));

import AddFoodScreen from '../../../app/add-food';
import type { FoodEntry } from '../../food/types';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const DATE = '2026-10-23';

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
const find = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
const input = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];

// The item is protein-heavy on purpose (300 g) so that only the foods set up below can replace it, whatever the built-in database holds.
const saved = (name: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `c-${name}`, name, group: 'processed', unit: 'phần', unitG: 100, kcal: 380, proteinG: 250, purineMg: 100, sugarG: 1, sodiumMg: 200, note: '', confidence: 'low', auto: true, ...over,
});

describe('Swaps when an item breaks a limit (Add food)', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<AddFoodScreen />);
    });
    return renderer!;
  };
  const type = async (r: ReactTestRenderer, label: string, v: string) => {
    await act(async () => input(r, label).props.onChangeText(v));
  };
  const fillItem = async (r: ReactTestRenderer, purine = '1500') => {
    await type(r, 'Tên món', 'Xúc xích chiên');
    await type(r, 'Calo (kcal)', '400');
    await type(r, 'Đạm (g)', '300');
    await type(r, 'Purine (mg)', purine);
  };
  const items = () => useNutritionStore.getState().logs[DATE]?.extraItems ?? [];

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useWorkoutStore.setState({ entries: [] });
    useFoodDbStore.setState({ custom: [saved('Đậu hũ nhà làm'), saved('Cá hấp nhà làm')], overrides: {}, recent: [] });
    useNutritionStore.setState({ logs: {} });
    mockSwaps.mockResolvedValue({ ok: true, result: { swaps: [] } });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('offers nothing while the item stays within the limits', async () => {
    const r = await mount();
    await fillItem(r, '500');
    expect(allText(r)).not.toContain('làm vượt giới hạn');
  });

  it('offers swaps from the user\'s own foods, scaled to the item, with how much each lowers the purine, and no AI call', async () => {
    const r = await mount();
    await fillItem(r);
    const text = allText(r);
    expect(text).toContain('Món này làm vượt giới hạn purine. Món thay gợi ý:');
    expect(text).toContain('Đậu hũ nhà làm');
    expect(text).toContain('Cá hấp nhà làm');
    expect(text).toContain('Từ cơ sở dữ liệu món ăn của bạn');
    expect(text).toContain('Khẩu phần: 1 phần');
    expect(text).toContain('380 kcal · 250 g đạm · purine 100 mg');
    expect(text).toContain('Giảm purine ~93%');
    expect(mockSwaps).not.toHaveBeenCalled();
  });

  it('using a swap puts its name and figures in the form (nothing is saved), and saving it does not duplicate a food already in the database', async () => {
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Dùng món thay: Cá hấp nhà làm')!.props.onPress());
    expect(input(r, 'Tên món').props.value).toBe('Cá hấp nhà làm');
    expect(input(r, 'Calo (kcal)').props.value).toBe('380');
    expect(input(r, 'Đạm (g)').props.value).toBe('250');
    expect(input(r, 'Purine (mg)').props.value).toBe('100');
    expect(items()).toHaveLength(0);
    expect(allText(r)).not.toContain('làm vượt giới hạn'); // the problem is gone, so is the card
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(items().map((i) => [i.name, i.calories, i.purineMg])).toEqual([['Cá hấp nhà làm', 380, 100]]);
    expect(useFoodDbStore.getState().custom).toHaveLength(2);
  });

  it('with fewer than 3 swaps of its own it offers the AI, sends the item, the room left and the usual foods, and shows only the swaps that hold up', async () => {
    mockSwaps.mockResolvedValue({
      ok: true,
      result: { swaps: [
        { name: 'Ức gà luộc + rau', calories: 390, proteinG: 280, purineMg: 300, saltG: 1, sugarG: 0, how: 'Luộc 15 phút, chấm muối tiêu chanh.', accuracyPercent: 64 },
        { name: 'Gan chiên', calories: 390, proteinG: 280, purineMg: 1400, saltG: 1, sugarG: 0, accuracyPercent: 80 }, // does not lower the purine enough: dropped
      ] },
    });
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    const arg = mockSwaps.mock.calls[0][0] as Record<string, any>;
    expect(arg.item).toMatchObject({ name: 'Xúc xích chiên', calories: 400, proteinG: 300, purineMg: 1500 });
    expect(arg.context).toEqual({ exceeded: ['purine'], headroom: { purine: 1200, salt: 7, sugar: 25 } });
    expect(arg.limits).toEqual({ purine: 1200, salt: 7, sugar: 25 });
    expect(Array.isArray(arg.favorites)).toBe(true);
    const text = allText(r);
    expect(text).toContain('Ức gà luộc + rau');
    expect(text).toContain('AI gợi ý');
    expect(text).toContain('Độ chính xác ước tính: 64%');
    expect(text).toContain('Luộc 15 phút');
    expect(text).toContain('do AI ước tính');
    expect(text).not.toContain('Gan chiên');
    expect(find(r, 'Nhờ AI gợi ý thêm')).toBeUndefined(); // asked once for this item
  });

  it('does not list an AI swap that has the same name as one already listed from the database', async () => {
    mockSwaps.mockResolvedValue({ ok: true, result: { swaps: [{ name: 'Đậu hũ nhà làm', calories: 390, proteinG: 280, purineMg: 300, accuracyPercent: 64 }] } });
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    expect(allText(r)).not.toContain('Độ chính xác ước tính: 64%'); // the AI copy was not listed next to the database one
  });

  it('offers nothing until the item has calories to swap (a purine figure alone is not a meal)', async () => {
    const r = await mount();
    await type(r, 'Tên món', 'Xúc xích');
    await type(r, 'Purine (mg)', '1500');
    expect(allText(r)).not.toContain('làm vượt giới hạn');
    await type(r, 'Calo (kcal)', '400');
    expect(allText(r)).toContain('làm vượt giới hạn');
  });

  it('a swap chosen from the AI is remembered as a new food when saved', async () => {
    mockSwaps.mockResolvedValue({ ok: true, result: { swaps: [{ name: 'Ức gà luộc + rau', calories: 390, proteinG: 280, purineMg: 300, accuracyPercent: 64 }] } });
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    await act(async () => find(r, 'Dùng món thay: Ức gà luộc + rau')!.props.onPress());
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(items().map((i) => i.name)).toEqual(['Ức gà luộc + rau']);
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toContain('Ức gà luộc + rau');
  });

  it('forgets the AI\'s answer when the item changes, and can be asked again for the new one', async () => {
    mockSwaps.mockResolvedValue({ ok: true, result: { swaps: [{ name: 'Ức gà luộc + rau', calories: 390, proteinG: 280, purineMg: 300, accuracyPercent: 64 }] } });
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    expect(allText(r)).toContain('Ức gà luộc + rau');
    await type(r, 'Purine (mg)', '1800');
    expect(allText(r)).not.toContain('Ức gà luộc + rau');
    expect(find(r, 'Nhờ AI gợi ý thêm')).toBeDefined();
  });

  it('says so when neither the database nor the AI has a swap', async () => {
    useFoodDbStore.setState({ custom: [] });
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    expect(allText(r)).toContain('Chưa tìm được món thay phù hợp');
  });

  it.each([
    ['notConfigured', 'AI chưa được thiết lập'],
    ['quota', 'hết lượt AI hôm nay'],
    ['disabled', 'AI đang tắt'],
    ['offline', 'Không có mạng'],
  ] as Array<['notConfigured' | 'quota' | 'disabled' | 'offline', string]>)('shows a friendly message for a %s failure and keeps the swaps it has', async (kind, expected) => {
    mockSwaps.mockResolvedValue({ ok: false, message: 'x', kind });
    const r = await mount();
    await fillItem(r);
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    expect(allText(r)).toContain(expected);
    expect(allText(r)).toContain('Đậu hũ nhà làm');
  });

  it('does not offer the AI when the database already gives 3 swaps', async () => {
    useFoodDbStore.setState({ custom: [saved('Món A'), saved('Món B'), saved('Món C'), saved('Món D')] });
    const r = await mount();
    await fillItem(r);
    expect(find(r, 'Nhờ AI gợi ý thêm')).toBeUndefined();
    expect(['Món A', 'Món B', 'Món C', 'Món D'].filter((n) => allText(r).includes(n))).toHaveLength(3);
  });

  it('counts the room already used today: a limit already full asks for at least half off', async () => {
    useNutritionStore.setState({ logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 100, extraProteinG: 0, extraItems: [{ id: 'e1', name: 'Bữa trước', calories: 100, proteinG: 0, loggedAtISO: `${DATE}T08:00:00`, mealTime: 'breakfast', purineMg: 1000 }], waterMl: 0 } } });
    const r = await mount();
    await fillItem(r, '500'); // 1000 + 500 = 1500 > 1200: breaks the limit with only 200 mg of room left
    expect(allText(r)).toContain('làm vượt giới hạn purine');
    await act(async () => find(r, 'Nhờ AI gợi ý thêm')!.props.onPress());
    expect((mockSwaps.mock.calls[0][0] as Record<string, any>).context.headroom.purine).toBe(200);
    // Both saved foods have 100 mg purine: they fit the 200 mg of room and are under half of 500.
    expect(allText(r)).toContain('Đậu hũ nhà làm');
  });
});
