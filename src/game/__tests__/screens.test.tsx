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
let mockParams: { slot?: string; date?: string } = { slot: 'meal3' };

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
  pushProofPhoto: jest.fn(),
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
import MealDetailScreen from '../../../app/meal/[slot]';
import CheckinScreen from '../../../app/checkin';
import JournalScreen from '../../../app/journal';
import QuickAddScreen from '../../../app/quick-add';
import { useFeelingStore } from '../../store/useFeelingStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

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
    useProofStore.setState({ photos: [] });
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
    it('shows the next meal, today water and the workout state', () => {
      const text = allText(render(<QuickAddScreen />));
      expect(text).toContain('Ghi nhanh');
      expect(text).toContain('Bữa kế · 19:15');
      expect(text).toContain('Đã xong hôm nay'); // the 14 min workout is already logged
      expect(text).toContain('3.2 / 4.5 L');
    });

    it('adds water to today and reports it', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Thêm 500 ml nước').props.onPress());
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3700);
      expect(allText(r)).toContain('+500 ml');
    });

    it('logs meals and water for another day picked with ‹ ›, never a future one', () => {
      const r = render(<QuickAddScreen />);
      expect(pressable(r, (l) => l === 'Ngày sau').props.disabled).toBe(true); // today is the latest day
      act(() => pressable(r, (l) => l === 'Ngày trước').props.onPress());
      act(() => pressable(r, (l) => l === 'Ngày trước').props.onPress());
      const text = allText(r);
      expect(text).toContain('T4 21/10');
      expect(text).toContain('Áp dụng cho bữa ăn');

      act(() => pressable(r, (l) => l === 'Thêm 250 ml nước').props.onPress());
      expect(useNutritionStore.getState().logs['2026-10-21'].waterMl).toBe(250);
      expect(useNutritionStore.getState().logs[DATE].waterMl).toBe(3200); // today untouched

      act(() => pressable(r, (l) => l.startsWith('Ngoài kế hoạch')).props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/add-food', params: { date: '2026-10-21' } });
      act(() => pressable(r, (l) => l.startsWith('Bữa ăn')).props.onPress());
      expect(mockRouter.replace).toHaveBeenLastCalledWith({ pathname: '/meal/[slot]', params: expect.objectContaining({ date: '2026-10-21' }) });

      act(() => pressable(r, (l) => l.startsWith('Ghi cho ngày: T4 21/10')).props.onPress()); // back to today
      expect(allText(r)).toContain('Hôm nay');
      expect(pressable(r, (l) => l === 'Ngày sau').props.disabled).toBe(true);
    });

    it('steps and saves the weight, rejecting nonsense', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l === 'Tăng 0.1 kg').props.onPress());
      expect(textInput(r, 'Cân nặng hôm nay (kg)').props.value).toBe('106.3');

      act(() => pressable(r, (l) => l.startsWith('Lưu')).props.onPress());
      const entries = useWeightStore.getState().entries;
      expect(entries).toHaveLength(2);
      expect(entries[entries.length - 1].weightKg).toBe(106.3);
      expect(allText(r)).toContain('Đã lưu 106.3 kg');

      act(() => textInput(r, 'Cân nặng hôm nay (kg)').props.onChangeText('abc'));
      act(() => pressable(r, (l) => l.startsWith('Lưu')).props.onPress());
      expect(useWeightStore.getState().entries).toHaveLength(2); // nothing new saved
      expect(allText(r)).toContain('Nhập cân nặng hợp lệ');
    });

    it('routes each tile to the right place', () => {
      const r = render(<QuickAddScreen />);
      act(() => pressable(r, (l) => l.startsWith('Bữa ăn')).props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/meal/[slot]', params: { slot: 'meal3' } });
      act(() => pressable(r, (l) => l.startsWith('Ngoài kế hoạch')).props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/add-food', params: {} });
      act(() => pressable(r, (l) => l.startsWith('Buổi tập')).props.onPress());
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/workout');
      act(() => pressable(r, (l) => l.startsWith('Cảm giác')).props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith('/checkin');
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
    it("summarises today's missions and boss damage", () => {
      const text = allText(render(<CheckinScreen />));
      expect(text).toContain('Nghỉ ở lửa trại');
      expect(text).toContain('2/7'); // workout and deficit are done in the seeded day
      expect(text).toContain('−1,500'); // today's boss damage, capped
      expect(text).toContain('Rất tốt'); // the app's real mood scale
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

    it('shows the same deficit on the day strip as in the stats', () => {
      const r = render(<JournalScreen />);
      const stat = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Thâm hụt '))[0];
      const value = stat.props.accessibilityLabel.replace('Thâm hụt ', '');
      const today = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('T6 23/10') && n.props.accessibilityState)[0];
      expect(today.props.accessibilityLabel).toContain(`thâm hụt ${value.replace(/,/g, '')}`);
      expect(today.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children)).toContain(value);
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
      act(() => pressable(r, (l) => l.includes('Bữa 3')).props.onPress());
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
