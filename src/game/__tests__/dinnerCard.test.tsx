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
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

type Outcome = { ok: true; result: unknown } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'quota' | 'disabled' | 'generic' };
const mockDinner = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
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
  requestDinner: (...a: unknown[]) => mockDinner(...a),
}));

import AddFoodScreen from '../../../app/add-food';
import { buildDinnerBrief, dinnerIdeasFromFoods } from '../../ai/dinner';
import { DinnerCard } from '../../components/quest/DinnerCard';
import type { FoodEntry } from '../../food/types';
import { mergeFoods, useFoodDbStore } from '../../store/useFoodDbStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const AT = (h: number, m = 10) => new Date(2026, 9, 23, h, m);
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

const saved = (name: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `c-${name}`, name, group: 'poultry', unit: 'phần', unitG: 100, kcal: 560, proteinG: 55, purineMg: 100, sugarG: 1, sodiumMg: 200, note: '', confidence: 'low', auto: true, ...over,
});
const logLunch = (kcal: number, purine = 400) =>
  useNutritionStore.setState({ logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: kcal, extraProteinG: 100, waterMl: 0, extraItems: [{ id: 'a', name: 'Cơm', calories: kcal, proteinG: 100, loggedAtISO: `${DATE}T12:00:00`, mealTime: 'lunch', purineMg: purine, saltG: 2, sugarG: 5 }] } } });

