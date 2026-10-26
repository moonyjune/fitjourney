import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
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
  // Each View shows up twice in the test tree (composite + host node): keep one per distinct label.
  const rowLabels = (r: ReactTestRenderer) => [
    ...new Set(
      r.root
        .findAll((n) => n.props.accessible === true && /HP$|chưa có dữ liệu$|no data$/.test(String(n.props.accessibilityLabel)))
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

  it('lists every day of the week up to today, marks days without data and keeps HP consistent with the log', () => {
    useNutritionStore.setState({ logs: { '2026-10-20': log('2026-10-20'), '2026-10-22': log('2026-10-22') } });
    useWorkoutStore.setState({ entries: [bigBurn('2026-10-22')] });
    const r = render();
    const text = allText(r);
    expect(text).toContain('Quái Một Ký Mỡ');
    expect(text).toContain('BOSS TUẦN 43'); // the eyebrow is set in capitals
    expect(text).toContain('RESET 00:00 THỨ HAI');
    const labels = rowLabels(r);
    expect(labels).toHaveLength(5); // Mon-Fri
    expect(labels[0]).toMatch(/^T2\. chưa có dữ liệu/); // Monday: no data, not "0 damage"
    expect(labels[4]).toMatch(/^Hôm nay/);
    // The numbers on screen must add up: 7,700 − sum of the daily hits = HP left.
    const dealt = labels.reduce((s, l) => s + Number((/−([\d,]+) HP/.exec(l)?.[1] ?? '0').replace(/,/g, '')), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(text.replace(/\s+/g, ' ')).toContain(`${(7700 - dealt).toLocaleString('en-US')} / 7,700`);
  });

  it('shows the daily cap and explains it when a day exceeds it', () => {
    useNutritionStore.setState({ logs: { '2026-10-23': log('2026-10-23') } });
    useWorkoutStore.setState({ entries: [bigBurn('2026-10-23')] });
    const text = allText(render());
    expect(text).toContain('→ 1,500 sát thương');
    expect(text).toContain('Chạm giới hạn an toàn 1,500/ngày');
    expect(text).toContain('−1,500');
    expect(text.replace(/\s+/g, ' ')).toContain('6,200 / 7,700');
  });

  it('says so instead of showing a hit when nothing is logged today', () => {
    expect(allText(render())).toContain('Chưa ghi bữa ăn nào hôm nay nên chưa có đòn.');
  });

  it('tells how much damage per day is still needed, and switches wording on the last day', () => {
    useNutritionStore.setState({ logs: { '2026-10-23': log('2026-10-23') } });
    useWorkoutStore.setState({ entries: [bigBurn('2026-10-23')] });
    const text = allText(render());
    expect(text).toContain('Còn 2 ngày nữa · cần trung bình 3,100 kcal/ngày'); // 6,200 HP over Saturday and Sunday
    expect(text).toContain('vượt giới hạn 1,500/ngày'); // 3,100 a day can never be dealt: say so
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
    expect(allText(r)).toContain('Battle log');
    act(() => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Back')[0].props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
