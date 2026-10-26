import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushHabit = jest.fn();
const mockPushCheck = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushHabit: (...a: unknown[]) => mockPushHabit(...a),
  pushHabitCheck: (...a: unknown[]) => mockPushCheck(...a),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import HabitsScreen from '../../../app/habits';
import type { Habit } from '../../habits/types';
import { addDaysToKey } from '../../insights/dateMath';
import { useHabitStore } from '../../store/useHabitStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';

const TODAY = toDateKey(new Date());
const YESTERDAY = addDaysToKey(TODAY, -1);

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const hit = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  return hit;
};
const has = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label).length > 0;
const tap = async (r: ReactTestRenderer, label: string) => act(async () => (pressable(r, label).props.onPress as () => void)());
const type = async (r: ReactTestRenderer, label: string, v: string) => {
  const hit = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no input "${label}"`);
  await act(async () => (hit.props.onChangeText as (v: string) => void)(v));
};

const habit = (id: string, name: string, over: Partial<Habit> = {}): Habit => ({ id, name, status: 'building', assessment: '', kaizen: '', measuredBy: '', tracked: true, auto: null, sort: Number(id.replace(/\D/g, '')), archived: false, ...over });

let renderer: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => {
    renderer = create(<HabitsScreen />);
  });
  return renderer!;
};

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'vi' });
  useNutritionStore.setState({ logs: {} });
  useWeightStore.setState({ entries: [] });
  useWorkoutStore.setState({ entries: [] });
  useHabitStore.setState({
    habits: [
      habit('h1', 'Không húp nước dùng', { status: 'formed', assessment: 'Cắt natri', kaizen: 'Xin sốt riêng', measuredBy: 'Natri bữa trưa' }),
      habit('h2', 'Cân hàng ngày', { status: 'building', auto: 'weigh' }),
      habit('h3', 'Uống giấm táo', { status: 'formed', tracked: false }),
      habit('h4', 'Uống đủ 3 lít nước', { status: 'formed', auto: 'water' }),
      habit('h5', 'Đi bộ sau bữa', { status: 'todo', auto: 'walk' }),
    ],
    checks: {},
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

describe('Habits screen', () => {
  it('lists the habits to tick (not the untracked one) and the whole list with status, kaizen and what it is measured by', async () => {
    const r = await mount();
    const text = allText(r);
    expect(has(r, 'Không húp nước dùng: chưa tích')).toBe(true);
    expect(has(r, 'Cân hàng ngày: chưa tích')).toBe(true);
    expect(has(r, 'Uống giấm táo: chưa tích')).toBe(false); // listed below, but not ticked day by day
    expect(text).toContain('Đã thành nếp');
    expect(text).toContain('Nâng cấp tiếp theo: Xin sốt riêng');
    expect(text).toContain('Đo bằng: Natri bữa trưa');
    expect(text).toContain('Không tích hằng ngày');
    expect(text).toContain('Chưa tích thói quen nào trong ngày này.');
  });

  it('cycles a tick through done, missed and cleared, saves each step and shows the day’s ratio', async () => {
    const r = await mount();
    await tap(r, 'Không húp nước dùng: chưa tích');
    expect(useHabitStore.getState().checks[TODAY]).toEqual({ h1: 'done' });
    expect(mockPushCheck).toHaveBeenLastCalledWith('h1', TODAY, 'done');
    await tap(r, 'Cân hàng ngày: chưa tích');
    await tap(r, 'Cân hàng ngày: đã làm');
    expect(useHabitStore.getState().checks[TODAY]).toEqual({ h1: 'done', h2: 'missed' });
    expect(allText(r)).toContain('Đạt 50% thói quen đã tích trong ngày (1/2)');
    await tap(r, 'Cân hàng ngày: chưa làm');
    expect(useHabitStore.getState().checks[TODAY]).toEqual({ h1: 'done' });
    expect(mockPushCheck).toHaveBeenLastCalledWith('h2', TODAY, null);
    expect(allText(r)).toContain('Đạt 100% thói quen đã tích trong ngày (1/1)');
  });

  it('ticks another day when its chip is chosen', async () => {
    const r = await mount();
    await tap(r, `${YESTERDAY.slice(8)}/${YESTERDAY.slice(5, 7)}`);
    await tap(r, 'Không húp nước dùng: chưa tích');
    expect(useHabitStore.getState().checks).toEqual({ [YESTERDAY]: { h1: 'done' } });
  });

  it('shows a streak once a habit has been done two days running', async () => {
    useHabitStore.setState({ checks: { [TODAY]: { h1: 'done' }, [YESTERDAY]: { h1: 'done' }, [addDaysToKey(TODAY, -2)]: { h1: 'done' } } });
    const r = await mount();
    expect(allText(r)).toContain('Chuỗi 3 ngày');
  });

  it('offers what the app’s own data says for the habits it can judge, and ticks it on request', async () => {
    useNutritionStore.setState({ logs: { [TODAY]: { dateISO: TODAY, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 3200 } } });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: `${TODAY}T07:00:00`, weightKg: 100 }] });
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Dữ liệu cho thấy: đủ 3 L nước ✔');
    expect(text).toContain('Dữ liệu cho thấy: có lần cân buổi sáng ✔');
    expect(text).toContain('Dữ liệu chưa thấy buổi đi bộ từ 15 phút'); // no walk logged
    expect(has(r, 'Dùng gợi ý: Đi bộ sau bữa')).toBe(false);
    await tap(r, 'Dùng gợi ý: Uống đủ 3 lít nước');
    expect(useHabitStore.getState().checks[TODAY]).toEqual({ h4: 'done' });
    expect(has(r, 'Dùng gợi ý: Uống đủ 3 lít nước')).toBe(false); // already ticked
  });

  it('shows weekly consistency: each ticked habit’s rate, the weakest one, or that all are routines', async () => {
    const mon = '2026-10-05';
    const checks: Record<string, Record<string, 'done' | 'missed'>> = {};
    for (let i = 0; i < 7; i++) checks[addDaysToKey(mon, i)] = { h1: i < 6 ? 'done' : 'missed', h2: i < 3 ? 'done' : 'missed' };
    useHabitStore.setState({ checks });
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Tuần 05/10–11/10');
    expect(text).toContain('Không húp nước dùng: 6/7 ngày (86%)');
    expect(text).toContain('Cân hàng ngày: 3/7 ngày (43%)');
    expect(text).toContain('Yếu nhất: Cân hàng ngày (43%) → ưu tiên tuần tới');
    expect(text).toContain('71%');

    useHabitStore.setState({ checks: Object.fromEntries(Object.keys(checks).map((d) => [d, { h1: 'done' as const }])) });
    await act(async () => undefined);
    expect(allText(r)).toContain('✔ Tất cả thói quen đạt ≥ 5/7 ngày');
  });

  it('asks for a first tick when nothing has ever been ticked', async () => {
    const r = await mount();
    expect(allText(r)).toContain('Tích vài ngày để thấy tỷ lệ duy trì theo tuần.');
  });

  it('adds a habit (a name is required), then edits and deletes it with a second tap', async () => {
    const r = await mount();
    await tap(r, 'Thêm thói quen');
    await tap(r, 'Lưu');
    expect(allText(r)).toContain('Nhập tên thói quen.');
    await type(r, 'Tên thói quen', 'Ngủ trước 23h');
    await tap(r, 'Cần xây');
    await type(r, 'Nâng cấp tiếp theo (kaizen)', 'Tắt điện thoại lúc 22h30');
    await tap(r, 'Lưu');
    const added = useHabitStore.getState().habits.find((x) => x.name === 'Ngủ trước 23h')!;
    expect(added).toMatchObject({ status: 'todo', kaizen: 'Tắt điện thoại lúc 22h30', tracked: true, auto: null, archived: false });
    expect(mockPushHabit).toHaveBeenLastCalledWith(added);
    expect(has(r, 'Ngủ trước 23h: chưa tích')).toBe(true);

    await tap(r, 'Sửa: Ngủ trước 23h');
    await tap(r, 'Đang xây');
    await tap(r, 'Lưu');
    expect(useHabitStore.getState().habits.find((x) => x.id === added.id)!.status).toBe('building');

    await tap(r, 'Xóa thói quen: Ngủ trước 23h');
    expect(useHabitStore.getState().habits.find((x) => x.id === added.id)!.archived).toBe(false);
    await tap(r, 'Bấm lần nữa để xóa: Ngủ trước 23h');
    expect(useHabitStore.getState().habits.find((x) => x.id === added.id)!.archived).toBe(true);
    expect(has(r, 'Ngủ trước 23h: chưa tích')).toBe(false);
    expect(allText(r)).not.toContain('Ngủ trước 23h');
  });

  it('can turn daily ticking off for a habit while editing it', async () => {
    const r = await mount();
    await tap(r, 'Sửa: Cân hàng ngày');
    const sw = r.root.findAll((n) => n.props.accessibilityLabel === 'Tích ✔/✘ mỗi ngày' && typeof n.props.onValueChange === 'function')[0];
    await act(async () => (sw.props.onValueChange as (v: boolean) => void)(false));
    await tap(r, 'Lưu');
    expect(useHabitStore.getState().habits.find((x) => x.id === 'h2')!.tracked).toBe(false);
    expect(has(r, 'Cân hàng ngày: chưa tích')).toBe(false);
  });

  it('speaks English and goes back', async () => {
    useSettingsStore.setState({ language: 'en' });
    const r = await mount();
    expect(allText(r)).toContain('Daily check-in');
    expect(allText(r)).toContain('Routine');
    await tap(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