describe('Dinner card (Camp)', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (now: Date) => {
    await act(async () => {
      renderer = create(<DinnerCard now={now} />);
    });
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    useSettingsStore.setState({ language: 'vi', gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
    useFoodDbStore.setState({ custom: [saved('Cá hấp nhà làm'), saved('Gà luộc nhà làm')], overrides: {}, recent: [] });
    logLunch(1700); // 3000 − 1100 − 1700 = 200 kcal left
    mockDinner.mockResolvedValue({ ok: true, result: { options: [] } });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows what is left, the room in the limits and how the plan\'s dinner compares, from 15:00', async () => {
    const r = await mount(AT(16));
    const text = allText(r);
    expect(text).toContain('Gợi ý bữa tối');
    expect(text).toContain('Còn ~200 kcal và thiếu ~100 g đạm trong hôm nay.');
    expect(text).toContain('purine 800 mg · muối 5 g · đường 20 g');
    expect(text).toContain('nhiều hơn phần còn lại ~'); // 713 kcal plan dinner vs 200 left
    expect(mockDinner).not.toHaveBeenCalled(); // nothing is asked of the AI on its own
  });

  it('is hidden before 15:00, from 20:00, and once the plan\'s dinner is eaten', async () => {
    let r = await mount(AT(14, 59));
    expect(allText(r)).not.toContain('Gợi ý bữa tối');
    act(() => r.unmount());
    r = await mount(AT(20, 0));
    expect(allText(r)).not.toContain('Gợi ý bữa tối');
    act(() => r.unmount());
    const log = useNutritionStore.getState().logs[DATE];
    useNutritionStore.setState({ logs: { [DATE]: { ...log, mealsEaten: { meal3: true } } } });
    r = await mount(AT(17));
    expect(allText(r)).not.toContain('Gợi ý bữa tối');
  });

  it('says "light dinner" when almost no calories are left, and "fits" when the plan\'s dinner fits', async () => {
    logLunch(2880); // 20 kcal left
    let r = await mount(AT(17));
    expect(allText(r)).toContain('Gần hết ngân sách kcal');
    act(() => r.unmount());
    logLunch(300); // 1600 kcal left: the 713 kcal plan dinner fits
    r = await mount(AT(17));
    expect(allText(r)).toContain('vẫn vừa với phần còn lại');
  });

  it('lists dinner ideas from the user\'s own foods, no AI, and opens Add food with the idea filled in', async () => {
    logLunch(2200); // 3000 − 1100 − 2200 = −300 → light; ideas must be tiny and are computed from the saved foods
    useFoodDbStore.setState({ custom: [saved('Rau luộc nhà làm', { kcal: 120, proteinG: 35, purineMg: 20, sodiumMg: 50, group: 'vegetable' })] });
    const r = await mount(AT(17));
    const expected = dinnerIdeasFromFoods(buildDinnerBrief(AT(17))!, mergeFoods(useFoodDbStore.getState().custom, useFoodDbStore.getState().overrides));
    expect(expected.map((i) => i.name)).toContain('Rau luộc nhà làm');
    expect(allText(r)).toContain('Rau luộc nhà làm');
    expect(allText(r)).toContain('Từ cơ sở dữ liệu món ăn của bạn');
    expect(mockDinner).not.toHaveBeenCalled();
    const idea = expected.find((i) => i.name === 'Rau luộc nhà làm')!;
    await act(async () => find(r, 'Ghi món bữa tối: Rau luộc nhà làm')!.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/add-food',
      params: { name: 'Rau luộc nhà làm', calories: String(idea.calories), protein: String(idea.proteinG), purine: String(idea.purineMg), salt: String(idea.saltG), sugar: String(idea.sugarG), mealTime: 'dinner', from: 'db' },
    });
  });

  it('asks the AI only on request, sends what is left and the usual foods, and shows only the dinners that fit', async () => {
    logLunch(1700);
    mockDinner.mockResolvedValue({
      ok: true,
      result: { options: [
        { name: 'Cá hấp gừng + rau', calories: 180, proteinG: 35, purineMg: 200, saltG: 1, sugarG: 0, how: 'Hấp 10 phút.', accuracyPercent: 66 },
        { name: 'Cơm chiên', calories: 700, proteinG: 20, purineMg: 100, accuracyPercent: 80 }, // far more than the 200 kcal left: dropped
      ] },
    });
    const r = await mount(AT(17));
    await act(async () => find(r, 'Nhờ AI gợi ý bữa tối')!.props.onPress());
    const [brief, favorites] = mockDinner.mock.calls[0] as [Record<string, any>, string[]];
    expect(brief).toMatchObject({ budgetKcal: 200, proteinLeftG: 100, hour: 17, headroom: { purine: 800, salt: 5, sugar: 20 } });
    expect(Array.isArray(favorites)).toBe(true);
    const text = allText(r);
    expect(text).toContain('Cá hấp gừng + rau');
    expect(text).toContain('Độ chính xác ước tính: 66%');
    expect(text).toContain('Hấp 10 phút.');
    expect(text).toContain('do AI ước tính');
    expect(text).not.toContain('Cơm chiên');
    expect(find(r, 'Nhờ AI gợi ý bữa tối')).toBeUndefined(); // asked once for what is left now
    await act(async () => find(r, 'Ghi món bữa tối: Cá hấp gừng + rau')!.props.onPress());
    expect(mockRouter.push.mock.calls[0][0]).toMatchObject({ pathname: '/add-food', params: { name: 'Cá hấp gừng + rau', mealTime: 'dinner' } });
    expect((mockRouter.push.mock.calls[0][0] as { params: Record<string, string> }).params.from).toBeUndefined(); // not from the database
  });

  it('does not list an AI dinner that has the same name as one already listed from the database', async () => {
    logLunch(2200);
    useFoodDbStore.setState({ custom: [saved('Rau luộc nhà làm', { kcal: 120, proteinG: 35, purineMg: 20, sodiumMg: 50, group: 'vegetable' })] });
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Rau luộc nhà làm', calories: 120, proteinG: 35, accuracyPercent: 90 }] } });
    const r = await mount(AT(17));
    await act(async () => find(r, 'Nhờ AI gợi ý bữa tối')!.props.onPress());
    expect(allText(r)).toContain('Rau luộc nhà làm');
    expect(allText(r)).not.toContain('Độ chính xác ước tính: 90%'); // the AI copy was not listed next to the database one
  });

  it('forgets the AI\'s answer when something is logged (what is left changes), and can be asked again', async () => {
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Cá hấp gừng + rau', calories: 180, proteinG: 35, accuracyPercent: 66 }] } });
    const r = await mount(AT(17));
    await act(async () => find(r, 'Nhờ AI gợi ý bữa tối')!.props.onPress());
    expect(allText(r)).toContain('Cá hấp gừng + rau');
    await act(async () => {
      logLunch(1800); // 100 kcal left now
    });
    expect(allText(r)).not.toContain('Cá hấp gừng + rau');
    expect(find(r, 'Nhờ AI gợi ý bữa tối')).toBeDefined();
  });

  it.each([
    ['notConfigured', 'AI chưa được thiết lập'],
    ['quota', 'hết lượt AI hôm nay'],
    ['disabled', 'AI đang tắt'],
    ['offline', 'Không có mạng'],
  ] as Array<['notConfigured' | 'quota' | 'disabled' | 'offline', string]>)('shows a friendly message for a %s failure and keeps the numbers', async (kind, expected) => {
    mockDinner.mockResolvedValue({ ok: false, message: 'x', kind });
    const r = await mount(AT(17));
    await act(async () => find(r, 'Nhờ AI gợi ý bữa tối')!.props.onPress());
    expect(allText(r)).toContain(expected);
    expect(allText(r)).toContain('Còn ~200 kcal');
  });

  it('says so when neither the database nor the AI has a dinner that fits', async () => {
    useFoodDbStore.setState({ custom: [] });
    logLunch(2200);
    const r = await mount(AT(17));
    await act(async () => find(r, 'Nhờ AI gợi ý bữa tối')!.props.onPress());
    // The built-in database may or may not offer a tiny dish; with the AI giving nothing the card must not stay silent about it.
    const text = allText(r);
    expect(text.includes('Chưa tìm được món hợp') || text.includes('Từ cơ sở dữ liệu món ăn của bạn')).toBe(true);
  });

  it('ignores a second tap while the AI is being asked', async () => {
    let resolve!: (o: Outcome) => void;
    mockDinner.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const r = await mount(AT(17));
    await act(async () => find(r, 'Nhờ AI gợi ý bữa tối')!.props.onPress());
    await act(async () => find(r, 'Đang hỏi AI…')!.props.onPress());
    expect(mockDinner).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true, result: { options: [] } });
    });
  });
});

