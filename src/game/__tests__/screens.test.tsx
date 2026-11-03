import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

// Only navigation, storage and the network edge are mocked; stores, game engine and UI are real.
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
  setParams: jest.fn(),
};
let mockParams: { slot?: string; date?: string; photo?: string } = { slot: 'meal3' };

// The factory runs when the screens import expo-router, before `mockRouter` is initialised, so the
// router methods defer to it at call time instead of capturing it here.
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
    dismissTo: (...a: unknown[]) => mockRouter.dismissTo(...a),
    setParams: (...a: unknown[]) => mockRouter.setParams(...a),
  },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-image-picker', () => ({}));
const mockPickPhoto = jest.fn<(source: string) => Promise<unknown>>(async () => null);
jest.mock('../../utils/pickPhoto', () => ({ pickPhoto: (s: string) => mockPickPhoto(s), pickPhotos: jest.fn(async () => null) }));
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: jest.fn(),
  imageUriToBase64: jest.fn(),
  deletePersistedPhoto: jest.fn(async () => undefined),
}));
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
  pushProofPhoto: jest.fn(),
  deleteProofPhoto: jest.fn(async () => undefined),
  pushFeelingRecord: jest.fn(),
  deleteFeelingRecord: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
  requestPhotoAnalysis: jest.fn(),
}));

import AddFoodScreen from '../../../app/add-food';
import MealDetailScreen from '../../../app/meal/[slot]';
import CheckinScreen from '../../../app/checkin';
import JournalScreen from '../../../app/journal';
import QuickAddScreen from '../../../app/quick-add';
import { useFeelingStore } from '../../store/useFeelingStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useSelectedDayStore } from '../../store/useSelectedDayStore';
import { useToastStore } from '../../store/useToastStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useCheatDayStore } from '../../store/useCheatDayStore';
import { useEatAgainStore } from '../../store/useEatAgainStore';
import { useSkippedMealStore } from '../../store/useSkippedMealStore';
import { deleteFeelingRecord, pushFeelingRecord, pushNutritionLog } from '../../sync/cloudSync';

const DATE = '2026-10-23';

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

