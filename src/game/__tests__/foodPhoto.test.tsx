import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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
  imageUriToBase64: jest.fn(),
}));
const mockPushProof = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
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
  requestPhotoAnalysis: jest.fn(),
}));

import AddFoodScreen from '../../../app/add-food';
import JournalScreen from '../../../app/journal';
import { DailyMealBreakdownTable } from '../../components/DailyMealBreakdownTable';
import { DEFAULT_PLAN } from '../../constants/plan';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { extraProofRef, type ExtraFoodItem } from '../../types';

const DATE = '2026-10-23';
const CAM = 'file:///tmp/cam.jpg';
const GAL = 'file:///tmp/gallery.png';

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
// Host nodes only: the Image composite and its host element both carry the same props.
const images = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label && n.props.source);
const preview = (r: ReactTestRenderer) => images(r, 'Ảnh món ăn đã chọn');
const sourceUri = (n: ReactTestInstance) => (n.props.source as { uri: string }).uri;

describe('Photo on an off-plan food', () => {
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

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockCameraPermission.mockResolvedValue({ granted: true });
    mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [{ uri: CAM }] });
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: GAL }] });
    mockPersist.mockImplementation(async (_uri, id) => `file:///docs/proofs/${id}.jpg`);
    mockDeletePhoto.mockResolvedValue(undefined);
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, activityLevel: 'light' });
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

  describe('picking', () => {
    it('takes a photo with the camera and previews it', async () => {
      const r = await mount(<AddFoodScreen />);
      expect(preview(r)).toHaveLength(0);
      await press(r, 'Chụp ảnh');
      expect(mockCameraPermission).toHaveBeenCalled();
      expect(preview(r).map(sourceUri)).toContain(CAM);
      expect(allText(r)).not.toContain('Không bắt buộc. Ảnh được lưu'); // the hint gives way to the preview
    });

    it('chooses a photo from the gallery without asking for library permission', async () => {
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chọn từ thư viện');
      expect(mockCameraPermission).not.toHaveBeenCalled();
      expect(preview(r).map(sourceUri)).toContain(GAL);
    });

    it('changes nothing when the picker is cancelled', async () => {
      mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });
      mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chụp ảnh');
      await press(r, 'Chọn từ thư viện');
      expect(preview(r)).toHaveLength(0);
      expect(allText(r)).not.toContain('Không lấy được ảnh');
      expect(allText(r)).not.toContain('Camera');
    });

    it('explains a refused camera permission inline and never opens the camera', async () => {
      mockCameraPermission.mockResolvedValue({ granted: false, canAskAgain: true });
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chụp ảnh');
      expect(mockLaunchCamera).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Chưa có quyền dùng camera');
      expect(preview(r)).toHaveLength(0);
      // The gallery still works, and picking something clears the message.
      await press(r, 'Chọn từ thư viện');
      expect(allText(r)).not.toContain('Chưa có quyền dùng camera');
      expect(preview(r)).toHaveLength(1);
    });

    it('tells the user where to turn the camera back on when it is blocked for good', async () => {
      mockCameraPermission.mockResolvedValue({ granted: false, canAskAgain: false });
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chụp ảnh');
      expect(allText(r)).toContain('Cài đặt của điện thoại');
    });

    it('reports a picker that throws, without crashing', async () => {
      mockLaunchLibrary.mockRejectedValue(new Error('boom'));
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chọn từ thư viện');
      expect(allText(r)).toContain('Không lấy được ảnh');
    });

    it('removes the chosen photo', async () => {
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chụp ảnh');
      expect(preview(r)).toHaveLength(1);
      await press(r, 'Xóa ảnh');
      expect(preview(r)).toHaveLength(0);
    });
  });

  describe('saving', () => {
    const fill = async (r: ReactTestRenderer, name = 'Bánh bao') => {
      await act(async () => textInput(r, 'Tên món').props.onChangeText(name));
      await act(async () => textInput(r, 'Calo (kcal)').props.onChangeText('320'));
    };
    const items = () => useNutritionStore.getState().logs[DATE].extraItems;

    it('stores the photo with the item and also saves it as a meal proof the coach can see', async () => {
      const r = await mount(<AddFoodScreen />);
      await fill(r);
      await press(r, 'Chụp ảnh');
      await press(r, 'Thêm vào hôm nay');

      expect(mockPersist).toHaveBeenCalledWith(CAM, expect.stringMatching(/^extra-/));
      expect(items()).toHaveLength(1);
      const item = items()[0];
      expect(item.photoUri).toMatch(/^file:\/\/\/docs\/proofs\/extra-.*\.jpg$/); // our persisted copy, not the picker's temp file
      const proofs = useProofStore.getState().photos;
      expect(proofs).toHaveLength(1);
      expect(proofs[0]).toMatchObject({ taskType: 'meal', taskRefId: extraProofRef(item.id), photoUri: item.photoUri, note: 'Bánh bao' });
      expect(mockPushProof).toHaveBeenCalledTimes(1); // handed to the sync pipeline
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('still saves without a photo, and creates no proof', async () => {
      const r = await mount(<AddFoodScreen />);
      await fill(r);
      await press(r, 'Thêm vào hôm nay');
      expect(items()).toHaveLength(1);
      expect(items()[0].photoUri).toBeUndefined();
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockPersist).not.toHaveBeenCalled();
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('keeps everything typed when the photo cannot be saved, and lets the user retry without it', async () => {
      mockPersist.mockRejectedValueOnce(new Error('disk full'));
      const r = await mount(<AddFoodScreen />);
      await fill(r, 'Phở bò');
      await press(r, 'Chọn từ thư viện');
      await press(r, 'Thêm vào hôm nay');

      expect(items()).toHaveLength(0);
      expect(mockRouter.back).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Không lưu được ảnh nên món chưa được thêm');
      expect(textInput(r, 'Tên món').props.value).toBe('Phở bò');
      expect(textInput(r, 'Calo (kcal)').props.value).toBe('320');
      expect(preview(r)).toHaveLength(1);

      await press(r, 'Xóa ảnh');
      expect(allText(r)).not.toContain('Không lưu được ảnh nên món chưa được thêm');
      await press(r, 'Thêm vào hôm nay');
      expect(items()).toHaveLength(1);
      expect(items()[0].name).toBe('Phở bò');
    });

    it('does not leave a copied file behind when adding the item itself fails', async () => {
      const original = useNutritionStore.getState().addExtra;
      useNutritionStore.setState({ addExtra: () => { throw new Error('store down'); } });
      try {
        const r = await mount(<AddFoodScreen />);
        await fill(r);
        await press(r, 'Chụp ảnh');
        await press(r, 'Thêm vào hôm nay');
        expect(mockDeletePhoto).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/docs\/proofs\/extra-/));
        expect(mockRouter.back).not.toHaveBeenCalled();
      } finally {
        useNutritionStore.setState({ addExtra: original });
      }
    });

    it('locks the form and saves only once while the photo is being written', async () => {
      let finish!: (uri: string) => void;
      mockPersist.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
      const r = await mount(<AddFoodScreen />);
      await fill(r);
      await press(r, 'Chụp ảnh');
      await press(r, 'Thêm vào hôm nay');
      expect(pressable(r, 'Chụp ảnh').props.disabled).toBe(true);
      expect(pressable(r, 'Xóa ảnh').props.disabled).toBe(true);
      expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Thêm vào hôm nay' && n.props.accessibilityState?.busy === true).length).toBeGreaterThan(0);
      await press(r, 'Thêm vào hôm nay'); // a second tap while busy is ignored
      expect(mockPersist).toHaveBeenCalledTimes(1);
      await act(async () => finish('file:///docs/proofs/extra-1.jpg'));
      expect(items()).toHaveLength(1);
    });
  });

  describe('deleting', () => {
    async function addWithPhoto(name = 'Bánh bao'): Promise<ExtraFoodItem> {
      jest.setSystemTime(new Date(Date.now() + 5)); // a distinct id per item
      useNutritionStore.getState().addExtra(DATE, name, 200, 5, null, { photoUri: `file:///docs/proofs/${name}.jpg` });
      const list = useNutritionStore.getState().logs[DATE].extraItems;
      return list[list.length - 1];
    }

    it('removing an item takes its photo (proof and file) with it', async () => {
      const item = await addWithPhoto();
      expect(useProofStore.getState().photos).toHaveLength(1);
      useNutritionStore.getState().removeExtraItem(DATE, item.id);
      expect(useProofStore.getState().photos).toHaveLength(0);
      expect(mockDeletePhoto).toHaveBeenCalledWith('file:///docs/proofs/Bánh bao.jpg');
    });

    it('removing an item whose proof entry is already gone still deletes the file', async () => {
      const item = await addWithPhoto();
      useProofStore.setState({ photos: [] });
      useNutritionStore.getState().removeExtraItem(DATE, item.id);
      expect(mockDeletePhoto).toHaveBeenCalledWith(item.photoUri);
    });

    it('a diary edit that drops an item deletes only that item’s photo; edited items keep theirs', async () => {
      const a = await addWithPhoto('Bánh bao');
      const b = await addWithPhoto('Xôi');
      expect(useProofStore.getState().photos).toHaveLength(2);
      useNutritionStore.getState().saveDayLog(DATE, {
        mealsEaten: {},
        removedMealSlots: [],
        extraItems: [{ ...b, name: 'Xôi gấc' }], // `a` removed, `b` renamed
      });
      const refs = useProofStore.getState().photos.map((p) => p.taskRefId);
      expect(refs).toEqual([extraProofRef(b.id)]);
      expect(mockDeletePhoto).toHaveBeenCalledWith(a.photoUri);
      expect(mockDeletePhoto).not.toHaveBeenCalledWith(b.photoUri);
      expect(useNutritionStore.getState().logs[DATE].extraItems[0].photoUri).toBe(b.photoUri);
    });

    it('removing an item without a photo touches no files', () => {
      useNutritionStore.getState().addExtra(DATE, 'Cà phê', 50, 0, null);
      const [item] = useNutritionStore.getState().logs[DATE].extraItems;
      useNutritionStore.getState().removeExtraItem(DATE, item.id);
      expect(mockDeletePhoto).not.toHaveBeenCalled();
    });
  });

  describe('showing the photo where items are listed', () => {
    const photoItem: ExtraFoodItem = { id: '101', name: 'Bánh bao', calories: 300, proteinG: 8, mealTime: 'lunch', loggedAtISO: `${DATE}T12:30:00`, photoUri: 'file:///docs/proofs/bb.jpg' };
    const oldItem: ExtraFoodItem = { id: '102', name: 'Cà phê sữa', calories: 120, proteinG: 2, mealTime: null, loggedAtISO: `${DATE}T09:00:00` };
    const thumbs = (r: ReactTestRenderer, name: string) => images(r, `Ảnh ${name}`);

    it('the journal shows a thumbnail for an item with a photo; items without one render as before', async () => {
      useNutritionStore.setState({
        logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 420, extraProteinG: 10, extraItems: [photoItem, oldItem], waterMl: 0 } },
      });
      const r = await mount(<JournalScreen />);
      expect(thumbs(r, 'Bánh bao').map(sourceUri)).toEqual(['file:///docs/proofs/bb.jpg']);
      expect(thumbs(r, 'Cà phê sữa')).toHaveLength(0);
      expect(allText(r)).toContain('Cà phê sữa');
      expect(allText(r)).toMatch(/120\s+kcal/);
    });

    it('the diary table shows it too, in both the read-only and the editable layout', async () => {
      for (const editable of [false, true]) {
        const r = await mount(
          <DailyMealBreakdownTable dark meals={DEFAULT_PLAN.mealTemplates.training} mealsEaten={{}} extraItems={[photoItem, oldItem]} editable={editable} />
        );
        expect(thumbs(r, 'Bánh bao')).toHaveLength(1);
        expect(thumbs(r, 'Cà phê sữa')).toHaveLength(0);
        act(() => r.unmount());
        renderer = undefined;
      }
    });

    it('a photo that cannot be loaded (e.g. synced from another device) just disappears', async () => {
      useNutritionStore.setState({
        logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 300, extraProteinG: 8, extraItems: [photoItem], waterMl: 0 } },
      });
      const r = await mount(<JournalScreen />);
      const img = thumbs(r, 'Bánh bao')[0];
      await act(async () => img.props.onError?.());
      expect(thumbs(r, 'Bánh bao')).toHaveLength(0);
      expect(allText(r)).toContain('Bánh bao');
    });
  });

  describe('several photos of one meal', () => {
    const P1 = 'file:///docs/proofs/a.jpg';
    const P2 = 'file:///docs/proofs/b.jpg';
    const P3 = 'file:///docs/proofs/c.jpg';
    const item: ExtraFoodItem = { id: '201', name: 'Bún chả', calories: 550, proteinG: 25, mealTime: 'lunch', loggedAtISO: `${DATE}T12:30:00`, photoUri: P1 };
    const withThree = () => {
      useNutritionStore.setState({
        logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 550, extraProteinG: 25, extraItems: [item], waterMl: 0 } },
      });
      const at = `${DATE}T12:31:00.000Z`;
      useProofStore.setState({
        photos: [
          { id: '9-2', dateISO: item.loggedAtISO, taskType: 'meal', taskRefId: extraProofRef(item.id), photoUri: P3, note: '', createdAtISO: at },
          { id: '9', dateISO: item.loggedAtISO, taskType: 'meal', taskRefId: extraProofRef(item.id), photoUri: P1, note: '', createdAtISO: at },
          { id: '9-1', dateISO: item.loggedAtISO, taskType: 'meal', taskRefId: extraProofRef(item.id), photoUri: P2, note: '', createdAtISO: at },
        ],
      });
    };
    const proofsOf = (id: string) => useProofStore.getState().photos.filter((p) => p.taskRefId === extraProofRef(id));

    it('saves every photo of the meal (each with its own id), the first one as the food\'s own photo', async () => {
      const r = await mount(<AddFoodScreen />);
      await press(r, 'Chọn từ thư viện');
      mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///tmp/b.jpg' }, { uri: 'file:///tmp/c.jpg' }] });
      await press(r, 'Chọn ảnh');
      await act(async () => textInput(r, 'Tên món').props.onChangeText('Bún chả'));
      await act(async () => textInput(r, 'Calo (kcal)').props.onChangeText('550'));
      await press(r, 'Thêm vào hôm nay');

      const saved = useNutritionStore.getState().logs[DATE].extraItems[0];
      const proofs = proofsOf(saved.id);
      expect(proofs).toHaveLength(3);
      expect(new Set(proofs.map((p) => p.id)).size).toBe(3);
      expect(proofs[0].photoUri).toBe(saved.photoUri);
      expect(mockPushProof).toHaveBeenCalledTimes(3);
    });

    it('the journal shows one thumbnail with a "3 photos" badge; tapping it shows them in a row with ‹ ›', async () => {
      withThree();
      const r = await mount(<JournalScreen />);
      expect(images(r, 'Ảnh Bún chả').map(sourceUri)).toEqual([P1]);
      await press(r, 'Xem 3 ảnh của bữa');
      expect(allText(r)).toContain('1/3');
      expect(images(r, 'Ảnh 1/3 Bún chả').map(sourceUri)).toEqual([P1]);
      expect(images(r, 'Ảnh 3/3 Bún chả').map(sourceUri)).toEqual([P3]);
      expect(pressable(r, 'Ảnh trước').props.disabled).toBe(true);
      await press(r, 'Ảnh sau');
      expect(allText(r)).toContain('2/3');
      await press(r, 'Ảnh sau');
      expect(allText(r)).toContain('3/3');
      expect(pressable(r, 'Ảnh sau').props.disabled).toBe(true);
    });

    it('the diary table shows the same badge', async () => {
      withThree();
      const r = await mount(<DailyMealBreakdownTable dark meals={DEFAULT_PLAN.mealTemplates.training} mealsEaten={{}} extraItems={[item]} editable={false} />);
      expect(images(r, 'Ảnh Bún chả')).toHaveLength(1);
      expect(pressable(r, 'Xem 3 ảnh của bữa')).toBeDefined();
    });

    it('the day table (History) has a photo button on each saved meal: add, view and remove photos there', async () => {
      withThree();
      const slot = DEFAULT_PLAN.mealTemplates.training[0];
      const r = await mount(
        <DailyMealBreakdownTable dark dateKey={DATE} meals={DEFAULT_PLAN.mealTemplates.training} mealsEaten={{ [slot.slot]: true }} extraItems={[item]} editable />
      );
      await press(r, 'Ảnh của Bún chả: thêm, xem hoặc xóa');
      expect(allText(r)).toContain('1/3');
      await press(r, 'Xóa ảnh này');
      expect(proofsOf(item.id)).toHaveLength(2);
      await press(r, 'Đóng');

      // A plan meal that was eaten gets one too; its first photo then shows as a thumbnail in the row.
      await press(r, `Ảnh của ${slot.label}: thêm, xem hoặc xóa`);
      await press(r, 'Chọn từ thư viện');
      const slotPhotos = useProofStore.getState().photos.filter((p) => p.taskRefId === slot.slot);
      expect(slotPhotos).toHaveLength(1);
      await press(r, 'Đóng');
      expect(images(r, `Ảnh ${slot.label}`)).toHaveLength(1);
    });

    it('in the meal detail, removes only the photo in view, then offers to add one again', async () => {
      withThree();
      const r = await mount(<JournalScreen />);
      await press(r, '12:30 Bún chả. 550 kcal');
      expect(allText(r)).toContain('1/3');
      expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Thêm ảnh (3/3)')).toHaveLength(0); // already 3
      await press(r, 'Ảnh sau');
      await press(r, 'Xóa ảnh này');
      expect(proofsOf(item.id).map((p) => p.photoUri).sort()).toEqual([P1, P3]);
      expect(useNutritionStore.getState().logs[DATE].extraItems[0].photoUri).toBe(P1);
      expect(allText(r)).toContain('1/2');

      // The first photo goes too: the food loses its own photo, the other one stays.
      await press(r, 'Xóa ảnh này');
      expect(proofsOf(item.id).map((p) => p.photoUri)).toEqual([P3]);
      expect(useNutritionStore.getState().logs[DATE].extraItems[0].photoUri).toBeUndefined();

      mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: GAL }] });
      await press(r, 'Thêm ảnh (1/3)');
      expect(proofsOf(item.id)).toHaveLength(2);
    });
  });
});
