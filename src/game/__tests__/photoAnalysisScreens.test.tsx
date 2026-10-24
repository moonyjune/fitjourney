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

jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: async (_uri: string, id: string) => `file:///docs/proofs/${id}.jpg`,
  deletePersistedPhoto: jest.fn(async () => undefined),
  imageUriToBase64: async () => ({ base64: 'QUJD', mediaType: 'image/png' }),
}));

type Outcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'generic' };
const mockAnalysis = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
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
  requestPhotoAnalysis: (...a: unknown[]) => mockAnalysis(...a),
}));

import AddFoodScreen from '../../../app/add-food';
import { usePhotoAnalysis } from '../../ai/usePhotoAnalysis';
import { ProofCapture } from '../../components/ProofCapture';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
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
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useWorkoutStore.setState({ entries: [] });
    useProofStore.setState({ photos: [] });
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
      await press(r, 'Chọn từ thư viện');
      return r;
    };
    const items = () => useNutritionStore.getState().logs[DATE].extraItems;

    it('offers the AI button only once a photo is attached', async () => {
      const r = await mount(<AddFoodScreen />);
      expect(r.root.findAll((n) => n.props.accessibilityLabel === ANALYZE)).toHaveLength(0);
      await press(r, 'Chọn từ thư viện');
      expect(pressable(r, ANALYZE)).toBeDefined();
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
      expect(pressable(r, 'Đang phân tích…').props.accessibilityState).toMatchObject({ busy: true }); // shown as busy, not tappable twice
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
      await press(r, 'Xóa ảnh');
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
