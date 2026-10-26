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
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: async (_u: string, id: string) => `file:///docs/${id}.jpg`,
  deletePersistedPhoto: jest.fn(async () => undefined),
  AI_MAX_EDGE_PX: 1280,
  AI_FULL_HD_EDGE_PX: 1920,
  imageUriToBase64: async () => ({ base64: 'QUJD', mediaType: 'image/png' }),
}));
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
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
import FoodDbScreen from '../../../app/food-db';
import { BUILT_IN_FOODS } from '../../food/foodData';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';

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
const press = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const hit = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  return hit;
};
const input = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const hit = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];
  if (!hit) throw new Error(`no input "${label}"`);
  return hit;
};
const has = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;

let renderer: ReactTestRenderer | undefined;
const mount = async (el: React.ReactElement) => {
  await act(async () => {
    renderer = create(el);
  });
  return renderer!;
};
const tap = async (r: ReactTestRenderer, label: string) => act(async () => (press(r, label).props.onPress as () => void)());
const type = async (r: ReactTestRenderer, label: string, v: string) => act(async () => (input(r, label).props.onChangeText as (v: string) => void)(v));

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'vi' });
  useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
  useNutritionStore.setState({ logs: {} });
  useProofStore.setState({ photos: [] });
  useWeightStore.setState({ entries: [] });
  useWorkoutStore.setState({ entries: [] });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

