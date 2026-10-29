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
const mockToBase64 = jest.fn(async (uri: string) => ({ base64: `B64:${uri}`, mediaType: 'image/jpeg' }));
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: (...a: unknown[]) => mockPersist(...a),
  deletePersistedPhoto: jest.fn(async () => undefined),
  imageUriToBase64: (uri: string) => mockToBase64(uri),
}));
const mockPickOne = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockPickMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../utils/pickPhoto', () => ({ pickPhoto: (...a: unknown[]) => mockPickOne(...a), pickPhotos: (...a: unknown[]) => mockPickMany(...a) }));

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

import TextMealScreen from '../../../app/add-food';
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

describe('Add food: description, photos and AI in one screen', () => {
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
    expect(allText(r)).toContain('Hãy mô tả món đã ăn');
    await type(r, 'Bạn đã ăn gì?', '  2 tô mì quảng, 1 ly trà đá ít đường ');
    await press(r, ANALYZE);
    expect(mockText).toHaveBeenCalledTimes(1);
    const [sentence, profile, coach] = mockText.mock.calls[0] as [string, Record<string, unknown>, Record<string, any>];
    expect(sentence).toBe('2 tô mì quảng, 1 ly trà đá ít đường');
    expect(profile).toMatchObject({ weightKg: 106.2, heightCm: 172 });
    expect(coach.now).toMatchObject({ date: DATE, time: '16:10' });
    expect(mockText.mock.calls[0]).toHaveLength(4);
    expect(mockText.mock.calls[0][3]).toBeUndefined(); // text only: no photos, so the request is exactly as before
    expect(mockToBase64).not.toHaveBeenCalled();
  });

  it('attaches up to 3 photos (library and camera), lets one be removed, and sends the rest with the text', async () => {
    mockPickMany.mockResolvedValueOnce({ uris: ['file:///a.jpg', 'file:///b.jpg'] });
    mockPickOne.mockResolvedValueOnce({ uri: 'file:///c.jpg' });
    const r = await mount();
    expect(allText(r)).toContain('ẢNH MÓN ĂN');
    await press(r, 'Chọn ảnh');
    expect(mockPickMany).toHaveBeenCalledWith(3);
    await press(r, 'Chụp ảnh');
    expect(mockPickOne).toHaveBeenCalledWith('camera');
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Ảnh món ăn đã chọn 3' && n.props.source).length).toBeGreaterThan(0);
    expect(allText(r)).toContain('Đã đủ 3 ảnh.');
    expect(pressable(r, 'Chọn ảnh').props.disabled).toBe(true);
    await press(r, 'Xóa ảnh 2');
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Ảnh món ăn đã chọn 3' && n.props.source)).toHaveLength(0);
    expect(allText(r)).toContain('2/3 ảnh');
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    expect(mockToBase64.mock.calls.map((c) => c[0])).toEqual(['file:///a.jpg', 'file:///c.jpg']);
    const [sentence, , , images] = mockText.mock.calls[0] as [string, unknown, unknown, unknown];
    expect(sentence).toBe('phở và trà');
    expect(images).toEqual([
      { base64: 'B64:file:///a.jpg', mediaType: 'image/jpeg' },
      { base64: 'B64:file:///c.jpg', mediaType: 'image/jpeg' },
    ]);
    // The first attached photo becomes the meal's photo (still changeable before saving).
    await press(r, 'Thêm vào hôm nay');
    expect(mockPersist).toHaveBeenCalledWith('file:///a.jpg', expect.stringContaining('extra-'));
  });

  it('photos alone (no text) are enough, and with photos the database shortcut is skipped', async () => {
    useFoodDbStore.setState({
      custom: [{ id: 'c1', name: 'Bún riêu nhà nấu', group: 'soup', unit: 'phần', unitG: 100, kcal: 450, proteinG: 25, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true }],
    });
    mockPickMany.mockResolvedValueOnce({ uris: ['file:///a.jpg'] });
    const r = await mount();
    await press(r, 'Chọn ảnh');
    await press(r, ANALYZE);
    expect(mockText).toHaveBeenCalledTimes(1);
    expect(mockText.mock.calls[0][0]).toBe('');
    expect(mockText.mock.calls[0][3]).toEqual([{ base64: 'B64:file:///a.jpg', mediaType: 'image/jpeg' }]);
    mockText.mockClear();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    expect(mockText).toHaveBeenCalledTimes(1); // a known food still goes to the AI when photos are attached
    expect(mockText.mock.calls[0][0]).toBe('bun rieu nha nau');
  });

  it('a cancelled or failed pick changes nothing', async () => {
    mockPickMany.mockResolvedValueOnce(null);
    mockPickOne.mockResolvedValueOnce({ error: 'failed' });
    const r = await mount();
    await press(r, 'Chọn ảnh');
    await press(r, 'Chụp ảnh');
    expect(allText(r)).toContain('Không lấy được ảnh.');
    await type(r, 'Bạn đã ăn gì?', 'phở');
    await press(r, ANALYZE);
    expect(mockText.mock.calls[0][3]).toBeUndefined();
  });

  it('shows one editable line per food with its own accuracy and the overall accuracy, and saves nothing yet', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', '2 tô mì quảng, 1 ly trà đá ít đường');
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
    expect(text).toContain('Kiểm tra từng món');
    expect(text).toContain('Thêm vào hôm nay');
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
    await press(r, 'Thêm vào hôm nay');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ name: 'Phở bò (2 bát), Trà đá không đường', calories: 725, proteinG: 48, mealTime: 'lunch', purineMg: 210, saltG: 4.6, sugarG: 10 });
    expect(items()[0].parts?.map((p) => [p.name, p.calories, p.proteinG])).toEqual([['Phở bò (2 bát)', 700, 48], ['Trà đá không đường', 25, 0]]);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Trà đá không đường']) // each new food on its own; "Phở bò" is already in the database;
  });

  it('the description can be rewritten; an emptied one falls back to the joined names; one food has no parts', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Mô tả bữa ăn (một mô tả chung)', 'Bữa trưa ở quán quen');
    await press(r, 'Thêm vào hôm nay');
    expect(items()[0].name).toBe('Bữa trưa ở quán quen');
    expect(items()[0].parts).toHaveLength(2);
    useNutritionStore.setState({ logs: {} });
    const again = await mount();
    await type(again, 'Bạn đã ăn gì?', 'phở và trà');
    await press(again, ANALYZE);
    await type(again, 'Mô tả bữa ăn (một mô tả chung)', '   ');
    await press(again, 'Thêm vào hôm nay');
    expect(items()[0].name).toBe('Phở bò (2 bát), Trà đá ít đường');
  });

  it('one food taken unchanged from the user\'s database adds nothing new; the same food under a rewritten description is a new meal that is remembered', async () => {
    useFoodDbStore.setState({
      custom: [{ id: 'c1', name: 'Bún riêu nhà nấu', group: 'soup', unit: 'phần', unitG: 100, kcal: 450, proteinG: 25, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true }],
    });
    let r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    await press(r, 'Thêm vào hôm nay');
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
    act(() => r.unmount());
    useNutritionStore.setState({ logs: {} });
    r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    await type(r, 'Tên món', 'Bún riêu quán góc phố'); // one food: its name is the meal's description
    await press(r, 'Thêm vào hôm nay');
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Bún riêu nhà nấu', 'Bún riêu quán góc phố']);
  });

  it('a photo added after the analysis is saved with the meal', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    mockPickMany.mockResolvedValueOnce({ uris: ['file:///tmp/pick.jpg'] });
    await press(r, 'Chọn ảnh');
    await press(r, 'Thêm vào hôm nay');
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
    expect(allText(r)).not.toContain('Mô tả bữa ăn (một mô tả chung)'); // one food left: its name is the description
    await press(r, 'Thêm vào hôm nay');
    expect(items().map((i) => i.name)).toEqual(['Phở bò (2 bát)']);
    expect(items()[0].parts).toBeUndefined(); // one food: no breakdown
  });

  it('says so, and offers no save, when the AI finds no food', async () => {
    mockText.mockResolvedValue({ ok: true, result: { items: [], reasoning: 'Không phải đồ ăn.' } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'hôm nay trời đẹp');
    await press(r, ANALYZE);
    expect(allText(r)).toContain('AI không thấy món ăn nào');
    expect(input(r, 'Tên món').props.value).toBe(''); // one empty line to type a food by hand
    expect(items()).toHaveLength(0);
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
    await press(r, 'Thêm vào hôm nay');
    expect(items().map((i) => [i.name, i.calories])).toEqual([['Bún riêu nhà nấu, Chè đậu xanh nhà nấu', 455]]);
    expect(items()[0].parts?.map((p) => p.name)).toEqual(['Bún riêu nhà nấu', 'Chè đậu xanh nhà nấu']);
    expect(useFoodDbStore.getState().custom).toHaveLength(2); // the two foods stay; the combination is not saved as a food of its own
  });

  it('a line taken from the database and then renamed counts as a new food and is remembered under its new name', async () => {
    useFoodDbStore.setState({
      custom: [{ id: 'c1', name: 'Bún riêu nhà nấu', group: 'soup', unit: 'phần', unitG: 100, kcal: 450, proteinG: 25, purineMg: 90, sugarG: 2, sodiumMg: 800, note: '', confidence: 'low', auto: true }],
    });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'bun rieu nha nau');
    await press(r, ANALYZE);
    await type(r, 'Tên món', 'Bún riêu ít muối');
    await press(r, 'Thêm vào hôm nay');
    expect(useFoodDbStore.getState().custom.map((f) => f.name)).toEqual(['Bún riêu nhà nấu', 'Bún riêu ít muối']);
  });

  it('remembers the AI calories of each AI line next to what was saved (not the database lines)', async () => {
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Calo (kcal) món 1', '700');
    await press(r, 'Thêm vào hôm nay');
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
    await press(r, 'Thêm vào hôm nay');
    expect(items()).toHaveLength(0); // nothing is saved with a bad time
    await type(r, 'Giờ ăn (tuỳ chọn)', '');
    await press(r, 'Thêm vào hôm nay');
    expect(items().map((i) => hhmm(i.loggedAtISO))).toEqual(['12:00']);
  });

  it('an exact time typed applies to the whole meal (and so to all its parts)', async () => {
    const hhmm = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}`;
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'phở và trà');
    await press(r, ANALYZE);
    await type(r, 'Giờ ăn (tuỳ chọn)', '13:15');
    await press(r, 'Thêm vào hôm nay');
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

  it('changing a food\'s amount works its figures out again in proportion, from the AI\'s line (no rounding drift), and saves the new amount', async () => {
    const RICE = { name: 'Cơm trắng 150g', caloriesKcal: 195, proteinG: 4, purineMg: 30, saltG: 0, sugarG: 0, accuracyPercent: 80 };
    mockText.mockResolvedValue({ ok: true, result: { ...OK, items: [RICE, TEA] } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'cơm và trà');
    await press(r, ANALYZE);
    expect(input(r, 'Lượng món 1').props.value).toBe('150');
    expect(allText(r)).toContain('g'); // the unit read from the name
    await type(r, 'Lượng món 1', '1');
    await type(r, 'Lượng món 1', '');
    await type(r, 'Lượng món 1', '300');
    expect(input(r, 'Tên món 1').props.value).toBe('Cơm trắng 300g');
    expect(input(r, 'Calo (kcal) món 1').props.value).toBe('390');
    expect(input(r, 'Đạm (g) món 1').props.value).toBe('8');
    expect(input(r, 'Purine (mg) món 1').props.value).toBe('60');
    // A figure typed by hand wins, and the next amount change starts from it.
    await type(r, 'Calo (kcal) món 1', '400');
    await type(r, 'Lượng món 1', '150');
    expect(input(r, 'Calo (kcal) món 1').props.value).toBe('200');
    await press(r, 'Thêm vào hôm nay');
    expect(items()[0].parts?.[0]).toMatchObject({ name: 'Cơm trắng 150g', calories: 200 });
    expect(items()[0].calories).toBe(225);
  });

  it('a food can be added by hand next to the AI\'s lines, and a main meal can be logged as not eaten', async () => {
    const r = await mount();
    await press(r, 'Thêm món tự nhập');
    await type(r, 'Tên món 2', 'Chuối');
    await type(r, 'Calo (kcal) món 2', '90');
    await press(r, 'Tối');
    await press(r, 'Không ăn Tối');
    expect(items()).toEqual([expect.objectContaining({ name: 'Không ăn', calories: 0, mealTime: 'dinner' })]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('refuses to save when no line has calories or protein', async () => {
    mockText.mockResolvedValue({ ok: true, result: { ...OK, items: [{ ...PHO, name: 'Món lạ nhà hàng X' }] } });
    const r = await mount();
    await type(r, 'Bạn đã ăn gì?', 'x');
    await press(r, ANALYZE);
    await type(r, 'Calo (kcal)', '');
    await type(r, 'Đạm (g)', '');
    await press(r, 'Thêm vào hôm nay');
    expect(allText(r)).toContain('Không tìm thấy'); // a name alone is looked up in the food database, never guessed
    expect(items()).toHaveLength(0);
  });
});
