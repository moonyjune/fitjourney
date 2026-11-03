import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
    setParams: (...a: unknown[]) => mockRouter.setParams(...a),
  },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

import BossScreen from '../../../app/boss';
import { JournalScreen } from '../../screens/journal/JournalScreen';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

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

const log = (dateKey: string) => ({ dateISO: dateKey, mealsEaten: { meal1: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 });
const bigBurn = (dateKey: string) => ({ id: `w${dateKey}`, dateISO: `${dateKey}T15:00:00`, templateId: null, label: 'Hard', durationMin: 60, caloriesBurned: 5000 });

describe('Boss detail screen', () => {
  it('opens the AI weekly review from a button under the boss', () => {
    const r = (() => {
      let x!: ReactTestRenderer;
      act(() => {
        x = create(<BossScreen />);
      });
      return x;
    })();
    const button = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Tổng kết tuần bằng AI')[0];
    expect(button).toBeDefined();
    act(() => button.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/weekly-report');
    act(() => r.unmount());
  });

  let renderer: ReactTestRenderer | undefined;
  const render = () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<BossScreen />);
    });
    renderer = r;
    return r;
  };
  // The full 7-day log is in Journal › Tuần (dialogs.md decision 7).
  const renderWeek = () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<JournalScreen initialTab="week" />);
    });
    renderer = r;
    return r;
  };
  // Each View shows up twice in the test tree (composite + host node): keep one per distinct label.
  const rowLabels = (r: ReactTestRenderer) => [
    ...new Set(
      r.root
        // (The week strip's cells, "T2 19/10, …", are not log rows.)
        .findAll((n) => n.props.accessible === true && /HP$|chưa có dữ liệu$|no data$/.test(String(n.props.accessibilityLabel)) && !/\d\d\/\d\d/.test(String(n.props.accessibilityLabel)))
        .map((n) => String(n.props.accessibilityLabel))
    ),
  ];

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') }); // Friday of the week starting Mon 19 Oct
    Object.values(mockRouter).forEach((m) => m.mockClear());
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, activityLevel: 'light', gender: null, age: null, heightCm: null });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106 }] });
    useWorkoutStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: {} });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('opens the full week in Journal › Tuần', () => {
    const r = render();
    act(() => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Xem cả tuần')[0].props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/journal', params: { tab: 'week' } });
    expect(rowLabels(r)).toHaveLength(0); // the 7-day log is not repeated here
  });

  it('Journal › Tuần lists every day of the week up to today, marks days without data and keeps HP consistent with the log', () => {
    useNutritionStore.setState({ logs: { '2026-10-20': log('2026-10-20'), '2026-10-22': log('2026-10-22') } });
    useWorkoutStore.setState({ entries: [{ ...bigBurn('2026-10-22'), caloriesBurned: 500 }] }); // keeps the boss alive (training adds on top of the cap)
    const page = allText(render());
    expect(page).toContain('Quái Một Ký Mỡ');
    expect(page).toContain('BOSS TUẦN 43'); // the eyebrow is set in capitals
    expect(page).toContain('RESET 05:00 SÁNG THỨ HAI');
    act(() => renderer?.unmount());
    const r = renderWeek();
    const text = allText(r);
    const labels = rowLabels(r);
    expect(labels).toHaveLength(5); // Mon-Fri
    expect(labels[0]).toMatch(/^T2\. chưa có dữ liệu/); // Monday: no data, not "0 damage"
    expect(labels[4]).toMatch(/^Hôm nay/);
    // The numbers on screen must add up: 7,700 − sum of the daily hits = HP left.
    const dealt = labels.reduce((s, l) => s + Number((/−([\d,]+) HP/.exec(l)?.[1] ?? '0').replace(/,/g, '')), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(text.replace(/\s+/g, ' ')).toContain(`${(7700 - dealt).toLocaleString('en-US')} / 7,700`);
  });

  it('a hit while meals are still to come is pending: an estimate shown, no HP taken until the day is settled', () => {
    useNutritionStore.setState({ logs: { '2026-10-23': log('2026-10-23') } });
    useWorkoutStore.setState({ entries: [bigBurn('2026-10-23')] });
    const text = allText(render()); // Friday 16:10: the plan's later meals are still to come
    expect(text).toMatch(/Thâm hụt dự kiến [\d,]+ kcal → ~[\d,]+ sát thương, chờ chốt/);
    expect(text).toContain('đòn tính khi ghi đủ bữa hoặc hết giờ ăn');
    expect(text.replace(/\s+/g, ' ')).toContain('7,700 / 7,700');
    expect(text).toContain('Còn 2 ngày nữa · cần trung bình 2,567 kcal/ngày'); // today still counts as a day to come: 7,700 / 3
    // ⓘ: why the hit waits, in full.
    const info = renderer!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Vì sao đòn hôm nay chờ chốt?')[0];
    act(() => info.props.onPress());
    expect(allText(renderer!)).toContain('để boss không mất máu từ sáng chỉ vì chưa ăn');
    act(() => renderer?.unmount());
    // The week's log: today's hit is an estimate (~−…), with the same ⓘ.
    const week = renderWeek();
    expect(allText(week)).toMatch(/~−[\d,]+/);
    expect(week.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Vì sao đòn hôm nay chờ chốt?').length).toBeGreaterThan(0);
  });

  it('shows the daily cap and explains it when a day exceeds it', () => {
    jest.setSystemTime(new Date('2026-10-23T20:30:00')); // the eating window is over: the day is settled
    useNutritionStore.setState({ logs: { '2026-10-23': log('2026-10-23') } });
    useWorkoutStore.setState({ entries: [bigBurn('2026-10-23')] });
    const text = allText(render());
    // 1,500 from eating + 5,000 of training: training adds on top of the cap.
    expect(text).toContain('→ 6,500 sát thương');
    expect(text).toContain('chạm mức an toàn 1,500/ngày');
    expect(text.replace(/\s+/g, ' ')).toContain('1,200 / 7,700');
    act(() => renderer?.unmount());
    // The week's log splits the deficit: eating below the TDEE (capped at 1,500 for damage) and training.
    const week = allText(renderWeek());
    expect(week).toMatch(/🍽 ăn dưới TDEE [\d,]+ \(tính tối đa 1,500\) · 🏃 tập luyện 5,000/);
    expect(week).toContain('−6,500');
  });

  it('says so instead of showing a hit when nothing is logged today', () => {
    expect(allText(render())).toContain('Chưa ghi bữa ăn nào hôm nay nên chưa có đòn.');
  });

  it('tells how much damage per day is still needed, and switches wording on the last day', () => {
    jest.setSystemTime(new Date('2026-10-23T20:30:00')); // settled
    useNutritionStore.setState({ logs: { '2026-10-23': log('2026-10-23') } });
    useWorkoutStore.setState({ entries: [bigBurn('2026-10-23')] });
    const text = allText(render());
    expect(text).toContain('Còn 2 ngày nữa · cần trung bình 600 kcal/ngày'); // 1,200 HP over Saturday and Sunday
    expect(text).not.toContain('chỉ còn hạ được boss nếu tập luyện thêm');
    act(() => renderer?.unmount());
    jest.setSystemTime(new Date('2026-10-25T10:00:00'));
    expect(allText(render())).toContain('Hôm nay là ngày cuối');
  });

  it('announces a defeated boss and never shows negative HP', () => {
    jest.setSystemTime(new Date('2026-10-25T21:00:00'));
    const keys = ['19', '20', '21', '22', '23', '24', '25'].map((d) => `2026-10-${d}`);
    useNutritionStore.setState({ logs: Object.fromEntries(keys.map((k) => [k, log(k)])) });
    useWorkoutStore.setState({ entries: keys.map(bigBurn) });
    const text = allText(render());
    expect(text).toContain('Boss đã gục');
    expect(text.replace(/\s+/g, ' ')).toContain('0 / 7,700');
    expect(text).not.toMatch(/NaN|-\d/); // no negative HP, no NaN
    expect(text).not.toContain('vượt giới hạn'); // a defeated boss needs nothing more
  });

  it('goes back and speaks English', () => {
    useSettingsStore.setState({ language: 'en' });
    const r = render();
    expect(allText(r)).toContain('The One-Kilo Blob');
    expect(allText(r)).toContain('See the whole week');
    act(() => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Back')[0].props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
