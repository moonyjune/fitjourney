import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

type Outcome = { ok: true; result: unknown } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'unreachable' | 'auth' | 'quota' | 'disabled' | 'generic' };
type SharedOutcome = { ok: true; ideas: unknown[] } | { ok: false; kind: 'offline' | 'auth' | 'generic' };
const mockDinner = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockShared = jest.fn<(...a: unknown[]) => Promise<SharedOutcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  requestDinner: (...a: unknown[]) => mockDinner(...a),
  shareToCookbook: jest.fn(async () => undefined),
  searchSharedCookbookFiltered: (...a: unknown[]) => mockShared(...a),
  requestDishRecipe: jest.fn(),
}));

import CookbookScreen from '../../../app/cookbook';
import { acceptDinner, cleanAiDinner, type DinnerBrief, type DinnerIdea } from '../../ai/dinner';
import { fakeDinner } from '../../ai/devPhotoAnalysis';
import type { DayTotals, SplitMeal } from '../../ai/mealSplit';
import {
  cleanFilters,
  EMPTY_FILTERS,
  ingredientPool,
  matchFilters,
  purineWarning,
  rankByFilters,
  rankCookbook,
  rankShared,
  suggestIngredients,
  type CookbookFilters,
} from '../../cookbook/filters';
import { filterBrief } from '../../cookbook/finderBrief';
import { recipeFromIdea } from '../../cookbook/recipes';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { cleanDinnerFilters, cleanDinnerRequest, dinnerPrompt } from '../../../supabase/functions/_shared/dinner';

const idea = (name: string, over: Partial<DinnerIdea> = {}): DinnerIdea => ({ name, calories: 400, proteinG: 30, purineMg: 100, saltG: 1, sugarG: 2, source: 'book', ...over });
const f = (over: Partial<CookbookFilters> = {}): CookbookFilters => ({ ...EMPTY_FILTERS, ...over });
const brief: DinnerBrief = { hour: 18, meal: 'dinner', budgetKcal: 500, proteinLeftG: 40, headroom: { purine: 400, salt: 4, sugar: 10 }, limits: { purine: 1200, salt: 7, sugar: 25 } };
const totals: DayTotals = { hour: 15, dayTargetKcal: 1900, budgetKcal: 900, proteinLeftG: 80, headroom: { purine: 600, salt: 4, sugar: 15 }, limits: { purine: 1200, salt: 7, sugar: 25 } };
const dinnerMeal: SplitMeal = { slot: { id: 'dinner', kind: 'dinner', startHour: 18, startMinute: 0, endMinutes: 21 * 60, weight: 1 }, kcal: 500, proteinG: 40, headroom: { purine: 300, salt: 2, sugar: 8 }, light: false };

