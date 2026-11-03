import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  requestDinner: jest.fn(),
  requestCheatPlaces: jest.fn(),
  shareToCookbook: jest.fn(async () => undefined),
  searchSharedCookbookFiltered: jest.fn(async () => ({ ok: true, ideas: [] })),
  requestDishRecipe: jest.fn(),
  requestDishPhotos: jest.fn(async () => ({ ok: false, message: 'off', kind: 'disabled' })),
}));

import CookbookScreen from '../../../app/cookbook';
import RecipeScreen from '../../../app/recipe/[id]';
import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { browseCookbook, dishBadge, matchesSearch, splitByFilters } from '../../cookbook/browse';
import { EMPTY_FILTERS } from '../../cookbook/filters';
import { useRecipeViewStore } from '../../store/useRecipeViewStore';
import { useToastStore } from '../../store/useToastStore';
import { recipeFromIdea, type CookbookRecipe } from '../../cookbook/recipes';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const idea = (name: string, over: Partial<DinnerIdea> = {}): DinnerIdea => ({ name, calories: 400, proteinG: 30, purineMg: 100, saltG: 1, sugarG: 2, source: 'book', ...over });
const recipe = (name: string, over: Partial<CookbookRecipe> = {}, ideaOver: Partial<DinnerIdea> = {}): CookbookRecipe => ({ ...recipeFromIdea(idea(name, ideaOver)), ...over });
const brief: DinnerBrief = { hour: 18, meal: 'dinner', budgetKcal: 500, proteinLeftG: 40, headroom: { purine: 400, salt: 4, sugar: 10 }, limits: { purine: 1200, salt: 7, sugar: 25 } };

const book: CookbookRecipe[] = [
  recipe('Canh bí đỏ', { createdAtISO: '2026-10-01T00:00:00Z', cookedCount: 5, rating: 3, minutes: 15, ingredients: [{ name: 'Bí đỏ', quantity: '200g' }, { name: 'Đậu phụ', quantity: '100g' }] }, { calories: 200 }),
  recipe('Gà áp chảo', { createdAtISO: '2026-10-20T00:00:00Z', rating: 5, minutes: 30 }, { calories: 450 }),
  recipe('Gan heo xào', { createdAtISO: '2026-10-10T00:00:00Z', cookedCount: 1 }, { calories: 350, purineMg: 450 }),
];

describe('cook book list: search, quick filters, sort', () => {
  it('searches names and ingredients, accent- and case-insensitive, every word', () => {
    expect(matchesSearch(book[0], 'bi do')).toBe(true);
    expect(matchesSearch(book[0], 'PHU')).toBe(true);
    expect(matchesSearch(book[0], 'canh ga')).toBe(false);
    expect(browseCookbook(book, { query: 'ap chao' }).map((r) => r.name)).toEqual(['Gà áp chảo']);
    expect(browseCookbook(book, { query: '  ' })).toHaveLength(3);
  });

  it('sorts by newest, most cooked, rating and fewest kcal', () => {
    expect(browseCookbook(book, { sort: 'newest' }).map((r) => r.name)).toEqual(['Gà áp chảo', 'Gan heo xào', 'Canh bí đỏ']);
    expect(browseCookbook(book, { sort: 'cooked' }).map((r) => r.name)).toEqual(['Canh bí đỏ', 'Gan heo xào', 'Gà áp chảo']);
    expect(browseCookbook(book, { sort: 'rating' }).map((r) => r.name)).toEqual(['Gà áp chảo', 'Canh bí đỏ', 'Gan heo xào']);
    expect(browseCookbook(book, { sort: 'kcal' }).map((r) => r.name)).toEqual(['Canh bí đỏ', 'Gan heo xào', 'Gà áp chảo']);
  });

  it('quick filters: low purine, quick, rated, fits the next meal', () => {
    expect(browseCookbook(book, { quick: ['lowPurine'] }).map((r) => r.name)).not.toContain('Gan heo xào');
    expect(browseCookbook(book, { quick: ['quick'] }).map((r) => r.name)).toEqual(['Canh bí đỏ']);
    expect(browseCookbook(book, { quick: ['rated', 'lowPurine'], sort: 'rating' }).map((r) => r.name)).toEqual(['Gà áp chảo', 'Canh bí đỏ']);
    expect(browseCookbook(book, { quick: ['fits'], brief }).map((r) => r.name)).toEqual(['Gà áp chảo', 'Canh bí đỏ']);
    expect(browseCookbook(book, { quick: ['fits'], brief: null })).toEqual([]);
  });

  it('the filter sheet splits the grid: matches first (most matches first), the rest folded; avoided ingredients are misses', () => {
    const { hits, misses } = splitByFilters(book, { ...EMPTY_FILTERS, types: ['grilled'] });
    expect(hits.map((r) => r.name)).toEqual(['Gà áp chảo']);
    expect(misses.map((r) => r.name)).toEqual(['Canh bí đỏ', 'Gan heo xào']);
    const avoid = splitByFilters(book, { ...EMPTY_FILTERS, avoid: ['Bí đỏ'] });
    expect(avoid.hits.map((r) => r.name)).toEqual(['Gà áp chảo', 'Gan heo xào']);
    expect(splitByFilters(book, EMPTY_FILTERS).misses).toEqual([]);
  });

  it('one badge per card: purine first, then fits, then +kcal over; none on a cheat day', () => {
    const ok = idea('Gà', { calories: 450 });
    expect(dishBadge(idea('Gan heo', { purineMg: 450 }), brief)).toEqual({ kind: 'purine' });
    expect(dishBadge(ok, brief)).toEqual({ kind: 'fits' });
    expect(dishBadge(idea('Bò', { calories: 620 }), brief)).toEqual({ kind: 'over', kcal: 120 });
    expect(dishBadge(ok, null)).toBeNull();
    expect(dishBadge(idea('Gan heo', { purineMg: 450 }), brief, true)).toBeNull();
  });
});

