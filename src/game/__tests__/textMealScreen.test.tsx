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
const mockPersist = jest.fn<(...a: unknown[]) => Promise<string | undefined>>();
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: (...a: unknown[]) => mockPersist(...a), deletePersistedPhoto: jest.fn(async () => undefined) }));

type Outcome = { ok: true; result: Record<string, unknown> } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'unreachable' | 'auth' | 'generic' };
const mockText = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
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
  requestMealText: (...a: unknown[]) => mockText(...a),
}));

import TextMealScreen from '../../../app/text-meal';
import { useAiCalibrationStore } from '../../store/useAiCalibrationStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const DATE = '2026-10-23';
const ANALYZE = 'Phân tích bằng AI';

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
  const f = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!f) throw new Error(`no pressable "${label}"`);
  return f;
};
const input = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const f = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  if (!f) throw new Error(`no input "${label}"`);
  return f;
};

const PHO = { name: 'Phở bò (2 bát)', caloriesKcal: 820, proteinG: 48, purineMg: 210, saltG: 4.6, sugarG: 4, accuracyPercent: 62 };
const TEA = { name: 'Trà đá ít đường', caloriesKcal: 25, proteinG: 0, sugarG: 6, accuracyPercent: 80 };
const OK = { items: [PHO, TEA], mealTime: 'lunch', accuracyPercent: 66.4, reasoning: 'Giả định bát phở vừa.' };