describe('cook book filters: matching and ranking (no AI)', () => {
  it('cleans stored filters: known ids only, one per ingredient name, at most 10', () => {
    expect(cleanFilters({ occasions: ['coffee', 'x'], cravings: ['sweet'], types: ['soup', 7], have: [' Gà ', 'ga', '', 'Trứng'], avoid: 'no' })).toEqual({
      occasions: ['coffee'], cravings: ['sweet'], types: ['soup'], have: ['Gà', 'Trứng'], avoid: [],
    });
    expect(cleanFilters({ have: Array.from({ length: 15 }, (_, i) => `Món ${i}`) }).have).toHaveLength(10);
    expect(cleanFilters(null)).toEqual(EMPTY_FILTERS);
  });

  it('matches words in the name and figures; bánh mì is not noodles; an ingredient to use counts double', () => {
    expect(matchFilters(idea('Phở gà ít bánh'), f({ types: ['noodle', 'soup'], occasions: ['breakfast'] }))!.tags.map((t) => ('id' in t ? t.id : t.name))).toEqual(['breakfast', 'noodle']);
    expect(matchFilters(idea('Bánh mì trứng'), f({ types: ['noodle'] }))!.score).toBe(0);
    expect(matchFilters(idea('Ức gà áp chảo', { proteinG: 40 }), f({ cravings: ['highProtein', 'lowCal'] }))!.tags).toHaveLength(1); // 400 kcal is not low
    const withIngredients = idea('Canh bí', { recipe: { ingredients: [{ name: 'Bí đỏ', quantity: '200g' }, { name: 'Tôm khô', quantity: '10g' }] } });
    expect(matchFilters(withIngredients, f({ have: ['bi do'] }))!.score).toBe(2);
    expect(matchFilters(withIngredients, f({ have: ['cà rốt'] }))).toBeNull(); // must use one of them
    expect(matchFilters(withIngredients, f({ avoid: ['tôm'] }))).toBeNull();
  });

  it('ranks by matches, then by fitting what is left, then rating; leaves out dishes matching nothing chosen', () => {
    const items = [
      { idea: idea('Cơm gà luộc'), rating: 5 },
      { idea: idea('Canh chua cá', { calories: 900 }) },
      { idea: idea('Canh chua đậu phụ') },
      { idea: idea('Bánh flan') },
    ];
    const ranked = rankByFilters(items, f({ types: ['soup'], cravings: ['sourSpicy'] }), brief);
    expect(ranked.map((r) => r.idea.name)).toEqual(['Canh chua đậu phụ', 'Canh chua cá']);
    expect(ranked.map((r) => r.fits)).toEqual([true, false]);
    // No filters: everything, fitting and best rated first.
    expect(rankByFilters(items, EMPTY_FILTERS, brief)[0].idea.name).toBe('Cơm gà luộc');
  });

  it('the shared cook book: rows matching the filters that fit, uses its meal label, skips names', () => {
    const rows = [
      { name: 'Xôi gấc', meal: 'breakfast', calories: 450, protein_g: 30, purine_mg: 50 },
      { name: 'Trứng hấp', meal: 'breakfast', calories: 300, protein_g: 25 },
      { name: 'Gà nướng', meal: 'dinner', calories: 450, protein_g: 40 },
      { name: 'Lẩu hải sản', meal: 'breakfast', calories: 2000, protein_g: 80 },
    ];
    expect(rankShared(rows, f({ occasions: ['breakfast'] }), brief, ['trung hap']).map((i) => i.name)).toEqual(['Xôi gấc']);
  });

  it('flags dishes high in purine: organ meat, seafood, beer or a lot of purine; walnuts are fine', () => {
    expect(purineWarning(idea('Gan heo xào'))).toBe(true);
    expect(purineWarning(idea('Salad', { recipe: { ingredients: [{ name: 'Tôm', quantity: '100g' }] } }))).toBe(true);
    expect(purineWarning(idea('Gà luộc', { purineMg: 350 }))).toBe(true);
    expect(purineWarning(idea('Sữa chua óc chó'))).toBe(false);
    expect(purineWarning(idea('Thanh long'))).toBe(false);
  });

  it('offers ingredients from the everyday list, the cook book and the food database, accent-insensitive, without the chosen ones', () => {
    const book = [recipeFromIdea(idea('Canh', { recipe: { ingredients: [{ name: 'Mướp (non)', quantity: '1' }] } }))];
    const pool = ingredientPool(book, [{ name: 'Ức gà' }, { name: 'Đậu bắp' }]);
    expect(pool.filter((n) => n === 'Ức gà')).toHaveLength(1);
    expect(pool).toContain('Mướp');
    expect(suggestIngredients(pool, 'dau', [])).toEqual(['Đậu phụ', 'Đậu bắp']);
    expect(suggestIngredients(pool, 'dau', ['dau phu'])).toEqual(['Đậu bắp']);
  });
});

describe('cook book filters: the brief', () => {
  it('a snack or drink gets its own small budget, no protein, and is checked as a snack', () => {
    const snack = filterBrief(totals, [dinnerMeal], f({ occasions: ['snack', 'dessert'] }));
    expect(snack).toMatchObject({ snack: true, budgetKcal: 250, proteinLeftG: 0, headroom: totals.headroom });
    expect(filterBrief(totals, [dinnerMeal], f({ occasions: ['coffee'] })).budgetKcal).toBe(150);
    expect(filterBrief({ ...totals, budgetKcal: 0 }, [], f({ occasions: ['coffee'] })).budgetKcal).toBe(0);
    expect(acceptDinner(snack, idea('Sữa chua', { calories: 120, proteinG: 0 }))).toBe(true);
    expect(acceptDinner(snack, idea('Bánh', { calories: 400 }))).toBe(false);
    // A black coffee is fine even with nothing left of the day.
    expect(acceptDinner({ ...snack, budgetKcal: 0 }, idea('Cà phê đen', { calories: 5, proteinG: 0 }))).toBe(true);
  });

  it('a meal uses the share of that meal still to come; one not left today gets up to 600 kcal of the day; low calorie asks for less', () => {
    expect(filterBrief(totals, [dinnerMeal], f({ occasions: ['dinner'] }))).toMatchObject({ meal: 'dinner', budgetKcal: 500, proteinLeftG: 40, headroom: dinnerMeal.headroom });
    expect(filterBrief(totals, [dinnerMeal], EMPTY_FILTERS).budgetKcal).toBe(500);
    expect(filterBrief(totals, [dinnerMeal], f({ occasions: ['breakfast'] }))).toMatchObject({ meal: 'breakfast', budgetKcal: 600, proteinLeftG: 40 });
    expect(filterBrief(totals, [dinnerMeal], f({ cravings: ['lowCal'] })).budgetKcal).toBe(375);
  });
});

