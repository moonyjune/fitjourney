import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// Navigation, storage, the picker and the network edge (requestPhotoAnalysis) are mocked; stores, screens and UI are real.
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

const mockLaunchLibrary = jest.fn<() => Promise<{ canceled: boolean; assets: { uri: string }[] | null }>>();
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: () => mockLaunchLibrary(),
}));

const mockToBase64 = jest.fn();
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: async (_uri: string, id: string) => `file:///docs/proofs/${id}.jpg`,
  deletePersistedPhoto: jest.fn(async () => undefined),
  AI_MAX_EDGE_PX: 1280,
  AI_FULL_HD_EDGE_PX: 1920,
  imageUriToBase64: (...args: unknown[]) => {
    mockToBase64(...args);
    return Promise.resolve({ base64: 'QUJD', mediaType: 'image/png' });
  },
}));

type Outcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'generic' };
const mockAnalysis = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockLabel = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockPushUserData = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
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
  requestPhotoAnalysis: (...a: unknown[]) => mockAnalysis(...a),
  requestNutritionLabel: (...a: unknown[]) => mockLabel(...a),
}));

import AddFoodScreen from '../../../app/add-food';
import { usePhotoAnalysis } from '../../ai/usePhotoAnalysis';
import { ProofCapture } from '../../components/ProofCapture';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useAiCalibrationStore } from '../../store/useAiCalibrationStore';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const DATE = '2026-10-23';
const PHOTO = 'file:///tmp/gallery.png';
const ANALYZE = 'Phân tích ảnh bằng AI';

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return parts.join(' ');
}
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!found) throw new Error(`no pressable "${label}"`);
  return found;
};
const textInput = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
const byPlaceholder = (r: ReactTestRenderer, placeholder: string): ReactTestInstance =>
  r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.placeholder === placeholder)[0];
/** The first touchable whose visible text contains `text` (ProofCapture's buttons have no accessibility label). */
const tapText = (r: ReactTestRenderer, text: string): ReactTestInstance => {
  const hit = r.root.findAll((n) => {
    if (typeof n.props.onPress !== 'function') return false;
    const parts: string[] = [];
    const walk = (x: unknown) => {
      if (typeof x === 'string') parts.push(x);
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') walk((x as { props?: { children?: unknown } }).props?.children);
    };
    walk(n.props.children);
    return parts.join('').includes(text);
  })[0];
  if (!hit) throw new Error(`nothing to tap with text "${text}"`);
  return hit;
};

const LABEL_OK = {
  readable: true,
  productName: 'Bánh quy yến mạch',
  per100: { energyKcal: 450, proteinG: 7, sugarG: 22, sodiumMg: 380 },
  per100Unit: 'g',
  perServing: { energyKcal: 135, proteinG: 2.1, sugarG: 6.6, sodiumMg: 114 },
  servingSize: { amount: 30, unit: 'g' },
  servingsPerPack: 6,
  accuracyPercent: 93,
  reasoning: 'Đủ hai cột.',
};
const MEAL_OK = { foodName: 'Cơm gà xối mỡ', estimatedCaloriesKcal: 612.4, estimatedProteinG: 38.46, estimatedWaterMl: 200, confidence: 'medium', reasoning: 'Một đĩa cơm gà vừa.' };

