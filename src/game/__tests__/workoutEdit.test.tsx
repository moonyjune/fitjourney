import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// Only navigation, storage, the picker and the network edge are mocked; stores, screens and UI are real.
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

const mockCameraPermission = jest.fn<() => Promise<{ granted: boolean; canAskAgain?: boolean }>>();
const mockLaunchCamera = jest.fn<() => Promise<{ canceled: boolean; assets: { uri: string }[] | null }>>();
const mockLaunchLibrary = jest.fn<() => Promise<{ canceled: boolean; assets: { uri: string }[] | null }>>();
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockCameraPermission(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: () => mockLaunchCamera(),
  launchImageLibraryAsync: () => mockLaunchLibrary(),
}));

const mockPersist = jest.fn<(uri: string, id: string) => Promise<string>>();
const mockDeletePhoto = jest.fn<(uri: string) => Promise<void>>();
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: (uri: string, id: string) => mockPersist(uri, id),
  deletePersistedPhoto: (uri: string) => mockDeletePhoto(uri),
  imageUriToBase64: async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' }),
}));

type Outcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'generic' };
const mockAnalysis = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockPushWorkout = jest.fn();
const mockPushProof = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: (...a: unknown[]) => mockPushWorkout(...a),
  pushWeightEntry: jest.fn(),
  pushProofPhoto: (...a: unknown[]) => mockPushProof(...a),
  deleteProofPhoto: jest.fn(async () => undefined),
  pushFeelingRecord: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
  requestPhotoAnalysis: (...a: unknown[]) => mockAnalysis(...a),
}));

import WorkoutScreen from '../../../app/(tabs)/workout-classic';
import { useDayEvaluator, useNow } from '../useGameState';
import { toDateKey } from '../../utils/date';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useNutritionStore } from '../../store/useNutritionStore';

const NOW = new Date('2026-10-23T16:10:00');
const CAM = 'file:///tmp/cam.jpg';
const GAL = 'file:///tmp/gallery.png';
const entry = (over: Partial<{ id: string; dateISO: string; templateId: string | null; label: string; durationMin: number; caloriesBurned: number }> = {}) => ({
  id: 'e1',
  dateISO: '2026-10-23T07:00:00.000Z',
  templateId: null as string | null,
  label: 'Đi bộ nhanh',
  durationMin: 8,
  caloriesBurned: 60,
  ...over,
});

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
const hasPress = (n: ReactTestInstance, label: string) => n.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === label).length > 0;
const pressable = (scope: ReactTestInstance | ReactTestRenderer, label: string): ReactTestInstance => {
  const root = 'root' in scope ? scope.root : scope;
  const found = root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!found) throw new Error(`no pressable "${label}"`);
  return found;
};
const textOf = (n: ReactTestInstance): string => n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
/** Date-picker chips are plain touchables with only a text child. */
const pressableWithText = (scope: ReactTestInstance, text: string): ReactTestInstance => {
  const found = scope.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).trim() === text)[0];
  if (!found) throw new Error(`no touchable with text "${text}"`);
  return found;
};
const inputById = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const found = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.testID === id)[0];
  if (!found) throw new Error(`no input ${id}`);
  return found;
};
/** The smallest container of the form whose inputs start with `prefix` and which holds the `submit` button. */
function formOf(r: ReactTestRenderer, prefix: string, submit: string): ReactTestInstance {
  let node: ReactTestInstance | null = inputById(r, `${prefix}-label`);
  while (node && !hasPress(node, submit)) node = node.parent;
  if (!node) throw new Error(`no form ${prefix}`);
  return node;
}
const images = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label && n.props.source);
const sourceUri = (n: ReactTestInstance) => (n.props.source as { uri: string }).uri;

