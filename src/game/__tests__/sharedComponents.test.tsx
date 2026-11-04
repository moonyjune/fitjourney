import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Image, StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../sync/cloudSync', () => ({ pushUserData: jest.fn(), pushNutritionLog: jest.fn(), requestDishPhotos: jest.fn(async () => ({ ok: true, dishes: [] })) }));

import { BottomSheet } from '../../components/quest/BottomSheet';
import { DateChip } from '../../components/quest/DateChip';
import { clampMonth, DatePickerSheet } from '../../components/quest/DatePickerSheet';
import { DEFICIT_LEVEL_COLOR } from '../deficitLevel';
import type { DayDeficitMark } from '../deficitView';
import { quest } from '../../theme/quest';
import { oldestPickableKey } from '../../utils/logDate';
import { DishThumb, dishLook } from '../../components/quest/DishThumb';
import { ScreenTemplate } from '../../components/quest/ScreenTemplate';
import { parseStepperText, Stepper, STEPPER_HOLD_MS, STEPPER_REPEAT_MS } from '../../components/quest/Stepper';
import { ToastHost } from '../../components/quest/Toast';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSelectedDayStore, workingDayKey } from '../../store/useSelectedDayStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { hideToast, showToast, useToastStore } from '../../store/useToastStore';

const NOW = new Date('2026-10-23T16:10:00'); // Friday

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

function pressable(r: ReactTestRenderer, label: string | ((l: string) => boolean)): ReactTestInstance {
  const match = typeof label === 'string' ? (l: string) => l === label : label;
  const found = r.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && match(n.props.accessibilityLabel))[0];
  if (!found) throw new Error(`no pressable matched ${String(label)}`);
  return found;
}

function maybePressable(r: ReactTestRenderer, label: string): ReactTestInstance | undefined {
  return r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
}