// ----- the screen -----

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === 'string') parts.push(n);
    else n.children.forEach(walk);
  };
  walk(r.root);
  return parts.join(' ');
}
const byLabel = (r: ReactTestRenderer, label: string, prop = 'onPress'): ReactTestInstance | undefined =>
  r.root.findAll((n) => typeof n.props[prop] === 'function' && n.props.accessibilityLabel === label)[0];
const press = async (r: ReactTestRenderer, label: string) => {
  const node = byLabel(r, label);
  if (!node) throw new Error(`no "${label}"`);
  await act(async () => {
    node.props.onPress();
  });
};
/** Names of the dish cards in screen order. */
const cards = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && book.some((b) => b.name === n.props.accessibilityLabel)).map((n) => n.props.accessibilityLabel as string);

describe('Cook book screen: search, filter sheet, photo grid', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (el: React.ReactElement = <CookbookScreen />) => {
    await act(async () => {
      renderer = create(el);
    });
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    useSettingsStore.setState({ language: 'vi', calorieTargetKcal: 1900, targetDailyDeficitKcal: 500, proteinTargetG: 120 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useNutritionStore.setState({ logs: {} });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useCookbookFinderStore.getState().reset();
    useCookbookStore.setState({ recipes: [...book, recipe('Gà rán', { cheat: true })] });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('opens on "Món của tôi" with a grid of photo cards (name, kcal · protein, one badge) and the sticky "Gợi ý món mới"', async () => {
    const r = await mount();
    expect(byLabel(r, 'Món của tôi · 3')!.props.accessibilityState).toEqual({ selected: true });
    expect(cards(r)).toEqual(['Gà áp chảo', 'Gan heo xào', 'Canh bí đỏ']);
    const text = allText(r);
    expect(text).toContain('3 món');
    expect(text).toContain('⚠ Purine cao');
    expect(text).toContain('★5');
    expect(text).toContain('200 kcal · 30 g');
    expect(text).not.toContain('Gà rán');
    expect(text).toMatch(/✨ Gợi ý món mới cho /);
    // The filters are folded into a sheet behind the filter button.
    expect(byLabel(r, 'Món nước / súp')).toBeUndefined();
    await press(r, 'Bộ lọc');
    expect(byLabel(r, 'Món nước / súp')).toBeDefined();
  });

  it('searches by name or ingredient, sorts (in the filter sheet) and filters quickly', async () => {
    const r = await mount();
    const input = byLabel(r, 'Tìm món hoặc nguyên liệu', 'onChangeText')!;
    await act(async () => {
      input.props.onChangeText('dau phu');
    });
    expect(cards(r)).toEqual(['Canh bí đỏ']);
    await press(r, 'Xóa tìm kiếm');
    expect(cards(r)).toHaveLength(3);
    await press(r, 'Bộ lọc');
    await press(r, 'Nấu nhiều');
    expect(cards(r)).toEqual(['Canh bí đỏ', 'Gan heo xào', 'Gà áp chảo']);
    await press(r, 'Ít kcal');
    expect(cards(r)).toEqual(['Canh bí đỏ', 'Gan heo xào', 'Gà áp chảo']);
    await press(r, 'Ít purine');
    expect(cards(r)).toEqual(['Canh bí đỏ', 'Gà áp chảo']);
    await press(r, '≤ 20′');
    expect(cards(r)).toEqual(['Canh bí đỏ']);
    await act(async () => {
      byLabel(r, 'Tìm món hoặc nguyên liệu', 'onChangeText')!.props.onChangeText('pizza');
    });
    expect(allText(r)).toContain('Không có món khớp.');
  });

  it('the filter button shows a badge; matches come first and the rest are folded under "Xem n món không khớp"', async () => {
    const r = await mount();
    await press(r, 'Bộ lọc');
    await press(r, 'Nướng / áp chảo');
    expect(byLabel(r, 'Xem 1 món khớp')).toBeDefined();
    await press(r, 'Xem 1 món khớp');
    expect(byLabel(r, 'Bộ lọc (1)')).toBeDefined();
    expect(allText(r)).toContain('3 món · 1 khớp bộ lọc');
    expect(cards(r)).toEqual(['Gà áp chảo']);
    await press(r, 'Xem 2 món không khớp bộ lọc');
    expect(cards(r)).toEqual(['Gà áp chảo', 'Gan heo xào', 'Canh bí đỏ']);
  });

  it('Camp\'s ?quick=lowPurine opens the grid already filtered', async () => {
    mockParams = { quick: 'lowPurine' };
    const r = await mount();
    expect(byLabel(r, 'Ít purine')!.props.accessibilityState).toEqual({ selected: true });
    expect(cards(r)).not.toContain('Gan heo xào');
  });

  it('the cheat-day side has its own dishes, a short empty state and leads to the Cheat day screen', async () => {
    const r = await mount();
    await press(r, '🎉 Cheat day · 1');
    expect(allText(r)).toContain('Gà rán');
    expect(allText(r)).not.toContain('Canh bí đỏ');
    expect(byLabel(r, 'Bộ lọc')).toBeUndefined();
    await press(r, '🎉 Cheat day: thèm gì, tìm quán');
    expect(mockPush).toHaveBeenCalledWith('/cheat-day');
    act(() => r.unmount());
    useCookbookStore.setState({ recipes: [] });
    const empty = await mount();
    await press(empty, '🎉 Cheat day · 0');
    expect(allText(empty)).toContain('Chưa có món cheat day.');
  });

  it('a card opens the recipe page; the page shows the recipe, logs it into Ghi bữa and removes it with undo', async () => {
    const r = await mount();
    await press(r, 'Canh bí đỏ');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'canh bi do' } });
    act(() => r.unmount());
    mockParams = { id: 'canh bi do' };
    const page = await mount(<RecipeScreen />);
    const text = allText(page);
    expect(text).toContain('Canh bí đỏ');
    expect(text).toContain('Nguyên liệu');
    expect(text).toContain('Bí đỏ');
    expect(text).toContain('15 phút');
    await press(page, 'Chấm 4 sao');
    expect(useCookbookStore.getState().recipes.find((x) => x.name === 'Canh bí đỏ')?.rating).toBe(4);
    // The sticky button says what it logs.
    const log = page.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Ghi món'))[0];
    await act(async () => {
      log.props.onPress();
    });
    expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ pathname: '/add-food', params: expect.objectContaining({ name: 'Canh bí đỏ', calories: '200' }) }));
    expect(useCookbookStore.getState().recipes.find((x) => x.name === 'Canh bí đỏ')?.cookedCount).toBe(6);
    await press(page, 'Xóa khỏi cook book');
    expect(useCookbookStore.getState().recipes.find((x) => x.name === 'Canh bí đỏ')).toBeUndefined();
    act(() => useToastStore.getState().undo());
    expect(useCookbookStore.getState().recipes.find((x) => x.name === 'Canh bí đỏ')?.rating).toBe(4);
  });

  it('a dish not in the cook book (handed over) can be saved from its page; an unknown id says so', async () => {
    useRecipeViewStore.getState().put({ idea: idea('Phở gà ít bánh', { source: 'shared', calories: 420 }) });
    mockParams = { id: 'pho ga it banh' };
    const page = await mount(<RecipeScreen />);
    expect(allText(page)).toContain('Phở gà ít bánh');
    await press(page, 'Lưu vào cook book');
    expect(useCookbookStore.getState().recipes.map((x) => x.name)).toContain('Phở gà ít bánh');
    act(() => page.unmount());
    mockParams = { id: 'khong co' };
    const missing = await mount(<RecipeScreen />);
    expect(allText(missing)).toContain('Không tìm thấy món này nữa.');
  });
});
