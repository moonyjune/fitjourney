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

type Outcome = { ok: true; result: unknown } | { ok: false; message: string; kind: string };
const mockDinner = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockPlaces = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockShare = jest.fn(async () => undefined);
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  requestDinner: (...a: unknown[]) => mockDinner(...a),
  requestCheatPlaces: (...a: unknown[]) => mockPlaces(...a),
  shareToCookbook: (...a: unknown[]) => (mockShare as (...x: unknown[]) => Promise<undefined>)(...a),
  searchSharedCookbookFiltered: jest.fn(async () => ({ ok: true, ideas: [] })),
  requestDishRecipe: jest.fn(),
}));

import CookbookScreen from '../../../app/cookbook';
import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { fakeCheatDinner, fakeCheatPlaces } from '../../ai/devPhotoAnalysis';
import { cheatPurineWarning, cleanCheatIdeas, dishesToLocate, recheckPlaces, splitCookbook } from '../../cookbook/cheat';
import { EMPTY_FILTERS, rankCookbook } from '../../cookbook/filters';
import { cleanCookbook, mergeRecipe, recipeFromIdea, recipesFitting } from '../../cookbook/recipes';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { cleanDinnerRequest, dinnerPrompt } from '../../../supabase/functions/_shared/dinner';
import { cleanPlacesAnswer, cleanPlacesRequest, cleanReviewDate, placesPrompt, reliabilityCap } from '../../../supabase/functions/_shared/places';
import { addUsage, DAILY_QUOTA, estimateCostUsd } from '../../../supabase/functions/_shared/usage';
import { collectWebFindings, isWebSearchUnavailable, mergeFindings, normalizeUrl, webSearchTool, webSearchVariantAfter } from '../../../supabase/functions/_shared/webSearch';

const idea = (name: string, over: Partial<DinnerIdea> = {}): DinnerIdea => ({ name, calories: 400, proteinG: 30, purineMg: 100, saltG: 1, sugarG: 2, source: 'book', ...over });
const brief: DinnerBrief = { hour: 18, meal: 'dinner', budgetKcal: 500, proteinLeftG: 40, headroom: { purine: 400, salt: 4, sugar: 10 }, limits: { purine: 1200, salt: 7, sugar: 25 } };

describe('web search tool helpers (server)', () => {
  it('builds the tool: newest version by default, direct caller and basic fallbacks, Vietnam location', () => {
    expect(webSearchTool({ maxUses: 6, userLocation: { country: 'VN' } })).toEqual({ type: 'web_search_20260318', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'VN' } });
    expect(webSearchTool({ maxUses: 50 }, 'dynamic-direct')).toMatchObject({ max_uses: 10, allowed_callers: ['direct'] });
    expect(webSearchTool({ maxUses: 2 }, 'basic').type).toBe('web_search_20250305');
  });

  it('falls back on a 400 naming the tool, and recognises "web search is not enabled"', () => {
    expect(webSearchVariantAfter(400, 'set allowed_callers to ["direct"] for this model', 'dynamic')).toBe('dynamic-direct');
    expect(webSearchVariantAfter(400, 'web_search_20260318 is not supported on this model', 'dynamic-direct')).toBe('basic');
    expect(webSearchVariantAfter(400, 'messages: bad', 'dynamic')).toBeNull();
    expect(webSearchVariantAfter(500, 'allowed_callers', 'dynamic')).toBeNull();
    const off = '{"type":"error","error":{"type":"invalid_request_error","message":"Web search is not enabled for your organization."}}';
    expect(isWebSearchUnavailable(400, off)).toBe(true);
    expect(webSearchVariantAfter(400, off, 'dynamic')).toBeNull();
    expect(isWebSearchUnavailable(429, off)).toBe(false);
    expect(isWebSearchUnavailable(400, 'max_tokens too large')).toBe(false);
  });

  it('collects what the searches really returned: direct and nested results, citations, error codes', () => {
    const f = collectWebFindings([
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'bún bò quận 1' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://WWW.Foody.vn/ho-chi-minh/bun-bo/', title: 'Bún bò', page_age: 'May 2, 2026', encrypted_content: 'x' }] },
      { type: 'web_search_tool_result', tool_use_id: 's2', caller: { type: 'code_execution_20260120' }, content: [{ type: 'web_search_result', url: 'https://maps.google.com/?cid=1#x', title: 'Maps' }] },
      { type: 'web_search_tool_result', tool_use_id: 's3', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
      { type: 'text', text: 'Ngon', citations: [{ type: 'web_search_result_location', url: 'https://blog.example.vn/review', title: 'Blog', cited_text: 'ngon lắm' }] },
      { type: 'text', text: 'no citations' },
    ]);
    expect(f.urls).toEqual(['https://www.foody.vn/ho-chi-minh/bun-bo', 'https://maps.google.com?cid=1', 'https://blog.example.vn/review']);
    expect(f.results[0]).toEqual({ url: 'https://www.foody.vn/ho-chi-minh/bun-bo', title: 'Bún bò', pageAge: 'May 2, 2026' });
    expect(f.citations[0].citedText).toBe('ngon lắm');
    expect(f.errors).toEqual(['max_uses_exceeded']);
    expect(mergeFindings([f, f]).urls).toHaveLength(3);
    expect(normalizeUrl('javascript:alert(1)')).toBe('');
  });

  it('prices searches at $0.01 each on top of the tokens; other features cost the same as before', () => {
    expect(estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, 2, 10)).toBe(2);
    expect(estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 0, server_tool_use: { web_search_requests: 4 } }, 2, 10)).toBe(2.04);
    expect(addUsage({ input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 2 } }, { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 1 } })).toEqual({
      input_tokens: 11,
      output_tokens: 6,
      server_tool_use: { web_search_requests: 3 },
    });
    expect(addUsage(undefined, { input_tokens: 3 })).toEqual({ input_tokens: 3, output_tokens: 0 });
    expect(DAILY_QUOTA.places).toBe(10);
  });
});