/** First pressable whose accessibility label satisfies `match`. */
function pressable(r: ReactTestRenderer, match: (label: string) => boolean): ReactTestInstance {
  const found = r.root.findAll(
    (n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && match(n.props.accessibilityLabel)
  )[0];
  if (!found) throw new Error('no pressable matched');
  return found;
}

function textInput(r: ReactTestRenderer, label: string): ReactTestInstance {
  const found = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  if (!found) throw new Error(`no input labelled ${label}`);
  return found;
}

describe('FitQuest logging screens', () => {
  let renderer: ReactTestRenderer | undefined;

  function render(element: React.ReactElement): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(element);
    });
    renderer = r;
    return r;
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') }); // Friday, eating window open
    Object.values(mockRouter).forEach((fn) => fn.mockClear());
    mockPickPhoto.mockClear();
    useProofStore.setState({ photos: [] });
    useSelectedDayStore.setState({ selectedKey: null });
    mockRouter.canGoBack.mockReturnValue(true);
    mockParams = { slot: 'meal3' };
    useSettingsStore.setState({
      startDateISO: '2026-10-19T08:00:00',
      startWeightKg: 110,
      goalWeightKg: 95,
      waterTargetMl: 4500,
      proteinTargetG: 200,
      language: 'vi',
      activityLevel: 'light',
    });
    useFeelingStore.setState({ records: [] });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useNutritionStore.setState({
      logs: {
        [DATE]: { dateISO: DATE, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 3200 },
      },
    });
    useWorkoutStore.setState({
      entries: [{ id: 'x', dateISO: `${DATE}T15:00:00`, templateId: null, label: 'Ngày A', durationMin: 14, caloriesBurned: 420 }],
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  describe('Quick add', () => {
    /** Picks a day in the date chip's calendar sheet and confirms it. */
    function pickDate(r: ReactTestRenderer, chip: string, day: string) {
      act(() => pressable(r, (l) => l.startsWith(`Ngày ghi: ${chip}`)).props.onPress());
      act(() => pressable(r, (l) => l.startsWith(day)).props.onPress());
      act(() => pressable(r, (l) => l.startsWith('Ghi cho ')).props.onPress());
    }

    it('puts the photo first, then typing, saved foods, water and the small chips', () => {
      const text = allText(render(<QuickAddScreen />));
      expect(text).toContain('Ghi nhanh');
      expect(text).toContain('Chụp món ăn');
      expect(text).toContain('Nói / gõ món');
      expect(text).toContain('Món đã lưu');
      expect(text).toContain('3.2 / 4.5 L');
      expect(text).toContain('106.2 kg'); // the last weighing on the weight chip
      expect(text).toContain('Cảm giác');
      expect(text).toContain('Tập khác');
      expect(text).not.toContain('−250'); // the minus chips are gone: undo and "Sửa tổng" replace them
    });

    it('opens the camera at once and hands the photo to Add food, which analyses it', async () => {
      mockPickPhoto.mockResolvedValueOnce({ uri: 'data:image/jpeg;base64,AAA' });
      const r = render(<QuickAddScreen />);
      await act(async () => {
        pressable(r, (l) => l.startsWith('Chụp món ăn')).props.onPress();
      });
      expect(mockPickPhoto).toHaveBeenCalledWith('camera');
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/add-food', params: { photo: '1' } });
      const { takePendingMealPhoto } = require('../../food/pendingPhoto');
      expect(takePendingMealPhoto()).toBe('data:image/jpeg;base64,AAA');
      expect(takePendingMealPhoto()).toBeNull(); // taken once
    });

    it('picks a photo from the library too, and says so when the camera is refused', async () => {
      mockPickPhoto.mockResolvedValueOnce({ error: 'cameraDeniedAsk' });
      const r = render(<QuickAddScreen />);
      await act(async () => {
        pressable(r, (l) => l.startsWith('Chụp món ăn')).props.onPress();
      });
      expect(allText(r)).toContain('Chưa có quyền camera');
      expect(mockRouter.replace).not.toHaveBeenCalled();
      mockPickPhoto.mockResolvedValueOnce({ uri: 'file:///x.jpg' });
      await act(async () => {
        pressable(r, (l) => l === 'Chọn ảnh có sẵn').props.onPress();
      });
      expect(mockPickPhoto).toHaveBeenLastCalledWith('library');
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/add-food', params: { photo: '1' } });
      require('../../food/pendingPhoto').takePendingMealPhoto();
    });

    it('adds water to today and reports it in the app toast, whose undo takes exactly that back off', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Thêm 500 ml nước').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3700);
      const toast = useToastStore.getState().toast;
      expect(toast).toMatchObject({ text: '+500 ml nước · 3,700 ml', tone: 'mana' });
      act(() => useToastStore.getState().undo());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3200);
      expect(allText(r)).toContain('3.2 / 4.5 L');
      expect(useToastStore.getState().toast).toBeNull();
    });

    it('a long press on a water chip opens another amount, a typed amount and "Sửa tổng", each with undo', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Thêm 250 ml nước').props.onLongPress());
      expect(allText(r)).toContain('Nước · Hôm nay');
      act(() => textInput(r, 'Lượng nước (ml)').props.onChangeText('350'));
      act(() => pressable(r, (l) => l === '+ Thêm').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3550);

      act(() => pressable(r, (l) => l.startsWith('Nước: ')).props.onPress()); // the bar opens it too
      act(() => textInput(r, 'Lượng nước (ml)').props.onChangeText('99999'));
      act(() => pressable(r, (l) => l === '+ Thêm').props.onPress());
      expect(allText(r)).toContain('Nhập từ 1 đến 3,000 ml');
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3550);

      act(() => pressable(r, (l) => l === 'Bớt 250 ml nước (ghi nhầm)').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3300);
      expect(useToastStore.getState().toast?.text).toBe('Đã bớt 250 ml · còn 3,300 ml');
      expect(pushNutritionLog).toHaveBeenLastCalledWith(expect.objectContaining({ dateISO: DATE, waterMl: 3300 }));

      act(() => pressable(r, (l) => l.startsWith('Nước: ')).props.onPress());
      act(() => pressable(r, (l) => l === 'Đặt lại về 0').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(0);
      act(() => useToastStore.getState().undo()); // no confirmation box: undo brings it back
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3300);
    });

    it('taking water off never goes below 0', () => {
      useNutritionStore.setState({
        logs: { [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 100 } },
      });
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l.startsWith('Nước: ')).props.onPress());
      act(() => pressable(r, (l) => l === 'Bớt 250 ml nước (ghi nhầm)').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(0);
      expect(useToastStore.getState().toast?.text).toBe('Đã bớt 100 ml · còn 0 ml');
      act(() => pressable(r, (l) => l.startsWith('Nước: ')).props.onPress());
      expect(pressable(r, (l) => l === 'Bớt 250 ml nước (ghi nhầm)').props.disabled).toBe(true);
    });

    it('logs water, weight and typed meals for another day picked with the date chip, never a future one', () => {
      const r = render(<QuickAddScreen />);
      pickDate(r, 'Hôm nay', 'T4 21/10');
      expect(useSelectedDayStore.getState().selectedKey).toBe('2026-10-21'); // the day is shared with Camp and the other screens
      expect(pressable(r, (l) => l.startsWith('Ngày ghi: T4 21/10'))).toBeDefined();
      act(() => pressable(r, (l) => l === 'Thêm 250 ml nước').props.onPress());
      expect(useNutritionStore.getState().logs['2026-10-21'].waterMl).toBe(250);
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3200); // today untouched

      act(() => pressable(r, (l) => l === 'Nói / gõ món').props.onPress());
      expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/add-food', params: { date: '2026-10-21' } });

      act(() => pressable(r, (l) => l.startsWith('Cân nặng, lần cuối 106.2 kg')).props.onPress());
      act(() => pressable(r, (l) => l === 'Giảm 0.1 kg').props.onPress());
      act(() => pressable(r, (l) => l === 'Lưu 106.1 kg').props.onPress());
      const saved = useWeightStore.getState().entries.find((e) => e.weightKg === 106.1)!;
      expect(new Date(saved.dateISO).getDate()).toBe(21); // the weighing follows the chosen day
      expect(new Date(saved.dateISO).getHours()).toBe(16);

      // A day in the future cannot be picked.
      act(() => pressable(r, (l) => l.startsWith('Ngày ghi: ')).props.onPress());
      const future = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'T7 24/10')[0];
      expect(future.props.disabled).toBe(true);
    });

    it('saves the weight from the stepper sheet with undo, and refuses nonsense', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l.startsWith('Cân nặng, lần cuối')).props.onPress());
      expect(allText(r)).toContain('kg · lần trước 106.2');
      expect(allText(r)).not.toMatch(/Xoá|Xóa/); // no delete in the weight sheet
      act(() => pressable(r, (l) => l === 'Tăng 0.1 kg').props.onPress());
      expect(textInput(r, 'Cân nặng hôm nay (kg)').props.value).toBe('106.3');
      expect(allText(r)).toContain('+0.1 kg so với lần trước');
      act(() => pressable(r, (l) => l === 'Lưu 106.3 kg').props.onPress());
      expect(useWeightStore.getState().entries).toHaveLength(2);
      expect(useToastStore.getState().toast?.text).toBe('Đã lưu 106.3 kg');
      act(() => useToastStore.getState().undo());
      expect(useWeightStore.getState().entries).toHaveLength(1);

      act(() => pressable(r, (l) => l.startsWith('Cân nặng, lần cuối')).props.onPress());
      act(() => textInput(r, 'Cân nặng hôm nay (kg)').props.onChangeText('abc'));
      act(() => pressable(r, (l) => l.startsWith('Lưu ')).props.onPress());
      expect(useWeightStore.getState().entries).toHaveLength(1); // nothing new saved
      expect(allText(r)).toContain('Nhập cân nặng hợp lệ');
    });

    it('"Ăn lại" logs a recent dish with one tap for the chosen day, with undo; a long press opens its menu', () => {
      useNutritionStore.setState({
        logs: {
          '2026-10-22': {
            dateISO: '2026-10-22',
            mealsEaten: {},
            extraCalories: 0,
            extraProteinG: 0,
            waterMl: 0,
            extraItems: [
              { id: 'a', name: 'Phở bò', calories: 480, proteinG: 28, purineMg: 150, mealTime: 'breakfast', loggedAtISO: new Date('2026-10-22T08:00:00').toISOString() },
              { id: 'b', name: 'phở  bò', calories: 500, proteinG: 30, mealTime: 'lunch', loggedAtISO: new Date('2026-10-21T12:00:00').toISOString() },
              { id: 'c', name: 'Cơm tấm', calories: 620, proteinG: 30, mealTime: 'lunch', loggedAtISO: new Date('2026-10-22T12:00:00').toISOString() },
              { id: 'd', name: 'Không ăn', calories: 0, proteinG: 0, mealTime: 'dinner', loggedAtISO: new Date('2026-10-22T19:00:00').toISOString() },
            ],
          },
          [DATE]: { dateISO: DATE, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 3200 },
        },
      });
      const r = render(<QuickAddScreen />);
      const text = allText(r);
      expect(text).toContain('Ăn lại');
      expect(text).toContain('Cơm tấm');
      expect(text.match(/Phở bò/g)).toHaveLength(1); // the same dish once
      expect(text).not.toContain('Không ăn');

      act(() => pressable(r, (l) => l === 'Ghi lại Phở bò, 480 kcal').props.onPress());
      const items = useNutritionStore.getState().logs[DATE].extraItems;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ name: 'Phở bò', calories: 480, proteinG: 28, purineMg: 150, mealTime: 'late_afternoon_snack' }); // 16:10
      expect(useToastStore.getState().toast?.text).toContain('Đã ghi Phở bò · 480 kcal');
      act(() => useToastStore.getState().undo());
      expect(useNutritionStore.getState().logs[DATE].extraItems).toHaveLength(0);

      act(() => pressable(r, (l) => l === 'Ghi lại Cơm tấm, 620 kcal').props.onLongPress());
      expect(allText(r)).toContain('620 kcal · 30 g đạm · lần cuối 22/10');
      act(() => pressable(r, (l) => l === 'Ghi với khẩu phần khác').props.onPress());
      expect(mockRouter.replace).toHaveBeenLastCalledWith({
        pathname: '/add-food',
        params: { name: 'Cơm tấm', calories: '620', protein: '30', mealTime: 'late_afternoon_snack' },
      });

      act(() => pressable(r, (l) => l === 'Ghi lại Cơm tấm, 620 kcal').props.onLongPress());
      act(() => pressable(r, (l) => l === 'Ẩn khỏi Ăn lại').props.onPress());
      expect(allText(r)).not.toContain('Cơm tấm');
      act(() => useToastStore.getState().undo());
      expect(allText(r)).toContain('Cơm tấm');
      useEatAgainStore.setState({ hidden: [] });
    });

    it('"Món đã lưu" opens the food lookup and hands the picked total to Add food', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Món đã lưu').props.onPress());
      expect(allText(r)).toContain('Món trong Cook book');
      act(() => pressable(r, (l) => l === 'Món trong Cook book ▸').props.onPress());
      expect(mockRouter.replace).toHaveBeenLastCalledWith('/cookbook');
    });

    it('routes the feeling and other-workout chips', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Cảm giác').props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith('/checkin');
      act(() => pressable(r, (l) => l === 'Tập khác').props.onPress());
      // "Tập khác" is a sheet on the Train tab now (dialogs.md row 13): the tab opens with it up.
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/(tabs)/workout', params: { other: expect.any(String) } });
    });

    it('closes from the backdrop, falling back to home when there is nothing to go back to', () => {
      mockRouter.canGoBack.mockReturnValue(false);
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Đóng').props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  describe('Meal detail', () => {
    it('shows the pending meal with its items, totals and what eating it would complete', () => {
      const text = allText(render(<MealDetailScreen />));
      expect(text).toContain('CHỜ ĂN');
      expect(text).toContain('200g ức gà áp chảo');
      expect(text).toContain('713 kcal · 86 g đạm');
      // Meals 1+2 give 117 g protein; meal 3 brings the day to 203 g, completing the mission.
      expect(text).toContain('Hoàn thành nhiệm vụ Protein · +40 XP');
    });

    it('marks the meal eaten, then lets you undo it', () => {
      const r = render(<MealDetailScreen />);
      act(() => pressable(r, (l) => l.startsWith('Đã ăn')).props.onPress());
      expect(useNutritionStore.getState().logs[DATE].mealsEaten.meal3).toBe(true);
      expect(allText(r)).toContain('ĐÃ ĂN');

      act(() => pressable(r, (l) => l === 'Bỏ đánh dấu đã ăn').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].mealsEaten.meal3).toBe(false);
    });

    it('switches meal through the route params', () => {
      const r = render(<MealDetailScreen />);
      act(() => pressable(r, (l) => l === 'Bữa 1').props.onPress());
      expect(mockRouter.setParams).toHaveBeenCalledWith({ slot: 'meal1' });
    });

    it('marks the meal eaten on the day picked in the quick-add sheet, and says which day', () => {
      mockParams = { slot: 'meal3', date: '2026-10-22' };
      const r = render(<MealDetailScreen />);
      expect(allText(r)).toContain('Đang ghi cho: Hôm qua');
      act(() => pressable(r, (l) => l.startsWith('Đã ăn')).props.onPress());
      expect(useNutritionStore.getState().logs['2026-10-22'].mealsEaten.meal3).toBe(true);
      expect(useNutritionStore.getState().logs[DATE].mealsEaten.meal3).toBeFalsy();
    });

    it('handles an unknown meal without crashing', () => {
      mockParams = { slot: 'nope' };
      expect(allText(render(<MealDetailScreen />))).toContain('Không tìm thấy bữa ăn này');
    });
  });

  describe('Add food', () => {
    it('takes the photo handed over by "Chụp món ăn" once (AI off: no analysis, the photo waits with the form)', () => {
      const { setPendingMealPhoto, takePendingMealPhoto } = require('../../food/pendingPhoto');
      const { useAiPhotoStore } = require('../../store/useAiPhotoStore');
      useAiPhotoStore.setState({ aiEnabled: false });
      setPendingMealPhoto('file:///meal.jpg');
      mockParams = { photo: '1' };
      const r = render(<AddFoodScreen />);
      const photo = r.root.findAll((n) => n.props.accessibilityLabel === 'Ảnh món ăn đã chọn 1' && n.props.source?.uri === 'file:///meal.jpg');
      expect(photo.length).toBeGreaterThan(0);
      expect(takePendingMealPhoto()).toBeNull();
      useAiPhotoStore.setState({ aiEnabled: true });
    });

    it('refuses an empty entry', () => {
      const r = render(<AddFoodScreen />);
      act(() => pressable(r, (l) => l === 'Thêm vào hôm nay').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].extraItems).toHaveLength(0);
      expect(allText(r)).toContain('Hãy mô tả món đã ăn, thêm ảnh, hoặc nhập tên món.');
      expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('saves an item with its purine, salt, sugar and junk flag, then closes', () => {
      const r = render(<AddFoodScreen />);
      act(() => textInput(r, 'Tên món').props.onChangeText('Bánh mì thịt'));
      act(() => pressable(r, (l) => l === 'Trưa').props.onPress());
      act(() => textInput(r, 'Calo (kcal)').props.onChangeText('450'));
      act(() => textInput(r, 'Đạm (g)').props.onChangeText('18,5'));
      act(() => textInput(r, 'Purine (mg)').props.onChangeText('60'));
      act(() => textInput(r, 'Muối (g)').props.onChangeText('2.2'));
      const junk = r.root.findAll((n) => typeof n.props.onValueChange === 'function' && n.props.accessibilityLabel === 'Đồ ăn vặt / junk food')[0];
      act(() => junk.props.onValueChange(true));

      act(() => pressable(r, (l) => l === 'Thêm vào hôm nay').props.onPress());
      const log = useNutritionStore.getState().logs[DATE];
      expect(log.extraItems).toHaveLength(1);
      expect(log.extraItems[0]).toMatchObject({
        name: 'Bánh mì thịt', calories: 450, proteinG: 18.5, mealTime: 'lunch', purineMg: 60, saltG: 2.2, junk: true,
      });
      expect(log.extraItems[0].sugarG).toBeUndefined(); // untouched optional fields are not stored
      expect(log.extraCalories).toBe(450);
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('saves to the day picked in the quick-add sheet; a future or malformed date means today', () => {
      mockParams = { date: '2026-10-20' };
      let r = render(<AddFoodScreen />);
      expect(allText(r)).toContain('Đang ghi cho: T3 20/10');
      act(() => textInput(r, 'Tên món').props.onChangeText('Chè'));
      act(() => textInput(r, 'Calo (kcal)').props.onChangeText('250'));
      act(() => pressable(r, (l) => l === 'Thêm vào T3 20/10').props.onPress());
      expect(useNutritionStore.getState().logs['2026-10-20'].extraItems[0]).toMatchObject({ name: 'Chè', calories: 250 });
      expect(new Date(useNutritionStore.getState().logs['2026-10-20'].extraItems[0].loggedAtISO).getDate()).toBe(20);
      expect(useNutritionStore.getState().logs[DATE].extraItems).toHaveLength(0);

      for (const date of ['2026-10-24', '2026-02-31', 'hôm qua']) {
        mockParams = { date };
        act(() => r.unmount());
        r = render(<AddFoodScreen />);
        expect(allText(r)).not.toContain('Đang ghi cho');
        expect(pressable(r, (l) => l === 'Thêm vào hôm nay')).toBeDefined();
      }
    });

    it('warns live about the missions an item would break, before it is saved', () => {
      const r = render(<AddFoodScreen />);
      act(() => textInput(r, 'Calo (kcal)').props.onChangeText('300'));
      act(() => textInput(r, 'Đường tự do (g)').props.onChangeText('40'));
      const junk = r.root.findAll((n) => typeof n.props.onValueChange === 'function' && n.props.accessibilityLabel === 'Đồ ăn vặt / junk food')[0];
      act(() => junk.props.onValueChange(true));
      const text = allText(r);
      expect(text).toContain('Sẽ vượt ngưỡng Đường');
      expect(text).toContain('Sẽ vượt ngưỡng Đồ ăn vặt');
      expect(useNutritionStore.getState().logs[DATE].extraItems).toHaveLength(0); // preview only
    });
  });

  describe('Check-in', () => {
    it('asks for the feeling only: no missions or boss tiles (they are on Camp), with the date chip', () => {
      const r = render(<CheckinScreen />);
      const text = allText(r);
      expect(text).toContain('Nghỉ ở lửa trại');
      expect(text).toContain('Rất tốt'); // the app's real mood scale
      expect(text).not.toContain('1/7');
      expect(text).not.toMatch(/chờ chốt/);
      expect(pressable(r, (l) => l.startsWith('Ngày ghi: Hôm nay'))).toBeDefined();
    });

    it('will not save until mood, craving and hunger are all chosen', () => {
      const r = render(<CheckinScreen />);
      act(() => pressable(r, (l) => l === 'Ghi lại & nghỉ ngơi').props.onPress());
      expect(useFeelingStore.getState().records).toHaveLength(0);
      expect(allText(r)).toContain('Chọn tâm trạng, mức thèm và mức đói để lưu.');
    });

    it('saves exactly what was chosen, with an optional condition and a trimmed note', () => {
      const r = render(<CheckinScreen />);
      act(() => pressable(r, (l) => l === 'Tốt').props.onPress());
      act(() => pressable(r, (l) => l === 'Mức thèm ăn 2').props.onPress());
      act(() => pressable(r, (l) => l === 'Mức đói 3').props.onPress());
      act(() => pressable(r, (l) => l === 'Mệt').props.onPress());
      act(() => textInput(r, 'Ghi chú').props.onChangeText('  hơi đói lúc 15h  '));
      act(() => pressable(r, (l) => l === 'Ghi lại & nghỉ ngơi').props.onPress());
      const records = useFeelingStore.getState().records;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ mood: 'good', cravingLevel: 2, hungerLevel: 3, workoutCondition: 'tired', note: 'hơi đói lúc 15h' });
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('lets an optional condition be switched off again', () => {
      const r = render(<CheckinScreen />);
      act(() => pressable(r, (l) => l === 'Ổn' || l === 'Bình thường').props.onPress());
      act(() => pressable(r, (l) => l === 'Mức thèm ăn 1').props.onPress());
      act(() => pressable(r, (l) => l === 'Mức đói 1').props.onPress());
      act(() => pressable(r, (l) => l === 'Đau cơ').props.onPress());
      act(() => pressable(r, (l) => l === 'Đau cơ').props.onPress()); // tap again to clear
      act(() => pressable(r, (l) => l === 'Ghi lại & nghỉ ngơi').props.onPress());
      expect(useFeelingStore.getState().records[0].workoutCondition).toBeNull();
    });
  });

  describe('Selected day', () => {
    function pickInStrip(label: string) {
      const journal = render(<JournalScreen />);
      act(() => {
        pressable(journal, (l) => l.startsWith(label)).props.onPress();
      });
      act(() => journal.unmount());
      renderer = undefined;
    }

    it('starts the quick-add sheet on the day selected in the week strip', () => {
      pickInStrip('T4 21/10');
      const r = render(<QuickAddScreen />);
      expect(pressable(r, (l) => l.startsWith('Ngày ghi: T4 21/10'))).toBeDefined();
      act(() => pressable(r, (l) => l === 'Thêm 250 ml nước').props.onPress());
      expect(useNutritionStore.getState().logs['2026-10-21'].waterMl).toBe(250);
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3200);
      act(() => pressable(r, (l) => l === 'Cảm giác').props.onPress());
      expect(mockRouter.replace).toHaveBeenLastCalledWith('/checkin'); // the check-in reads the shared day itself
    });

    it('stays on today when today is selected', () => {
      pickInStrip('T6 23/10');
      expect(useSelectedDayStore.getState().selectedKey).toBeNull();
      const r = render(<QuickAddScreen />);
      expect(pressable(r, (l) => l.startsWith('Ngày ghi: Hôm nay'))).toBeDefined();
    });

    it('records the check-in for the selected past day', () => {
      pickInStrip('T4 21/10');
      const r = render(<CheckinScreen />);
      expect(pressable(r, (l) => l.startsWith('Ngày ghi: T4 21/10'))).toBeDefined();
      act(() => pressable(r, (l) => l === 'Tốt').props.onPress());
      act(() => pressable(r, (l) => l === 'Mức thèm ăn 2').props.onPress());
      act(() => pressable(r, (l) => l === 'Mức đói 3').props.onPress());
      act(() => pressable(r, (l) => l === 'Ghi lại & nghỉ ngơi').props.onPress());
      const records = useFeelingStore.getState().records;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ mood: 'good', cravingLevel: 2, hungerLevel: 3 });
      expect(new Date(records[0].loggedAtISO).getDate()).toBe(21);
      expect(new Date(records[0].loggedAtISO).getHours()).toBe(16); // at the time it was written
      expect(pushFeelingRecord).toHaveBeenLastCalledWith(records[0]);
    });

    it("opens a past day's check-in for editing instead of adding another", () => {
      useFeelingStore.setState({
        records: [{ id: 'cloud-abc', loggedAtISO: new Date('2026-10-20T21:00:00').toISOString(), mood: 'tired', cravingLevel: 4, hungerLevel: 4, workoutCondition: null, note: 'mệt' }],
      });
      useSelectedDayStore.setState({ selectedKey: '2026-10-20' });
      const r = render(<CheckinScreen />);
      expect(allText(r)).toContain('Ngày này đã có check-in');
      expect(textInput(r, 'Ghi chú').props.value).toBe('mệt');
      act(() => pressable(r, (l) => l === 'Mức thèm ăn 1').props.onPress());
      act(() => pressable(r, (l) => l === 'Ghi lại & nghỉ ngơi').props.onPress());
      const records = useFeelingStore.getState().records;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ mood: 'tired', cravingLevel: 1, hungerLevel: 4, note: 'mệt', loggedAtISO: new Date('2026-10-20T21:00:00').toISOString() });
      // A row the cloud had without a device id is re-sent under one and the old row removed: no duplicate.
      expect(records[0].id).not.toBe('cloud-abc');
      expect(pushFeelingRecord).toHaveBeenLastCalledWith(records[0]);
      expect(deleteFeelingRecord).toHaveBeenCalledWith('cloud-abc');
    });

    it('moves the check-in between days with the date chip (and the shared day with it), today adding a new one as before', () => {
      useFeelingStore.setState({
        records: [{ id: 'r1', loggedAtISO: new Date('2026-10-22T20:00:00').toISOString(), mood: 'great', cravingLevel: 1, hungerLevel: 2, workoutCondition: null, note: 'ổn' }],
      });
      const r = render(<CheckinScreen />);
      expect(allText(r)).not.toContain('Ngày này đã có check-in');
      act(() => pressable(r, (l) => l.startsWith('Ngày ghi: Hôm nay')).props.onPress());
      act(() => pressable(r, (l) => l === 'Hôm qua').props.onPress());
      act(() => pressable(r, (l) => l.startsWith('Ghi cho Hôm qua')).props.onPress());
      expect(textInput(r, 'Ghi chú').props.value).toBe('ổn');
      expect(allText(r)).toContain('Ngày này đã có check-in');
      expect(useSelectedDayStore.getState().selectedKey).toBe('2026-10-22');
      act(() => pressable(r, (l) => l.startsWith('Ngày ghi: Hôm qua')).props.onPress());
      act(() => pressable(r, (l) => l === 'Hôm nay').props.onPress());
      act(() => pressable(r, (l) => l.startsWith('Ghi cho Hôm nay')).props.onPress()); // back to today
      expect(textInput(r, 'Ghi chú').props.value).toBe('');
      expect(useSelectedDayStore.getState().selectedKey).toBeNull();
    });
  });

  describe('Journal', () => {
    it("shows today's timeline: meals, water, the workout with its XP, and where you are now", () => {
      const text = allText(render(<JournalScreen />));
      expect(text).toContain('Nhật ký trận');
      expect(text).toContain('TUẦN 43'); // the eyebrow is set in capitals
      expect(text).toContain('Bữa 1 - Trưa (Phá cỗ)');
      expect(text).toContain('Nước +500 ml');
      expect(text).toContain('Ngày A');
      expect(text).toContain('+60 XP');
      expect(text).toContain('ĐANG Ở ĐÂY');
      expect(text).toContain('Xong'); // meals 1 and 2
      expect(text).toContain('Chờ ăn'); // meal 3 is still ahead of 16:10
    });

    it('a plan meal with nothing logged can be marked "Không ăn" on the timeline, shown as its status, and undone', () => {
      const r = render(<JournalScreen />);
      const offers = r.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Đánh dấu không ăn'));
      expect(offers).toHaveLength(1); // meals 1 and 2 are eaten: only meal 3 (dinner) is offered
      act(() => {
        offers[0].props.onPress();
      });
      const items = useNutritionStore.getState().logs[DATE].extraItems;
      expect(items).toEqual([expect.objectContaining({ name: 'Không ăn', calories: 0, mealTime: 'dinner' })]);
      const text = allText(r);
      expect(text).toContain('Không ăn'); // the plan meal's status
      expect(text).toContain('Bỏ "Không ăn"');
      expect(text).not.toContain('Không ăn bữa này');
      expect(r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes('Không ăn. 0 kcal'))).toHaveLength(0); // no separate row
      const undo = r.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Bỏ đánh dấu không ăn'))[0];
      act(() => {
        undo.props.onPress(); // block body: the store's set returns a promise that act must not wait on
      });
      expect(useNutritionStore.getState().logs[DATE].extraItems).toHaveLength(0);
      expect(allText(r)).toContain('Không ăn bữa này');
    });

    it('offers no "Không ăn" for a meal that already has food logged at that time', () => {
      useNutritionStore.getState().addExtra(DATE, 'Phở', 450, 25, 'dinner');
      const r = render(<JournalScreen />);
      expect(allText(r)).not.toContain('Không ăn bữa này');
    });

    it('shows the whole-day water and follows the nutrition screen', () => {
      const r = render(<JournalScreen />);
      expect(allText(r)).toContain('Nước cả ngày');
      expect(allText(r)).toContain('3.2 /');
      act(() => {
        useNutritionStore.getState().addWater(DATE, 800);
      });
      expect(allText(r)).toContain('4.0 /');
    });

    it('lists a meal with several foods as ONE entry: the description and the totals, never its parts', () => {
      useNutritionStore.getState().addExtra(DATE, 'Yến mạch 30g, Sữa chua 100g', 170, 8, 'afternoon_snack', {
        purineMg: 25, saltG: 0.2, sugarG: 5.5,
        parts: [{ name: 'CHI-TIẾT-MỘT 30g', calories: 110, proteinG: 4 }, { name: 'CHI-TIẾT-HAI 100g', calories: 60, proteinG: 4 }],
      });
      const text = allText(render(<JournalScreen />));
      expect(text).toContain('Yến mạch 30g, Sữa chua 100g');
      expect(text.replace(/\s+/g, ' ')).toContain('170 kcal · 8 g');
      expect(text).toContain('14:00 Yến mạch 30g'); // filed at the usual time of the picked meal
      expect(text).toContain('purine 25 mg · đường 5.5 g · muối 0.2 g');
      expect(text).not.toContain('CHI-TIẾT');
    });

    it('colours the day\'s deficit by how it compares with the target, and a cheat day is not counted', () => {
      useCheatDayStore.setState({ days: [] });
      const r = render(<JournalScreen />);
      const level = () => ['Thâm hụt quá mức', 'Đạt', 'Tạm chấp nhận', 'Không đạt', 'Duy trì', 'Ăn dư', 'Cheat day'].filter((l) => r.root.findAll((n) => (n.type as unknown) === 'Text' && [n.props.children].flat(5).join('') === l).length > 0);
      expect(level().length).toBeGreaterThan(0);
      expect(allText(r)).toContain('Mục tiêu 1100 kcal · Đạt ≥ 90%');
      act(() => pressable(r, (l) => l.startsWith('Đánh dấu ngày này là cheat day')).props.onPress());
      expect(useCheatDayStore.getState().days).toEqual([DATE]);
      // A cheat day's kcal are not counted: it shows as such instead of a deficit level.
      expect(allText(r)).toContain('Cheat day · không tính kcal');
      act(() => pressable(r, (l) => l.startsWith('Đánh dấu ngày này là cheat day')).props.onPress());
      expect(useCheatDayStore.getState().days).toEqual([]);
    });

    it('shows workouts close together as one row from start to end, and opens their history with each set', () => {
      useWorkoutStore.setState({
        entries: [
          { id: 'x', dateISO: `${DATE}T15:00:00`, templateId: null, label: 'Ngày A', durationMin: 14, caloriesBurned: 420 },
          {
            id: 'y',
            dateISO: `${DATE}T15:20:00`,
            templateId: 'home-A',
            label: 'Cầu mông',
            durationMin: 6,
            caloriesBurned: 40,
            details: { exercises: [{ id: 'glutBridge', level: 1, sets: 3, amount: 10, unit: 'reps', restSec: 30, results: [10, 10, 8], rating: 'hard' }] },
          },
        ],
      });
      const r = render(<JournalScreen />);
      const text = allText(r);
      expect(text).toContain('Ngày A + Cầu mông');
      expect(text).toContain('15:00–15:26');
      expect(text).toContain('2 lượt tập');
      act(() => pressable(r, (l) => l.includes('Xem chi tiết buổi tập')).props.onPress());
      const dialog = allText(r);
      expect(dialog).toContain('Buổi tập');
      expect(dialog).toContain('15:20–15:26');
      expect(dialog).toContain('3/3 set');
      expect(dialog).toContain('Đạt từng set: 1: 10 · 2: 10 · 3: 8 lần');
      expect(dialog).toContain('Cảm nhận: Khó');
      expect(dialog).toContain('Ghi tay hoặc buổi tập cũ');
      act(() => pressable(r, (l) => l === 'Đóng').props.onPress());
      expect(allText(r)).not.toContain('Đạt từng set');
    });

    it('opens a dialog with the photo, totals and parts when a logged meal is tapped, and closes it again', () => {
      useNutritionStore.getState().addExtra(DATE, 'Yến mạch 30g, Sữa chua 100g', 170, 8, 'afternoon_snack', {
        photoUri: 'file:///docs/proofs/extra-9.jpg',
        parts: [{ name: 'CHI-TIẾT-MỘT 30g', calories: 110, proteinG: 4 }, { name: 'CHI-TIẾT-HAI 100g', calories: 60, proteinG: 4 }],
      });
      const r = render(<JournalScreen />);
      expect(allText(r)).not.toContain('CHI-TIẾT');
      act(() => pressable(r, (l) => l.includes('Yến mạch 30g, Sữa chua 100g')).props.onPress());
      const text = allText(r);
      expect(text).toContain('CHI-TIẾT-MỘT 30g · 110 kcal · 4 g đạm');
      expect(text).toContain('CHI-TIẾT-HAI 100g');
      expect(r.root.findAll((n) => n.props.source?.uri === 'file:///docs/proofs/extra-9.jpg').length).toBeGreaterThan(0);
      act(() => pressable(r, (l) => l === 'Đóng').props.onPress());
      expect(allText(r)).not.toContain('CHI-TIẾT');
    });

    it('changes the amount of one food in the dialog and works the calories out again, offline, with no AI call', () => {
      useNutritionStore.getState().addExtra(DATE, 'CHI-TIẾT-MỘT 30g, CHI-TIẾT-HAI 100g', 170, 8, 'afternoon_snack', {
        parts: [{ name: 'CHI-TIẾT-MỘT 30g', calories: 110, proteinG: 4 }, { name: 'CHI-TIẾT-HAI 100g', calories: 60, proteinG: 4 }],
      });
      const r = render(<JournalScreen />);
      act(() => pressable(r, (l) => l.includes('CHI-TIẾT-MỘT 30g, CHI-TIẾT-HAI 100g')).props.onPress());
      act(() => pressable(r, (l) => l === 'Sửa lượng CHI-TIẾT-MỘT 30g').props.onPress());
      const input = r.root.findAll((n) => n.props.accessibilityLabel === 'Lượng' && typeof n.props.onChangeText === 'function')[0];
      expect(input.props.value).toBe('30');
      act(() => input.props.onChangeText('60'));
      const kcal = r.root.findAll((n) => n.props.accessibilityLabel === 'Kcal' && typeof n.props.onChangeText === 'function')[0];
      expect(kcal.props.value).toBe('220'); // worked out from the amount
      act(() => pressable(r, (l) => l === 'Lưu').props.onPress());

      const saved = useNutritionStore.getState().getLog(DATE).extraItems.find((i) => i.name.includes('CHI-TIẾT-MỘT'))!;
      expect(saved.calories).toBe(280);
      expect(saved.proteinG).toBe(12);
      expect(saved.name).toBe('CHI-TIẾT-MỘT 60g, CHI-TIẾT-HAI 100g');
      expect(saved.parts?.[0]).toMatchObject({ name: 'CHI-TIẾT-MỘT 60g', calories: 220, proteinG: 8 });
      expect(useNutritionStore.getState().getLog(DATE).extraCalories).toBeGreaterThanOrEqual(280);
      expect(allText(r)).toContain('CHI-TIẾT-MỘT 60g · 220 kcal · 8 g đạm');
    });

    it('does not accept an empty or zero amount', () => {
      useNutritionStore.getState().addExtra(DATE, 'CHI-TIẾT-MỘT 30g, CHI-TIẾT-HAI 100g', 170, 8, 'afternoon_snack', {
        parts: [{ name: 'CHI-TIẾT-MỘT 30g', calories: 110, proteinG: 4 }, { name: 'CHI-TIẾT-HAI 100g', calories: 60, proteinG: 4 }],
      });
      const r = render(<JournalScreen />);
      act(() => pressable(r, (l) => l.includes('CHI-TIẾT-MỘT 30g, CHI-TIẾT-HAI 100g')).props.onPress());
      act(() => pressable(r, (l) => l === 'Sửa lượng CHI-TIẾT-MỘT 30g').props.onPress());
      const input = r.root.findAll((n) => n.props.accessibilityLabel === 'Lượng' && typeof n.props.onChangeText === 'function')[0];
      act(() => input.props.onChangeText('0'));
      expect(allText(r)).toContain('Lượng phải lớn hơn 0');
      const save = r.root.findAll((n) => n.props.accessibilityLabel === 'Lưu' && n.props.accessibilityState)[0];
      expect(save.props.accessibilityState.disabled).toBe(true);
    });

    it('a meal saved as ONE food shows the total and itself as its one part, and its amount changes the same way', () => {
      useNutritionStore.getState().addExtra(DATE, 'MỘT-MÓN 150g', 195, 4, 'dinner', { purineMg: 30, fromFoodDb: true });
      const r = render(<JournalScreen />);
      act(() => pressable(r, (l) => l.includes('MỘT-MÓN 150g')).props.onPress());
      expect(allText(r)).toContain('Thành phần'.toUpperCase());
      expect(allText(r)).toContain('MỘT-MÓN 150g · 195 kcal · 4 g đạm');
      act(() => pressable(r, (l) => l === 'Sửa lượng MỘT-MÓN 150g').props.onPress());
      const input = r.root.findAll((n) => n.props.accessibilityLabel === 'Lượng' && typeof n.props.onChangeText === 'function')[0];
      expect(input.props.value).toBe('150');
      act(() => input.props.onChangeText('300'));
      act(() => pressable(r, (l) => l === 'Lưu').props.onPress());

      const saved = useNutritionStore.getState().getLog(DATE).extraItems.find((i) => i.name.startsWith('MỘT-MÓN'))!;
      expect(saved).toMatchObject({ name: 'MỘT-MÓN 300g', calories: 390, proteinG: 8, purineMg: 60 });
      expect(saved.parts).toBeUndefined();
      expect(allText(r)).toContain('MỘT-MÓN 300g · 390 kcal · 8 g đạm');
    });

    it('a "Không ăn" record opens with no part list', () => {
      useNutritionStore.getState().addExtra(DATE, 'Không ăn', 0, 0, 'dinner', { fromFoodDb: true });
      const r = render(<JournalScreen />);
      act(() => pressable(r, (l) => l.includes('Không ăn')).props.onPress());
      expect(allText(r)).not.toContain('Thành phần'.toUpperCase());
      expect(r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Sửa lượng'))).toHaveLength(0);
    });

    it('removes the photo of a logged meal from the dialog, and the meal keeps its figures', async () => {
      useNutritionStore.getState().addExtra(DATE, 'Bánh ZZ', 300, 10, 'afternoon_snack', { photoUri: 'file:///docs/proofs/extra-5.jpg' });
      const r = render(<JournalScreen />);
      act(() => pressable(r, (l) => l.includes('Bánh ZZ')).props.onPress());
      expect(r.root.findAll((n) => n.props.source?.uri === 'file:///docs/proofs/extra-5.jpg').length).toBeGreaterThan(0);
      await act(async () => {
        await pressable(r, (l) => l === 'Xóa ảnh').props.onPress();
      });
      const item = useNutritionStore.getState().getLog(DATE).extraItems.find((i) => i.name === 'Bánh ZZ')!;
      expect(item.photoUri).toBeUndefined();
      expect(item.calories).toBe(300);
      expect(allText(r)).toContain('Bữa này chưa có ảnh.');
    });

    it('a past day with a meal not logged says so, loses its level colour and offers to log the rest for that day', () => {
      const thursday = '2026-10-22';
      useNutritionStore.setState({
        logs: { [thursday]: { dateISO: thursday, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 } },
      });
      useSelectedDayStore.setState({ selectedKey: thursday });
      const r = render(<JournalScreen />);
      const text = allText(r);
      expect(text).toContain('⚠ Chưa ghi Bữa 3 - Tối (Chốt cửa sổ ăn): nếu đã ăn, thâm hụt thật thấp hơn số này.');
      expect(text).not.toContain('Dự kiến');
      act(() => pressable(r, (l) => l.startsWith('Ghi bổ sung món cho')).props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/quick-add');
      expect(useSelectedDayStore.getState().selectedKey).toBe(thursday); // (+) opens on that day
    });

    it('"Bỏ bữa" marks the meal not logged as skipped: the flag goes, and Undo brings it back', () => {
      const thursday = '2026-10-22';
      useNutritionStore.setState({
        logs: { [thursday]: { dateISO: thursday, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 } },
      });
      useSelectedDayStore.setState({ selectedKey: thursday });
      useSkippedMealStore.setState({ days: {} });
      const r = render(<JournalScreen />);
      act(() => pressable(r, (l) => l.startsWith('Đánh dấu đã bỏ Bữa 3')).props.onPress());
      expect(useSkippedMealStore.getState().days[thursday]).toEqual(['meal3']);
      expect(allText(r)).not.toContain('⚠ Chưa ghi');
      expect(allText(r)).toContain('Đã bỏ Bữa 3 - Tối (Chốt cửa sổ ăn): không tính là thiếu bữa.');
      act(() => pressable(r, (l) => l.startsWith('Hoàn tác bỏ Bữa 3')).props.onPress());
      expect(useSkippedMealStore.getState().days[thursday]).toBeUndefined();
      expect(allText(r)).toContain('⚠ Chưa ghi Bữa 3');
    });

    it("today's meal still to come can be skipped, which settles the day", () => {
      useSkippedMealStore.setState({ days: {} });
      const r = render(<JournalScreen />);
      expect(allText(r)).toContain('Đang tính: đã ăn');
      act(() => pressable(r, (l) => l.startsWith('Đánh dấu đã bỏ Bữa 3')).props.onPress());
      expect(allText(r)).not.toContain('Đang tính: đã ăn');
      useSkippedMealStore.setState({ days: {} });
    });

    it('shows the same deficit on the day strip as in the stats', () => {
      const r = render(<JournalScreen />);
      // Today still has meals to come: both show the end-of-day estimate ("Dự kiến ~…"), and say how it is worked out.
      const stat = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Dự kiến '))[0];
      const value = stat.props.accessibilityLabel.replace('Dự kiến ', '');
      expect(value.startsWith('~')).toBe(true);
      const today = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('T6 23/10') && n.props.accessibilityState)[0];
      expect(today.props.accessibilityLabel).toContain(`thâm hụt dự kiến ${value.replace(/[~,]/g, '')}`);
      expect(today.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children)).toContain(value);
      expect(allText(r)).toContain('Đang tính: đã ăn');
    });

    it('includes a feeling check-in logged today', () => {
      useFeelingStore.setState({
        records: [{ id: 'f', loggedAtISO: `${DATE}T14:20:00`, cravingLevel: 2, hungerLevel: 3, mood: 'good', workoutCondition: null, note: '' }],
      });
      const text = allText(render(<JournalScreen />));
      expect(text).toContain('Check-in cảm giác');
      expect(text).toContain('thèm 2/5 · đói 3/5');
    });

    it('opens a meal only for today, and switches to another day of the week', () => {
      const r = render(<JournalScreen />);
      // (The "Bỏ Bữa 3" chip under today's estimate names the meal too.)
      act(() => pressable(r, (l) => l.includes('Bữa 3') && !l.startsWith('Đánh dấu đã bỏ')).props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/meal/meal3');

      // Thursday 22/10 has no log: the strip says so, "now" disappears and meals are not tappable.
      act(() => pressable(r, (l) => l.startsWith('T5 22/10')).props.onPress());
      const text = allText(r);
      expect(text).not.toContain('ĐANG Ở ĐÂY');
      expect(text).toContain('—'); // no deficit without any food logged
      const mealCard = (l: string) => l.includes('Bữa 3') && !l.startsWith('Đánh dấu không ăn'); // the "Không ăn" chip under it is its own button
      expect(r.root.findAll((n) => typeof n.props.onPress === 'function' && mealCard(String(n.props.accessibilityLabel ?? '')))).toHaveLength(0);
    });

    it('locks days that have not happened yet', () => {
      const r = render(<JournalScreen />);
      const saturday = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('T7 24/10') && n.props.accessibilityState)[0];
      expect(saturday.props.accessibilityState.disabled).toBe(true);
    });

    it('walks back a week and forward again, never past the current week', () => {
      const r = render(<JournalScreen />);
      const next = () => r.root.findAll((n) => n.props.accessibilityLabel === 'Tuần sau' && n.props.accessibilityState)[0];
      expect(next().props.accessibilityState.disabled).toBe(true);
      act(() => pressable(r, (l) => l === 'Tuần trước').props.onPress());
      expect(allText(r)).toContain('TUẦN 42');
      expect(next().props.accessibilityState.disabled).toBe(false);
      act(() => pressable(r, (l) => l === 'Tuần sau').props.onPress());
      expect(allText(r)).toContain('TUẦN 43');
    });
  });
});