describe('Log food by text', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<TextMealScreen />);
    });
    return renderer!;
  };
  const press = async (r: ReactTestRenderer, label: string) => {
    await act(async () => {
      pressable(r, label).props.onPress();
    });
  };
  const type = async (r: ReactTestRenderer, label: string, v: string) => {
    await act(async () => input(r, label).props.onChangeText(v));
  };
  const items = () => useNutritionStore.getState().logs[DATE]?.extraItems ?? [];

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockText.mockResolvedValue({ ok: true, result: OK });
    mockPersist.mockResolvedValue('file:///docs/proofs/extra-1.jpg');
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useWorkoutStore.setState({ entries: [] });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useAiCalibrationStore.getState().clear();
    useNutritionStore.setState({ logs: {} });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('asks for text first, and sends the sentence with body data and the coach snapshot', async () => {
    const r = await mount();
    await press(r, ANALYZE);
    expect(mockText).not.toHaveBeenCalled();
    expect(allText(r)).toContain('Hãy nhập những gì bạn đã ăn.');
    await type(r, 'Bạn đã ăn gì?', '  2 bát phở bò, 1 ly trà đá ít đường ');
    await press(r, ANALYZE);
    expect(mockText).toHaveBeenCalledTimes(1);
    const [sentence, profile, coach] = mockText.mock.calls[0] as [string, Record<string, unknown>, Record<string, any>];
    expect(sentence).toBe('2 bát phở bò, 1 ly trà đá ít đường');
    expect(profile).toMatchObject({ weightKg: 106.2, heightCm: 172 });
    expect(coach.now).toMatchObject({ date: DATE, time: '16:10' });
  });

  it('shows one editable line per food with its own accuracy and the overall accuracy, and saves nothing yet', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', '2 bát phở bò, 1 ly trà đá ít đường');
    await press(r, ANALYZE);
    expect((input(r, 'Tên món 1')).props.value).toBe('Phở bò (2 bát)');
    expect(input(r, 'Calo (kcal) món 1').props.value).toBe('820');
    expect(input(r, 'Đạm (g) món 1').props.value).toBe('48');
    expect(input(r, 'Tên món 2').props.value).toBe('Trà đá ít đường');
    const text = allText(r);
    expect(text).toContain('Độ chính xác ước tính: 66%');
    expect(text).toContain('Chính xác ~62%');
    expect(text).toContain('Chính xác ~80%');
    expect(text).toContain('Giả định bát phở vừa.');
    expect(text).toContain('Kiểm tra và sửa từng món trước khi lưu.');
    expect(text).toContain('Thêm bữa ăn vào hôm nay');
    // The lines are the parts of ONE meal: a single description (the names joined) and the totals.
    expect(input(r, 'Mô tả bữa ăn (một mô tả chung)').props.value).toBe('Phở bò (2 bát), Trà đá ít đường');
    expect(text).toContain('Tổng: 845 kcal · 48 g đạm · purine 210 mg · muối 4.6 g · đường 10 g');
    expect(items()).toHaveLength(0);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('saves ONE meal: the joined description, the totals of the lines as edited, the AI\'s meal time, the lines as its parts, and remembers it as a food', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Calo (kcal) món 1', '700');
    await type(r, 'Tên món 2', 'Trà đá không đường');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ name: 'Phở bò (2 bát), Trà đá không đường', calories: 725, proteinG: 48, mealTime: 'lunch', purineMg: 210, saltG: 4.6, sugarG: 10 });
    expect(items()[0].parts?.map((p) => [p.name, p.calories, p.proteinG])).toEqual([['Phở bò (2 bát)', 700, 48], ['Trà đá không đường', 25, 0]]);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Phở bò (2 bát), Trà đá không đường']);
  });

  it('the description can be rewritten; an emptied one falls back to the joined names; one food has no parts', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Mô tả bữa ăn (một mô tả chung)', 'Bữa trưa ở quán quen');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items()[0].name).toBe('Bữa trưa ở quán quen');
    expect(items()[0].parts).toHaveLength(2);
    useNutritionStore.setState({ logs: {} });
    const again = await mount();
    await type(again, 'Bạn đã ăn gì?', 'phở và trà');
    await press(again, ANALYZE);
    await type(again, 'Mô tả bữa ăn (một mô tả chung)', '   ');
    await press(again, 'Thêm bữa ăn vào hôm nay');
    expect(items()[0].name).toBe('Phở bò (2 bát), Trà đá ít đường');
  });

  it('one food taken unchanged from the user\'s database adds nothing new; the same food under a rewritten description is a new meal that is remembered', async () => {
    useFoodDbStore.setState({
      custom: [{ id: 'c1', name: 'Bún riêu nhà nấu', group: 'soup', unit: 'phần', unitG: 100, kcal: 450, proteinG: 25, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true }],
    });
    let r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
    act(() => r.unmount());
    useNutritionStore.setState({ logs: {} });
    r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    await type(r, 'Mô tả bữa ăn (một mô tả chung)', 'Bún riêu quán góc phố');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Bún riêu nhà nấu', 'Bún riêu quán góc phố']);
  });

  it('attaches the photo to the meal (one photo for the whole entry)', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    const picker = r.root.findAll((n) => typeof n.props.onChange === 'function' && 'uri' in n.props && 'disabled' in n.props)[0];
    await act(async () => picker.props.onChange('file:///tmp/pick.jpg'));
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(mockPersist).toHaveBeenCalledWith('file:///tmp/pick.jpg', expect.stringContaining('extra-'));
    expect(items()).toHaveLength(1);
    expect(items()[0].photoUri).toBe('file:///docs/proofs/extra-1.jpg');
  });

  it('lets a line be removed, and leaves out lines with neither calories nor protein', async () => {
    mockText.mockResolvedValue({ ok: true, result: { ...OK, items: [PHO, TEA, { name: 'Nước lọc', caloriesKcal: 0, proteinG: 0, accuracyPercent: 90 }] } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'x');
    await press(r, ANALYZE);
    expect(input(r, 'Mô tả bữa ăn (một mô tả chung)').props.value).toBe('Phở bò (2 bát), Trà đá ít đường'); // the water line has no figures
    await press(r, 'Bỏ món 2');
    expect(input(r, 'Mô tả bữa ăn (một mô tả chung)').props.value).toBe('Phở bò (2 bát)');
    expect(allText(r)).toContain('Tổng: 820 kcal');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items().map((i) => i.name)).toEqual(['Phở bò (2 bát)']);
    expect(items()[0].parts).toBeUndefined(); // one food: no breakdown
  });

  it('says so, and offers no save, when the AI finds no food', async () => {
    mockText.mockResolvedValue({ ok: true, result: { items: [], reasoning: 'Không phải đồ ăn.' } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'hôm nay trời đẹp');
    await press(r, ANALYZE);
    expect(allText(r)).toContain('AI không thấy món ăn nào');
    expect(r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Thêm ')).length).toBe(0);
  });

  it('does not call the AI when every food is already in the user\'s database, and those figures are used', async () => {
    useFoodDbStore.setState({
      custom: [
        { id: 'c1', name: 'Bún riêu nhà nấu', group: 'soup', unit: 'phần', unitG: 100, kcal: 450, proteinG: 25, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true },
        { id: 'c2', name: 'Chè đậu xanh nhà nấu', group: 'drink', unit: 'phần', unitG: 100, kcal: 5, proteinG: 0, purineMg: 0, sugarG: 0, sodiumMg: 0, note: '', confidence: 'low', auto: true },
      ],
    });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'BUN RIEU NHA NAU, che dau xanh nha nau');
    await press(r, ANALYZE);
    expect(mockText).not.toHaveBeenCalled();
    expect(allText(r)).toContain('không cần hỏi AI');
    expect(allText(r)).toContain('Từ cơ sở dữ liệu của bạn');
    expect(input(r, 'Calo (kcal) món 1').props.value).toBe('450');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items().map((i) => [i.name, i.calories])).toEqual([['Bún riêu nhà nấu, Chè đậu xanh nhà nấu', 455]]);
    expect(items()[0].parts?.map((p) => p.name)).toEqual(['Bún riêu nhà nấu', 'Chè đậu xanh nhà nấu']);
    expect(useFoodDbStore.getState().custom).toHaveLength(3); // the two foods stay, and the whole meal is remembered once
  });

  it('a line taken from the database and then renamed counts as a new food and is remembered under its new name', async () => {
    useFoodDbStore.setState({
      custom: [{ id: 'c1', name: 'Bún riêu nhà nấu', group: 'soup', unit: 'phần', unitG: 100, kcal: 450, proteinG: 25, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true }],
    });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    await type(r, 'Tên món 1', 'Bún riêu ít muối');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Bún riêu nhà nấu', 'Bún riêu ít muối']);
  });

  it('remembers the AI calories of each AI line next to what was saved (not the database lines)', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Calo (kcal) món 1', '700');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(useAiCalibrationStore.getState().estimates).toEqual([{ ai: 820, final: 700 }, { ai: 25, final: 25 }]);
  });

  it('shows how far off the AI has been once there is enough history', async () => {
    for (const [ai, final] of [[100, 100], [100, 100], [100, 100], [130, 100], [100, 100]]) useAiCalibrationStore.getState().record(ai, final);
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'x');
    await press(r, ANALYZE);
    expect(allText(r)).toContain('Trước đây AI lệch trung bình ~0% so với số bạn chốt (5 lần).');
  });

  it('files every line at the meal\'s usual time (a lunch typed at 16:10 is 12:00), or at the exact time typed, and refuses a bad time', async () => {
    const hhmm = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}`;
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    expect(input(r, 'Giờ ăn (tuỳ chọn)').props.placeholder).toBe('12:00'); // the AI said lunch
    await type(r, 'Giờ ăn (tuỳ chọn)', '9:61');
    expect(allText(r)).toContain('Giờ chưa đúng');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items()).toHaveLength(0); // nothing is saved with a bad time
    await type(r, 'Giờ ăn (tuỳ chọn)', '');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items().map((i) => hhmm(i.loggedAtISO))).toEqual(['12:00']);
  });

  it('an exact time typed applies to the whole meal (and so to all its parts)', async () => {
    const hhmm = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}`;
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Giờ ăn (tuỳ chọn)', '13:15');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(items().map((i) => hhmm(i.loggedAtISO))).toEqual(['13:15']);
    expect(items()[0].parts).toHaveLength(2);
  });

  it('shows the advice for the rest of the day', async () => {
    mockText.mockResolvedValue({ ok: true, result: { ...OK, advice: { verdict: 'over', summary: 'Bữa này nhiều muối.', nextSteps: ['Uống thêm nước.'], remainingKcalToEat: 300, remainingProteinG: 40, extraBurnKcal: 120, bossNote: 'Cần 1000 mỗi ngày.' } } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'x');
    await press(r, ANALYZE);
    const text = allText(r);
    expect(text).toContain('Gợi ý cho phần còn lại của ngày');
    expect(text).toContain('Vượt giới hạn: Bữa này nhiều muối.');
    expect(text).toContain('Còn ăn được ~300 kcal');
  });

  it.each([
    ['notConfigured', 'AI chưa được thiết lập'],
    ['offline', 'Không có mạng'],
    ['unreachable', 'Chưa kết nối được dịch vụ AI'],
    ['auth', 'Phiên đăng nhập không hợp lệ'],
    ['generic', 'Chưa phân tích được'],
  ] as Array<['notConfigured' | 'offline' | 'unreachable' | 'auth' | 'generic', string]>)('shows a friendly message for a %s failure and keeps the text', async (kind, expected) => {
    mockText.mockResolvedValue({ ok: false, message: 'x', kind });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở');
    await press(r, ANALYZE);
    expect(allText(r)).toContain(expected);
    expect(input(r, 'Bạn đã ăn gì?').props.value).toBe('phở');
  });

  it('ignores a second tap while the first analysis is running', async () => {
    let resolve!: (o: Outcome) => void;
    mockText.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở');
    await act(async () => {
      pressable(r, ANALYZE).props.onPress();
    });
    await act(async () => {
      pressable(r, 'Đang phân tích…').props.onPress();
    });
    expect(mockText).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, result: OK }));
    expect(input(r, 'Tên món 1')).toBeDefined();
  });

  it('refuses to save when no line has calories or protein', async () => {
    mockText.mockResolvedValue({ ok: true, result: { ...OK, items: [PHO] } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'x');
    await press(r, ANALYZE);
    await type(r, 'Calo (kcal) món 1', '');
    await type(r, 'Đạm (g) món 1', '');
    await press(r, 'Thêm bữa ăn vào hôm nay');
    expect(allText(r)).toContain('Chưa có món nào có calo hoặc đạm để lưu.');
    expect(items()).toHaveLength(0);
  });
});