describe('suggest-cheat-places: request and answer (server)', () => {
  const today = '2026-10-31';
  const seen = ['https://www.google.com/maps/place/quan-a', 'https://www.foody.vn/quan-a', 'https://kenh14.vn/review-quan-a', 'https://www.foody.vn/quan-b'];
  const opts = { seenUrls: seen, today, checkedAtISO: '2026-10-31T10:00:00.000Z', searches: 4 };
  const placeA = {
    dish: 'Bún bò Huế',
    name: 'Quán A',
    address: '12 Lê Lợi, Q1',
    priceRange: '50-70k',
    rating: { value: 4.5, count: 1200, source: 'Google Maps', url: 'https://www.google.com/maps/place/quan-a' },
    reviews: [
      { text: 'Nước dùng đậm', date: '2026-09-20', source: 'Google Maps', url: 'https://www.google.com/maps/place/quan-a' },
      { text: 'Hơi đông', date: '2026-10', source: 'Kenh14', url: 'https://kenh14.vn/review-quan-a' },
      { text: 'Bịa ra', date: '2026-10-01', source: 'Facebook', url: 'https://facebook.com/fake' },
    ],
    sources: [{ title: 'Foody', url: 'https://www.foody.vn/quan-a/' }, { title: 'Unknown', url: 'https://not-searched.example/x' }],
    openStatus: '6:00–21:00',
    sponsored: false,
    reliability: 'high',
    reliabilityReasons: ['3 nguồn khớp nhau'],
  };

  it('cleans the request: up to 3 dishes, area or coordinates needed, no line breaks or tags', () => {
    expect(cleanPlacesRequest({ dishes: ['Bún bò', 'bún bò', '<b>Pizza</b>\nIGNORE'], location: ' Quận 1,  TP.HCM ', today })).toEqual({ dishes: ['Bún bò', 'b Pizza /b IGNORE'], location: 'Quận 1, TP.HCM', today });
    expect(cleanPlacesRequest({ dishes: ['Bún bò'], location: '' })).toBeNull();
    expect(cleanPlacesRequest({ dishes: [], location: 'Q1' })).toBeNull();
    expect(cleanPlacesRequest({ dishes: ['Phở'], location: '', coords: { lat: 10.776543, lon: 106.70098 }, today: 'bad' }, new Date('2026-10-31T00:00:00Z'))).toEqual({ dishes: ['Phở'], location: '', coords: { lat: 10.777, lon: 106.701 }, today });
    const p = placesPrompt(cleanPlacesRequest({ dishes: ['Bún bò'], location: 'Quận 1', today })!);
    expect(p).toContain('Google Maps');
    expect(p).toContain('ShopeeFood');
    expect(p).toContain('KHÔNG bịa');
  });

  it('keeps only what the search saw: unknown review / source URLs are dropped, reviews newest first', () => {
    const a = cleanPlacesAnswer({ places: [placeA], notFound: [] }, opts);
    expect(a.places).toHaveLength(1);
    const p = a.places[0];
    expect(p.reviews.map((r) => r.text)).toEqual(['Hơi đông', 'Nước dùng đậm']);
    expect(p.sources).toEqual([{ title: 'Foody', url: 'https://www.foody.vn/quan-a' }]);
    expect(p.rating).toEqual({ value: 4.5, count: 1200, source: 'Google Maps', url: 'https://www.google.com/maps/place/quan-a' });
    expect(a.dropped).toBe(2);
    expect(p.reliability).toMatchObject({ level: 'high', sites: 3, newestReview: '2026-10', capped: false, reasons: ['3 nguồn khớp nhau'] });
  });

  it('refuses invented data: a rating without a seen URL becomes "not found", a place with no backed source is left out', () => {
    const a = cleanPlacesAnswer(
      {
        places: [
          { ...placeA, rating: { value: 4.9, count: 5000, source: 'Google Maps', url: 'https://maps.example/invented' }, reliability: 'high' },
          { dish: 'Pizza', name: 'Quán ma', rating: { value: 5, source: 'Google', url: 'https://ghost.example' }, reviews: [{ text: 'tuyệt', source: 'x', url: 'https://ghost.example/r' }], sources: [], reliability: 'high', reliabilityReasons: [] },
          { dish: 'Pizza', name: 'Không nguồn', rating: { value: 7, source: 'Google', url: seen[0] }, reviews: [], sources: [], reliability: 'medium', reliabilityReasons: [] },
        ],
        notFound: ['Trà sữa'],
      },
      opts
    );
    expect(a.places.map((p) => p.name)).toEqual(['Quán A']);
    expect(a.places[0].rating).toBeNull();
    // Without a rating it cannot be "high" any more.
    expect(a.places[0].reliability).toMatchObject({ level: 'medium', capped: true });
    expect(a.notFound).toEqual(['Trà sữa']);
  });

  it('caps the reliability: one site, old reviews or a sponsored article can not be high', () => {
    expect(reliabilityCap({ sites: 1, rating: true, newestReviewDays: 10, sponsored: false })).toBe('medium');
    expect(reliabilityCap({ sites: 3, rating: true, newestReviewDays: 400, sponsored: false })).toBe('medium');
    expect(reliabilityCap({ sites: 3, rating: true, newestReviewDays: 10, sponsored: true })).toBe('medium');
    expect(reliabilityCap({ sites: 1, rating: false, newestReviewDays: 800, sponsored: false })).toBe('low');
    const sponsored = cleanPlacesAnswer({ places: [{ ...placeA, sponsored: true }] }, opts).places[0];
    expect(sponsored.reliability).toMatchObject({ level: 'medium', capped: true });
    // Nothing to check against: never above low.
    expect(cleanPlacesAnswer({ places: [placeA] }, { ...opts, seenUrls: null }).places[0].reliability.level).toBe('low');
  });

  it('review dates: YYYY-MM(-DD) only, never in the future', () => {
    expect(cleanReviewDate('2026-10-05', today)).toBe('2026-10-05');
    expect(cleanReviewDate('2026-11-01', today)).toBeNull();
    expect(cleanReviewDate('2026-10-31', today)).toBe('2026-10-31');
    expect(cleanReviewDate('hôm qua', today)).toBeNull();
    expect(cleanReviewDate('2026-13', today)).toBeNull();
  });

  it('cleaning twice changes nothing (the app re-checks what it stores)', () => {
    const once = cleanPlacesAnswer({ places: [placeA, { ...placeA, name: 'Quán B', sponsored: true }] }, opts);
    const twice = recheckPlaces(once)!;
    expect(twice.places).toEqual(once.places);
    expect(twice.dropped).toBe(once.dropped);
    expect(recheckPlaces(twice)!.places).toEqual(once.places);
    expect(recheckPlaces(null)).toBeNull();
  });

  it('the dev stand-in is labelled sample data, with example.com links only', () => {
    const fake = fakeCheatPlaces(['Bún bò Huế', 'Pizza'], 'Quận 1', new Date('2026-10-31T10:00:00Z'));
    expect(fake.sample).toBe(true);
    expect(fake.places).toHaveLength(2);
    expect(fake.places.every((p) => p.name.includes('DỮ LIỆU MẪU'))).toBe(true);
    expect(fake.places.flatMap((p) => [...p.sources.map((s) => s.url), ...p.reviews.map((r) => r.url)]).every((u) => /^https:\/\/example\.(com|org)\//.test(u))).toBe(true);
  });
});

describe('cheat-day dishes', () => {
  const ok = { budgetKcal: 300, proteinLeftG: 40, headroom: { purine: 100, salt: 1, sugar: 2 }, limits: { purine: 1200, salt: 7, sugar: 25 }, hour: 19 };

  it('suggest-dinner takes a cheat flag: no budget in the prompt, any dish, a gout caution', () => {
    const req = cleanDinnerRequest({ ...ok, cheat: { where: 'out' }, filters: { cravings: ['crunchy'] } })!;
    expect(req.cheat).toEqual({ where: 'out' });
    expect(cleanDinnerRequest({ ...ok, cheat: { where: 'moon' } })!.cheat).toEqual({ where: 'both' });
    expect(cleanDinnerRequest({ ...ok }))!.not.toHaveProperty('cheat');
    const p = dinnerPrompt(req);
    expect(p).toContain('CHEAT DAY');
    expect(p).toContain('KHÔNG giới hạn calo');
    expect(p).toContain('ĂN NGOÀI');
    expect(p).toContain('gout');
    expect(p).toContain('giòn');
    expect(p).not.toContain('300 kcal');
    // The everyday prompt is unchanged.
    expect(dinnerPrompt(cleanDinnerRequest({ ...ok })!)).toContain('Hãy gợi ý đúng 3 món khác nhau cho bữa tối');
  });

  it('cleans the AI cheat ideas without the budget check, marked cheat with where they are eaten', () => {
    const ideas = cleanCheatIdeas(fakeCheatDinner('both'), 'both');
    expect(ideas).toHaveLength(3);
    expect(ideas.every((i) => i.cheat && i.source === 'ai')).toBe(true);
    expect(ideas.map((i) => i.where)).toEqual(['home', 'out', 'out']);
    expect(ideas[0].calories).toBe(850); // far above a 300 kcal budget, still kept
    expect(cleanCheatIdeas({ options: [{ name: 'Pizza', calories: 900, proteinG: 30 }, { name: 'pizza', calories: 1, proteinG: 1 }, { name: '', calories: 5, proteinG: 1 }, { name: 'X', calories: -1, proteinG: 1 }] }, 'out')).toEqual([
      { name: 'Pizza', calories: 900, proteinG: 30, purineMg: 0, saltG: 0, sugarG: 0, source: 'ai', cheat: true, where: 'out' },
    ]);
    expect(dishesToLocate(ideas, 'both')).toEqual([ideas[1].name, ideas[2].name]);
    expect(dishesToLocate(ideas, 'home')).toEqual([]);
    expect(cheatPurineWarning(ideas[1])).toBe(true); // bún bò, 380 mg
    expect(cheatPurineWarning(ideas[2])).toBe(false);
  });

  it('cheat dishes live apart: kept out of everyday suggestions and ranking unless it is a cheat day', () => {
    const everyday = recipeFromIdea(idea('Gà luộc'));
    const cheat = recipeFromIdea(idea('Gà rán', { cheat: true, where: 'home', calories: 450 }));
    expect(cheat).toMatchObject({ cheat: true, where: 'home' });
    expect(splitCookbook([everyday, cheat])).toEqual({ everyday: [everyday], cheat: [cheat] });
    expect(recipesFitting([everyday, cheat], brief).map((r) => r.name)).toEqual(['Gà luộc']);
    expect(rankCookbook([everyday, cheat], EMPTY_FILTERS, brief).map((r) => r.idea.name)).toEqual(['Gà luộc']);
    expect(rankCookbook([everyday, cheat], EMPTY_FILTERS, null, undefined, true).map((r) => r.idea.name)).toEqual(['Gà rán', 'Gà luộc']);
    // The same name coming back as a cheat idea does not turn an everyday dish into a cheat one.
    expect(mergeRecipe(everyday, recipeFromIdea(idea('Gà luộc', { cheat: true }))).cheat).toBeUndefined();
    // Synced through the cloud copy like any other entry.
    expect(cleanCookbook({ recipes: [cheat, { ...everyday, cheat: 'yes', where: 'moon' }] }).map((r) => [r.name, r.cheat, r.where])).toEqual([
      ['Gà rán', true, 'home'],
      ['Gà luộc', undefined, undefined],
    ]);
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
const byLabel = (r: ReactTestRenderer, label: string, prop = 'onPress'): ReactTestInstance => {
  const node = r.root.findAll((n) => typeof n.props[prop] === 'function' && n.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`no "${label}"`);
  return node;
};
const press = async (r: ReactTestRenderer, label: string) => {
  const node = byLabel(r, label);
  await act(async () => {
    node.props.onPress();
  });
};
const type = async (r: ReactTestRenderer, label: string, text: string) => {
  const node = byLabel(r, label, 'onChangeText');
  await act(async () => {
    node.props.onChangeText(text);
  });
};

describe('Cook book screen: cheat day', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (finder = true) => {
    await act(async () => {
      renderer = create(<CookbookScreen />);
    });
    if (finder) await press(renderer!, '✨ Gợi ý');
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', calorieTargetKcal: 1900, targetDailyDeficitKcal: 500, proteinTargetG: 120 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useNutritionStore.setState({ logs: {} });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useCookbookFinderStore.getState().reset();
    useCookbookStore.setState({ recipes: [recipeFromIdea(idea('Gà luộc'))] });
    mockDinner.mockResolvedValue({ ok: true, result: fakeCheatDinner('out') });
    mockPlaces.mockImplementation(async (...a: unknown[]) => ({ ok: true, result: fakeCheatPlaces(a[0] as string[], a[1] as string, new Date('2026-10-31T10:00:00Z')) }));
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('ticking cheat day + eat out + an area: dishes without a budget, then places with reliability, all kept after a reload', async () => {
    const r = await mount();
    await press(r, 'Cheat day');
    expect(allText(r)).toContain('Cheat day vẫn phải nhớ gout');
    await press(r, 'Ăn ngoài');
    await type(r, 'Khu vực (phường / quận, thành phố)', 'Quận 1, TP.HCM');
    await press(r, 'Gợi ý bằng AI');
    expect(mockDinner).toHaveBeenCalledTimes(1);
    expect(mockDinner.mock.calls[0][4]).toEqual({ where: 'out' });
    const text = allText(r);
    expect(text).toContain('AI gợi ý cheat day (3)');
    expect(text).toContain('Pizza phô mai (giả lập)');
    expect(text).toContain('⚠ Purine cao');
    expect(text).not.toContain('✗ Vượt');
    // Places were looked up at once for the eat-out dishes, near the area typed.
    expect(mockPlaces).toHaveBeenCalledTimes(1);
    expect(mockPlaces.mock.calls[0][1]).toBe('Quận 1, TP.HCM');
    expect(text).toContain('DỮ LIỆU MẪU (chế độ Dev)');
    expect(text).toContain('Độ tin cậy: Cao');
    expect(text).toContain('Nguồn mẫu 4.3★ / 120 đánh giá');
    expect(text).toContain('Kiểm tra lần cuối');
    // Saved into the cook book's cheat day part, not shared.
    expect(useCookbookStore.getState().recipes.filter((x) => x.cheat)).toHaveLength(3);
    expect(mockShare).not.toHaveBeenCalled();
    act(() => r.unmount());
    const again = await mount();
    const t2 = allText(again);
    expect(t2).toContain('Pizza phô mai (giả lập)');
    expect(t2).toContain('Độ tin cậy: Cao');
    expect(useCookbookFinderStore.getState().location).toBe('Quận 1, TP.HCM');
  });

  it('web search not allowed: says so, and the dishes still come', async () => {
    mockPlaces.mockResolvedValue({ ok: false, message: 'Tìm địa điểm chưa khả dụng: Claude API lỗi (400): web search is not enabled', kind: 'unavailable' });
    const r = await mount();
    await press(r, 'Cheat day');
    await press(r, 'Ăn ngoài');
    await type(r, 'Khu vực (phường / quận, thành phố)', 'Hà Đông, Hà Nội');
    await press(r, 'Gợi ý bằng AI');
    const text = allText(r);
    expect(text).toContain('Tìm địa điểm chưa khả dụng: Claude API lỗi (400): web search is not enabled');
    expect(text).toContain('Bún bò Huế (giả lập)');
  });

  it('no area: asks for one before looking up places; cook at home looks up nothing', async () => {
    const r = await mount();
    await press(r, 'Cheat day');
    await press(r, 'Ăn ngoài');
    await press(r, 'Gợi ý bằng AI');
    expect(mockPlaces).not.toHaveBeenCalled();
    await press(r, 'Tìm quán gần đây');
    expect(allText(r)).toContain('Nhập khu vực trước để tìm quán.');
    await press(r, 'Tự nấu');
    expect(() => byLabel(r, 'Tìm quán gần đây')).toThrow();
  });

  it('the cook book shows cheat dishes under their own tab only', async () => {
    useCookbookStore.getState().saveMany([recipeFromIdea(idea('Gà rán giòn', { cheat: true }))]);
    const r = await mount(false);
    expect(allText(r)).toContain('Gà luộc');
    expect(allText(r)).not.toContain('Gà rán giòn');
    await press(r, '🎉 Cheat day (1)');
    expect(allText(r)).toContain('Gà rán giòn');
    expect(allText(r)).not.toContain('Gà luộc');
  });
});