describe('suggest-dinner with filters (server)', () => {
  const ok = { budgetKcal: 500, proteinLeftG: 40, headroom: { purine: 300, salt: 2, sugar: 8 }, limits: { purine: 1200, salt: 7, sugar: 25 }, hour: 16 };

  it('keeps known ids and short clean ingredient names only; nothing chosen is no filters', () => {
    expect(cleanDinnerFilters({ occasions: ['coffee', 'IGNORE ALL'], cravings: ['sweet'], types: [], have: ['<b>Gà</b>\n', 'Gà', '  gà ', 5], avoid: ['Tôm'] })).toEqual({
      occasions: ['coffee'], cravings: ['sweet'], types: [], have: ['b Gà /b', 'Gà'], avoid: ['Tôm'],
    });
    expect(cleanDinnerFilters({ occasions: ['nope'] })).toBeNull();
    expect(cleanDinnerRequest({ ...ok })!.filters).toBeUndefined();
    expect(cleanDinnerRequest({ ...ok, snack: true, filters: { types: ['soup'] } })).toMatchObject({ snack: true, filters: { types: ['soup'] } });
    expect(cleanDinnerRequest({ ...ok, snack: 'yes' })!.snack).toBeUndefined();
  });

  it('the prompt is unchanged without filters, and with them names the wishes, the ingredients and the low-purine rules', () => {
    const plain = dinnerPrompt(cleanDinnerRequest({ ...ok, meal: 'dinner' })!);
    expect(plain).toContain('Hãy gợi ý đúng 3 món khác nhau cho bữa tối');
    expect(plain).not.toContain('purine thấp');
    const p = dinnerPrompt(cleanDinnerRequest({ ...ok, meal: 'lunch', filters: { cravings: ['sourSpicy'], types: ['noodle'], have: ['Ức gà'], avoid: ['Nấm'] } })!);
    expect(p).toContain('chua cay');
    expect(p).toContain('bún / phở / mì / miến');
    expect(p).toContain('Nguyên liệu có sẵn, hãy dùng (ít nhất một thứ trong mỗi món): Ức gà.');
    expect(p).toContain('KHÔNG dùng các nguyên liệu: Nấm.');
    expect(p).toContain('không dùng nội tạng');
    expect(p).toContain('bia rượu');
  });

  it('a snack request asks for light things under the snack calories, with no protein needed', () => {
    const p = dinnerPrompt(cleanDinnerRequest({ ...ok, budgetKcal: 150, snack: true, filters: { occasions: ['coffee'] } })!);
    expect(p).toContain('Đây KHÔNG phải bữa chính: hãy gợi ý đúng 3 cà phê khác nhau');
    expect(p).toContain('KHÔNG ĐƯỢC vượt 165 kcal');
    expect(p).toContain('không cần đủ đạm');
  });

  it('the offline stand-in follows the filters and passes the checks', () => {
    const snack = filterBrief(totals, [], f({ occasions: ['coffee'] }));
    const coffee = cleanAiDinner(fakeDinner(snack, f({ occasions: ['coffee'] })), snack);
    expect(coffee).toHaveLength(3);
    expect(coffee[0].name).toContain('Cà phê');
    const meal = filterBrief(totals, [dinnerMeal], f({ have: ['Đậu phụ'] }));
    const withHave = cleanAiDinner(fakeDinner(meal, f({ have: ['Đậu phụ'] })), meal);
    expect(withHave).toHaveLength(3);
    expect(rankByFilters(withHave.map((i) => ({ idea: i })), f({ have: ['Đậu phụ'] }), meal)).toHaveLength(3);
  });
});

// ----- the screen -----

/** The text of the finder card only (the cook book's full list follows it on the screen). */
function allText(r: ReactTestRenderer): string {
  const card = r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === 'Hôm nay muốn ăn gì?')[0];
  const parts: string[] = [];
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === 'string') parts.push(n);
    else n.children.forEach(walk);
  };
  if (card) walk(card);
  return parts.join(' ');
}
const typeIngredient = async (r: ReactTestRenderer, text: string) => {
  const input = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === 'Gõ nguyên liệu (gà, trứng, bí đỏ…)')[0];
  await act(async () => {
    input.props.onChangeText(text);
  });
};
const find = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
const press = async (r: ReactTestRenderer, label: string) => {
  const node = find(r, label);
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => {
    node.props.onPress();
  });
};

