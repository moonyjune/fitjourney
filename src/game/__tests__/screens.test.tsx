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
let mockParams: { slot?: string } = { slot: 'meal3' };

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
  deletePersistedPhoto: jest.fn(),
}));
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
  requestPhotoAnalysis: jest.fn(),
}));

import AddFoodScreen from '../../../app/add-food';
import MealDetailScreen from '../../../app/meal/[slot]';
import CheckinScreen from '../../../app/checkin';
import JournalScreen from '../../../app/journal';
import QuickAddScreen from '../../../app/quick-add';
import { useFeelingStore } from '../../store/useFeelingStore';
import { useNutritionStore } from '../../store/useNutritionStore';
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
      expect(mockRouter.replace).toHaveBeenCalledWith('/meal/meal3');
      act(() => pressable(r, (l) => l.startsWith('Ngoài kế hoạch')).props.onPress());
      expect(mockRouter.replace).toHaveBeenCalledWith('/add-food');
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
      expect(allText(r)).toContain('Nhập calo hoặc đạm lớn hơn 0.');
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
      expect(r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').includes('Bữa 3'))).toHaveLength(0);
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