describe('Classic workout screen: editing, photo and AI prefill', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (el: React.ReactElement = <WorkoutScreen />) => {
    await act(async () => {
      renderer = create(el);
    });
    return renderer!;
  };
  const press = async (scope: ReactTestInstance | ReactTestRenderer, label: string) => {
    await act(async () => {
      pressable(scope, label).props.onPress();
    });
  };
  const type = async (r: ReactTestRenderer, id: string, text: string) => {
    await act(async () => {
      inputById(r, id).props.onChangeText(text);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockCameraPermission.mockResolvedValue({ granted: true });
    mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [{ uri: CAM }] });
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: GAL }] });
    mockPersist.mockImplementation(async (_uri, id) => `file:///docs/proofs/${id}.jpg`);
    mockDeletePhoto.mockResolvedValue(undefined);
    mockAnalysis.mockReset();
    mockAnalysis.mockResolvedValue({ ok: false, kind: 'notConfigured', message: 'AI off' });
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useNutritionStore.setState({ logs: {} });
    useWorkoutStore.setState({ entries: [] });
    useProofStore.setState({ photos: [] });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('editing an entry', () => {
    it('changes the name, minutes and calories, and syncs the updated entry', async () => {
      useWorkoutStore.setState({ entries: [entry()] });
      const r = await mount();
      await press(r, 'Sửa buổi tập: Đi bộ nhanh');
      expect(allText(r)).toContain('Sửa buổi tập');
      expect(inputById(r, 'edit-e1-label').props.value).toBe('Đi bộ nhanh');
      expect(inputById(r, 'edit-e1-duration').props.value).toBe('8');
      await type(r, 'edit-e1-label', 'Chạy bộ');
      await type(r, 'edit-e1-duration', '32,5');
      await type(r, 'edit-e1-calories', '280');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      const saved = useWorkoutStore.getState().entries[0];
      expect(saved).toMatchObject({ id: 'e1', label: 'Chạy bộ', durationMin: 32.5, caloriesBurned: 280, templateId: null });
      expect(saved.dateISO).toBe('2026-10-23T07:00:00.000Z'); // same day: the original timestamp stays
      expect(mockPushWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', label: 'Chạy bộ', durationMin: 32.5, caloriesBurned: 280 }));
      expect(allText(r)).not.toContain('Sửa buổi tập '); // form closed
      expect(allText(r)).toContain('Chạy bộ');
    });

    it('can edit an entry made by a training session (templateId home-A) and keeps its template link', async () => {
      useWorkoutStore.setState({ entries: [entry({ id: 'sess', templateId: 'home-A', label: 'Nhóm A', durationMin: 18, caloriesBurned: 130 })] });
      const r = await mount();
      await press(r, 'Sửa buổi tập: Nhóm A');
      await type(r, 'edit-sess-duration', '25');
      await press(formOf(r, 'edit-sess', 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(useWorkoutStore.getState().entries[0]).toMatchObject({ templateId: 'home-A', durationMin: 25 });
    });

    it('edits an earlier entry from the recent list too', async () => {
      useWorkoutStore.setState({ entries: [entry({ id: 'old', dateISO: '2026-10-20T07:00:00.000Z', label: 'Bơi tự do' })] });
      const r = await mount();
      await press(r, 'Sửa buổi tập: Bơi tự do');
      await type(r, 'edit-old-calories', '300');
      await press(formOf(r, 'edit-old', 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(useWorkoutStore.getState().entries[0].caloriesBurned).toBe(300);
    });

    it('refuses empty, zero or negative values, says why, keeps the form open with the typed draft', async () => {
      useWorkoutStore.setState({ entries: [entry()] });
      const r = await mount();
      await press(r, 'Sửa buổi tập: Đi bộ nhanh');
      for (const bad of ['', '0', '-5', 'abc']) {
        (Alert.alert as jest.Mock).mockClear();
        await type(r, 'edit-e1-duration', bad);
        await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
        expect(Alert.alert).toHaveBeenCalledWith('Lỗi', expect.stringContaining('Nhập đầy đủ'));
        expect(inputById(r, 'edit-e1-duration').props.value).toBe(bad); // draft kept
      }
      expect(useWorkoutStore.getState().entries[0]).toMatchObject({ label: 'Đi bộ nhanh', durationMin: 8 });
      expect(mockPushWorkout).not.toHaveBeenCalled();
    });

    it('cancel keeps the original entry', async () => {
      useWorkoutStore.setState({ entries: [entry()] });
      const r = await mount();
      await press(r, 'Sửa buổi tập: Đi bộ nhanh');
      await type(r, 'edit-e1-label', 'Khác');
      await type(r, 'edit-e1-duration', '99');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Hủy');
      expect(useWorkoutStore.getState().entries[0]).toMatchObject({ label: 'Đi bộ nhanh', durationMin: 8 });
      expect(mockPushWorkout).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Đi bộ nhanh');
    });

    it('moves the entry to another day with the date picker', async () => {
      useWorkoutStore.setState({ entries: [entry()] });
      const r = await mount();
      expect(allText(r)).toContain('Đã tập hôm nay (1)');
      await press(r, 'Sửa buổi tập: Đi bộ nhanh');
      await act(async () => {
        pressableWithText(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Hôm qua').props.onPress();
      });
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      const saved = useWorkoutStore.getState().entries[0];
      expect(toDateKey(new Date(saved.dateISO))).toBe('2026-10-22');
      expect(allText(r)).toContain('Đã tập hôm nay (0)');
      expect(allText(r)).toContain('Lịch sử gần đây');
    });

    it('only one entry is edited at a time', async () => {
      useWorkoutStore.setState({ entries: [entry(), entry({ id: 'e2', label: 'Yoga' })] });
      const r = await mount();
      await press(r, 'Sửa buổi tập: Yoga');
      await press(r, 'Sửa buổi tập: Đi bộ nhanh');
      expect(r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.testID === 'edit-e2-label')).toHaveLength(0);
      expect(r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.testID === 'edit-e1-label').length).toBeGreaterThan(0);
    });

    it('editing the minutes from 8 to 12 flips the workout mission to done (everything derives from the logs)', async () => {
      useWorkoutStore.setState({ entries: [entry({ durationMin: 8 })] });
      const key = toDateKey(NOW);
      function Probe() {
        const now = useNow();
        const status = useDayEvaluator(now)(key).missions.find((m) => m.id === 'workout')?.status;
        return <>{status}</>;
      }
      const probe = await (async () => {
        let p!: ReactTestRenderer;
        await act(async () => {
          p = create(<Probe />);
        });
        return p;
      })();
      expect(JSON.stringify(probe.toJSON())).toContain('open');
      const r = await mount();
      await press(r, 'Sửa buổi tập: Đi bộ nhanh');
      await type(r, 'edit-e1-duration', '12');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(JSON.stringify(probe.toJSON())).toContain('done');
      act(() => probe.unmount());
    });
  });

  describe('photo-first logging (the photo is the way in: analysed and logged by itself)', () => {
    const logForm = (r: ReactTestRenderer) => formOf(r, 'log', 'Ghi nhận');
    const complete = { activityName: 'Đi bộ dốc', durationMin: 42, estimatedCaloriesBurned: 318, confidence: 'medium', reasoning: 'Màn hình máy báo 42 phút.' };
    const ok = (result: Record<string, unknown>) => mockAnalysis.mockResolvedValue({ ok: true, result });
    const entries = () => useWorkoutStore.getState().entries;

    it('puts the photo section at the TOP of the manual form, above the name, duration and calories inputs', async () => {
      const r = await mount();
      const text = allText(r);
      const photoAt = text.indexOf('ẢNH KẾT QUẢ TẬP LUYỆN');
      expect(photoAt).toBeGreaterThan(-1);
      expect(photoAt).toBeLessThan(text.indexOf('Tên buổi tập'));
      expect(photoAt).toBeLessThan(text.indexOf('Thời lượng (phút)'));
      expect(hasPress(logForm(r), 'Chụp ảnh')).toBe(true);
      expect(hasPress(logForm(r), 'Chọn từ thư viện')).toBe(true);
      expect(text).toContain('AI tự điền số liệu và ghi buổi tập cho bạn');
    });

    it('picks a photo from the camera or the gallery, previews it and removes it', async () => {
      mockAnalysis.mockResolvedValue({ ok: false, kind: 'generic', message: 'x' }); // analysis fails, the photo stays
      const r = await mount();
      await press(logForm(r), 'Chụp ảnh');
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn').map(sourceUri)).toContain(CAM);
      await press(logForm(r), 'Xóa ảnh');
      await press(logForm(r), 'Chọn từ thư viện');
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn').map(sourceUri)).toContain(GAL);
      await press(logForm(r), 'Xóa ảnh');
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn')).toHaveLength(0);
    });

    it('starts the analysis by itself as soon as the photo is chosen (no analyze button pressed), sending the profile', async () => {
      ok(complete);
      const r = await mount();
      expect(mockAnalysis).not.toHaveBeenCalled();
      await press(logForm(r), 'Chọn từ thư viện');
      expect(mockAnalysis).toHaveBeenCalledTimes(1);
      const args = mockAnalysis.mock.calls[0];
      expect(args[0]).toBe('workout');
      expect(args[4]).toMatchObject({ weightKg: 106.2, heightCm: 172 });
    });

    it('logs the workout by itself with the photo attached, and shows the confirmation card', async () => {
      ok(complete);
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()).toHaveLength(1);
      const [created] = entries();
      expect(created).toMatchObject({ templateId: null, label: 'Đi bộ dốc', durationMin: 42, caloriesBurned: 318 });
      expect(mockPersist).toHaveBeenCalledWith(GAL, expect.stringMatching(/^workout-/));
      const proofs = useProofStore.getState().photos;
      expect(proofs).toHaveLength(1);
      expect(proofs[0]).toMatchObject({ taskType: 'workout', taskRefId: created.id });
      expect(proofs[0].photoUri).toMatch(/^file:\/\/\/docs\/proofs\/workout-/);
      expect(mockPushProof).toHaveBeenCalledTimes(1);
      expect(mockPushWorkout).toHaveBeenCalledWith(expect.objectContaining({ label: 'Đi bộ dốc' }));
      const text = allText(r);
      expect(text).toContain('Đã ghi từ ảnh');
      expect(text).toContain('Đi bộ dốc · 42 phút · 318 kcal');
      expect(text).toContain('Độ tin cậy: vừa');
      expect(text).toContain('Màn hình máy báo 42 phút.');
      expect(hasPress(r.root, 'Sửa')).toBe(true);
      expect(hasPress(r.root, 'Hoàn tác')).toBe(true);
      // The form is ready for the next workout.
      expect(inputById(r, 'log-label').props.value).toBe('');
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn')).toHaveLength(0);
    });

    it('the typed values win: a typed name is used, the AI fills the rest', async () => {
      ok({ ...complete, activityName: 'Đạp xe' });
      const r = await mount();
      await type(r, 'log-label', 'Chạy sáng của tôi');
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()[0]).toMatchObject({ label: 'Chạy sáng của tôi', durationMin: 42, caloriesBurned: 318 });
    });

    it('typed minutes and calories are kept too (the AI cannot overwrite them)', async () => {
      ok(complete);
      const r = await mount();
      await type(r, 'log-duration', '50');
      await type(r, 'log-calories', '400');
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()[0]).toMatchObject({ label: 'Đi bộ dốc', durationMin: 50, caloriesBurned: 400 });
    });

    it('does NOT log by itself when the AI is not confident: fills the form, keeps the photo, asks to check', async () => {
      ok({ ...complete, confidence: 'low' });
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()).toHaveLength(0);
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockPersist).not.toHaveBeenCalled();
      expect(inputById(r, 'log-label').props.value).toBe('Đi bộ dốc');
      expect(inputById(r, 'log-duration').props.value).toBe('42');
      expect(inputById(r, 'log-calories').props.value).toBe('318');
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn').map(sourceUri)).toContain(GAL);
      expect(allText(r)).toContain('chưa tự ghi');
      expect(allText(r)).not.toContain('Đã ghi từ ảnh');
      // The user checks and logs: the entry gets the photo.
      await press(logForm(r), 'Ghi nhận');
      expect(entries()).toHaveLength(1);
      expect(useProofStore.getState().photos[0]).toMatchObject({ taskType: 'workout', taskRefId: entries()[0].id });
    });

    it.each([
      ['no calories', { activityName: 'Bơi', durationMin: 30, confidence: 'high', reasoning: 'x' }, 'log-duration', '30', 'log-calories', ''],
      ['no minutes', { activityName: 'Bơi', estimatedCaloriesBurned: 250, confidence: 'high', reasoning: 'x' }, 'log-calories', '250', 'log-duration', ''],
    ])('does NOT log by itself when the result has %s: fills what came back and keeps the photo', async (_name, result, filledId, filledValue, emptyId, emptyValue) => {
      ok(result as Record<string, unknown>);
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()).toHaveLength(0);
      expect(inputById(r, filledId as string).props.value).toBe(filledValue);
      expect(inputById(r, emptyId as string).props.value).toBe(emptyValue);
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn')).toHaveLength(1);
      expect(allText(r)).toContain('chưa tự ghi');
    });

    it.each([
      ['not set up', { ok: false, kind: 'notConfigured', message: 'Server chưa cấu hình ANTHROPIC_API_KEY.' }, 'AI chưa được thiết lập'],
      ['offline', { ok: false, kind: 'offline', message: 'x' }, 'Không có mạng'],
      ['generic error', { ok: false, kind: 'generic', message: 'x' }, 'Chưa phân tích được ảnh này'],
    ])('on an AI failure (%s) shows the friendly message, keeps the photo, and manual entry still works', async (_n, outcome, message) => {
      mockAnalysis.mockResolvedValue(outcome as Outcome);
      const r = await mount();
      await type(r, 'log-label', 'Chạy');
      await press(logForm(r), 'Chọn từ thư viện');
      expect(allText(r)).toContain(message);
      expect(allText(r)).toContain('Ảnh vẫn được giữ lại');
      expect(entries()).toHaveLength(0);
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn')).toHaveLength(1);
      expect(inputById(r, 'log-label').props.value).toBe('Chạy'); // typed data is never lost
      await type(r, 'log-duration', '20');
      await type(r, 'log-calories', '200');
      await press(logForm(r), 'Ghi nhận');
      expect(entries()).toHaveLength(1);
      expect(useProofStore.getState().photos).toHaveLength(1);
    });

    it('"Phân tích lại" retries after a failure and then logs by itself', async () => {
      mockAnalysis.mockResolvedValueOnce({ ok: false, kind: 'offline', message: 'x' });
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()).toHaveLength(0);
      ok(complete);
      await press(logForm(r), 'Phân tích lại');
      expect(mockAnalysis).toHaveBeenCalledTimes(2);
      expect(entries()).toHaveLength(1);
      expect(allText(r)).toContain('Đã ghi từ ảnh');
    });

    it('if the photo cannot be saved the workout is not logged, and the photo and filled inputs stay', async () => {
      ok(complete);
      mockPersist.mockRejectedValue(new Error('disk full'));
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      expect(entries()).toHaveLength(0);
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(allText(r)).toContain('Không lưu được ảnh nên buổi tập chưa được lưu');
      expect(inputById(r, 'log-label').props.value).toBe('Đi bộ dốc');
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn')).toHaveLength(1);
    });

    it('ignores a second photo while the first is being analysed', async () => {
      let release!: (v: Outcome) => void;
      mockAnalysis.mockImplementation(() => new Promise<Outcome>((res) => (release = res)));
      const r = await mount();
      await press(logForm(r), 'Chụp ảnh');
      await press(logForm(r), 'Chọn từ thư viện'); // the second photo
      expect(mockAnalysis).toHaveBeenCalledTimes(1);
      expect(images(r, 'Ảnh kết quả tập luyện đã chọn').map(sourceUri)).toEqual([CAM]);
      await act(async () => release({ ok: true, result: complete }));
      expect(entries()).toHaveLength(1);
      expect(mockPersist).toHaveBeenCalledWith(CAM, expect.any(String));
      expect(mockPersist).not.toHaveBeenCalledWith(GAL, expect.any(String));
    });

    it('Undo removes the entry, its proof and its file, and the card goes away', async () => {
      ok(complete);
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      const proofUri = useProofStore.getState().photos[0].photoUri;
      await press(r, 'Hoàn tác');
      expect(entries()).toHaveLength(0);
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockDeletePhoto).toHaveBeenCalledWith(proofUri);
      expect(allText(r)).not.toContain('Đã ghi từ ảnh');
    });

    it('"Sửa" on the card opens the edit form for that entry, and saving changes it', async () => {
      ok(complete);
      const r = await mount();
      await press(logForm(r), 'Chọn từ thư viện');
      const [created] = entries();
      await press(r, 'Sửa');
      expect(inputById(r, `edit-${created.id}-label`).props.value).toBe('Đi bộ dốc');
      expect(inputById(r, `edit-${created.id}-duration`).props.value).toBe('42');
      await type(r, `edit-${created.id}-duration`, '45');
      await press(formOf(r, `edit-${created.id}`, 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(entries()[0]).toMatchObject({ id: created.id, durationMin: 45, caloriesBurned: 318 });
      expect(allText(r)).toContain('Đi bộ dốc · 45 phút · 318 kcal'); // the card shows the current numbers
    });

    it('works end to end with the offline Login Dev simulated result', async () => {
      const { fakePhotoAnalysis } = jest.requireActual('../../ai/devPhotoAnalysis') as typeof import('../../ai/devPhotoAnalysis');
      mockAnalysis.mockImplementation(async (...a: unknown[]) => ({ ok: true, result: fakePhotoAnalysis('workout', a[4] as never) as unknown as Record<string, unknown> }));
      const r = await mount();
      await press(logForm(r), 'Chụp ảnh');
      expect(entries()).toHaveLength(1);
      expect(entries()[0]).toMatchObject({ label: 'Đi bộ dốc', durationMin: 45, caloriesBurned: Math.round((6 * 106.2 * 45) / 60) });
      expect(allText(r)).toContain('Dữ liệu giả lập (chế độ Dev)');
    });

    it('saves a typed workout without a photo exactly as before (no proof, nothing persisted, no analysis)', async () => {
      const r = await mount();
      await type(r, 'log-label', 'Yoga');
      await type(r, 'log-duration', '30');
      await type(r, 'log-calories', '90');
      await press(logForm(r), 'Ghi nhận');
      expect(entries()).toHaveLength(1);
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockPersist).not.toHaveBeenCalled();
      expect(mockAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('photo on an existing entry', () => {
    const withProof = (uri = 'file:///docs/proofs/old.jpg') => {
      useWorkoutStore.setState({ entries: [entry()] });
      useProofStore.setState({ photos: [{ id: 'p1', dateISO: entry().dateISO, taskType: 'workout', taskRefId: 'e1', photoUri: uri, note: '', createdAtISO: entry().dateISO }] });
    };

    it('shows the thumbnail and offers Change / Remove, or Add when there is none', async () => {
      useWorkoutStore.setState({ entries: [entry()] });
      const r = await mount();
      expect(hasPress(r.root, 'Thêm ảnh: Đi bộ nhanh')).toBe(true);
      expect(hasPress(r.root, 'Xóa ảnh: Đi bộ nhanh')).toBe(false);
      act(() => r.unmount());
      withProof();
      const r2 = await mount();
      expect(images(r2, 'Ảnh Đi bộ nhanh').map(sourceUri)).toContain('file:///docs/proofs/old.jpg');
      expect(hasPress(r2.root, 'Đổi ảnh: Đi bộ nhanh')).toBe(true);
      expect(hasPress(r2.root, 'Xóa ảnh: Đi bộ nhanh')).toBe(true);
    });

    it('adds a photo to an entry that has none, through the edit form', async () => {
      useWorkoutStore.setState({ entries: [entry()] });
      const r = await mount();
      await press(r, 'Thêm ảnh: Đi bộ nhanh');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Chụp ảnh');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      const proofs = useProofStore.getState().photos;
      expect(proofs).toHaveLength(1);
      expect(proofs[0]).toMatchObject({ taskType: 'workout', taskRefId: 'e1' });
      expect(mockPersist).toHaveBeenCalledWith(CAM, expect.any(String));
    });

    it('replaces the photo: the old proof and file go, the new one stays', async () => {
      withProof();
      const r = await mount();
      await press(r, 'Đổi ảnh: Đi bộ nhanh');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Chọn từ thư viện');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      const proofs = useProofStore.getState().photos;
      expect(proofs).toHaveLength(1);
      expect(proofs[0].id).not.toBe('p1');
      expect(proofs[0].photoUri).toMatch(/^file:\/\/\/docs\/proofs\/workout-/);
      expect(mockDeletePhoto).toHaveBeenCalledWith('file:///docs/proofs/old.jpg');
    });

    it('a failed replacement leaves the old photo and the old numbers untouched', async () => {
      withProof();
      mockPersist.mockRejectedValue(new Error('disk full'));
      const r = await mount();
      await press(r, 'Đổi ảnh: Đi bộ nhanh');
      await type(r, 'edit-e1-duration', '30');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Chọn từ thư viện');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(useProofStore.getState().photos.map((p) => p.id)).toEqual(['p1']);
      expect(useWorkoutStore.getState().entries[0].durationMin).toBe(8);
      expect(allText(r)).toContain('Không lưu được ảnh nên buổi tập chưa được lưu');
    });

    it('removes the photo straight from the card', async () => {
      withProof();
      const r = await mount();
      await press(r, 'Xóa ảnh: Đi bộ nhanh');
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockDeletePhoto).toHaveBeenCalledWith('file:///docs/proofs/old.jpg');
      expect(hasPress(r.root, 'Thêm ảnh: Đi bộ nhanh')).toBe(true);
    });

    it('removes the photo inside the edit form (applied on save, not before)', async () => {
      withProof();
      const r = await mount();
      await press(r, 'Đổi ảnh: Đi bộ nhanh');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Xóa ảnh');
      expect(useProofStore.getState().photos).toHaveLength(1); // still there until saved
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(useProofStore.getState().photos).toHaveLength(0);
    });

    it('a new analysis refills the edit inputs from the new photo, but never what was typed in this form', async () => {
      withProof();
      mockAnalysis.mockResolvedValue({ ok: true, result: { activityName: 'Elliptical', durationMin: 35, estimatedCaloriesBurned: 330, reasoning: 'ok' } });
      const r = await mount();
      await press(r, 'Đổi ảnh: Đi bộ nhanh');
      await type(r, 'edit-e1-label', 'Máy chạy của tôi');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Chọn từ thư viện');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Phân tích ảnh bằng AI');
      expect(inputById(r, 'edit-e1-label').props.value).toBe('Máy chạy của tôi');
      expect(inputById(r, 'edit-e1-duration').props.value).toBe('35'); // the old 8 was replaced
      expect(inputById(r, 'edit-e1-calories').props.value).toBe('330');
      await press(formOf(r, 'edit-e1', 'Lưu thay đổi'), 'Lưu thay đổi');
      expect(useWorkoutStore.getState().entries[0]).toMatchObject({ label: 'Máy chạy của tôi', durationMin: 35, caloriesBurned: 330 });
    });

    it('deleting an entry deletes its proof and its file', async () => {
      withProof();
      const r = await mount();
      await press(r, 'Xóa: Đi bộ nhanh');
      expect(useWorkoutStore.getState().entries).toHaveLength(0);
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockDeletePhoto).toHaveBeenCalledWith('file:///docs/proofs/old.jpg');
    });
  });
});
