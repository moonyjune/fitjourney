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
const mockPush = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushUricReading: (...a: unknown[]) => mockPush(...a),
  deleteUricReading: (...a: unknown[]) => mockDelete(...a),
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  return { LineChart: (props: Record<string, unknown>) => <View testID="LineChart" {...props} /> };
});

import UricScreen from '../../../app/uric';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUricStore } from '../../store/useUricStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

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

let renderer: ReactTestRenderer | undefined;
const mount = async () => {
  await act(async () => {
    renderer = create(<UricScreen />);
  });
  return renderer!;
};

const food = (name: string, over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({ id: `${name}-${Math.random()}`, name, calories: 500, proteinG: 40, loggedAtISO: '2026-10-05T05:00:00.000Z', mealTime: 'lunch', ...over });
const TODAY = toDateKey(new Date());
const ddmmyyyy = (key: string) => `${key.slice(8)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'vi', startWeightKg: 110, goalWeightKg: 95, calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110, gender: null, age: null, heightCm: null, activityLevel: null });
  useLimitsStore.setState({ purineMg: 600, saltG: 5, sugarG: 35 });
  useNutritionStore.setState({ logs: {} });
  useWeightStore.setState({ entries: [] });
  useWorkoutStore.setState({ entries: [] });
  useUricStore.setState({ readings: [], targetUmol: 360 });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

describe('Uric acid screen', () => {
  it('asks for a first result when there is none, and still offers the target and the disclaimer', async () => {
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Chưa có kết quả nào');
    expect(text).toContain('Dưới 360 µmol/L (≈ 6,1 mg/dL)');
    expect(text).toContain('không thay cho tư vấn của bác sĩ');
    expect(has(r, 'Ghi kết quả xét nghiệm')).toBe(true);
  });

  it('shows the latest result against the target, in both units, with how long ago it was', async () => {
    useUricStore.setState({ readings: [{ id: 'a', dateKey: '2026-10-16', valueUmol: 457, note: '' }] });
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('457 µmol/L ≈ 7,7 mg/dL');
    expect(text).toContain('Cao');
    expect(text).toContain('Mục tiêu dưới 360 µmol/L: còn cao hơn 97 µmol/L.');
    expect(text).toContain('Xét nghiệm ngày 16/10/2026');
    expect(text).toContain('khớp sưng, nóng, đỏ, đau thì nên đi khám');
  });

  it('shows the change since the previous test and a chart once there are two results', async () => {
    useUricStore.setState({
      readings: [
        { id: 'a', dateKey: '2026-08-01', valueUmol: 520, note: '' },
        { id: 'b', dateKey: '2026-10-16', valueUmol: 457, note: '' },
      ],
    });
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('So với lần trước (01/08/2026): -63 µmol/L');
    expect(text).toContain('Axit uric theo thời gian');
    const chart = r.root.findAll((n) => n.props.testID === 'LineChart')[0];
    expect(chart.props.data.datasets[0].data).toEqual([520, 457]);
    expect(chart.props.data.datasets[1].data).toEqual([360, 360]);
  });

  it('says on target at or under the target, in green wording', async () => {
    useUricStore.setState({ readings: [{ id: 'a', dateKey: '2026-10-16', valueUmol: 350, note: '' }] });
    const r = await mount();
    expect(allText(r)).toContain('Đạt mục tiêu');
    expect(allText(r)).toContain('Đạt mục tiêu dưới 360 µmol/L.');
    expect(allText(r)).not.toContain('khớp sưng');
  });

  it('shows what the diary looked like in the 14 days before each test', async () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (const d of [10, 12, 16]) {
      const key = `2026-10-${d}`;
      const items = [food(d === 12 ? '2 lon bia' : 'cơm', { purineMg: d === 16 ? 800 : 300, saltG: 3 })];
      logs[key] = { dateISO: key, mealsEaten: {}, extraCalories: 1500, extraProteinG: 100, extraItems: items, waterMl: 0 };
    }
    useNutritionStore.setState({ logs });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-15T07:00:00', weightKg: 106.2 }] });
    useUricStore.setState({ readings: [{ id: 'a', dateKey: '2026-10-16', valueUmol: 457, note: 'sau cỗ' }] });
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('sau cỗ');
    expect(text).toContain('14 NGÀY TRƯỚC XÉT NGHIỆM');
    expect(text).toContain('Purine TB 467 mg/ngày (1/3 ngày vượt trần)');
    expect(text).toContain('Có rượu hoặc bia: 1 ngày');
    expect(text).toContain('Thâm hụt TB');
    expect(text).toContain('Cân 106,2 kg');
  });

  it('says when there is no diary around the test', async () => {
    useUricStore.setState({ readings: [{ id: 'a', dateKey: '2026-10-16', valueUmol: 457, note: '' }] });
    const r = await mount();
    expect(allText(r)).toContain('Không có nhật ký ăn uống trong 14 ngày đó.');
  });

  it('logs a result typed in µmol/L, then lists it', async () => {
    const r = await mount();
    await tap(r, 'Ghi kết quả xét nghiệm');
    await type(r, 'Ngày xét nghiệm (dd/mm/yyyy)', ddmmyyyy(TODAY));
    await type(r, 'Kết quả', '430');
    await type(r, 'Ghi chú (tùy chọn)', 'sáng nhịn ăn');
    await tap(r, 'Lưu');
    expect(useUricStore.getState().readings).toHaveLength(1);
    expect(useUricStore.getState().readings[0]).toMatchObject({ dateKey: TODAY, valueUmol: 430, note: 'sáng nhịn ăn' });
    expect(mockPush).toHaveBeenCalled();
    expect(allText(r)).toContain('430 µmol/L ≈ 7,2 mg/dL');
    expect(allText(r)).toContain('Xét nghiệm hôm nay');
  });

  it('converts a result typed in mg/dL, and converts the typed number when the unit is switched', async () => {
    const r = await mount();
    await tap(r, 'Ghi kết quả xét nghiệm');
    await tap(r, 'mg/dL');
    await type(r, 'Kết quả', '7.2');
    await tap(r, 'Lưu');
    expect(useUricStore.getState().readings[0].valueUmol).toBe(428); // 7.2 x 59.48 = 428.3
    await tap(r, 'Sửa: ' + ddmmyyyy(TODAY));
    await tap(r, 'mg/dL');
    await tap(r, 'µmol/L');
    expect(allText(r)).toContain('Kết quả');
  });

  it('refuses a bad date, a future date and an implausible value, and says why', async () => {
    const r = await mount();
    await tap(r, 'Ghi kết quả xét nghiệm');
    await type(r, 'Ngày xét nghiệm (dd/mm/yyyy)', '31/02/2026');
    await type(r, 'Kết quả', '430');
    await tap(r, 'Lưu');
    expect(allText(r)).toContain('Ngày không hợp lệ');
    await type(r, 'Ngày xét nghiệm (dd/mm/yyyy)', '01/01/2999');
    await tap(r, 'Lưu');
    expect(allText(r)).toContain('không thể ở tương lai');
    await type(r, 'Ngày xét nghiệm (dd/mm/yyyy)', ddmmyyyy(TODAY));
    await type(r, 'Kết quả', '4300');
    await tap(r, 'Lưu');
    expect(allText(r)).toContain('Kết quả không hợp lý');
    expect(useUricStore.getState().readings).toEqual([]);
  });

  it('edits a result and deletes it with a second tap', async () => {
    useUricStore.setState({ readings: [{ id: 'a', dateKey: '2026-10-16', valueUmol: 457, note: '' }] });
    const r = await mount();
    await tap(r, 'Sửa: 16/10/2026');
    await type(r, 'Kết quả', '440');
    await tap(r, 'Lưu');
    expect(useUricStore.getState().readings[0]).toMatchObject({ id: 'a', valueUmol: 440 });
    await tap(r, 'Xóa: 16/10/2026');
    expect(useUricStore.getState().readings).toHaveLength(1);
    await tap(r, 'Bấm lần nữa để xóa: 16/10/2026');
    expect(useUricStore.getState().readings).toEqual([]);
    expect(mockDelete).toHaveBeenCalledWith('a');
    expect(allText(r)).toContain('Chưa có kết quả nào');
  });

  it('moves the target in steps and stops at the limits', async () => {
    const r = await mount();
    await tap(r, 'Giảm mục tiêu');
    expect(useUricStore.getState().targetUmol).toBe(350);
    expect(allText(r)).toContain('Dưới 350 µmol/L');
    await tap(r, 'Tăng mục tiêu');
    await tap(r, 'Tăng mục tiêu');
    expect(useUricStore.getState().targetUmol).toBe(370);
    useUricStore.setState({ targetUmol: 200 });
    await act(async () => undefined);
    expect(pressable(r, 'Giảm mục tiêu').props.disabled).toBe(true);
  });

  it('speaks English and goes back', async () => {
    useSettingsStore.setState({ language: 'en' });
    useUricStore.setState({ readings: [{ id: 'a', dateKey: '2026-10-16', valueUmol: 457, note: '' }] });
    const r = await mount();
    expect(allText(r)).toContain('Uric acid');
    expect(allText(r)).toContain('457 µmol/L ≈ 7.7 mg/dL');
    expect(allText(r)).toContain('Target under 360 µmol/L: still 97 µmol/L above.');
    await tap(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