describe('shared redesign components', () => {
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
    jest.useFakeTimers({ now: NOW });
    useSettingsStore.setState({ language: 'vi' });
    useSelectedDayStore.setState({ selectedKey: null });
    useNutritionStore.setState({ logs: {} });
    act(() => hideToast());
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    act(() => hideToast());
    jest.useRealTimers();
  });

  describe('Toast', () => {
    it('shows one toast at a time and hides it after 5 s', () => {
      const first = showToast({ text: 'A' });
      showToast({ text: 'B', tone: 'mana' });
      expect(useToastStore.getState().toast).toMatchObject({ text: 'B', tone: 'mana', durationMs: 5000 });
      act(() => hideToast(first)); // a stale id never closes the newer toast
      expect(useToastStore.getState().toast?.text).toBe('B');
      act(() => jest.advanceTimersByTime(4999));
      expect(useToastStore.getState().toast?.text).toBe('B');
      act(() => jest.advanceTimersByTime(1));
      expect(useToastStore.getState().toast).toBeNull();
    });

    it('defaults to gold and keeps a custom duration', () => {
      showToast({ text: 'Đã lưu', durationMs: 1000 });
      expect(useToastStore.getState().toast?.tone).toBe('gold');
      act(() => jest.advanceTimersByTime(1000));
      expect(useToastStore.getState().toast).toBeNull();
    });

    it('renders the text with a "Hoàn tác" button that runs the undo once and closes', () => {
      const undo = jest.fn();
      const r = render(<ToastHost />);
      expect(r.toJSON()).toBeNull();
      act(() => {
        showToast({ text: 'Đã thêm 250 ml', undo, tone: 'mana' });
      });
      expect(allText(r)).toContain('Đã thêm 250 ml');
      const live = r.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite' && n.type === View)[0];
      expect(live).toBeDefined();
      act(() => pressable(r, 'Hoàn tác').props.onPress());
      expect(undo).toHaveBeenCalledTimes(1);
      expect(r.toJSON()).toBeNull();
      act(() => useToastStore.getState().undo()); // nothing left to undo
      expect(undo).toHaveBeenCalledTimes(1);
    });

    it('can carry another action instead of undo', () => {
      const onPress = jest.fn();
      const r = render(<ToastHost />);
      act(() => {
        showToast({ text: 'Chưa lưu được ảnh', tone: 'danger', action: { label: 'Thử lại', onPress } });
      });
      expect(maybePressable(r, 'Hoàn tác')).toBeUndefined();
      act(() => pressable(r, 'Thử lại').props.onPress());
      expect(onPress).toHaveBeenCalled();
      expect(useToastStore.getState().toast).toBeNull();
    });
  });

  describe('BottomSheet', () => {
    it('shows the title, content and footer, and closes from the button and the backdrop', () => {
      const onClose = jest.fn();
      const r = render(
        <BottomSheet visible onClose={onClose} title="Cân nặng" eyebrow="Hôm nay" subtitle="còn 7.4 kg" footer={<Text>Lưu 79.2 kg</Text>} testID="sheet">
          <Text>nội dung</Text>
        </BottomSheet>
      );
      const text = allText(r);
      for (const part of ['Cân nặng', 'Hôm nay', 'còn 7.4 kg', 'nội dung', 'Lưu 79.2 kg']) expect(text).toContain(part);
      expect(r.root.findAll((n) => n.type === View && n.props.testID === 'sheet')[0].props.accessibilityViewIsModal).toBe(true);
      const closers = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Đóng');
      expect(closers.length).toBeGreaterThanOrEqual(2); // backdrop + close button
      closers.forEach((c) => act(() => c.props.onPress()));
      expect(onClose).toHaveBeenCalledTimes(closers.length);
    });

    it('renders nothing while hidden and puts a custom control in place of the close button', () => {
      const r = render(
        <BottomSheet visible={false} onClose={() => undefined} title="X">
          <Text>ẩn</Text>
        </BottomSheet>
      );
      expect(allText(r)).not.toContain('ẩn');
      act(() =>
        r.update(
          <BottomSheet visible onClose={() => undefined} title="X" headerRight={<Text>chip</Text>}>
            <Text>hiện</Text>
          </BottomSheet>
        )
      );
      expect(allText(r)).toContain('chip');
      expect(r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Đóng')).toHaveLength(1); // the backdrop only
    });
  });

  describe('ScreenTemplate', () => {
    it('has a back button, a 20 pt title with eyebrow, one right action and a sticky primary button', () => {
      const onBack = jest.fn();
      const onSave = jest.fn();
      const r = render(
        <ScreenTemplate title="Ghi bữa" eyebrow="Bữa trưa · Hôm nay" onBack={onBack} right={<Text>⋯</Text>} primary={{ label: 'Lưu bữa · 740 kcal', onPress: onSave }}>
          <Text>món</Text>
        </ScreenTemplate>
      );
      const text = allText(r);
      for (const part of ['Ghi bữa', 'Bữa trưa · Hôm nay', '⋯', 'món', 'Lưu bữa · 740 kcal']) expect(text).toContain(part);
      const header = r.root.findAll((n) => n.props.accessibilityRole === 'header' && n.type === Text)[0];
      expect(header.props.children).toBe('Ghi bữa');
      expect(header.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ fontSize: 20 })]));
      act(() => pressable(r, 'Quay lại').props.onPress());
      expect(onBack).toHaveBeenCalled();
      act(() => pressable(r, 'Lưu bữa · 740 kcal').props.onPress());
      expect(onSave).toHaveBeenCalled();
    });

    it('leaves out the back button on a root screen', () => {
      const r = render(
        <ScreenTemplate title="Trại" tabBar>
          <Text>x</Text>
        </ScreenTemplate>
      );
      expect(maybePressable(r, 'Quay lại')).toBeUndefined();
    });
  });

  describe('Stepper', () => {
    function Harness({ initial = 79.4, onValid }: { initial?: number; onValid?: (ok: boolean) => void }) {
      const [v, setV] = require('react').useState(initial);
      return <Stepper value={v} onChange={setV} step={0.1} min={20} max={80} decimals={1} unit="kg" label="Cân nặng" onValidChange={onValid} />;
    }
    const field = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === 'Cân nặng')[0];

    it('steps by 0.1 with one decimal and stops at max', () => {
      const r = render(<Harness />);
      act(() => pressable(r, 'Tăng 0.1 kg').props.onPress());
      expect(field(r).props.value).toBe('79.5');
      act(() => pressable(r, 'Giảm 0.1 kg').props.onPress());
      act(() => pressable(r, 'Giảm 0.1 kg').props.onPress());
      expect(field(r).props.value).toBe('79.3');
      for (let i = 0; i < 10; i++) act(() => pressable(r, 'Tăng 0.1 kg').props.onPress());
      expect(field(r).props.value).toBe('80.0');
      expect(pressable(r, 'Tăng 0.1 kg').props.disabled).toBe(true);
    });

    it('repeats while held, and letting go adds no extra step', () => {
      const r = render(<Harness initial={70} />);
      const plus = () => pressable(r, 'Tăng 0.1 kg');
      act(() => plus().props.onPressIn());
      act(() => jest.advanceTimersByTime(STEPPER_HOLD_MS + STEPPER_REPEAT_MS * 5));
      act(() => plus().props.onPressOut());
      act(() => plus().props.onPress());
      expect(field(r).props.value).toBe('70.5');
      act(() => plus().props.onPressIn()); // a quick tap is one step
      act(() => plus().props.onPressOut());
      act(() => plus().props.onPress());
      expect(field(r).props.value).toBe('70.6');
    });

    it('accepts a typed number in range and reports one out of range or not a number', () => {
      const onValid = jest.fn();
      const r = render(<Harness onValid={onValid} />);
      act(() => field(r).props.onChangeText('75,5'));
      expect(onValid).toHaveBeenLastCalledWith(true);
      act(() => field(r).props.onChangeText('abc'));
      expect(onValid).toHaveBeenLastCalledWith(false);
      expect(field(r).props.value).toBe('abc'); // what was typed stays until it is fixed
      act(() => field(r).props.onChangeText('320'));
      expect(onValid).toHaveBeenLastCalledWith(false);
      act(() => field(r).props.onBlur());
      expect(field(r).props.value).toBe('75.5'); // back to the last good value
      expect(parseStepperText('79.')).toBe(79);
      expect(parseStepperText('1e3')).toBeNull();
    });
  });

  describe('DishThumb', () => {
    it('falls back to an emoji on a colour by kind of dish', () => {
      expect(dishLook('Phở bò').emoji).toBe('🍜');
      expect(dishLook('Bánh mì thịt').emoji).toBe('🥖');
      expect(dishLook('Cá hấp gừng').emoji).toBe('🐟');
      expect(dishLook('Món lạ').emoji).toBe('🍽️');
      const r = render(<DishThumb name="Cơm tấm" off />);
      expect(allText(r)).toContain('🍚');
      expect(r.root.findAllByType(Image)).toHaveLength(0);
    });

    it("shows the user's own photo first, and the given emoji over the guessed one", () => {
      const r = render(<DishThumb name="Phở bò" photoUri="file:///pho.jpg" size={30} />);
      const img = r.root.findByType(Image);
      expect(img.props.source).toEqual({ uri: 'file:///pho.jpg' });
      expect(img.props.accessibilityLabel).toContain('Phở bò');
      act(() => r.update(<DishThumb name="Phở bò" emoji="🥣" off />));
      expect(allText(r)).toContain('🥣');
    });
  });

  describe('DatePickerSheet and DateChip', () => {
    it('keeps the shown month between the oldest pickable day and today', () => {
      expect(clampMonth({ year: 2026, month: 11 }, '2025-10-23', '2026-10-23')).toEqual({ year: 2026, month: 10 });
      expect(clampMonth({ year: 2025, month: 1 }, '2025-10-23', '2026-10-23')).toEqual({ year: 2025, month: 10 });
      expect(clampMonth({ year: 2026, month: 3 }, '2025-10-23', '2026-10-23')).toEqual({ year: 2026, month: 3 });
      // The plan's start date when it is older than a year, else a year back (a start date of today still leaves the past year).
      expect(oldestPickableKey(NOW)).toBe('2025-10-23');
      expect(oldestPickableKey(NOW, '2026-10-20T08:00:00')).toBe('2025-10-23');
      expect(oldestPickableKey(NOW, '2024-03-02T08:00:00')).toBe('2024-03-02');
      expect(oldestPickableKey(NOW, 'not a date')).toBe('2025-10-23');
    });

    it('a day picked weeks ago stays the working day (no 30-day cut-off)', () => {
      expect(workingDayKey('2026-08-02', NOW)).toBe('2026-08-02');
      expect(workingDayKey('2026-10-30', NOW)).toBe('2026-10-23');
    });

    it('shows a month with ‹ › to earlier months, never the future or before the oldest day', () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const r = render(<DatePickerSheet visible value="2026-10-23" now={NOW} minKey="2026-09-10" onPick={onPick} onClose={onClose} isMarked={(k) => k === '2026-10-20'} />);
      const text = allText(r);
      expect(text).toContain('Ghi cho ngày');
      expect(text).toContain('Tháng 10 / 2026');
      expect(pressable(r, (l) => l.startsWith('T7 24/10')).props.disabled).toBe(true); // tomorrow
      expect(pressable(r, 'Tháng sau').props.disabled).toBe(true);
      expect(pressable(r, 'T3 20/10, đã ghi')).toBeDefined();
      act(() => pressable(r, 'Tháng trước').props.onPress());
      expect(allText(r)).toContain('Tháng 9 / 2026');
      expect(pressable(r, 'Tháng trước').props.disabled).toBe(true); // 10/9 is the oldest day
      expect(pressable(r, (l) => l.startsWith('T4 09/09')).props.disabled).toBe(true);
      act(() => pressable(r, (l) => l.startsWith('T3 15/09')).props.onPress());
      act(() => pressable(r, 'Ghi cho T3 15/09').props.onPress());
      expect(onPick).toHaveBeenLastCalledWith('2026-09-15');
      expect(onClose).toHaveBeenCalled();
      // A quick chip jumps back to its month.
      act(() => pressable(r, 'Hôm qua').props.onPress());
      expect(allText(r)).toContain('Tháng 10 / 2026');
      act(() => pressable(r, 'Ghi cho Hôm qua · T5 22/10').props.onPress());
      expect(onPick).toHaveBeenLastCalledWith('2026-10-22');
    });

    it('colours each day by its deficit level, like Journal › Tháng', () => {
      const marks: Record<string, DayDeficitMark> = {
        '2026-10-19': { kind: 'settled', level: 'met', kcal: 950, color: DEFICIT_LEVEL_COLOR.met },
        '2026-10-20': { kind: 'settled', level: 'flat', kcal: 50, color: DEFICIT_LEVEL_COLOR.flat },
        '2026-10-21': { kind: 'incomplete', level: null, kcal: 1400, color: null },
        '2026-10-22': { kind: 'cheat', level: 'cheat', kcal: null, color: DEFICIT_LEVEL_COLOR.cheat },
        '2026-10-23': { kind: 'pending', level: 'ok', kcal: 600, color: DEFICIT_LEVEL_COLOR.ok },
      };
      const none: DayDeficitMark = { kind: 'none', level: null, kcal: null, color: null };
      const r = render(<DatePickerSheet visible value="2026-10-23" now={NOW} onPick={jest.fn()} onClose={jest.fn()} markOf={(k) => marks[k] ?? none} />);
      const bg = (n: ReactTestInstance) => StyleSheet.flatten(n.props.style).backgroundColor;
      expect(bg(pressable(r, 'T2 19/10, Đạt'))).toBe(DEFICIT_LEVEL_COLOR.met);
      expect(bg(pressable(r, 'T3 20/10, Duy trì'))).toBe(DEFICIT_LEVEL_COLOR.flat);
      expect(bg(pressable(r, 'T4 21/10, ⚠ Thiếu bữa'))).toBe(quest.raised);
      expect(bg(pressable(r, (l) => l.startsWith('Hôm qua, T5 22/10, Cheat day')))).toBe(DEFICIT_LEVEL_COLOR.cheat);
      expect(bg(pressable(r, (l) => l.startsWith('Hôm nay, T6 23/10, Tạm chấp nhận')))).toBe(`${DEFICIT_LEVEL_COLOR.ok}55`);
      const text = allText(r);
      expect(text).toContain('Duy trì');
      expect(text).toContain('~ Ước tính hôm nay');
    });

    it('the chip shows and sets the app-wide selected day', () => {
      useNutritionStore.setState({ logs: { '2026-10-22': { dateISO: '2026-10-22', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 500 } } });
      const r = render(<DateChip now={NOW} />);
      expect(pressable(r, 'Ngày ghi: Hôm nay. Chạm để đổi ngày')).toBeDefined();
      act(() => pressable(r, 'Ngày ghi: Hôm nay. Chạm để đổi ngày').props.onPress());
      expect(pressable(r, (l) => l === 'Hôm qua, T5 22/10, đã ghi')).toBeDefined();
      act(() => pressable(r, 'Hôm qua').props.onPress());
      act(() => pressable(r, (l) => l.startsWith('Ghi cho Hôm qua')).props.onPress());
      expect(useSelectedDayStore.getState().selectedKey).toBe('2026-10-22');
      expect(pressable(r, 'Ngày ghi: Hôm qua. Chạm để đổi ngày')).toBeDefined();
    });

    it('a controlled chip reports the pick instead of changing the selected day', () => {
      const onChange = jest.fn();
      const r = render(<DateChip now={NOW} value="2026-10-21" onChange={onChange} />);
      act(() => pressable(r, 'Ngày ghi: T4 21/10. Chạm để đổi ngày').props.onPress());
      act(() => pressable(r, 'Hôm nay').props.onPress());
      act(() => pressable(r, (l) => l.startsWith('Ghi cho Hôm nay')).props.onPress());
      expect(onChange).toHaveBeenCalledWith('2026-10-23');
      expect(useSelectedDayStore.getState().selectedKey).toBeNull();
    });
  });
});