describe('Photo → AI analysis in the screens', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (el: React.ReactElement) => {
    await act(async () => {
      renderer = create(el);
    });
    return renderer!;
  };
  const press = async (r: ReactTestRenderer, label: string) => {
    await act(async () => {
      pressable(r, label).props.onPress();
    });
  };
  const type = async (r: ReactTestRenderer, label: string, value: string) => {
    await act(async () => textInput(r, label).props.onChangeText(value));
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: PHOTO }] });
    mockAnalysis.mockResolvedValue({ ok: true, result: MEAL_OK });
    mockLabel.mockResolvedValue({ ok: true, label: LABEL_OK });
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useWorkoutStore.setState({ entries: [] });
    useProofStore.setState({ photos: [] });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useAiCalibrationStore.getState().clear();
    useNutritionStore.setState({
      logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 } },
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  describe('Add food', () => {
    const withPhoto = async () => {
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chọn ảnh');
      return r;
    };
    const items = () => useNutritionStore.getState().logs[DATE].extraItems;

    it('offers the AI button only once a photo is attached', async () => {
      const r = await mount(<AddFoodScreen />);
      expect(r.root.findAll((n) => n.props.accessibilityLabel === ANALYZE)).toHaveLength(0);
      await press(r, 'Chọn ảnh');
      expect(pressable(r, ANALYZE)).toBeDefined();
    });

    it('sends up to 2 more photos of the same meal with the main one, and only the main photo is kept with the food', async () => {
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(mockAnalysis.mock.calls[0][6]).toEqual([]);

      mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p2.jpg' }, { uri: 'file:///p3.jpg' }, { uri: 'file:///p4.jpg' }] });
      await press(r, 'Chọn ảnh');
      expect(allText(r)).toContain('Đã đủ 3 ảnh');
      await press(r, ANALYZE);
      expect(mockAnalysis.mock.calls[1][1]).toBe('QUJD');
      expect(mockAnalysis.mock.calls[1][6]).toEqual([{ base64: 'QUJD', mediaType: 'image/png' }, { base64: 'QUJD', mediaType: 'image/png' }]);
      expect(mockToBase64).toHaveBeenCalledWith('file:///p3.jpg', { maxEdge: 1280 });
      expect(mockToBase64).not.toHaveBeenCalledWith('file:///p4.jpg', expect.anything());

      await press(r, 'Xóa ảnh 2');
      await press(r, ANALYZE);
      expect(mockAnalysis.mock.calls[2][6]).toHaveLength(1);

      await press(r, 'Thêm vào hôm nay');
      const saved = items();
      expect(saved).toHaveLength(1);
      expect(saved[0].photoUri).toMatch(/^file:\/\/\/docs\/proofs\/extra-/);
    });

    it('shrinks the photo for the AI by default and sends Full HD only when the setting is on', async () => {
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(mockToBase64).toHaveBeenLastCalledWith(PHOTO, { maxEdge: 1280 });

      useAiPhotoStore.getState().setFullHd(true);
      await press(r, ANALYZE);
      expect(mockToBase64).toHaveBeenLastCalledWith(PHOTO, { maxEdge: 1920 });
      useAiPhotoStore.getState().setFullHd(false);
    });

    it('sends the photo with the user’s body data and pre-fills name, calories and protein as an editable suggestion', async () => {
      const r = await withPhoto();
      await type(r, 'Tên món', ''); // empty already; make the intent explicit
      await press(r, ANALYZE);

      expect(mockAnalysis).toHaveBeenCalledTimes(1);
      const [taskType, base64, mediaType, , profile] = mockAnalysis.mock.calls[0];
      expect([taskType, base64, mediaType]).toEqual(['meal', 'QUJD', 'image/png']);
      expect(profile).toEqual({ weightKg: 106.2, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });

      expect(textInput(r, 'Tên món').props.value).toBe('Cơm gà xối mỡ');
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('612');
      expect(textInput(r, 'Đạm (g)').props.value).toBe('38.5');
      const text = allText(r);
      expect(text).toContain('Gợi ý từ AI');
      expect(text).toContain('Độ tin cậy: vừa');
      expect(text).toContain('Một đĩa cơm gà vừa.');
      // Nothing is saved until the user presses save.
      expect(items()).toHaveLength(0);
      expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('shows the AI\'s accuracy as a percent (rounded, clamped to 0-100), and the old low/medium/high wording when it gave none', async () => {
      mockAnalysis.mockResolvedValue({ ok: true, result: { ...MEAL_OK, accuracyPercent: 71.6 } });
      let r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain('Độ chính xác ước tính: 72%');
      expect(allText(r)).not.toContain('Độ tin cậy');
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('612'); // still editable, nothing saved
      expect(items()).toHaveLength(0);
      act(() => renderer?.unmount());

      mockAnalysis.mockResolvedValue({ ok: true, result: { ...MEAL_OK, accuracyPercent: 250 } });
      r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain('Độ chính xác ước tính: 100%');
      act(() => renderer?.unmount());

      mockAnalysis.mockResolvedValue({ ok: true, result: { ...MEAL_OK, accuracyPercent: 'high' } });
      r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain('Độ tin cậy: vừa');
    });

    it('remembers the AI calories next to what the user saved, only when the AI filled them, and shows how far off it has been', async () => {
      let r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).not.toContain('lệch trung bình'); // not enough history yet
      await type(r, 'Calo (kcal)', '500');
      await press(r, 'Thêm vào hôm nay');
      expect(useAiCalibrationStore.getState().estimates).toEqual([{ ai: 612, final: 500 }]);
      act(() => renderer?.unmount());

      // A form filled by hand records nothing.
      useAiCalibrationStore.getState().clear();
      r = await mount(<AddFoodScreen />);
      await type(r, 'Tên món', 'Bánh mì');
      await type(r, 'Calo (kcal)', '300');
      await press(r, 'Thêm vào hôm nay');
      expect(useAiCalibrationStore.getState().estimates).toEqual([]);
      act(() => renderer?.unmount());

      // With 5 past estimates the AI note says how far off it usually is (median of 0%, 0%, 0%, 20%, 50% = 0%).
      useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] }); // the first save remembered the dish
      for (const [ai, final] of [[100, 100], [100, 100], [100, 100], [120, 100], [150, 100]]) useAiCalibrationStore.getState().record(ai, final);
      r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain('Trước đây AI lệch trung bình ~0% so với số bạn chốt (5 lần).');
    });

    describe('nutrition label', () => {
      const READ = 'Đọc nhãn dinh dưỡng';

      it('fills the name and the printed figures for one serving, and sends the photo at Full HD size whatever the switch says', async () => {
        const r = await withPhoto();
        await press(r, READ);
        expect(mockToBase64).toHaveBeenCalledWith(PHOTO, { maxEdge: 1920 });
        expect(mockLabel).toHaveBeenCalledWith('QUJD', 'image/png');
        expect(textInput(r, 'Tên món').props.value).toBe('Bánh quy yến mạch');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('135');
        expect(textInput(r, 'Đạm (g)').props.value).toBe('2.1');
        expect(textInput(r, 'Muối (g)').props.value).toBe('0.3');
        expect(textInput(r, 'Đường tự do (g)').props.value).toBe('6.6');
        expect(textInput(r, 'Purine (mg)').props.value).toBe('');
        expect(textInput(r, 'Số phần đã ăn').props.value).toBe('1');
        const text = allText(r);
        expect(text).toContain('Từ nhãn dinh dưỡng');
        expect(text).toContain('Bánh quy yến mạch');
        expect(text).toContain('Độ chính xác ước tính: 93%');
        expect(text).toContain('1 phần = 30 g');
        expect(text).toContain('gói có 6 phần');
        expect(text).toContain('Nhãn không ghi purine');
        expect(items()).toHaveLength(0);
      });

      it('recomputes when the number of servings changes, and again for an amount in grams', async () => {
        const r = await withPhoto();
        await press(r, READ);
        await type(r, 'Số phần đã ăn', '2.5');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('338'); // 135 × 2.5 = 337.5
        await press(r, 'Theo khối lượng');
        expect(textInput(r, 'Khối lượng đã ăn (g/ml)').props.value).toBe('30');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('135');
        await type(r, 'Khối lượng đã ăn (g/ml)', '50');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('225'); // per-100 column
        await press(r, 'Theo phần');
        expect(textInput(r, 'Số phần đã ăn').props.value).toBe('1');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('135');
        await type(r, 'Số phần đã ăn', '0'); // nonsense leaves the figures alone
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('135');
      });

      it('never overwrites a figure the user typed, and saves what the form ends up with', async () => {
        const r = await withPhoto();
        await type(r, 'Tên món', 'Bánh nhà làm');
        await type(r, 'Đạm (g)', '9');
        await press(r, READ);
        expect(textInput(r, 'Tên món').props.value).toBe('Bánh nhà làm');
        expect(textInput(r, 'Đạm (g)').props.value).toBe('9');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('135');
        await type(r, 'Số phần đã ăn', '2');
        expect(textInput(r, 'Đạm (g)').props.value).toBe('9');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('270');
        await press(r, 'Thêm vào hôm nay');
        expect(items().map((i) => [i.name, i.calories, i.proteinG])).toEqual([['Bánh nhà làm', 270, 9]]);
        expect(items()[0]).toMatchObject({ saltG: 0.6, sugarG: 13.2 });
        expect(useAiCalibrationStore.getState().estimates).toEqual([]); // read from the label: nothing to calibrate
      });

      it('with only a per-100 column it asks for an amount, starting at 100 g', async () => {
        mockLabel.mockResolvedValue({ ok: true, label: { readable: true, per100: { energyKcal: 52, proteinG: 0.3, sugarG: 10 }, reasoning: '' } });
        const r = await withPhoto();
        await press(r, READ);
        expect(textInput(r, 'Khối lượng đã ăn (g/ml)').props.value).toBe('100');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('52');
        expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Theo phần')).toHaveLength(0); // one way only: no mode chips
        await type(r, 'Khối lượng đã ăn (g/ml)', '150');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('78');
      });

      it('says so when the photo has no readable panel, and leaves the form alone', async () => {
        mockLabel.mockResolvedValue({ ok: true, label: { readable: false, reasoning: 'Không thấy bảng.' } });
        const r = await withPhoto();
        await type(r, 'Calo (kcal)', '400');
        await press(r, READ);
        expect(allText(r)).toContain('Không đọc được bảng dinh dưỡng');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('400');
      });

      it.each([
        ['notConfigured', 'AI chưa được thiết lập'],
        ['quota', 'hết lượt AI hôm nay'],
        ['disabled', 'AI đang tắt'],
        ['offline', 'Không có mạng'],
      ] as Array<['notConfigured' | 'quota' | 'disabled' | 'offline', string]>)('shows a friendly message for a %s failure', async (kind, expected) => {
        mockLabel.mockResolvedValue({ ok: false, message: 'x', kind });
        const r = await withPhoto();
        await press(r, READ);
        expect(allText(r)).toContain(expected);
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('');
      });

      it('does not record the earlier AI estimate against the label figures the user then saves', async () => {
        const r = await withPhoto();
        await press(r, ANALYZE); // the AI fills 612 kcal
        await press(r, READ); // the label replaces the empty/AI-filled fields: 135 kcal
        await press(r, 'Thêm vào hôm nay');
        expect(items()).toHaveLength(1);
        expect(useAiCalibrationStore.getState().estimates).toEqual([]);
      });

      it('tapping the mode that is already selected keeps what was typed', async () => {
        const r = await withPhoto();
        await press(r, READ);
        await type(r, 'Số phần đã ăn', '2.5');
        await press(r, 'Theo phần');
        expect(textInput(r, 'Số phần đã ăn').props.value).toBe('2.5');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('338');
      });

      it('drops the label card when the photo is replaced', async () => {
        const r = await withPhoto();
        await press(r, READ);
        expect(allText(r)).toContain('Từ nhãn dinh dưỡng');
        mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///tmp/other.png' }] });
        await press(r, 'Chọn ảnh');
        expect(allText(r)).toContain('Từ nhãn dinh dưỡng'); // another photo of the same meal keeps the reading of the main one
        await press(r, 'Xóa ảnh 1'); // other.png becomes the main photo
        expect(allText(r)).not.toContain('Từ nhãn dinh dưỡng');
        expect(textInput(r, 'Số phần đã ăn')).toBeUndefined();
      });

      it('drops the label card when the photo is removed', async () => {
        const r = await withPhoto();
        await press(r, READ);
        expect(allText(r)).toContain('Từ nhãn dinh dưỡng');
        await press(r, 'Xóa ảnh 1');
        expect(allText(r)).not.toContain('Từ nhãn dinh dưỡng');
      });
    });

    it('for an unclassified failure it adds the server\'s own message (shortened), but not for the other kinds', async () => {
      const long = `Claude API lỗi: {"type":"error","error":{"type":"not_found_error","message":"model: x"}} ${'a'.repeat(400)}`;
      mockAnalysis.mockResolvedValue({ ok: false, message: long, kind: 'generic' });
      let r = await withPhoto();
      await press(r, ANALYZE);
      let text = allText(r);
      expect(text).toContain('Chưa phân tích được ảnh này.');
      expect(text).toContain('(Claude API lỗi: {"type":"error","error":{"type":"not_found_error","message":"model: x"}}');
      expect(text).not.toContain('a'.repeat(300)); // cut at 220 characters
      act(() => renderer?.unmount());

      mockAnalysis.mockResolvedValue({ ok: false, message: 'Server chưa cấu hình ANTHROPIC_API_KEY.', kind: 'notConfigured' });
      r = await withPhoto();
      await press(r, ANALYZE);
      text = allText(r);
      expect(text).toContain('AI chưa được thiết lập');
      expect(text).not.toContain('ANTHROPIC_API_KEY'); // no technical detail for a kind that already explains itself
    });

    describe('a photo with several foods: one description, the foods as its parts', () => {
      const MULTI = {
        ...MEAL_OK,
        foodName: 'Yến mạch 30g, sữa chua không đường 100g, sữa tươi không đường 50ml',
        estimatedCaloriesKcal: 200,
        estimatedProteinG: 9.7,
        components: [
          { name: 'Yến mạch 30g', caloriesKcal: 110, proteinG: 4 },
          { name: 'Sữa chua không đường 100g', caloriesKcal: 60, proteinG: 4 },
          { name: 'Sữa tươi không đường 50ml', caloriesKcal: 30, proteinG: 1.7 },
        ],
      };

      it('the name carries every food with its amount, the details are listed, and the saved meal keeps them as its parts', async () => {
        mockAnalysis.mockResolvedValue({ ok: true, result: MULTI });
        const r = await withPhoto();
        await press(r, ANALYZE);
        expect(textInput(r, 'Tên món').props.value).toBe(MULTI.foodName);
        const text = allText(r);
        expect(text).toContain('Chi tiết các món AI nhận ra');
        expect(text).toContain('• Yến mạch 30g: 110 kcal · 4 g');
        await press(r, 'Thêm vào hôm nay');
        expect(items()).toHaveLength(1);
        expect(items()[0].name).toBe(MULTI.foodName);
        expect(items()[0].parts?.map((p) => p.name)).toEqual(['Yến mạch 30g', 'Sữa chua không đường 100g', 'Sữa tươi không đường 50ml']);
      });

      it('changing the total calories by hand drops the parts (they no longer describe the meal) and they are not saved', async () => {
        mockAnalysis.mockResolvedValue({ ok: true, result: MULTI });
        const r = await withPhoto();
        await press(r, ANALYZE);
        await type(r, 'Calo (kcal)', '500');
        expect(allText(r)).not.toContain('Chi tiết các món AI nhận ra');
        await press(r, 'Thêm vào hôm nay');
        expect(items()[0].calories).toBe(500);
        expect(items()[0].parts).toBeUndefined();
      });

      it('a photo with one food has no parts, and a new photo clears the old parts', async () => {
        mockAnalysis.mockResolvedValue({ ok: true, result: { ...MEAL_OK, components: [{ name: 'Một món 100g', caloriesKcal: 612, proteinG: 38 }] } });
        let r = await withPhoto();
        await press(r, ANALYZE);
        expect(allText(r)).not.toContain('Chi tiết các món AI nhận ra');
        act(() => renderer?.unmount());

        mockAnalysis.mockResolvedValue({ ok: true, result: MULTI });
        r = await withPhoto();
        await press(r, ANALYZE);
        expect(allText(r)).toContain('Chi tiết các món AI nhận ra');
        await press(r, 'Xóa ảnh 1');
        expect(allText(r)).not.toContain('Chi tiết các món AI nhận ra');
        // A new photo starts clean: the earlier photo's foods are not carried onto the next meal.
        await press(r, 'Chọn ảnh');
        expect(allText(r)).not.toContain('Chi tiết các món AI nhận ra');
        await type(r, 'Calo (kcal)', '200');
        await press(r, 'Thêm vào hôm nay');
        expect(items()[0].parts).toBeUndefined();
      });
    });

    it('sends the coach snapshot (targets, today, recent days, boss) along with the photo', async () => {
      const r = await withPhoto();
      await press(r, ANALYZE);
      const coach = mockAnalysis.mock.calls[0][5] as Record<string, any>;
      expect(coach.now).toMatchObject({ date: DATE, time: '16:10' });
      expect(coach.targets.dailyDeficitKcal).toBeGreaterThan(0);
      expect(coach.today).toMatchObject({ date: DATE, eatenKcal: 0 });
      expect(coach.week.bossMaxHp).toBe(7700);
      expect(Array.isArray(coach.recentDays)).toBe(true);
    });

    it('fills purine, salt and sugar from the AI and shows its advice for the rest of the day, saving nothing', async () => {
      mockAnalysis.mockResolvedValue({
        ok: true,
        result: {
          ...MEAL_OK,
          estimatedPurineMg: 180,
          estimatedSaltG: 2.34,
          estimatedSugarG: 12,
          advice: { verdict: 'watch', summary: 'Bữa này đã dùng nhiều ngân sách.', nextSteps: ['Bữa tối ăn cá hấp.', 'Đi bộ nhanh 30 phút.'], remainingKcalToEat: 520, remainingProteinG: 90, extraBurnKcal: 150, bossNote: 'Cần 1100 sát thương mỗi ngày còn lại.' },
        },
      });
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(textInput(r, 'Purine (mg)').props.value).toBe('180');
      expect(textInput(r, 'Muối (g)').props.value).toBe('2.3');
      expect(textInput(r, 'Đường tự do (g)').props.value).toBe('12');
      const text = allText(r);
      expect(text).toContain('Gợi ý cho phần còn lại của ngày');
      expect(text).toContain('Cần chú ý: Bữa này đã dùng nhiều ngân sách.');
      expect(text).toContain('Còn ăn được ~520 kcal');
      expect(text).toContain('Cần thêm ~90 g đạm');
      expect(text).toContain('Đốt thêm ~150 kcal');
      expect(text).toContain('• Bữa tối ăn cá hấp.');
      expect(text).toContain('Cần 1100 sát thương mỗi ngày còn lại.');
      expect(text).toContain('không thay thế bác sĩ');
      expect(items()).toHaveLength(0);
    });

    it('keeps purine, salt and sugar the user typed, and shows no advice card for a malformed advice', async () => {
      mockAnalysis.mockResolvedValue({ ok: true, result: { ...MEAL_OK, estimatedPurineMg: 180, estimatedSugarG: 12, advice: { verdict: 'great', summary: 'x', nextSteps: [] } } });
      const r = await withPhoto();
      await type(r, 'Purine (mg)', '55');
      await press(r, ANALYZE);
      expect(textInput(r, 'Purine (mg)').props.value).toBe('55');
      expect(textInput(r, 'Đường tự do (g)').props.value).toBe('12');
      expect(allText(r)).not.toContain('Gợi ý cho phần còn lại của ngày');
    });

    it('fills only what the AI returned when the answer is partial', async () => {
      mockAnalysis.mockResolvedValue({ ok: true, result: { estimatedCaloriesKcal: 250, reasoning: 'Chỉ đoán được calo.' } });
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('250');
      expect(textInput(r, 'Tên món').props.value).toBe('');
      expect(textInput(r, 'Đạm (g)').props.value).toBe('');
      expect(allText(r)).not.toContain('Độ tin cậy');
    });

    it('says AI is not set up yet, and manual entry still works and saves', async () => {
      mockAnalysis.mockResolvedValue({ ok: false, kind: 'notConfigured', message: 'Server chưa cấu hình ANTHROPIC_API_KEY.' });
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain('AI chưa được thiết lập');
      expect(allText(r)).not.toContain('ANTHROPIC_API_KEY'); // raw server text is never shown
      await type(r, 'Tên món', 'Bánh mì');
      await type(r, 'Calo (kcal)', '300');
      await press(r, 'Thêm vào hôm nay');
      expect(items()).toHaveLength(1);
      expect(items()[0]).toMatchObject({ name: 'Bánh mì', calories: 300 });
    });

    const failures: [kind: 'offline' | 'auth' | 'generic', expected: string][] = [
      ['offline', 'Không có mạng'],
      ['auth', 'Phiên đăng nhập không hợp lệ'],
      ['generic', 'Chưa phân tích được ảnh này'],
    ];
    it.each(failures)('shows a friendly message for a %s failure', async (kind, expected) => {
      mockAnalysis.mockResolvedValue({ ok: false, kind, message: 'raw' });
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain(expected);
    });

    it('ignores a second tap while the first analysis is still running', async () => {
      let finish!: (o: Outcome) => void;
      mockAnalysis.mockReturnValue(new Promise<Outcome>((resolve) => { finish = resolve; }));
      const r = await withPhoto();
      const button = pressable(r, ANALYZE);
      await act(async () => button.props.onPress());
      await act(async () => button.props.onPress());
      expect(mockAnalysis).toHaveBeenCalledTimes(1);
      expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Đang phân tích…' && n.props.accessibilityState)[0].props.accessibilityState).toMatchObject({ busy: true }); // shown as busy, not tappable twice
      await act(async () => finish({ ok: true, result: MEAL_OK }));
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('612');
    });

    it('never overwrites a field the user typed themselves, and says so', async () => {
      const r = await withPhoto();
      await type(r, 'Tên món', 'Phở mẹ nấu');
      await press(r, ANALYZE);
      expect(textInput(r, 'Tên món').props.value).toBe('Phở mẹ nấu'); // kept
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('612'); // empty field: filled
      expect(allText(r)).toContain('Các ô bạn đã tự nhập được giữ nguyên');
    });

    it('on a re-run refreshes AI-filled fields but keeps what the user edited after the last fill', async () => {
      const r = await withPhoto();
      await press(r, ANALYZE);
      await type(r, 'Calo (kcal)', '999'); // the user takes over calories
      mockAnalysis.mockResolvedValue({ ok: true, result: { foodName: 'Bún bò', estimatedCaloriesKcal: 700, estimatedProteinG: 30, reasoning: 'Lần 2.' } });
      await press(r, ANALYZE);
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('999');
      expect(textInput(r, 'Tên món').props.value).toBe('Bún bò'); // still the AI's, refreshed
      expect(textInput(r, 'Đạm (g)').props.value).toBe('30');
    });

    it('drops the old suggestion note when the photo is replaced or removed', async () => {
      const r = await withPhoto();
      await press(r, ANALYZE);
      expect(allText(r)).toContain('Gợi ý từ AI');
      await press(r, 'Xóa ảnh 1');
      expect(allText(r)).not.toContain('Gợi ý từ AI');
      expect(r.root.findAll((n) => n.props.accessibilityLabel === ANALYZE)).toHaveLength(0);
    });

    it('saves the values as edited by the user, not the raw AI suggestion', async () => {
      const r = await withPhoto();
      await press(r, ANALYZE);
      await type(r, 'Calo (kcal)', '500');
      await type(r, 'Tên món', 'Cơm gà (nửa phần)');
      await press(r, 'Thêm vào hôm nay');
      expect(items()).toHaveLength(1);
      expect(items()[0]).toMatchObject({ name: 'Cơm gà (nửa phần)', calories: 500, proteinG: 38.5 });
      expect(items()[0].photoUri).toMatch(/^file:\/\/\/docs\/proofs\//);
      expect(mockRouter.back).toHaveBeenCalled();
    });
    describe('remembering foods (so the next time needs no typing and no AI)', () => {
      const SAVE = 'Thêm vào hôm nay';
      const saveFood = async (r: ReactTestRenderer, name: string, kcal: string, protein: string) => {
        await type(r, 'Tên món', name);
        await type(r, 'Calo (kcal)', kcal);
        await type(r, 'Đạm (g)', protein);
        await press(r, SAVE);
      };
      const remembered = () => useFoodDbStore.getState().custom;

      it('saves a food the database does not know, as one portion, and files it in the cloud settings', async () => {
        const r = await mount(<AddFoodScreen />);
        await saveFood(r, 'Bánh bao nhà làm', '320', '9');
        expect(remembered()).toHaveLength(1);
        expect(remembered()[0]).toMatchObject({ name: 'Bánh bao nhà làm', unit: 'phần', unitG: 100, kcal: 320, proteinG: 9, auto: true, confidence: 'low' });
        expect(mockPushUserData).toHaveBeenCalledWith('foodDb', expect.objectContaining({ custom: [expect.objectContaining({ name: 'Bánh bao nhà làm' })] }));
      });

      it('does not save a food whose name the database already has (accents and case ignored), nor a second copy of a saved one', async () => {
        const r = await mount(<AddFoodScreen />);
        await saveFood(r, 'Bánh bao nhà làm', '320', '9');
        await act(async () => renderer?.unmount());
        const r2 = await mount(<AddFoodScreen />);
        await saveFood(r2, 'BANH BAO NHA LAM', '350', '10');
        expect(remembered()).toHaveLength(1);
        expect(remembered()[0].kcal).toBe(320);
      });

      it('offers the saved figures when the same name is typed again, and fills them on a tap without any AI call', async () => {
        const r = await mount(<AddFoodScreen />);
        await saveFood(r, 'Bánh bao nhà làm', '320', '9');
        await act(async () => renderer?.unmount());
        const r2 = await mount(<AddFoodScreen />);
        expect(allText(r2)).not.toContain('Đã có trong cơ sở dữ liệu món ăn');
        await type(r2, 'Tên món', 'bánh bao nhà làm');
        expect(allText(r2)).toContain('Đã có trong cơ sở dữ liệu món ăn');
        expect(allText(r2)).toContain('320 kcal');
        await press(r2, 'Dùng số liệu đã lưu');
        expect(textInput(r2, 'Calo (kcal)').props.value).toBe('320');
        expect(textInput(r2, 'Đạm (g)').props.value).toBe('9');
        expect(allText(r2)).not.toContain('Đã có trong cơ sở dữ liệu món ăn'); // nothing left to offer
        expect(mockAnalysis).not.toHaveBeenCalled();
      });

      it('with a photo and a saved name, the AI button reuses the saved figures and does not call the AI', async () => {
        useFoodDbStore.getState().remember({ name: 'Cơm gà xối mỡ', calories: 700, proteinG: 41, purineMg: 180, saltG: 2.5, sugarG: 3 });
        const r = await mount(<AddFoodScreen />);
        await press(r, 'Chọn ảnh');
        await type(r, 'Tên món', 'Cơm gà xối mỡ');
        await press(r, ANALYZE);
        expect(mockAnalysis).not.toHaveBeenCalled();
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('700');
        expect(textInput(r, 'Đạm (g)').props.value).toBe('41');
        expect(allText(r)).toContain('không gọi AI');
      });

      it('when the AI recognises a saved food, the saved figures win over its fresh estimate', async () => {
        useFoodDbStore.getState().remember({ name: 'Cơm gà xối mỡ', calories: 700, proteinG: 41 });
        const r = await withPhoto();
        await press(r, ANALYZE); // MEAL_OK: Cơm gà xối mỡ, 612 kcal
        expect(mockAnalysis).toHaveBeenCalledTimes(1);
        expect(textInput(r, 'Tên món').props.value).toBe('Cơm gà xối mỡ');
        expect(textInput(r, 'Calo (kcal)').props.value).toBe('700');
        expect(allText(r)).not.toContain('Gợi ý từ AI');
      });

      it('a new food found by the AI is saved only once the user saves the item, with the figures they ended up with', async () => {
        const r = await withPhoto();
        await press(r, ANALYZE);
        expect(remembered()).toHaveLength(0);
        await type(r, 'Calo (kcal)', '650');
        await press(r, SAVE);
        expect(remembered()).toHaveLength(1);
        expect(remembered()[0]).toMatchObject({ name: 'Cơm gà xối mỡ', kcal: 650 });
      });
    });
  });

  describe('Photo proof (ProofCapture)', () => {
    const openPicker = async (r: ReactTestRenderer) => {
      await act(async () => tapText(r, 'Thêm ảnh minh chứng').props.onPress());
      await act(async () => tapText(r, 'Chọn ảnh').props.onPress());
    };

    it('meal: pre-fills calories, water and protein and saves the item under the AI’s food name', async () => {
      const r = await mount(<ProofCapture dateKey={DATE} taskType="meal" taskRefId="meal1" contextLabel="Bữa 1" plannedCalories={500} />);
      await openPicker(r);
      await press(r, ANALYZE);

      expect(mockAnalysis.mock.calls[0].slice(0, 4)).toEqual(['meal', 'QUJD', 'image/png', { label: 'Bữa 1', plannedCalories: 500 }]);
      expect(mockAnalysis.mock.calls[0][4]).toMatchObject({ weightKg: 106.2, heightCm: 172 });
      expect(byPlaceholder(r, 'Kcal ước tính').props.value).toBe('612');
      expect(byPlaceholder(r, 'Nước ước tính (ml)').props.value).toBe('200');
      expect(textInput(r, 'Đạm (g)').props.value).toBe('38.5');
      expect(allText(r)).toContain('Cơm gà xối mỡ');
      expect(allText(r)).toContain('Độ tin cậy: vừa');

      await act(async () => byPlaceholder(r, 'Kcal ước tính').props.onChangeText('550'));
      await act(async () => tapText(r, 'Lưu').props.onPress());
      const log = useNutritionStore.getState().logs[DATE];
      expect(log.extraItems).toHaveLength(1);
      expect(log.extraItems[0]).toMatchObject({ name: 'Cơm gà xối mỡ', calories: 550, proteinG: 38.5 });
      expect(log.waterMl).toBe(200);
      expect(useProofStore.getState().photos).toHaveLength(1);
    });

    it('meal (quest): extra photos of the same meal go to the AI with the first one', async () => {
      const r = await mount(<ProofCapture variant="quest" dateKey={DATE} taskType="meal" taskRefId="meal1" contextLabel="Bữa 1" />);
      await openPicker(r);
      mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///p2.jpg' }] });
      await press(r, 'Chọn ảnh');
      await press(r, ANALYZE);
      expect(mockAnalysis.mock.calls[0][6]).toEqual([{ base64: 'QUJD', mediaType: 'image/png' }]);
      expect(mockToBase64).toHaveBeenCalledWith('file:///p2.jpg', { maxEdge: 1280 });
    });

    it('workout: pre-fills the calories burned, shows activity and duration, and updates the entry', async () => {
      useWorkoutStore.setState({ entries: [{ id: 'w1', dateISO: `${DATE}T07:00:00`, templateId: null, label: 'Đi bộ', durationMin: 30, caloriesBurned: 100 }] });
      mockAnalysis.mockResolvedValue({ ok: true, result: { activityName: 'Đi bộ dốc', durationMin: 45, estimatedCaloriesBurned: 409.6, confidence: 'high', reasoning: 'Màn hình máy ghi 45 phút.' } });
      const r = await mount(<ProofCapture dateKey={DATE} taskType="workout" taskRefId="w1" contextLabel="Đi bộ" />);
      await openPicker(r);
      await press(r, ANALYZE);

      expect(mockAnalysis.mock.calls[0][0]).toBe('workout');
      expect(byPlaceholder(r, 'Kcal đốt ước tính').props.value).toBe('410');
      const text = allText(r);
      expect(text).toContain('Đi bộ dốc · 45 phút');
      expect(text).toContain('Độ tin cậy: cao');

      await act(async () => tapText(r, 'Lưu').props.onPress());
      expect(useWorkoutStore.getState().entries[0].caloriesBurned).toBe(410);
    });

    it('shows the friendly message for each failure and keeps the inputs usable', async () => {
      mockAnalysis.mockResolvedValue({ ok: false, kind: 'notConfigured', message: 'Server chưa cấu hình ANTHROPIC_API_KEY.' });
      const r = await mount(<ProofCapture dateKey={DATE} taskType="meal" taskRefId="meal1" contextLabel="Bữa 1" />);
      await openPicker(r);
      await press(r, ANALYZE);
      expect(allText(r)).toContain('AI chưa được thiết lập');
      await act(async () => byPlaceholder(r, 'Kcal ước tính').props.onChangeText('420'));
      expect(byPlaceholder(r, 'Kcal ước tính').props.value).toBe('420');
      mockAnalysis.mockResolvedValue({ ok: false, kind: 'offline', message: 'Offline' });
      await press(r, ANALYZE);
      expect(allText(r)).toContain('Không có mạng');
      expect(allText(r)).not.toContain('AI chưa được thiết lập');
    });

    it('keeps a value the user typed instead of the AI’s on a meal photo', async () => {
      const r = await mount(<ProofCapture dateKey={DATE} taskType="meal" taskRefId="meal1" contextLabel="Bữa 1" />);
      await openPicker(r);
      await act(async () => byPlaceholder(r, 'Kcal ước tính').props.onChangeText('333'));
      await press(r, ANALYZE);
      expect(byPlaceholder(r, 'Kcal ước tính').props.value).toBe('333');
      expect(byPlaceholder(r, 'Nước ước tính (ml)').props.value).toBe('200');
      expect(allText(r)).toContain('Các ô bạn đã tự nhập được giữ nguyên');
    });
  });

  describe('usePhotoAnalysis', () => {
    type Api = ReturnType<typeof usePhotoAnalysis>;
    const harness = async () => {
      const ref: { current: Api | null } = { current: null };
      function Probe() {
        ref.current = usePhotoAnalysis('meal', { label: 'x' });
        return null;
      }
      await mount(<Probe />);
      return ref as { current: Api };
    };

    it('runs one request at a time: a second call while one is in flight is ignored, then a new one is allowed', async () => {
      let finish!: (o: Outcome) => void;
      mockAnalysis.mockReturnValueOnce(new Promise<Outcome>((resolve) => { finish = resolve; }));
      const api = await harness();
      let first!: Promise<unknown>;
      let second!: unknown;
      await act(async () => {
        first = api.current.analyze(PHOTO);
        second = await api.current.analyze(PHOTO); // same tick, before the first has answered
      });
      expect(second).toBeNull();
      expect(mockAnalysis).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish({ ok: true, result: MEAL_OK });
        await first;
      });
      expect(api.current.status).toBe('done');
      mockAnalysis.mockResolvedValueOnce({ ok: true, result: MEAL_OK });
      await act(async () => {
        await api.current.analyze(PHOTO);
      });
      expect(mockAnalysis).toHaveBeenCalledTimes(2);
    });

    it('turns a thrown error into a generic failure instead of crashing, and reset clears it', async () => {
      mockAnalysis.mockRejectedValueOnce(new Error('boom'));
      const api = await harness();
      await act(async () => {
        expect(await api.current.analyze(PHOTO)).toBeNull();
      });
      expect(api.current.status).toBe('error');
      expect(api.current.error).toMatchObject({ kind: 'generic' });
      await act(async () => api.current.reset());
      expect(api.current.status).toBe('idle');
      expect(api.current.error).toBeNull();
    });
  });
});
