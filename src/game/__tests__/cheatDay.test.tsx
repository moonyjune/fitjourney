import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockRouterPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
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

import CheatDayScreen from '../../../app/cheat-day';
import CookbookScreen from '../../../app/cookbook';
import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { fakeCheatDinner, fakeCheatPlaces } from '../../ai/devPhotoAnalysis';
import { cheatReadWish, cleanCheatIdeas, dishesToLocate, recheckPlaces, splitCookbook } from '../../cookbook/cheat';
import { wishContextFrom, wishSlot } from '../../cookbook/cheatWish';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';
import { formatAddress, osmUrl, reverseGeocode } from '../../cookbook/geocode';
import { EMPTY_FILTERS, rankCookbook } from '../../cookbook/filters';
import { cleanCookbook, mergeRecipe, recipeFromIdea, recipesFitting } from '../../cookbook/recipes';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { cleanDinnerRequest, dinnerPrompt } from '../../../supabase/functions/_shared/dinner';
import {
  cleanPlacesAnswer,
  cleanPlacesRequest,
  cleanReviewDate,
  cleanWish,
  cleanWishContext,
  mapsSearchUrl,
  PLACES_TOOL,
  placesPrompt,
  placesRequestProblem,
  reliabilityCap,
  wishPrompt,
} from '../../../supabase/functions/_shared/places';
import { addUsage, DAILY_QUOTA, estimateCostUsd } from '../../../supabase/functions/_shared/usage';
import {
  collectWebFindings,
  isRegionUnsupported,
  isUserLocationRejected,
  isWebSearchUnavailable,
  mergeFindings,
  normalizeUrl,
  regionUnsupportedMessage,
  webSearchRetryAfter,
  webSearchTool,
  webSearchVariantAfter,
  webSearchVariantFor,
} from '../../../supabase/functions/_shared/webSearch';

const idea = (name: string, over: Partial<DinnerIdea> = {}): DinnerIdea => ({ name, calories: 400, proteinG: 30, purineMg: 100, saltG: 1, sugarG: 2, source: 'book', ...over });
const brief: DinnerBrief = { hour: 18, meal: 'dinner', budgetKcal: 500, proteinLeftG: 40, headroom: { purine: 400, salt: 4, sugar: 10 }, limits: { purine: 1200, salt: 7, sugar: 25 } };

