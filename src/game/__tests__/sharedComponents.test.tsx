import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Image, Text, View } from 'react-native';
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
import { calendarDays, DatePickerSheet } from '../../components/quest/DatePickerSheet';
import { DishThumb, dishLook } from '../../components/quest/DishThumb';
import { ScreenTemplate } from '../../components/quest/ScreenTemplate';
import { parseStepperText, Stepper, STEPPER_HOLD_MS, STEPPER_REPEAT_MS } from '../../components/quest/Stepper';
import { ToastHost } from '../../components/quest/Toast';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSelectedDayStore } from '../../store/useSelectedDayStore';
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
    it('lays the last 30 days out in whole Monday-to-Sunday weeks', () => {
      const days = calendarDays(NOW);
      expect(days.length % 7).toBe(0);
      expect(days[0]).toBe('2026-09-21'); // Monday on or before 23/9 (30 days back)
      expect(days[days.length - 1]).toBe('2026-10-25'); // Sunday after Friday 23/10
    });

    it('picks a day with the quick chips or the calendar, never one in the future or too old', () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const r = render(<DatePickerSheet visible value="2026-10-23" now={NOW} onPick={onPick} onClose={onClose} isMarked={(k) => k === '2026-10-20'} />);
      const text = allText(r);
      expect(text).toContain('Ghi cho ngày');
      expect(text).toContain('Tháng 9 – 10 / 2026');
      expect(pressable(r, (l) => l.startsWith('T7 24/10')).props.disabled).toBe(true); // tomorrow
      expect(pressable(r, (l) => l.startsWith('T2 21/09')).props.disabled).toBe(true); // over 30 days back
      expect(pressable(r, 'T3 20/10, đã ghi')).toBeDefined();
      act(() => pressable(r, 'Hôm qua').props.onPress());
      act(() => pressable(r, 'Ghi cho Hôm qua · T5 22/10').props.onPress());
      expect(onPick).toHaveBeenLastCalledWith('2026-10-22');
      expect(onClose).toHaveBeenCalled();
      act(() => pressable(r, (l) => l.startsWith('T4 21/10')).props.onPress());
      act(() => pressable(r, 'Ghi cho T4 21/10').props.onPress());
      expect(onPick).toHaveBeenLastCalledWith('2026-10-21');
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