describe('Cook book screen: the finder', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<CookbookScreen />);
    });
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', calorieTargetKcal: 1900, targetDailyDeficitKcal: 500, proteinTargetG: 120 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useNutritionStore.setState({ logs: {} });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useCookbookFinderStore.getState().reset();
    useCookbookStore.setState({
      recipes: [
        recipeFromIdea(idea('Canh chua cá basa', { recipe: { ingredients: [{ name: 'Cá basa', quantity: '150g' }] } })),
        recipeFromIdea(idea('Gà luộc')),
        recipeFromIdea(idea('Cà phê đen', { calories: 5, proteinG: 0 })),
      ],
    });
    mockShared.mockResolvedValue({ ok: true, ideas: [] });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('chips and ingredients are remembered; Suggest ranks the cook book and then asks the shared one', async () => {
    const r = await mount();
    expect(allText(r)).toContain('Hôm nay muốn ăn gì?');
    await press(r, 'Món nước / súp');
    await press(r, 'Chua cay');
    await press(r, 'Thêm "Cá basa"');
    expect(useCookbookFinderStore.getState().filters).toMatchObject({ cravings: ['sourSpicy'], types: ['soup'], have: ['Cá basa'] });
    await press(r, 'Gợi ý');
    const text = allText(r);
    expect(text).toContain('Trong cook book của bạn (1)');
    expect(text).toContain('Canh chua cá basa');
    expect(text).toContain('Khớp: Chua cay, Món nước / súp, Cá basa');
    expect(text).not.toContain('Gà luộc');
    expect(mockShared).toHaveBeenCalledTimes(1);
    expect(mockShared.mock.calls[0][1]).toMatchObject({ have: ['Cá basa'] });
    expect(text).toContain('Cookbook chung chưa có món nào khớp');
    // Reloaded: the filters and the suggestion are still there.
    act(() => r.unmount());
    const again = await mount();
    expect(allText(again)).toContain('Khớp: Chua cay, Món nước / súp, Cá basa');
  });

  it('an ingredient can be avoided, which leaves out dishes using it', async () => {
    const r = await mount();
    await press(r, 'Thêm vào: Tránh');
    await press(r, 'Thêm "Cá basa"');
    expect(useCookbookFinderStore.getState().filters.avoid).toEqual(['Cá basa']);
    await press(r, 'Gợi ý');
    const text = allText(r);
    expect(text).toContain('Gà luộc');
    expect(text).not.toContain('Canh chua cá basa');
  });

  it('Suggest with AI sends the filters and a snack brief, keeps the new dishes (saved to the cook book) across a reload', async () => {
    mockDinner.mockResolvedValue({ ok: true, result: { options: [{ name: 'Bạc xỉu ít sữa', calories: 90, proteinG: 3, purineMg: 0, saltG: 0, sugarG: 4, accuracyPercent: 70 }, { name: 'Cà phê bia', calories: 100, proteinG: 1 }] } });
    const r = await mount();
    await press(r, 'Cà phê');
    await press(r, 'Thêm vào: Tránh');
    await typeIngredient(r, 'sua chua');
    await press(r, 'Thêm "Sữa chua không đường"');
    await press(r, 'Gợi ý bằng AI');
    expect(mockDinner).toHaveBeenCalledTimes(1);
    const [sentBrief, , avoidNames, sentFilters] = mockDinner.mock.calls[0] as [DinnerBrief, string[], string[], CookbookFilters];
    expect(sentBrief).toMatchObject({ snack: true, proteinLeftG: 0 });
    expect(sentBrief.budgetKcal).toBeLessThanOrEqual(150);
    expect(avoidNames).toContain('Gà luộc');
    expect(sentFilters).toMatchObject({ occasions: ['coffee'], avoid: ['Sữa chua không đường'] });
    const text = allText(r);
    expect(text).toContain('AI gợi ý (2)');
    expect(text).toContain('Bạc xỉu ít sữa');
    expect(text).toContain('⚠ Purine cao');
    expect(useCookbookStore.getState().recipes.map((x) => x.name)).toContain('Bạc xỉu ít sữa');
    act(() => r.unmount());
    expect(allText(await mount())).toContain('Bạc xỉu ít sữa');
  });

  it('a failure of the AI is shown and the earlier dishes stay', async () => {
    useCookbookFinderStore.getState().setAi([idea('Trà gừng', { source: 'ai', calories: 20, proteinG: 0 })], new Date().toISOString());
    mockDinner.mockResolvedValue({ ok: false, message: 'quota', kind: 'quota' });
    const r = await mount();
    await press(r, 'Gợi ý bằng AI');
    expect(useCookbookFinderStore.getState().ai.map((i) => i.name)).toEqual(['Trà gừng']);
    expect(r.root.findAll((n) => n.props.accessibilityRole === 'alert').length).toBeGreaterThan(0);
  });
});