describe('Food database screen', () => {
  it('lists the built-in foods and searches them without accents', async () => {
    const r = await mount(<FoodDbScreen />);
    expect(allText(r)).toContain('114 MÓN');
    expect(allText(r)).toContain('Lòng trắng trứng');
    await type(r, 'Tìm món (vd: ức gà, phở)', 'dau phu');
    const text = allText(r);
    expect(text).toContain('Đậu phụ');
    expect(text).not.toContain('Lòng trắng trứng');
    await type(r, 'Tìm món (vd: ức gà, phở)', 'zzzz');
    expect(allText(r)).toContain('Không tìm thấy món nào.');
  });

  it('narrows to one group with its chip', async () => {
    const r = await mount(<FoodDbScreen />);
    await tap(r, 'Hải sản');
    const text = allText(r);
    expect(text).toContain('Tôm chín bóc vỏ');
    expect(text).not.toContain('Lòng trắng trứng');
    await tap(r, 'Tất cả');
    expect(allText(r)).toContain('Lòng trắng trứng');
  });

  it('opens a food to show its values and calculates an amount', async () => {
    const r = await mount(<FoodDbScreen />);
    await tap(r, 'Ức gà chín (áp chảo/nướng/luộc)');
    let text = allText(r);
    expect(text).toContain('Trên 100 g');
    expect(text).toContain('Purine cao'); // 175 mg per 100 g
    expect(text).toContain('Chưa tính muối ướp');
    expect(text).toContain('100 g ≈ 165 kcal'); // default amount is 100 g
    await type(r, 'Số lượng (g)', '150');
    text = allText(r);
    expect(text).toContain('150 g ≈ 248 kcal'); // 247.5
    expect(text).toContain('đạm 46,5 g');
    expect(text).toContain('purine 263 mg');
    await tap(r, 'Ức gà chín (áp chảo/nướng/luộc)'); // tap again closes
    expect(allText(r)).not.toContain('Trên 100 g');
  });

  it('shows the portion size of a countable food', async () => {
    const r = await mount(<FoodDbScreen />);
    await tap(r, 'Trứng gà (quả ≈50 g)');
    expect(allText(r)).toContain('Mỗi quả ≈ 50 g: 72 kcal');
    expect(allText(r)).toContain('1 quả ≈ 72 kcal');
  });

  it('adds a food of your own, refuses a duplicate name and a bad value, then lists it', async () => {
    const r = await mount(<FoodDbScreen />);
    await tap(r, 'Thêm món mới');
    await type(r, 'Tên món', 'Lòng trắng trứng');
    await type(r, 'Kcal', '360');
    await tap(r, 'Lưu');
    expect(allText(r)).toContain('Đã có món tên này.');
    await type(r, 'Tên món', 'Bánh gạo');
    await type(r, 'Kcal', '950');
    await tap(r, 'Lưu');
    expect(allText(r)).toContain('Kcal trên 100 g không thể quá 900.');
    await type(r, 'Kcal', '360');
    await type(r, 'Đạm (g)', '6');
    await type(r, 'Purine (mg)', '10');
    await tap(r, 'Lưu');
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
    expect(useFoodDbStore.getState().custom[0]).toMatchObject({ name: 'Bánh gạo', kcal: 360, proteinG: 6, purineMg: 10, unit: 'g', unitG: 1, group: 'starch' });
    expect(allText(r)).toContain('115 MÓN');
    expect(allText(r)).toContain('Bánh gạo');
  });

  it('edits a built-in food from a label, shows that it was edited, and restores it', async () => {
    const r = await mount(<FoodDbScreen />);
    await tap(r, 'Lòng trắng trứng');
    await tap(r, 'Sửa theo nhãn');
    expect((input(r, 'Kcal').props as { value: string }).value).toBe('52');
    await type(r, 'Kcal', '48');
    await tap(r, 'Lưu');
    const egg = BUILT_IN_FOODS.find((f) => f.name === 'Lòng trắng trứng')!;
    expect(useFoodDbStore.getState().overrides[egg.id]).toMatchObject({ kcal: 48, name: 'Lòng trắng trứng' });
    // the row stays open after saving, now flagged as edited
    expect(allText(r)).toContain('Đã sửa theo nhãn');
    expect(allText(r)).toContain('48 kcal');
    await tap(r, 'Khôi phục giá trị gốc');
    expect(useFoodDbStore.getState().overrides[egg.id]).toBeUndefined();
    expect(allText(r)).not.toContain('Đã sửa theo nhãn');
  });

  it('deletes your own food only after a second tap', async () => {
    useFoodDbStore.getState().addCustom({ name: 'Bánh gạo', group: 'starch', unit: 'g', unitG: 1, kcal: 360, proteinG: 6, purineMg: 10, sugarG: 1, sodiumMg: 20, confidence: 'medium' });
    const r = await mount(<FoodDbScreen />);
    await tap(r, 'Bánh gạo');
    expect(allText(r)).toContain('Món của bạn');
    await tap(r, 'Xóa món');
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
    expect(allText(r)).toContain('Bấm lần nữa để xóa');
    await tap(r, 'Bấm lần nữa để xóa');
    expect(useFoodDbStore.getState().custom).toHaveLength(0);
    expect(allText(r)).toContain('114 MÓN');
  });

  it('speaks English and goes back', async () => {
    useSettingsStore.setState({ language: 'en' });
    const r = await mount(<FoodDbScreen />);
    expect(allText(r)).toContain('Food database');
    expect(allText(r)).toContain('114 FOODS');
    expect(has(r, 'Seafood')).toBe(true);
    await tap(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('Food lookup in Add food', () => {
  const today = toDateKey(new Date());
  const items = () => useNutritionStore.getState().logs[today]?.extraItems ?? [];

  it('stays closed until opened, and offers the database from inside', async () => {
    const r = await mount(<AddFoodScreen />);
    expect(has(r, 'Tìm món (vd: ức gà, phở)')).toBe(false);
    await tap(r, 'Tra cứu món (tính theo g/ml)');
    expect(input(r, 'Tìm món (vd: ức gà, phở)')).toBeDefined();
    await tap(r, 'Mở cơ sở dữ liệu món ăn');
    expect(mockRouter.push).toHaveBeenCalledWith('/food-db');
  });

  it('builds a meal from foods and amounts, fills the form with the totals, and saves them with purine and salt', async () => {
    const r = await mount(<AddFoodScreen />);
    await tap(r, 'Tra cứu món (tính theo g/ml)');
    await type(r, 'Tìm món (vd: ức gà, phở)', 'uc ga chin');
    await tap(r, 'Thêm Ức gà chín (áp chảo/nướng/luộc)');
    await type(r, 'Số lượng Ức gà chín (áp chảo/nướng/luộc)', '150');
    await type(r, 'Tìm món (vd: ức gà, phở)', 'com trang');
    await tap(r, 'Thêm Cơm trắng chín');
    await type(r, 'Số lượng Cơm trắng chín', '200');
    // chicken 150 g: 247.5 kcal, 46.5 g protein, 262.5 mg purine, 120 mg sodium; rice 200 g: 260 kcal, 5.4 g protein, 36 mg purine, 4 mg sodium
    const total = allText(r);
    expect(total).toContain('Tổng: 508 kcal'); // 507.5 rounds to 508
    expect(total).toContain('đạm 51,9 g');
    expect(total).toContain('purine 299 mg');

    await tap(r, 'Dùng cho món này');
    expect((input(r, 'Tên món').props as { value: string }).value).toBe('150 g Ức gà chín; 200 g Cơm trắng chín');
    expect((input(r, 'Calo (kcal)').props as { value: string }).value).toBe('508');
    expect((input(r, 'Đạm (g)').props as { value: string }).value).toBe('51.9');
    expect((input(r, 'Purine (mg)').props as { value: string }).value).toBe('299');
    // sodium 124 mg = 0.31 g salt
    expect((input(r, 'Muối (g)').props as { value: string }).value).toBe('0.31');
    expect(has(r, 'Tìm món (vd: ức gà, phở)')).toBe(false); // the lookup closes after use

    await tap(r, 'Thêm vào hôm nay');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ name: '150 g Ức gà chín; 200 g Cơm trắng chín', calories: 508, proteinG: 51.9, purineMg: 299, saltG: 0.31 });
    expect(useFoodDbStore.getState().recent).toHaveLength(2);
    // The figures came from the database itself, so there is nothing new to remember.
    expect(useFoodDbStore.getState().custom).toHaveLength(0);
  });

  it('a meal built from the lookup and then changed by hand is remembered as a new food', async () => {
    const r = await mount(<AddFoodScreen />);
    await tap(r, 'Tra cứu món (tính theo g/ml)');
    await type(r, 'Tìm món (vd: ức gà, phở)', 'com trang');
    await tap(r, 'Thêm Cơm trắng chín');
    await tap(r, 'Dùng cho món này');
    await type(r, 'Calo (kcal)', '333');
    await tap(r, 'Thêm vào hôm nay');
    expect(useFoodDbStore.getState().custom).toHaveLength(1);
    expect(useFoodDbStore.getState().custom[0]).toMatchObject({ auto: true, kcal: 333 });
  });

  it('shows recently used foods, lets you remove a picked food, and warns about low-confidence foods', async () => {
    const pho = BUILT_IN_FOODS.find((f) => f.confidence === 'low')!;
    useFoodDbStore.getState().touchRecent(pho.id);
    const r = await mount(<AddFoodScreen />);
    await tap(r, 'Tra cứu món (tính theo g/ml)');
    expect(allText(r)).toContain('DÙNG GẦN ĐÂY');
    await tap(r, `Thêm ${pho.name}`);
    expect(allText(r)).toContain('Có món độ tin cậy thấp');
    await tap(r, `Bỏ ${pho.name}`);
    expect(allText(r)).not.toContain('Món đã chọn'.toUpperCase());
    expect(has(r, 'Dùng cho món này')).toBe(false);
  });

  it('ignores an empty or zero amount instead of filling the form with zeros', async () => {
    const r = await mount(<AddFoodScreen />);
    await tap(r, 'Tra cứu món (tính theo g/ml)');
    await type(r, 'Tìm món (vd: ức gà, phở)', 'com trang');
    await tap(r, 'Thêm Cơm trắng chín');
    await type(r, 'Số lượng Cơm trắng chín', '0');
    await tap(r, 'Dùng cho món này');
    expect((input(r, 'Tên món').props as { value: string }).value).toBe('');
    expect((input(r, 'Calo (kcal)').props as { value: string }).value).toBe('');
  });
});