describe('web search tool helpers (server)', () => {
  it('builds the tool: newest version by default, direct caller and basic fallbacks; never the country VN (refused by the API)', () => {
    expect(webSearchTool({ maxUses: 6, userLocation: { country: 'VN' } })).toEqual({ type: 'web_search_20260318', name: 'web_search', max_uses: 6 });
    expect(webSearchTool({ maxUses: 6, userLocation: { country: 'vn', city: 'Hà Nội', timezone: 'Asia/Ho_Chi_Minh' } }).user_location).toEqual({ type: 'approximate', city: 'Hà Nội', timezone: 'Asia/Ho_Chi_Minh' });
    expect(webSearchTool({ maxUses: 6, userLocation: { country: 'US' } }).user_location).toEqual({ type: 'approximate', country: 'US' });
    expect(webSearchTool({ maxUses: 6, userLocation: { timezone: 'Asia/Ho_Chi_Minh' } }, 'dynamic', false)).not.toHaveProperty('user_location');
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
    // Code execution (behind dynamic filtering) refused: search directly; a field the tool does not take: the basic version.
    expect(webSearchVariantAfter(400, 'code_execution is not enabled for this organization', 'dynamic')).toBe('dynamic-direct');
    expect(webSearchVariantAfter(400, 'tools.0.response_inclusion: Extra inputs are not permitted', 'dynamic-direct')).toBe('basic');
    expect(webSearchVariantAfter(400, 'tools.0: bad', 'basic')).toBeNull();
  });

  it('a refused location is retried once without user_location, before any other fallback; a region not served says so', () => {
    const country = '{"type":"error","error":{"type":"invalid_request_error","message":"tools.0.user_location.country: country VN is not supported"}}';
    const plain = '{"type":"error","error":{"type":"invalid_request_error","message":"Country not supported"}}';
    expect(isUserLocationRejected(400, country)).toBe(true);
    expect(isUserLocationRejected(400, plain)).toBe(true);
    expect(isUserLocationRejected(400, 'Location is invalid')).toBe(true);
    expect(isUserLocationRejected(500, country)).toBe(false);
    expect(isUserLocationRejected(400, 'max_tokens too large')).toBe(false);
    expect(isUserLocationRejected(400, 'web_search_20260318 is not supported on this model')).toBe(false);
    // With the location: drop it (same tool version), even though the body also names web_search / tools.0.
    expect(webSearchRetryAfter(400, country, { variant: 'dynamic', withLocation: true })).toEqual({ variant: 'dynamic', withLocation: false });
    // Without it already: the usual version fallback, or nothing left to try (never a loop).
    expect(webSearchRetryAfter(400, country, { variant: 'dynamic', withLocation: false })).toEqual({ variant: 'basic', withLocation: false });
    expect(webSearchRetryAfter(400, plain, { variant: 'basic', withLocation: false })).toBeNull();
    expect(webSearchRetryAfter(400, 'allowed_callers', { variant: 'dynamic', withLocation: true })).toEqual({ variant: 'dynamic-direct', withLocation: true });
    expect(webSearchRetryAfter(400, 'messages: bad', { variant: 'dynamic', withLocation: true })).toBeNull();
    // Still refused without the location: the region itself is not served; the user is told plainly (as "not available").
    expect(isRegionUnsupported(400, plain)).toBe(true);
    expect(isRegionUnsupported(403, 'Web search is not available in your region')).toBe(true);
    expect(isRegionUnsupported(400, 'web_search is not enabled')).toBe(false);
    expect(regionUnsupportedMessage('Claude API lỗi (400): Country not supported')).toBe(
      'Tìm địa điểm chưa khả dụng: tìm kiếm web của Claude chưa hỗ trợ quốc gia / khu vực này (Claude API lỗi (400): Country not supported)'
    );
  });

  it('starts on the version the model takes: dynamic filtering on Claude 4.6 and later, basic before', () => {
    expect(webSearchVariantFor('claude-sonnet-5-5')).toBe('dynamic');
    expect(webSearchVariantFor('claude-opus-4-6')).toBe('dynamic');
    expect(webSearchVariantFor('claude-haiku-4-5')).toBe('basic');
    expect(webSearchVariantFor('claude-sonnet-4-5-20250929')).toBe('basic');
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
    expect(cleanPlacesRequest({ dishes: ['Bún bò', 'bún bò', '<b>Pizza</b>\nIGNORE'], location: ' Quận 1,  TP.HCM ', today })).toEqual({ dishes: ['Bún bò', 'b Pizza /b IGNORE'], location: 'Quận 1, TP.HCM', today, wish: '' });
    expect(cleanPlacesRequest({ dishes: ['Bún bò'], location: '' })).toBeNull();
    // No dish: the AI picks them from the wish (or from the time and the user's eating).
    expect(cleanPlacesRequest({ dishes: [], location: 'Q1', today })).toEqual({ dishes: [], location: 'Q1', today, wish: '' });
    expect(cleanPlacesRequest({ location: 'Q1', today, typed: true })).toEqual({ dishes: [], location: 'Q1', today, wish: '' });
    expect(cleanPlacesRequest({ dishes: ['Phở'], location: '', coords: { lat: 10.776543, lon: 106.70098 }, today: 'bad' }, new Date('2026-10-31T00:00:00Z'))).toEqual({ dishes: ['Phở'], location: '', coords: { lat: 10.7765, lon: 106.701 }, today, wish: '' });
    const p = placesPrompt(cleanPlacesRequest({ dishes: ['Bún bò'], location: 'Quận 1', today })!);
    expect(p).toContain('Google Maps');
    expect(p).toContain('ShopeeFood');
    expect(p).toContain('KHÔNG bịa');
    expect(placesRequestProblem({ dishes: [] })).toContain('địa chỉ');
    expect(placesRequestProblem({ dishes: ['Phở'], location: '' })).toContain('địa chỉ');
  });

  it('a typed search: exactly what the user wants, near the full address and the precise position, nearest first', () => {
    const req = cleanPlacesRequest({ dishes: ['trà sữa ít ngọt', 'ignored'], typed: true, location: '123 Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM', coords: { lat: 10.7731234, lon: 106.7004321 }, today })!;
    expect(req).toEqual({ dishes: ['trà sữa ít ngọt'], typed: true, location: '123 Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM', coords: { lat: 10.7731, lon: 106.7004 }, today, wish: '' });
    const p = placesPrompt(req);
    expect(p).toContain('đúng thứ này: "trà sữa ít ngọt"');
    expect(p).toContain('123 Lê Lợi, Phường Bến Thành');
    expect(p).toContain('10.7731, 106.7004');
    expect(p).toContain('GẦN NHẤT');
    expect(p).toContain('distanceKm');
    expect(p).toContain('mapsUrl');
    // Cheat day: no limit rule, only "no limits".
    expect(p).not.toMatch(/purine thấp|cảnh báo purine/i);
    expect(p).toContain('không có giới hạn calo, purine');
  });

  it('places come nearest first, with a distance and a Maps page only when the search saw it (www / https alike)', () => {
    const a = cleanPlacesAnswer(
      {
        places: [
          { ...placeA, name: 'Xa', distanceKm: 3.27, mapsUrl: 'https://maps.example/invented' },
          { ...placeA, name: 'Gần', distanceKm: 0.4, mapsUrl: 'http://google.com/maps/place/quan-a' },
          { ...placeA, name: 'Không rõ', distanceKm: -1 },
        ],
      },
      opts
    );
    expect(a.places.map((p) => [p.name, p.distanceKm])).toEqual([['Gần', 0.4], ['Xa', 3.3], ['Không rõ', null]]);
    expect(a.places[0].mapsUrl).toBe('http://google.com/maps/place/quan-a');
    expect(a.places[1].mapsUrl).toBeNull();
    expect(mapsSearchUrl('Quán A', null, 'Quận 1')).toBe('https://www.google.com/maps/search/?api=1&query=Qu%C3%A1n%20A%2C%20Qu%E1%BA%ADn%201');
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

  it('the dev stand-in is labelled sample data, with example.com links only, and sample dishes for a wish', () => {
    const fake = fakeCheatPlaces(['Bún bò Huế', 'Pizza'], 'Quận 1', new Date('2026-10-31T10:00:00Z'));
    expect(fake.sample).toBe(true);
    expect(fake.places).toHaveLength(2);
    expect(fake.dishes.map((d) => d.name)).toEqual(['Bún bò Huế', 'Pizza']);
    const wished = fakeCheatPlaces([], 'Quận 1', new Date('2026-10-31T10:00:00Z'), 'trời mưa');
    expect(wished.dishes).toHaveLength(3);
    expect(wished.readWish).toContain('giả lập');
    expect(wished.readWish).toContain('trời mưa');
    expect(wished.places).toHaveLength(3);
    expect(fake.places.every((p) => p.name.includes('DỮ LIỆU MẪU'))).toBe(true);
    expect(fake.places.flatMap((p) => [...p.sources.map((s) => s.url), ...p.reviews.map((r) => r.url)]).every((u) => /^https:\/\/example\.(com|org)\//.test(u))).toBe(true);
  });
});

describe('cheat-day wish: context and answer (pure)', () => {
  const item = (name: string, calories: number, at: string): ExtraFoodItem => ({ id: `${name}-${at}`, name, calories, proteinG: 10, loggedAtISO: at, mealTime: null });
  const log = (date: string, items: ExtraFoodItem[]): DailyNutritionLog => ({
    dateISO: date,
    mealsEaten: {},
    extraCalories: items.reduce((s, i) => s + i.calories, 0),
    extraProteinG: 0,
    extraItems: items,
    waterMl: 0,
  });

  it('builds the context: time and slot, recent foods newest first, favourites, the foods of days over target (not cheat days)', () => {
    const now = new Date(2026, 10, 1, 19, 45); // Sunday
    const logs: Record<string, DailyNutritionLog> = {
      '2026-11-01': log('2026-11-01', [item('Bánh mì', 400, '2026-11-01T01:00:00Z')]),
      '2026-10-31': log('2026-10-31', [item('Phở bò', 500, '2026-10-31T01:00:00Z'), item('Trà sữa', 450, '2026-10-31T09:00:00Z'), item('Gà rán', 900, '2026-10-31T12:00:00Z')]),
      '2026-10-30': log('2026-10-30', [item('Phở bò', 500, '2026-10-30T01:00:00Z')]),
      '2026-10-25': log('2026-10-25', [item('Pizza', 1200, '2026-10-25T12:00:00Z'), item('Bia', 300, '2026-10-25T13:00:00Z')]), // a cheat day
      '2026-10-10': log('2026-10-10', [item('Lẩu', 2000, '2026-10-10T12:00:00Z')]), // too old
    };
    const eaten = (k: string) => (logs[k]?.extraItems ?? []).reduce((s, i) => s + i.calories, 0);
    const ctx = wishContextFrom({ logs, eatenKcal: eaten, calorieTargetKcal: 1500, isCheatDay: (k) => k === '2026-10-25' }, now);
    expect(ctx.time).toBe('19:45');
    expect(ctx.weekday).toBe(0);
    expect(ctx.slot).toBe('dinner');
    expect(ctx.recent).toEqual(['Bánh mì', 'Gà rán', 'Trà sữa', 'Phở bò']);
    expect(ctx.favorites).toEqual(['Phở bò']);
    expect(ctx.overTarget).toEqual([
      { name: 'Gà rán', kcal: 900 },
      { name: 'Phở bò', kcal: 500 },
    ]);
    expect(ctx.loggedDays).toBe(2);
    expect(ctx.overDays).toBe(1);
    expect(JSON.stringify(ctx)).not.toMatch(/2026|Pizza|Lẩu|"id"/);
    expect([wishSlot(7), wishSlot(12), wishSlot(15), wishSlot(18), wishSlot(23), wishSlot(2)]).toEqual(['breakfast', 'lunch', 'afternoon', 'dinner', 'late', 'late']);
  });

  it('cleans the wish and the context the server gets: bounded, no tags or line breaks, bad parts dropped', () => {
    expect(cleanWish('  thèm <b>gì đó</b>\ngiòn giòn  ')).toBe('thèm b gì đó /b giòn giòn');
    expect(cleanWish('x'.repeat(500))).toHaveLength(200);
    expect(cleanWish(42)).toBe('');
    expect(cleanWishContext({ time: '25:00', weekday: 1 })).toBeNull();
    expect(cleanWishContext({ time: '12:00', weekday: 9 })).toBeNull();
    const ctx = cleanWishContext({
      time: '12:05',
      weekday: 3,
      slot: 'brunch',
      recent: Array.from({ length: 20 }, (_, i) => `Món ${i}`),
      favorites: ['Phở', 'phở', '<script>'],
      overTarget: [{ name: 'Gà rán', kcal: 900.6 }, { name: 'gà rán', kcal: 100 }, { name: 'Bad', kcal: -5 }, { name: '', kcal: 10 }],
      loggedDays: 30,
      overDays: 99,
    })!;
    expect(ctx.slot).toBe('dinner');
    expect(ctx.recent).toHaveLength(12);
    expect(ctx.favorites).toEqual(['Phở', 'script']);
    expect(ctx.overTarget).toEqual([{ name: 'Gà rán', kcal: 901 }]);
    expect(ctx.loggedDays).toBe(0);
    expect(ctx.overDays).toBe(0);
    // Into the places request and its prompt: the wish, the time, recent foods (not to repeat), no weather invented, pampering.
    const req = cleanPlacesRequest({ location: 'Quận 1', today: '2026-11-01', wish: 'trời mưa, buồn', context: { time: '20:10', weekday: 6, slot: 'dinner', recent: ['Phở bò'], overTarget: [{ name: 'Gà rán', kcal: 900 }], loggedDays: 7, overDays: 2 } })!;
    expect(req.wish).toBe('trời mưa, buồn');
    expect(req.context?.recent).toEqual(['Phở bò']);
    const p = placesPrompt(req);
    expect(p).toContain('"trời mưa, buồn"');
    expect(p).toContain('20:10, Thứ bảy');
    expect(p).toContain('đừng gợi ý lặp lại');
    expect(p).toContain('Gà rán (~900 kcal)');
    expect(p).toContain('2 ngày ăn vượt mục tiêu');
    expect(p).toContain('đừng tự bịa thời tiết');
    expect(p).toContain('chiều người dùng hết mức');
    expect(p).toContain('hot trend');
    expect(p).toContain('tự chọn 3 món');
    expect(p).toContain('readWish');
    expect(placesPrompt(cleanPlacesRequest({ location: 'Quận 1', today: '2026-11-01' })!)).toContain('không nói muốn gì');
    expect(PLACES_TOOL.input_schema.required).toEqual(['readWish', 'dishes', 'places', 'notFound']);
  });

  it('cleans the dishes and the read of the wish in the answer; stored answers without them still load', () => {
    const a = cleanPlacesAnswer(
      {
        readWish: ' Bạn cần\nmón <giòn> ',
        dishes: [
          { name: 'Gà rán', why: 'Giòn rụm', kcal: 820.7, emoji: '🍗' },
          { name: 'gà rán', why: 'dup', kcal: 1 },
          { name: '', why: 'no name', kcal: 100 },
          { name: 'Khoai tây chiên', why: 'Giòn', kcal: 99999 },
          { name: 'Bánh tráng nướng', kcal: 300 },
          { name: 'Ốc len xào dừa', why: 'Béo', kcal: 400 },
          { name: 'Thứ năm', why: 'over the cap', kcal: 400 },
        ],
        places: [],
        notFound: [],
      },
      { seenUrls: [], today: '2026-11-01', checkedAtISO: '2026-11-01T10:00:00.000Z' }
    );
    expect(a.readWish).toBe('Bạn cần món giòn');
    expect(a.dishes).toEqual([
      { name: 'Gà rán', why: 'Giòn rụm', kcal: 821, emoji: '🍗' },
      { name: 'Khoai tây chiên', why: 'Giòn', kcal: null, emoji: null },
      { name: 'Bánh tráng nướng', why: '', kcal: 300, emoji: null },
      { name: 'Ốc len xào dừa', why: 'Béo', kcal: 400, emoji: null },
    ]);
    expect(recheckPlaces(a)!.dishes).toEqual(a.dishes);
    expect(recheckPlaces(a)!.readWish).toBe(a.readWish);
    const old = recheckPlaces({ places: [], notFound: [], checkedAtISO: '2026-10-31T10:00:00.000Z', seenUrls: [] })!;
    expect(old.dishes).toEqual([]);
    expect(old.readWish).toBeNull();
  });
});

describe('my location: reverse geocoding (OpenStreetMap Nominatim)', () => {
  const answer = {
    display_name: '123, Lê Lợi, Phường Bến Thành, Quận 1, Thành phố Hồ Chí Minh, 700000, Việt Nam',
    address: { house_number: '123', road: 'Lê Lợi', quarter: 'Phường Bến Thành', suburb: 'Quận 1', city: 'Thành phố Hồ Chí Minh', postcode: '700000', country: 'Việt Nam' },
  };

  it('formats the address the Vietnamese way: number and street, ward, district, city', () => {
    expect(formatAddress(answer)).toBe('123 Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM');
    expect(formatAddress({ address: { road: 'Phố Huế', suburb: 'Quận Hai Bà Trưng', city: 'Thành phố Hà Nội' } })).toBe('Phố Huế, Quận Hai Bà Trưng, Hà Nội');
    expect(formatAddress({ display_name: 'Chợ Bến Thành, Lê Lợi, Quận 1, 700000, Việt Nam' })).toBe('Chợ Bến Thành, Lê Lợi, Quận 1');
    expect(formatAddress(null)).toBe('');
    expect(osmUrl(10.77312, 106.70043)).toBe('https://www.openstreetmap.org/?mlat=10.77312&mlon=106.70043#map=18/10.77312/106.70043');
  });

  it('asks Nominatim in Vietnamese for the precise position, and gives null on any failure', async () => {
    const ok = jest.fn(async () => ({ ok: true, json: async () => answer }) as unknown as Response);
    expect(await reverseGeocode(10.77312, 106.70043, ok as unknown as typeof fetch)).toBe('123 Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM');
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=vi&lat=10.77312&lon=106.70043');
    expect(init.headers).toMatchObject({ 'Accept-Language': 'vi' });
    expect(JSON.stringify(init.headers)).not.toContain('@');
    const bad = jest.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response);
    expect(await reverseGeocode(1, 2, bad as unknown as typeof fetch)).toBeNull();
    const down = jest.fn(async () => {
      throw new Error('network');
    });
    expect(await reverseGeocode(1, 2, down as unknown as typeof fetch)).toBeNull();
    const empty = jest.fn(async () => ({ ok: true, json: async () => ({ error: 'Unable to geocode' }) }) as unknown as Response);
    expect(await reverseGeocode(1, 2, empty as unknown as typeof fetch)).toBeNull();
  });
});

describe('cheat-day dishes', () => {
  const ok = { budgetKcal: 300, proteinLeftG: 40, headroom: { purine: 100, salt: 1, sugar: 2 }, limits: { purine: 1200, salt: 7, sugar: 25 }, hour: 19 };

  it('suggest-dinner takes a cheat flag: no rules in the prompt (no budget, no gout / purine / salt / sugar rule), any dish', () => {
    const req = cleanDinnerRequest({ ...ok, cheat: { where: 'out' }, filters: { cravings: ['crunchy'] } })!;
    expect(req.cheat).toEqual({ where: 'out' });
    expect(cleanDinnerRequest({ ...ok, cheat: { where: 'moon' } })!.cheat).toEqual({ where: 'both' });
    expect(cleanDinnerRequest({ ...ok }))!.not.toHaveProperty('cheat');
    const p = dinnerPrompt(req);
    expect(p).toContain('CHEAT DAY');
    expect(p).toContain('KHÔNG có quy tắc nào');
    expect(p).toContain('không giới hạn calo');
    expect(p).toContain('ĂN NGOÀI');
    expect(p).toContain('không cảnh báo sức khỏe');
    expect(p).not.toContain('bệnh gout');
    expect(p).not.toContain('cảnh báo purine');
    expect(p).not.toContain('purine thấp');
    expect(p).toContain('giòn');
    expect(p).not.toContain('300 kcal');
    // The everyday prompt is unchanged.
    expect(dinnerPrompt(cleanDinnerRequest({ ...ok })!)).toContain('Hãy gợi ý đúng 3 món khác nhau cho bữa tối');
  });

  it('suggest-dinner cheat ideas can read the wish too, and say how they read it', () => {
    const req = cleanDinnerRequest({ ...ok, cheat: { where: 'both', wish: 'ignored here' } })!;
    expect(req.cheat).toEqual({ where: 'both' });
    const ctx = cleanWishContext({ time: '21:30', weekday: 5, slot: 'dinner', recent: ['Phở bò'] })!;
    const p = dinnerPrompt(req, wishPrompt(cleanWish('buồn, muốn ăn gì ấm bụng'), ctx));
    expect(p).toContain('"buồn, muốn ăn gì ấm bụng"');
    expect(p).toContain('Phở bò');
    expect(p).toContain('readWish');
    expect(p).toContain('chiều người dùng');
    expect(dinnerPrompt(req)).not.toContain('readWish');
    expect(cheatReadWish(fakeCheatDinner('out', 'trời mưa'))).toContain('trời mưa');
    expect(cheatReadWish(fakeCheatDinner('out'))).toBeNull();
    expect(cheatReadWish({ readWish: 'Bạn cần món <b>ấm</b>\nbụng' })).toBe('Bạn cần món b ấm /b bụng');
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
    expect(ideas.every((i) => !/purine/i.test(i.how ?? ''))).toBe(true);
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

describe('Cheat day screen', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<CheatDayScreen />);
    });
    return renderer!;
  };
  /** The location chip opens the "where" sheet; the address is typed there. */
  const setArea = async (r: ReactTestRenderer, text: string) => {
    const chip = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Vị trí tìm quán:'))[0];
    await act(async () => {
      chip.props.onPress();
    });
    await type(r, 'Địa chỉ / khu vực của bạn', text);
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
    mockPlaces.mockImplementation(async (...a: unknown[]) => ({
      ok: true,
      result: fakeCheatPlaces(a[0] as string[], a[1] as string, new Date('2026-10-31T10:00:00Z'), (a[3] as { wish?: string } | undefined)?.wish),
    }));
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('eat out + an area + AI dishes: dishes without a budget, then short place cards (details in ⓘ), all kept after a reload', async () => {
    const r = await mount();
    expect(allText(r)).toContain('Không tính kcal · không quy tắc');
    expect(allText(r)).not.toMatch(/gout/i);
    await press(r, 'Ăn ngoài');
    await setArea(r, 'Quận 1, TP.HCM');
    await press(r, 'Dùng Quận 1, TP.HCM');
    await press(r, 'Gợi ý bằng AI');
    expect(mockDinner).toHaveBeenCalledTimes(1);
    expect(mockDinner.mock.calls[0][4]).toEqual({ where: 'out', context: expect.objectContaining({ time: expect.any(String), slot: expect.any(String) }) });
    const text = allText(r);
    expect(text).toContain('AI gợi ý cheat day (3)');
    expect(text).toContain('Pizza phô mai (giả lập)');
    // Cheat day has no rules: no purine warning or badge, no limit check; kcal stays as information.
    expect(text).not.toContain('Purine');
    expect(text).not.toContain('✗ Vượt');
    // Places were looked up at once for the eat-out dishes, near the area typed: one short card each.
    expect(mockPlaces).toHaveBeenCalledTimes(1);
    expect(mockPlaces.mock.calls[0][1]).toBe('Quận 1, TP.HCM');
    expect(mockPlaces.mock.calls[0][3]).toEqual({ typed: false, context: expect.objectContaining({ recent: [] }) });
    expect(text).toContain('DỮ LIỆU MẪU (chế độ Dev)');
    expect(text).toContain('Tin cậy cao');
    expect(text).toContain('★ 4.3 (120) · ~0.4 km');
    expect(text).toContain('Chỉ đường');
    // The details are in the ⓘ sheet.
    expect(text).not.toContain('Độ tin cậy: Cao');
    await press(r, 'Thông tin quán Quán mẫu A (DỮ LIỆU MẪU)');
    const info = allText(r);
    expect(info).toContain('Độ tin cậy: Cao');
    expect(info).toContain('Nguồn mẫu 4.3★ / 120 đánh giá');
    expect(info).toContain('Kiểm tra lần cuối');
    expect(info).toContain('Tìm trên Google Maps');
    // Saved into the cook book's cheat day part, not shared.
    expect(useCookbookStore.getState().recipes.filter((x) => x.cheat)).toHaveLength(3);
    expect(mockShare).not.toHaveBeenCalled();
    act(() => r.unmount());
    const again = await mount();
    const t2 = allText(again);
    expect(t2).toContain('Pizza phô mai (giả lập)');
    expect(t2).toContain('Tin cậy cao');
    expect(useCookbookFinderStore.getState().location).toBe('Quận 1, TP.HCM');
  });

  it('web search not allowed: says so, and the dishes still come', async () => {
    mockPlaces.mockResolvedValue({ ok: false, message: 'Tìm địa điểm chưa khả dụng: Claude API lỗi (400): web search is not enabled', kind: 'unavailable' });
    const r = await mount();
    await press(r, 'Ăn ngoài');
    await setArea(r, 'Hà Đông, Hà Nội');
    await press(r, 'Gợi ý bằng AI');
    const text = allText(r);
    expect(text).toContain('Tìm địa điểm chưa khả dụng: Claude API lỗi (400): web search is not enabled');
    expect(text).toContain('Bún bò Huế (giả lập)');
  });

  it('no area: asks for one before looking up places; cook at home asks for dishes to cook only', async () => {
    const r = await mount();
    expect(allText(r)).toContain('Chọn khu vực');
    await press(r, 'Ăn ngoài');
    await press(r, 'Gợi ý bằng AI');
    expect(mockPlaces).not.toHaveBeenCalled();
    await press(r, 'Tìm quán cho các món AI gợi ý');
    expect(allText(r)).toContain('Nhập địa chỉ / khu vực hoặc bấm 📍 Vị trí của tôi trước để tìm quán.');
    expect(mockPlaces).not.toHaveBeenCalled();
    await press(r, 'Tự nấu');
    expect(() => byLabel(r, 'Tìm quán cho các món AI gợi ý')).toThrow();
    expect(() => byLabel(r, 'Tìm quán')).toThrow();
    // The main button asks for dishes to cook (no places); the wish box stays.
    mockDinner.mockResolvedValueOnce({ ok: true, result: fakeCheatDinner('home') });
    await press(r, 'Gợi ý món tự nấu');
    expect(mockDinner).toHaveBeenCalledTimes(2);
    expect((mockDinner.mock.calls[1][4] as { where: string }).where).toBe('home');
    expect(mockPlaces).not.toHaveBeenCalled();
    expect(() => byLabel(r, 'Hôm nay bạn thèm gì, thấy thế nào?', 'onChangeText')).not.toThrow();
  });

  it('the wish box: one "Tìm quán" sends the wish and the recent eating, and shows how it was read, the dishes, then places', async () => {
    const day = new Date();
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    useNutritionStore.setState({
      logs: { [key]: { dateISO: key, mealsEaten: {}, extraCalories: 450, extraProteinG: 20, waterMl: 0, extraItems: [{ id: 'x', name: 'Phở bò', calories: 450, proteinG: 20, loggedAtISO: day.toISOString(), mealTime: null }] } },
    });
    const r = await mount();
    await press(r, 'Tìm quán');
    expect(allText(r)).toContain('Nhập địa chỉ / khu vực');
    expect(mockPlaces).not.toHaveBeenCalled();
    await type(r, 'Hôm nay bạn thèm gì, thấy thế nào?', '  buồn, muốn ăn gì <ấm> bụng ');
    await setArea(r, 'Quận 3, TP.HCM');
    mockPlaces.mockResolvedValueOnce({
      ok: true,
      result: cleanPlacesAnswer(
        {
          readWish: 'Bạn đang buồn, cần món nóng hổi ấm bụng',
          dishes: [
            { name: 'Lẩu gà lá é', why: 'Nóng hổi, thơm, ăn cùng bạn bè cho vui', kcal: 750.4, emoji: '🍲' },
            { name: 'Cháo sườn sụn', why: 'Mềm, ấm bụng', kcal: 'nhiều' },
          ],
          places: [{ dish: 'Lẩu gà lá é', name: 'Quán Lẩu Gà X', sources: [{ title: 'Foody', url: 'https://www.foody.vn/x' }], reviews: [], reliability: 'medium', reliabilityReasons: [] }],
          notFound: [],
        },
        { seenUrls: ['https://www.foody.vn/x'], today: '2026-11-01', checkedAtISO: '2026-11-01T12:00:00.000Z', searches: 3 }
      ),
    });
    await press(r, 'Tìm quán');
    expect(mockDinner).not.toHaveBeenCalled();
    expect(mockPlaces).toHaveBeenCalledTimes(1);
    const [dishes, where, coords, opts] = mockPlaces.mock.calls[0] as [string[], string, unknown, { typed: boolean; wish: string; context: { recent: string[] } }];
    expect([dishes, where, coords]).toEqual([[], 'Quận 3, TP.HCM', undefined]);
    expect(opts.typed).toBe(false);
    expect(opts.wish).toBe('buồn, muốn ăn gì ấm bụng');
    expect(opts.context.recent).toEqual(['Phở bò']);
    const text = allText(r);
    const read = text.indexOf('AI hiểu là: Bạn đang buồn, cần món nóng hổi ấm bụng');
    const dish = text.indexOf('Lẩu gà lá é');
    const place = text.indexOf('Quán Lẩu Gà X');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(text).toContain('Món hợp ý bạn (2)');
    expect(text).toContain('~750 kcal');
    expect(dish).toBeGreaterThan(read);
    expect(place).toBeGreaterThan(dish);
    expect(text).toContain('Cháo sườn sụn');
    expect(text).toContain('Nóng hổi, thơm, ăn cùng bạn bè cho vui');
    expect(text).toContain('Tin cậy thấp'); // one site only: capped
    // Nothing logged, nothing put in the cook book.
    expect(useNutritionStore.getState().logs[key].extraItems).toHaveLength(1);
    expect(useCookbookStore.getState().recipes.filter((x) => x.cheat)).toHaveLength(0);
    // Choosing a dish narrows the places to it, and offers a search for exactly that dish (the wish still goes with it).
    await press(r, 'Cháo sườn sụn');
    expect(allText(r)).toContain('Quán Cháo sườn sụn · 0');
    expect(allText(r)).not.toContain('Quán Lẩu Gà X');
    await press(r, '🔎 Tìm quán: Cháo sườn sụn');
    expect(mockPlaces.mock.calls[1][0]).toEqual(['Cháo sườn sụn']);
    expect(mockPlaces.mock.calls[1][3]).toMatchObject({ typed: true, wish: 'buồn, muốn ăn gì ấm bụng' });
  });

  it('an empty wish still gets dishes and places from one "Tìm quán" (dev sample)', async () => {
    useCookbookFinderStore.getState().setLocation('Quận 1', null);
    const r = await mount();
    expect(allText(r)).toContain('Quận 1');
    await press(r, 'Tìm quán');
    expect(mockPlaces).toHaveBeenCalledTimes(1);
    expect(mockPlaces.mock.calls[0][3]).not.toHaveProperty('wish');
    const text = allText(r);
    expect(text).toContain('AI hiểu là:');
    expect(text).toContain('Món hợp ý bạn (3)');
    expect(text).toContain('Món mẫu A (giả lập)');
    expect(text).toContain('Quán gợi ý · 3');
    expect(text).toContain('DỮ LIỆU MẪU (chế độ Dev)');
  });

  it('an AI cheat dish\'s "find places" searches for it (the wish box stays); the precise position goes with the address', async () => {
    useCookbookFinderStore.getState().setLocation('123 Lê Lợi, Quận 1, TP.HCM', { lat: 10.7731234, lon: 106.7004321 });
    const r = await mount();
    await press(r, 'Ăn ngoài');
    await press(r, 'Gợi ý bằng AI');
    mockPlaces.mockClear();
    await press(r, '🔎 Tìm quán: Pizza phô mai (giả lập)');
    expect(useCookbookFinderStore.getState().query).toBe('');
    expect(mockPlaces.mock.calls[0]).toEqual([['Pizza phô mai (giả lập)'], '123 Lê Lợi, Quận 1, TP.HCM', { lat: 10.77312, lon: 106.70043 }, { typed: true, context: expect.anything() }]);
    // The "where" sheet: coordinates shown; editing the address keeps the position; "clear" drops it.
    await setArea(r, '125 Lê Lợi, Quận 1, TP.HCM');
    expect(allText(r)).toContain('Tọa độ: 10.77312, 106.70043');
    expect(useCookbookFinderStore.getState().coords).toEqual({ lat: 10.77312, lon: 106.70043 });
    await press(r, 'Bỏ tọa độ');
    expect(useCookbookFinderStore.getState().coords).toBeNull();
  });

  it('an AI cheat dish opens its recipe page', async () => {
    useCookbookFinderStore.getState().setLocation('Quận 1', null);
    const r = await mount();
    await press(r, 'Tự nấu');
    mockDinner.mockResolvedValueOnce({ ok: true, result: fakeCheatDinner('home') });
    await press(r, 'Gợi ý món tự nấu');
    const name = useCookbookFinderStore.getState().cheatAi[0].name;
    await press(r, name);
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: expect.any(String) } });
  });

  it('a failed search shows its real reason, never nothing', async () => {
    mockPlaces.mockResolvedValue({ ok: false, message: 'Tìm kiếm quá lâu (hơn 135 giây), hãy thử lại.', kind: 'generic' });
    useCookbookFinderStore.getState().setLocation('Quận 1', null);
    useCookbookFinderStore.getState().setQuery('ốc');
    const r = await mount();
    await press(r, 'Tìm quán');
    expect(allText(r)).toContain('Tìm quán lỗi:');
    expect(allText(r)).toContain('Tìm kiếm quá lâu (hơn 135 giây), hãy thử lại.');
  });

  it('the cook book shows cheat dishes under their own tab, which leads to the Cheat day screen', async () => {
    useCookbookStore.getState().saveMany([recipeFromIdea(idea('Gà rán giòn', { cheat: true }))]);
    await act(async () => {
      renderer = create(<CookbookScreen />);
    });
    const r = renderer!;
    expect(allText(r)).toContain('Gà luộc');
    expect(allText(r)).not.toContain('Gà rán giòn');
    await press(r, '🎉 Cheat day · 1');
    expect(allText(r)).toContain('Gà rán giòn');
    expect(allText(r)).not.toContain('Gà luộc');
    await press(r, '🎉 Cheat day: thèm gì, tìm quán');
    expect(mockRouterPush).toHaveBeenCalledWith('/cheat-day');
  });
});
