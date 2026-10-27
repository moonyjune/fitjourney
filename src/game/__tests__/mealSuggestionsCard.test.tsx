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

type Outcome = { ok: true; result: unknown } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'unreachable' | 'auth' | 'quota' | 'disabled' | 'generic' };
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
import { dinnerIdeasFromFoods } from '../../ai/dinner';
import { buildMealPlan, mealBrief } from '../../ai/mealSplit';
import { MealSuggestionsCard } from '../../components/quest/MealSuggestionsCard';
import type { FoodEntry } from '../../food/types';
import { mergeFoods, useFoodDbStore } from '../../store/useFoodDbStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useMealIdeasStore } from '../../store/useMealIdeasStore';
import { useMealModeStore } from '../../store/useMealModeStore';
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

describe('Meal suggestions card (Camp)', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (now: Date) => {
    await act(async () => {
      renderer = create(<MealSuggestionsCard now={now} />);
    });
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    useCookbookStore.setState({ recipes: [] });
    useMealIdeasStore.setState({ byDay: {} });
    useSettingsStore.setState({ language: 'vi', gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
    useMealModeStore.setState({ fasting: true });
    useFoodDbStore.setState({ custom: [saved('Cá hấp nhà làm'), saved('Gà luộc nhà làm')], overrides: {}, recent: [] });
    logLunch(1700); // 3000 − 1100 − 1700 = 200 kcal left
    mockDinner.mockResolvedValue({ ok: true, result: { options: [] } });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    useMealModeStore.setState({ fasting: true });
  });

  it('fasting: shows what is left, the room in the limits and how the plan\'s meals compare, from 11:00', async () => {
    logLunch(1000); // 1900 − 1000 = 900 kcal left
    const r = await mount(AT(16));
    const text = allText(r);
    expect(text).toContain('Gợi ý các bữa còn lại');
    expect(text).toContain('Còn ~900 kcal và thiếu ~100 g đạm trong hôm nay.');
    expect(text).toContain('purine 800 mg · muối 5 g · đường 20 g');
    expect(text).toContain('Chia ~900 kcal còn lại cho 2 bữa.'); // 16:10: the first plan meal is over
    expect(text).toContain('Phần của bữa này');
    expect(text).toMatch(/theo kế hoạch \(500 kcal\) nhiều hơn phần còn lại ~\d+ kcal/); // the plan's meal 2 is bigger than its ~371 kcal share
    expect(mockDinner).not.toHaveBeenCalled(); // nothing is asked of the AI on its own
  });

  it('is hidden before the window opens (fasting: 11:00), from 20:00, and once every meal is eaten', async () => {
    let r = await mount(AT(10, 59));
    expect(allText(r)).not.toContain('Gợi ý các bữa còn lại');
    act(() => r.unmount());
    r = await mount(AT(20, 0));
    expect(allText(r)).not.toContain('Gợi ý các bữa còn lại');
    act(() => r.unmount());
    const log = useNutritionStore.getState().logs[DATE];
    useNutritionStore.setState({ logs: { [DATE]: { ...log, mealsEaten: { meal1: true, meal2: true, meal3: true } } } });
    r = await mount(AT(17));
    expect(allText(r)).not.toContain('Gợi ý các bữa còn lại');
  });

  it('turning fasting off switches the card to a normal day: breakfast, lunch, dinner split over what is left, from the early morning', async () => {
    useMealModeStore.setState({ fasting: false });
    logLunch(100); // 1900 − 100 = 1800 kcal left in total
    let r = await mount(AT(8));
    let text = allText(r);
    expect(text).toContain('Bữa sáng');
    expect(text).toContain('Bữa trưa');
    expect(text).toContain('Bữa tối');
    expect(text).toContain('Chia ~1800 kcal còn lại cho 3 bữa.');
    act(() => r.unmount());
    r = await mount(AT(16)); // lunch time is over: dinner alone gets everything
    text = allText(r);
    expect(text).toContain('Bữa tối');
    expect(text).not.toContain('Bữa sáng');
    expect(text).not.toContain('Chia ~');
    act(() => r.unmount());
    r = await mount(AT(5, 30)); // a normal day starts early: the card is already open
    expect(allText(r)).toContain('Bữa sáng');
  });

  it('a small budget is folded into fewer meals and the card says which ones were folded', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 600 }); // nothing eaten: 600 kcal left for the whole day
    let r = await mount(AT(8));
    let text = allText(r);
    expect(text).toContain('Gộp Bữa sáng vào các bữa sau vì chỉ còn ~600 kcal.');
    expect(text).toContain('Chia ~600 kcal còn lại cho 2 bữa.'); // lunch 280 and dinner 320
    expect(text).toContain('Bữa trưa · 12:00');
    expect(text).toContain('Bữa tối · 18:30');
    expect(text).not.toContain('Bữa sáng · 07:00');
    act(() => r.unmount());
    useSettingsStore.setState({ calorieTargetKcal: 400 });
    r = await mount(AT(8));
    text = allText(r);
    expect(text).toContain('Gộp Bữa sáng, Bữa trưa vào các bữa sau vì chỉ còn ~400 kcal.');
    expect(text).toContain('Bữa tối · 18:30');
    expect(text).not.toContain('Chia ~'); // one meal: nothing to split
  });

  it('lists ideas from the user\'s own foods for each meal, sized to its share, and opens Add food filed under that meal', async () => {
    useMealModeStore.setState({ fasting: false });
    logLunch(1900); // 3000 − 1100 − 1900 = 0 → raise it: 100 kcal means one light meal; use 1000 left instead
    logLunch(900); // 1000 kcal left
    useFoodDbStore.setState({ custom: [saved('Rau luộc nhà làm', { kcal: 120, proteinG: 35, purineMg: 20, sodiumMg: 50, group: 'vegetable' })] });
    const r = await mount(AT(16)); // dinner only: all 1000 kcal
    const plan = buildMealPlan(AT(16))!;
    const brief = mealBrief(plan.totals, plan.split.meals[0]);
    const expected = dinnerIdeasFromFoods(brief, mergeFoods(useFoodDbStore.getState().custom, useFoodDbStore.getState().overrides)).slice(0, 2);
    expect(expected.length).toBeGreaterThan(0);
    for (const idea of expected) expect(allText(r)).toContain(idea.name);
    expect(allText(r)).toContain('Từ cơ sở dữ liệu món ăn của bạn');
    const first = expected[0];
    await act(async () => find(r, `Ghi món bữa tối: ${first.name}`)!.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/add-food',
      params: { name: first.name, calories: String(first.calories), protein: String(first.proteinG), purine: String(first.purineMg), salt: String(first.saltG), sugar: String(first.sugarG), mealTime: 'dinner', from: 'db' },
    });
  });

  it('asks the AI for ONE meal on request, with that meal\'s share, kind and eat-by hour, and shows only ideas that fit that share', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 2800 }); // 2800 kcal left, three meals at 8:00
    mockDinner.mockResolvedValue({
      ok: true,
      result: { options: [
        { name: 'Trứng ốp la + bánh mì', calories: 650, proteinG: 30, purineMg: 100, saltG: 1.5, sugarG: 2, how: 'Chiên 5 phút.', accuracyPercent: 70 },
        { name: 'Phở bò tô lớn', calories: 1500, proteinG: 60, accuracyPercent: 80 }, // far over the breakfast share: dropped
      ] },
    });
    const r = await mount(AT(8));
    await act(async () => find(r, 'Nhờ AI gợi ý Bữa sáng')!.props.onPress());
    expect(mockDinner).toHaveBeenCalledTimes(1);
    const [brief] = mockDinner.mock.calls[0] as [Record<string, any>];
    expect(brief).toMatchObject({ meal: 'breakfast', hour: 7, eatByHour: 11, budgetKcal: 600 }); // 2800 × .25 = 700, capped at 600 per meal
    const text = allText(r);
    expect(text).toContain('Trứng ốp la + bánh mì');
    expect(text).toContain('Chiên 5 phút.');
    expect(text).not.toContain('Phở bò tô lớn');
    expect(find(r, 'Nhờ AI gợi ý Bữa sáng')).toBeUndefined(); // asked once for this meal
    expect(find(r, 'Nhờ AI gợi ý Bữa trưa')).toBeDefined(); // the other meals can still be asked
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('says a plan meal still fits when the share is big enough', async () => {
    const r = await mount(AT(16)); // 1700 eaten: 200 left… make it plenty: nothing eaten
    act(() => r.unmount());
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 3000 });
    const again = await mount(AT(16)); // 3000 left over meal 2 and 3: shares well above the plan's 500 / 713
    expect(allText(again)).toContain('theo kế hoạch (500 kcal) vẫn vừa với phần còn lại');
    expect(allText(again)).toContain('nhiều hơn phần còn lại ~113 kcal'); // the dinner (713) only exceeds the 600 kcal cap of one meal
  });

  it('does not list an AI idea that has the same name as one already listed from the user\'s foods', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 2800 });
    useFoodDbStore.setState({ custom: [saved('Trứng chiên nhà làm', { kcal: 600, proteinG: 200, purineMg: 50, sodiumMg: 100, group: 'eggDairy' })] }); // the best fit for breakfast, so it is listed from the database
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Trứng chiên nhà làm', calories: 600, proteinG: 30, accuracyPercent: 91 }] } });
    const r = await mount(AT(8));
    await act(async () => find(r, 'Nhờ AI gợi ý Bữa sáng')!.props.onPress());
    expect(allText(r)).toContain('Trứng chiên nhà làm');
    expect(allText(r)).not.toContain('Độ chính xác ước tính: 91%');
  });

  it('keeps the AI\'s answers when the page is reloaded, hides the ones that no longer fit, and does not ask again', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 2800 });
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Trứng ốp la + bánh mì', calories: 650, proteinG: 30, accuracyPercent: 70 }] } });
    const r = await mount(AT(8));
    await act(async () => find(r, 'Nhờ AI gợi ý Bữa sáng')!.props.onPress());
    expect(allText(r)).toContain('Trứng ốp la + bánh mì');
    expect(mockDinner).toHaveBeenCalledTimes(1);

    // "Reload": the card is built again from nothing but what was stored.
    act(() => renderer?.unmount());
    const again = await mount(AT(8));
    expect(allText(again)).toContain('Trứng ốp la + bánh mì');
    expect(find(again, 'Nhờ AI gợi ý Bữa sáng')).toBeUndefined(); // already asked
    expect(mockDinner).toHaveBeenCalledTimes(1);

    // Later in the day, with much less left, the stored idea is not offered any more (and is not asked for again either).
    await act(async () => {
      logLunch(1700);
    });
    expect(allText(again)).not.toContain('Đã lưu vào cook book'); // the AI list is hidden; the dish may still come from the cook book for a later meal
    expect(allText(again)).not.toContain('Độ chính xác ước tính: 70%');
  });

  it('saves every AI idea into the cook book (once) and offers cook book dishes that fit, without the AI', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 2800 });
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Trứng ốp la + bánh mì', calories: 650, proteinG: 30, accuracyPercent: 70, steps: ['Đập trứng', 'Chiên trứng'], ingredients: [{ name: 'Trứng', quantity: '2 quả' }], minutes: 10, difficulty: 1 }] } });
    const r = await mount(AT(8));
    await act(async () => find(r, 'Nhờ AI gợi ý Bữa sáng')!.props.onPress());
    const book = useCookbookStore.getState().recipes;
    expect(book).toHaveLength(1);
    expect(book[0]).toMatchObject({ name: 'Trứng ốp la + bánh mì', source: 'ai', minutes: 10, difficulty: 1, steps: ['Đập trứng', 'Chiên trứng'] });
    expect(allText(r)).toContain('Cook book (1 món)');

    // A new day with nothing asked: the dish comes from the cook book, no AI call.
    useMealIdeasStore.setState({ byDay: {} });
    mockDinner.mockClear();
    act(() => renderer?.unmount());
    const next = await mount(AT(8));
    expect(allText(next)).toContain('Trứng ốp la + bánh mì');
    expect(allText(next)).toContain('Từ cook book');
    expect(mockDinner).not.toHaveBeenCalled();
  });

  it('asks for other dishes: sends the cook book and the dishes on screen to avoid, and shows only new ones', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 2800 });
    mockDinner.mockResolvedValueOnce({ ok: true, result: { options: [{ name: 'Món một', calories: 650, proteinG: 30, accuracyPercent: 70 }] } });
    const r = await mount(AT(8));
    await act(async () => find(r, 'Nhờ AI gợi ý Bữa sáng')!.props.onPress());
    mockDinner.mockResolvedValueOnce({ ok: true, result: { options: [{ name: 'Món một', calories: 650, proteinG: 30, accuracyPercent: 70 }, { name: 'Món hai', calories: 640, proteinG: 30, accuracyPercent: 70 }] } });
    await act(async () => find(r, 'Gợi ý món khác: Bữa sáng')!.props.onPress());
    expect((mockDinner.mock.calls[1] as unknown[])[2]).toEqual(expect.arrayContaining(['Món một']));
    expect(allText(r)).toContain('Món hai');
    expect(useCookbookStore.getState().recipes.map((x) => x.name).sort()).toEqual(['Món hai', 'Món một']);
  });

  it('opens a dialog with the recipe, and the user can rate the dish', async () => {
    useMealModeStore.setState({ fasting: false });
    useNutritionStore.setState({ logs: {} });
    useSettingsStore.setState({ calorieTargetKcal: 2800 });
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Cá hấp gừng', calories: 650, proteinG: 30, accuracyPercent: 70, emoji: '🐟', steps: ['Rửa cá', 'Hấp cá 10 phút'], ingredients: [{ name: 'Cá', quantity: '200g' }], minutes: 20, difficulty: 2, equipment: ['nồi hấp'] }] } });
    const r = await mount(AT(8));
    await act(async () => find(r, 'Nhờ AI gợi ý Bữa sáng')!.props.onPress());
    await act(async () => find(r, 'Xem công thức: Cá hấp gừng')!.props.onPress());
    const text = allText(r);
    expect(text).toContain('NGUYÊN LIỆU');
    expect(text).toContain('Cá — 200g');
    expect(text).toContain('CÁCH NẤU');
    expect(text).toContain('1. Rửa cá');
    expect(text).toContain('20 phút');
    expect(text).toContain('★★☆☆☆'); // difficulty 2
    expect(text).toContain('PHÂN TÍCH DINH DƯỠNG');
    await act(async () => find(r, 'Chấm 4 sao')!.props.onPress());
    expect(useCookbookStore.getState().recipes[0].rating).toBe(4);
  });

  it.each([
    ['notConfigured', 'AI chưa được thiết lập'],
    ['quota', 'hết lượt AI hôm nay'],
    ['disabled', 'AI đang tắt'],
    ['offline', 'Không có mạng'],
    ['unreachable', 'Chưa kết nối được dịch vụ AI'],
  ] as Array<['notConfigured' | 'quota' | 'disabled' | 'offline' | 'unreachable', string]>)('shows a friendly message under the meal for a %s failure and keeps the numbers', async (kind, expected) => {
    mockDinner.mockResolvedValue({ ok: false, message: 'x', kind });
    const r = await mount(AT(17));
    const ask = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Nhờ AI gợi ý'))[0];
    await act(async () => ask.props.onPress());
    expect(allText(r)).toContain(expected);
    expect(allText(r)).toContain('Còn ~200 kcal');
  });

  it('ignores a second tap while the AI is being asked', async () => {
    let resolve!: (o: Outcome) => void;
    mockDinner.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const r = await mount(AT(17));
    const ask = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Nhờ AI gợi ý'))[0];
    await act(async () => ask.props.onPress());
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

describe('Time eaten box on the entry screens', () => {
  let renderer: ReactTestRenderer | undefined;
  const input = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T23:05:00') });
    jest.clearAllMocks();
    mockParams = {};
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
  const type = async (r: ReactTestRenderer, label: string, v: string) => {
    await act(async () => input(r, label).props.onChangeText(v));
  };
  const saved1 = () => useNutritionStore.getState().logs[DATE].extraItems[0];
  const hhmm = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}`;
  const fill = async (r: ReactTestRenderer) => {
    await type(r, 'Tên món', 'Cơm gà');
    await type(r, 'Calo (kcal)', '600');
  };
  const chip = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];

  it('shows the picked meal\'s usual time as the placeholder, and with nothing typed files the food at that time (a lunch entered at 23:05 is 12:00)', async () => {
    const r = await mount();
    expect(input(r, 'Giờ ăn (tuỳ chọn)').props.placeholder).toBe('23:05'); // no meal yet: the moment of entry
    await act(async () => chip(r, 'Trưa').props.onPress());
    expect(input(r, 'Giờ ăn (tuỳ chọn)').props.placeholder).toBe('12:00');
    await fill(r);
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(hhmm(saved1().loggedAtISO)).toBe('12:00');
  });

  it('the time typed wins: a dinner at 20:30', async () => {
    const r = await mount();
    await act(async () => chip(r, 'Tối').props.onPress());
    await fill(r);
    await type(r, 'Giờ ăn (tuỳ chọn)', '20h30');
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(hhmm(saved1().loggedAtISO)).toBe('20:30');
    expect(saved1().mealTime).toBe('dinner');
  });

  it('a time that is not a time is flagged and nothing is saved until it is fixed or emptied', async () => {
    const r = await mount();
    await fill(r);
    await type(r, 'Giờ ăn (tuỳ chọn)', '25:99');
    expect(allText(r)).toContain('Giờ chưa đúng');
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(useNutritionStore.getState().logs[DATE]).toBeUndefined();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await type(r, 'Giờ ăn (tuỳ chọn)', '');
    expect(allText(r)).not.toContain('Giờ chưa đúng');
    await act(async () => find(r, 'Thêm vào hôm nay')!.props.onPress());
    expect(hhmm(saved1().loggedAtISO)).toBe('23:05'); // no meal, no time: the moment of entry
  });
});