describe('Add food opened with a dinner idea', () => {
  let renderer: ReactTestRenderer | undefined;
  const input = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T17:10:00') });
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWeightStore.setState({ entries: [] });
    useWorkoutStore.setState({ entries: [] });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useNutritionStore.setState({ logs: {} });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });
  const mount = async () => {
    await act(async () => {
      renderer = create(<AddFoodScreen />);
    });
    return renderer!;
  };

  it('fills the form (name, figures, dinner) from the route and saves nothing until confirmed', async () => {
    mockParams = { name: 'Cá hấp gừng + rau', calories: '180', protein: '35', purine: '200', salt: '1', sugar: '0', mealTime: 'dinner' };
    const r = await mount();
    expect(input(r, 'Tên món').props.value).toBe('Cá hấp gừng + rau');
    expect(input(r, 'Calo (kcal)').props.value).toBe('180');
    expect(input(r, 'Đạm (g)').props.value).toBe('35');
    expect(input(r, 'Purine (mg)').props.value).toBe('200');
    expect(input(r, 'Muối (g)').props.value).toBe('1');
    expect(input(r, 'Đường tự do (g)').props.value).toBe('');
    expect(useNutritionStore.getState().logs[DATE]).toBeUndefined();
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    const items = useNutritionStore.getState().logs[DATE].extraItems;
    expect(items.map((i) => [i.name, i.calories, i.proteinG, i.mealTime])).toEqual([['Cá hấp gừng + rau', 180, 35, 'dinner']]);
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Cá hấp gừng + rau']); // an AI idea is remembered
  });

  it('an idea from the user\'s own database is not saved as a second food', async () => {
    useFoodDbStore.setState({ custom: [saved('Rau luộc nhà làm')] });
    mockParams = { name: 'Rau luộc nhà làm', calories: '120', protein: '35', from: 'db', mealTime: 'dinner' };
    const r = await mount();
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
  });

  it('ignores nonsense in the route and opens an empty form', async () => {
    mockParams = { name: '', calories: '99999999', protein: 'x', mealTime: 'brunch' };
    const r = await mount();
    expect(input(r, 'Tên món').props.value).toBe('');
    expect(input(r, 'Calo (kcal)').props.value).toBe('');
  });
});
