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
const mockPlaces = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPush(...a),
  requestDinner: jest.fn(),
  requestCheatPlaces: (...a: unknown[]) => mockPlaces(...a),
  requestDishPhotos: jest.fn(async () => ({ ok: false, message: 'off', kind: 'disabled' })),
  shareToCookbook: jest.fn(async () => undefined),
  searchSharedCookbookFiltered: jest.fn(async () => ({ ok: true, ideas: [] })),
  requestDishRecipe: jest.fn(),
}));

import CheatDayScreen from '../../../app/cheat-day';
import { fakeCheatPlaces } from '../../ai/devPhotoAnalysis';
import { recheckPlaces } from '../../cookbook/cheat';
import { useToastStore } from '../../store/useToastStore';
import {
  cleanCheatPlacesData,
  EMPTY_CHEAT_PLACES,
  excludeNames,
  joinAnswers,
  mergeCheatPlaces,
  placePhotoForDish,
  placeToSaved,
  searchFromAnswer,
  type CheatPlacesData,
} from '../../cookbook/placesHistory';
import { useCheatPlacesStore } from '../../store/useCheatPlacesStore';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { USER_DATA_KEYS } from '../../sync/userDataKeys';
import {
  CACHE_VERSION,
  cacheKey,
  cleanDishPhotoRequest,
  coreDishName,
  dishKey,
  loadThumb,
  PHOTO_ACCEPT,
  photoUserAgent,
  type PhotoFetch,
} from '../../../supabase/functions/_shared/dishPhoto';
import {
  cleanPlacePhoto,
  cleanPlacesAnswer,
  cleanPlacesRequest,
  MAX_EXCLUDE,
  placeNameKey,
  placesMaxSearches,
  placesPrompt,
  type CheatPlacesAnswer,
} from '../../../supabase/functions/_shared/places';
import { extractOgImage, findPlacePhotos, pagePhoto, photoPagesFor, publicHttpUrl, type PageFetch } from '../../../supabase/functions/_shared/webImage';

const NOW = new Date('2026-11-02T10:00:00.000Z');

/** A places answer with these place names (each backed by its own source page) and dishes. */
function answer(names: string[], dishes: string[] = ['Ốc len xào dừa'], at = NOW.toISOString()): CheatPlacesAnswer {
  const places = names.map((name, i) => ({ dish: dishes[0], name, address: `${i + 1} Lê Lợi`, sources: [{ title: 'Foody', url: `https://www.foody.vn/p-${placeNameKey(name).replace(/ /g, '-')}` }], reviews: [], reliability: 'medium', reliabilityReasons: [] }));
  return cleanPlacesAnswer(
    { readWish: 'Bạn thèm ốc', dishes: dishes.map((name) => ({ name, why: 'Ngon', kcal: 500 })), places, notFound: [] },
    { seenUrls: places.map((p) => p.sources[0].url), today: at.slice(0, 10), checkedAtISO: at, searches: 3 }
  );
}

describe('dish photos: the root cause (no photo was ever found, so the model was never asked)', () => {
  // The names the app really sent (dish_photos held 13 rows, all "none", for names like these).
  const REAL = [
    ['Cơm tấm sườn bì chả trứng ốp la (1 đĩa đầy đủ)', 'Cơm tấm sườn bì chả trứng ốp la', ['cơm tấm sườn', 'cơm tấm']],
    ['Bò nướng mỡ chài + bún + rau sống (quán nướng, 1 phần)', 'Bò nướng mỡ chài', ['bò nướng mỡ chài', 'bò nướng']],
    ['Pizza hải sản phô mai kéo sợi + cánh gà BBQ (nửa pizza 9 inch + 4 cánh)', 'Pizza hải sản phô mai kéo sợi', ['pizza hải sản', 'pizza hải']],
    ['Bún bò Huế giò heo + chả cua (1 tô lớn)', 'Bún bò Huế giò heo', ['bún bò huế', 'bún bò']],
  ] as const;

  it('a long AI name is searched by the dish itself: brackets, side dishes and portions dropped, plus a shorter query', () => {
    for (const [name, core, queries] of REAL) {
      expect(coreDishName(name)).toBe(core);
      const [d] = cleanDishPhotoRequest({ dishes: [{ name }] })!;
      expect(d.core).toBe(core);
      expect(d.queries).toEqual(queries);
      // The whole name never goes to a search, and the answer is matched by the name the app sent.
      expect(d.queries.some((q) => q.includes('(') || q.includes('+'))).toBe(false);
      expect(d.nameKey).toBe(dishKey(name));
      expect(d.key).toBe(dishKey(core));
    }
    expect(coreDishName('Trà sữa trân châu 1 ly lớn')).toBe('Trà sữa trân châu');
    expect(coreDishName('Phở bò')).toBe('Phở bò');
    expect(coreDishName('Gà rán và khoai tây chiên')).toBe('Gà rán');
    expect(coreDishName('(1 phần)')).toBe('(1 phần)'); // nothing left: the name itself
  });

  it('the old whole-name "none" rows are never read again: the cache key carries a version and the core name', () => {
    for (const [name, core] of REAL) {
      const oldRow = dishKey(name); // how version 1 keyed it, e.g. "com tam suon bi cha trung op la 1 dia day du"
      const [d] = cleanDishPhotoRequest({ dishes: [{ name }] })!;
      expect(cacheKey(d.key)).toBe(`${CACHE_VERSION}:${dishKey(core)}`);
      expect(cacheKey(d.key)).not.toBe(oldRow);
      expect(cacheKey(d.key).length).toBeLessThanOrEqual(100);
    }
    expect(cacheKey(dishKey('Phở bò'))).not.toBe(dishKey('Phở bò'));
  });

  it('two names of the same dish are looked up once but each is answered under its own name', () => {
    const list = cleanDishPhotoRequest({ dishes: ['Bún bò Huế (1 tô lớn)', 'Bún bò Huế + chả cua'] })!;
    expect(list.map((d) => d.nameKey)).toEqual(['bun bo hue 1 to lon', 'bun bo hue cha cua']);
    expect(new Set(list.map((d) => d.key))).toEqual(new Set(['bun bo hue']));
  });

  it('thumbnails: Openverse refuses "image/*" (406); the Accept sent now names the photo types and */*', async () => {
    // Openverse's thumbnail endpoint negotiates on exact types: "image/*" alone gets 406 (seen live), "*/*" gets the picture.
    const openverse: PhotoFetch = async (_url, init) => {
      const ok = /\*\/\*/.test(init.headers.accept ?? '');
      return { ok, status: ok ? 200 : 406, headers: { get: (h: string) => (h === 'content-type' ? (ok ? 'image/webp' : 'application/json') : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, body: { cancel: async () => undefined } };
    };
    const before = await openverse('https://api.openverse.org/v1/images/x/thumb/', { headers: { accept: 'image/*' } });
    expect(before.status).toBe(406);
    expect(PHOTO_ACCEPT).toContain('*/*');
    const got = await loadThumb('https://api.openverse.org/v1/images/x/thumb/', openverse, { userAgent: photoUserAgent(), maxBytes: 1000 });
    expect(got).toEqual({ ok: true, mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) });
    // Failures say why (they are logged together when no candidate loads).
    const html: PhotoFetch = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(0), body: null });
    expect(await loadThumb('https://x.org/a.jpg', html, { userAgent: 'x', maxBytes: 10 })).toEqual({ ok: false, why: 'type text/html' });
  });

  it('the User-Agent always names a contact (Wikimedia policy), even without the DISH_PHOTO_CONTACT secret', () => {
    expect(photoUserAgent()).toMatch(/^FitQuest\/1\.0 \(.*; https:\/\/fitjourney-vn\.vercel\.app\)$/);
    expect(photoUserAgent('me@example.com')).toContain('me@example.com');
  });
});

describe('real photos from the web pages of a place (og:image)', () => {
  const page = (head: string) => `<!doctype html><html><head>${head}</head><body>…</body></html>`;

  it('reads og:image (secure URL first), then twitter:image, then link image_src; relative URLs made absolute', () => {
    expect(extractOgImage(page('<meta property="og:image" content="https://img.foody.vn/res/g1/oc.jpg">'), 'https://www.foody.vn/x')).toBe('https://img.foody.vn/res/g1/oc.jpg');
    expect(
      extractOgImage(page(`<meta content='/images/oc-dao.webp?w=800&amp;h=600' property='og:image'><meta property="og:image:secure_url" content="https://cdn.x.vn/a.jpg">`), 'https://blog.x.vn/post/1')
    ).toBe('https://cdn.x.vn/a.jpg');
    expect(extractOgImage(page(`<meta content='/images/oc-dao.webp?w=800&amp;h=600' property='og:image'>`), 'https://blog.x.vn/post/1')).toBe('https://blog.x.vn/images/oc-dao.webp?w=800&h=600');
    expect(extractOgImage(page('<meta name="twitter:image" content="//cdn.x.vn/t.png">'), 'https://x.vn/p')).toBe('https://cdn.x.vn/t.png');
    expect(extractOgImage(page('<link rel="image_src" href="https://x.vn/pic.jpg">'), 'https://x.vn/p')).toBe('https://x.vn/pic.jpg');
  });

  it('no picture: missing tags, data URLs, svg / icons / logos, http pictures and private addresses give null', () => {
    expect(extractOgImage(page('<title>Quán ốc</title>'), 'https://x.vn/p')).toBeNull();
    expect(extractOgImage('', 'https://x.vn/p')).toBeNull();
    expect(extractOgImage(page('<meta property="og:image" content="data:image/png;base64,AAAA">'), 'https://x.vn/p')).toBeNull();
    expect(extractOgImage(page('<meta property="og:image" content="https://x.vn/static/logo.svg">'), 'https://x.vn/p')).toBeNull();
    expect(extractOgImage(page('<meta property="og:image" content="https://x.vn/img/logo-share.png">'), 'https://x.vn/p')).toBeNull();
    expect(extractOgImage(page('<meta property="og:image" content="http://x.vn/a.jpg">'), 'https://x.vn/p')).toBeNull();
    expect(extractOgImage(page('<meta property="og:image" content="https://192.168.1.2/a.jpg">'), 'https://x.vn/p')).toBeNull();
    expect(publicHttpUrl('http://127.0.0.1/admin')).toBeNull();
    expect(publicHttpUrl('http://10.0.0.5/')).toBeNull();
    expect(publicHttpUrl('http://[::1]/')).toBeNull();
    expect(publicHttpUrl('http://localhost:3000/')).toBeNull();
    expect(publicHttpUrl('ftp://x.vn/a')).toBeNull();
    expect(publicHttpUrl('https://user:pw@x.vn/')).toBeNull();
    expect(publicHttpUrl('https://foody.vn/a#b')).toBe('https://foody.vn/a');
  });

  /** A fake web: pages by URL (HTML or other), pictures with their content type. */
  const web = (pages: Record<string, { type: string; body: string } | number>): { fetch: PageFetch; asked: string[] } => {
    const asked: string[] = [];
    const fetch: PageFetch = async (url) => {
      asked.push(url);
      const hit = pages[url];
      if (hit === undefined || typeof hit === 'number') return { ok: false, status: typeof hit === 'number' ? hit : 404, headers: { get: () => null }, text: async () => '' };
      return { ok: true, status: 200, url, headers: { get: (h: string) => (h === 'content-type' ? hit.type : null) }, text: async () => hit.body };
    };
    return { fetch, asked };
  };

  it('checks the page answers HTML and the picture answers as a photo; the credit is the host', async () => {
    const w = web({
      'https://www.foody.vn/oc-oanh': { type: 'text/html; charset=utf-8', body: page('<meta property="og:image" content="/res/oc-oanh.jpg">') },
      'https://www.foody.vn/res/oc-oanh.jpg': { type: 'image/jpeg', body: '' },
      'https://blog.vn/p': { type: 'text/html', body: page('<meta property="og:image" content="https://blog.vn/page.html">') },
      'https://blog.vn/page.html': { type: 'text/html', body: '' },
      'https://api.vn/x': { type: 'application/json', body: '{}' },
    });
    expect(await pagePhoto('https://www.foody.vn/oc-oanh', w.fetch)).toEqual({ url: 'https://www.foody.vn/res/oc-oanh.jpg', pageUrl: 'https://www.foody.vn/oc-oanh', credit: 'foody.vn' });
    expect(await pagePhoto('https://blog.vn/p', w.fetch)).toBeNull(); // the "picture" is a page
    expect(await pagePhoto('https://api.vn/x', w.fetch)).toBeNull(); // not HTML
    expect(await pagePhoto('https://gone.vn/404', w.fetch)).toBeNull();
    expect(await pagePhoto('http://169.254.169.254/latest/meta-data', w.fetch)).toBeNull();
    expect(w.asked).not.toContain('http://169.254.169.254/latest/meta-data');
    // A public page redirecting to a private address is not followed there.
    const hop: PageFetch = async (url) => {
      w.asked.push(url);
      return { ok: false, status: 302, headers: { get: (h: string) => (h === 'location' ? 'http://10.0.0.1/secret' : null) }, text: async () => '' };
    };
    expect(await pagePhoto('https://short.vn/x', hop)).toBeNull();
    expect(w.asked).not.toContain('http://10.0.0.1/secret');
  });

  it('a photo per place from its own pages (no Google Maps / Facebook pages), each picture given once', async () => {
    expect(photoPagesFor({ sources: [{ url: 'https://www.google.com/maps/place/x' }, { url: 'https://www.facebook.com/x' }, { url: 'https://foody.vn/a' }], reviews: [{ url: 'https://blog.vn/r' }, { url: 'https://c.vn/z' }] })).toEqual([
      'https://foody.vn/a',
      'https://blog.vn/r',
    ]);
    const shared = page('<meta property="og:image" content="https://site.vn/banner.jpg">');
    const w = web({
      'https://a.vn/1': { type: 'text/html', body: page('<meta property="og:image" content="https://a.vn/1.jpg">') },
      'https://a.vn/1.jpg': { type: 'image/png', body: '' },
      'https://site.vn/x': { type: 'text/html', body: shared },
      'https://site.vn/y': { type: 'text/html', body: shared },
      'https://site.vn/banner.jpg': { type: 'image/jpeg', body: '' },
    });
    const photos = await findPlacePhotos([{ sources: [{ url: 'https://a.vn/1' }] }, { sources: [{ url: 'https://site.vn/x' }] }, { sources: [{ url: 'https://site.vn/y' }] }, { sources: [] }], w.fetch);
    expect(photos.map((p) => p?.url ?? null)).toEqual(['https://a.vn/1.jpg', 'https://site.vn/banner.jpg', null, null]);
  });

  it('the answer keeps photos only when the server added them: one the model writes itself is dropped', () => {
    const raw = {
      readWish: 'x',
      dishes: [{ name: 'Ốc', why: 'y', kcal: 300, photo: { url: 'https://evil.vn/a.jpg', pageUrl: 'https://evil.vn' } }],
      places: [{ dish: 'Ốc', name: 'Ốc Oanh', sources: [{ url: 'https://foody.vn/a' }], reviews: [], reliability: 'low', reliabilityReasons: [], photo: { url: 'https://evil.vn/a.jpg', pageUrl: 'https://evil.vn' } }],
      notFound: [],
    };
    const opts = { seenUrls: ['https://foody.vn/a'], today: '2026-11-02', checkedAtISO: NOW.toISOString() };
    const fromModel = cleanPlacesAnswer(raw, opts);
    expect(fromModel.places[0].photo).toBeUndefined();
    expect(fromModel.dishes[0].photo).toBeUndefined();
    // Stored with a photo the server found: kept through the app's re-check (and after a reload).
    fromModel.places[0].photo = { url: 'https://foody.vn/img.jpg', pageUrl: 'https://foody.vn/a', credit: 'foody.vn' };
    expect(recheckPlaces(JSON.parse(JSON.stringify(fromModel)))!.places[0].photo).toEqual({ url: 'https://foody.vn/img.jpg', pageUrl: 'https://foody.vn/a', credit: 'foody.vn' });
    expect(cleanPlacePhoto({ url: 'http://foody.vn/a.jpg', pageUrl: 'https://foody.vn' })).toBeNull();
    expect(cleanPlacePhoto({ url: 'https://127.0.0.1/a.jpg', pageUrl: 'https://foody.vn' })).toBeNull();
    expect(cleanPlacePhoto({ url: 'javascript:alert(1)', pageUrl: 'https://foody.vn' })).toBeNull();
  });

  it('a dish without its own photo may show the photo of a place found for that very dish', () => {
    const photo = { url: 'https://a.vn/1.jpg', pageUrl: 'https://a.vn/1', credit: 'a.vn' };
    expect(placePhotoForDish('Ốc len xào dừa', [{ dish: 'oc len xao dua', photo }])).toEqual(photo);
    expect(placePhotoForDish('Ốc hương', [{ dish: 'Ốc len xào dừa', photo }])).toBeNull();
  });
});

describe('"Gợi ý tiếp" and an empty wish (server request)', () => {
  it('cleans exclude: bounded, one per name (accents / case alike), no tags or line breaks; absent when empty', () => {
    const req = cleanPlacesRequest({ location: 'Quận 1', exclude: ['Ốc Oanh', 'oc oanh!', '<b>Quán\nX</b>', 5, '', ...Array.from({ length: 30 }, (_, i) => `Quán ${i}`)], excludeDishes: ['Ốc', 'ốc'] }, NOW)!;
    expect(req.exclude).toHaveLength(MAX_EXCLUDE);
    expect(req.exclude!.slice(0, 3)).toEqual(['Ốc Oanh', 'b Quán X /b', 'Quán 0']);
    expect(req.excludeDishes).toEqual(['Ốc']);
    expect(cleanPlacesRequest({ location: 'Quận 1', exclude: [] }, NOW)).not.toHaveProperty('exclude');
    expect(cleanPlacesRequest({ location: 'Quận 1', exclude: 'Ốc Oanh' }, NOW)).not.toHaveProperty('exclude');
  });

  it('the prompt names the places not to repeat, skips the trend search, and fewer searches are allowed', () => {
    const first = cleanPlacesRequest({ location: 'Quận 1', wish: 'ốc' }, NOW)!;
    const more = cleanPlacesRequest({ location: 'Quận 1', wish: 'ốc', exclude: ['Ốc Oanh'], excludeDishes: ['Ốc len xào dừa'] }, NOW)!;
    expect(placesPrompt(first)).not.toContain('GỢI Ý TIẾP');
    expect(placesPrompt(first)).toContain('hot trend');
    expect(placesPrompt(more)).toContain('<seen>Ốc Oanh</seen>');
    expect(placesPrompt(more)).toContain('<seen>Ốc len xào dừa</seen>');
    expect(placesPrompt(more)).not.toContain('hot trend ở Việt Nam');
    expect(placesMaxSearches(first)).toBe(2);
    expect(placesMaxSearches(more)).toBe(2);
  });

  it('a place that comes back anyway is dropped by name', () => {
    const raw = { readWish: '', dishes: [], places: [{ dish: 'Ốc', name: 'ỐC OANH', sources: [{ url: 'https://a.vn' }], reviews: [], reliability: 'low', reliabilityReasons: [] }, { dish: 'Ốc', name: 'Ốc Đào', sources: [{ url: 'https://a.vn' }], reviews: [], reliability: 'low', reliabilityReasons: [] }], notFound: [] };
    const out = cleanPlacesAnswer(raw, { seenUrls: ['https://a.vn'], today: '2026-11-02', checkedAtISO: NOW.toISOString(), exclude: ['Ốc Oanh'] });
    expect(out.places.map((p) => p.name)).toEqual(['Ốc Đào']);
    expect(out.dropped).toBe(0);
  });

  it('an empty wish is accepted: the AI picks the dishes from the time and the recent eating', () => {
    const req = cleanPlacesRequest({ dishes: [], location: 'Quận 1', wish: '   ', context: { time: '19:30', weekday: 1, slot: 'dinner', recent: ['Phở bò'] } }, NOW)!;
    expect(req).not.toBeNull();
    expect(req.wish).toBe('');
    expect(req.dishes).toEqual([]);
    const prompt = placesPrompt(req);
    expect(prompt).toContain('Người dùng không nói muốn gì');
    expect(prompt).toContain('hãy tự chọn 3 món');
    expect(cleanPlacesRequest({ wish: '' }, NOW)).toBeNull(); // still needs an area
  });
});

describe('kept places: history, saved places, sync (user_data cheatPlaces)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCheatPlacesStore.setState({ ...EMPTY_CHEAT_PLACES });
  });

  it('every answer is kept compactly with its photos; "suggest more" pages are joined, each place and dish once', () => {
    const first = answer(['Ốc Oanh', 'Ốc Đào']);
    first.places[0].photo = { url: 'https://foody.vn/1.jpg', pageUrl: 'https://foody.vn/p-oc-oanh', credit: 'foody.vn' };
    const more = answer(['ốc oanh', 'Ốc Vũ'], ['Ốc len xào dừa', 'Sò điệp nướng mỡ hành'], '2026-11-02T10:05:00.000Z');
    const joined = joinAnswers([first, more])!;
    expect(joined.places.map((p) => p.name)).toEqual(['Ốc Oanh', 'Ốc Đào', 'Ốc Vũ']);
    expect(joined.dishes.map((d) => d.name)).toEqual(['Ốc len xào dừa', 'Sò điệp nướng mỡ hành']);
    expect(joined.searches).toBe(6);
    expect(joined.checkedAtISO).toBe('2026-11-02T10:05:00.000Z');
    const s = searchFromAnswer(joined, { id: 'ps-1', near: 'Quận 4', wish: 'ốc' });
    expect(s.places).toHaveLength(3);
    expect(s.places[0]).toMatchObject({ name: 'Ốc Oanh', dish: 'Ốc len xào dừa', address: '1 Lê Lợi', link: 'https://www.foody.vn/p-oc-oanh', photo: first.places[0].photo, near: 'Quận 4', wish: 'ốc' });
    expect(JSON.stringify(s)).not.toContain('seenUrls');
  });

  it('exclude: the places shown, then those found before / saved for the same wish, each once, at most 20', () => {
    const data: Pick<CheatPlacesData, 'history' | 'saved'> = {
      history: [searchFromAnswer(answer(['Ốc Vũ', 'Ốc Oanh']), { id: 'a', near: 'Q4', wish: 'Ốc' }), searchFromAnswer(answer(['Lẩu Dê']), { id: 'b', near: 'Q4', wish: 'lẩu' })],
      saved: [placeToSaved(answer(['Ốc Sáu Nở']).places[0], { near: 'Q4', wish: 'ốc', atISO: NOW.toISOString() })],
    };
    expect(excludeNames(['Ốc Oanh', 'Ốc Đào'], data, 'ốc')).toEqual(['Ốc Oanh', 'Ốc Đào', 'Ốc Vũ', 'Ốc Sáu Nở']);
    expect(excludeNames(Array.from({ length: 30 }, (_, i) => `Quán ${i}`), data, 'ốc')).toHaveLength(20);
  });

  it('the store keeps searches newest first (at most 30), stars and un-stars places, and syncs every change', () => {
    const st = () => useCheatPlacesStore.getState();
    act(() => {
      for (let i = 0; i < 32; i++) st().putSearch(searchFromAnswer(answer([`Quán ${i}`], undefined, new Date(NOW.getTime() + i * 60_000).toISOString()), { id: `s${i}`, near: 'Q1', wish: '' }));
    });
    expect(st().history).toHaveLength(30);
    expect(st().history[0].id).toBe('s31');
    expect(USER_DATA_KEYS.cheatPlaces).toBe('cheatPlaces');
    expect(mockPush).toHaveBeenLastCalledWith('cheatPlaces', expect.objectContaining({ history: expect.any(Array), saved: [] }));
    const place = st().history[0].places[0];
    act(() => {
      st().toggleSaved(place);
    });
    expect(st().saved.map((p) => p.name)).toEqual(['Quán 31']);
    act(() => {
      st().toggleSaved(place);
    });
    expect(st().saved).toEqual([]);
    expect(st().removed[0].id).toBe(`p:${place.key}`);
    act(() => {
      st().removeSearch('s31');
    });
    expect(st().history[0].id).toBe('s30');
    act(() => {
      st().setDishPhotos('s30', { 'ốc len xào dừa': { url: 'https://upload.wikimedia.org/a.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg', credit: 'X · CC BY · Wikimedia' } });
    });
    expect(st().history[0].dishes[0].photo?.url).toBe('https://upload.wikimedia.org/a.jpg');
    act(() => {
      st().clearHistory();
    });
    expect(st().history).toEqual([]);
    expect(mockPush).toHaveBeenLastCalledWith('cheatPlaces', expect.objectContaining({ history: [], clearedAtISO: expect.any(String) }));
  });

  it('merging two devices: everything from both, minus what one removed after it was added; a re-saved place stays', () => {
    const p = placeToSaved(answer(['Ốc Oanh']).places[0], { near: 'Q4', wish: 'ốc', atISO: '2026-11-01T10:00:00.000Z' });
    const q = placeToSaved(answer(['Ốc Đào']).places[0], { near: 'Q4', wish: 'ốc', atISO: '2026-11-01T11:00:00.000Z' });
    const s1 = searchFromAnswer(answer(['Ốc Oanh'], undefined, '2026-11-01T09:00:00.000Z'), { id: 'a', near: 'Q4', wish: 'ốc' });
    const s2 = searchFromAnswer(answer(['Ốc Đào'], undefined, '2026-11-01T12:00:00.000Z'), { id: 'b', near: 'Q4', wish: 'ốc' });
    const phone: CheatPlacesData = { history: [s1], saved: [p, q], removed: [], clearedAtISO: null };
    const web: CheatPlacesData = { history: [s2], saved: [], removed: [{ id: `p:${p.key}`, atISO: '2026-11-01T10:30:00.000Z' }, { id: 's:a', atISO: '2026-11-01T13:00:00.000Z' }], clearedAtISO: null };
    const merged = mergeCheatPlaces(phone, web);
    expect(merged.history.map((s) => s.id)).toEqual(['b']);
    expect(merged.saved.map((x) => x.name)).toEqual(['Ốc Đào']);
    // Saved again after the removal: kept.
    const again = mergeCheatPlaces({ ...phone, saved: [{ ...p, atISO: '2026-11-01T14:00:00.000Z' }, q] }, web);
    expect(again.saved.map((x) => x.name)).toEqual(['Ốc Oanh', 'Ốc Đào']);
    // A history cleared on one device clears the older searches everywhere.
    expect(mergeCheatPlaces(phone, { ...EMPTY_CHEAT_PLACES, clearedAtISO: '2026-11-01T10:00:00.000Z' }).history).toEqual([]);
    // Garbage from the cloud is dropped, not trusted.
    expect(cleanCheatPlacesData({ history: [{ id: 'x' }, 5], saved: [{ name: 'A', atISO: 'no' }], removed: [{ id: 'z:1', atISO: NOW.toISOString() }] })).toEqual(EMPTY_CHEAT_PLACES);
    expect(cleanCheatPlacesData({ saved: [{ name: '<b>A</b>', atISO: NOW.toISOString(), link: 'javascript:x', photo: { url: 'http://a.vn/a.jpg', pageUrl: 'https://a.vn' } }] }).saved[0]).toMatchObject({ name: 'b A /b', link: null, photo: null });
  });
});

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
const count = (text: string, part: string) => text.split(part).length - 1;

describe('Cheat day screen: kept places and "Gợi ý tiếp"', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<CheatDayScreen />);
    });
    return renderer!;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    useSettingsStore.setState({ language: 'vi' });
    useNutritionStore.setState({ logs: {} });
    useCookbookStore.setState({ recipes: [] });
    useCookbookFinderStore.getState().reset();
    useCookbookFinderStore.getState().setLocation('Quận 4, TP.HCM', null);
    useCheatPlacesStore.setState({ ...EMPTY_CHEAT_PLACES });
    mockPlaces.mockImplementation(async (...a: unknown[]) => {
      const opts = (a[3] ?? {}) as { wish?: string; exclude?: string[] };
      return { ok: true, result: fakeCheatPlaces(a[0] as string[], a[1] as string, NOW, opts.wish, opts.exclude) };
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('"Tìm quán" works with an empty wish (the button is not disabled) and the answer goes into the history', async () => {
    const r = await mount();
    expect(useCookbookFinderStore.getState().query).toBe('');
    const button = r.root.findAll((n) => n.props.accessibilityLabel === 'Tìm quán' && n.props.accessibilityState)[0];
    expect(button.props.accessibilityState.disabled).toBeFalsy();
    await press(r, 'Tìm quán');
    expect(mockPlaces).toHaveBeenCalledTimes(1);
    expect(mockPlaces.mock.calls[0][0]).toEqual([]);
    expect(mockPlaces.mock.calls[0][3]).not.toHaveProperty('wish');
    expect(allText(r)).toContain('Quán mẫu A (DỮ LIỆU MẪU)');
    const kept = useCheatPlacesStore.getState().history;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ wish: '', near: 'Quận 4, TP.HCM' });
    expect(kept[0].places.map((p) => p.name)).toEqual(['Quán mẫu A (DỮ LIỆU MẪU)', 'Quán mẫu B (DỮ LIỆU MẪU)', 'Quán mẫu C (DỮ LIỆU MẪU)']);
    expect(mockPush).toHaveBeenCalledWith('cheatPlaces', expect.objectContaining({ history: kept }));
  });

  it('"Gợi ý tiếp" asks again with the places shown excluded and adds the new ones below, none twice', async () => {
    const r = await mount();
    await press(r, 'Tìm quán');
    await press(r, 'Gợi ý tiếp · quán khác');
    expect(mockPlaces).toHaveBeenCalledTimes(2);
    const [dishes, where, , opts] = mockPlaces.mock.calls[1] as [string[], string, unknown, { exclude: string[]; excludeDishes: string[] }];
    expect([dishes, where]).toEqual([[], 'Quận 4, TP.HCM']);
    expect(opts.exclude).toEqual(['Quán mẫu A (DỮ LIỆU MẪU)', 'Quán mẫu B (DỮ LIỆU MẪU)', 'Quán mẫu C (DỮ LIỆU MẪU)']);
    expect(opts.excludeDishes).toEqual(['Món mẫu A (giả lập)', 'Món mẫu B (giả lập)', 'Món mẫu C (giả lập)']);
    let text = allText(r);
    expect(text).toContain('Quán gợi ý · 6');
    expect(text.indexOf('Quán mẫu D (DỮ LIỆU MẪU)')).toBeGreaterThan(text.indexOf('Quán mẫu C (DỮ LIỆU MẪU)'));
    expect(count(text, 'Quán mẫu A (DỮ LIỆU MẪU)')).toBe(1);
    // The server answering a place already shown anyway: it is not shown twice; nothing new says so.
    mockPlaces.mockResolvedValueOnce({ ok: true, result: fakeCheatPlaces([], 'Quận 4', NOW) });
    await press(r, 'Gợi ý tiếp · quán khác');
    text = allText(r);
    expect(count(text, 'Quán mẫu A (DỮ LIỆU MẪU)')).toBe(1);
    expect(text).toContain('Không tìm thêm được quán mới nào');
    // The history entry grew with the second page (same search).
    expect(useCheatPlacesStore.getState().history).toHaveLength(1);
    expect(useCheatPlacesStore.getState().history[0].places).toHaveLength(6);
  });

  it('⭐ saves a place (photo included) into "Quán đã lưu", ✕ removes it with undo; the history can be opened again, removed with undo and cleared', async () => {
    const r = await mount();
    await press(r, 'Tìm quán');
    await press(r, 'Lưu quán Quán mẫu B (DỮ LIỆU MẪU)');
    expect(useCheatPlacesStore.getState().saved.map((p) => p.name)).toEqual(['Quán mẫu B (DỮ LIỆU MẪU)']);
    expect(allText(r)).toContain('⭐ Đã lưu');
    expect(allText(r)).toContain('⭐ Quán đã lưu (1)');
    expect(allText(r)).toContain('Địa chỉ mẫu, Quận 4, TP.HCM');
    await press(r, 'Xóa Quán mẫu B (DỮ LIỆU MẪU)');
    expect(useCheatPlacesStore.getState().saved).toEqual([]);
    act(() => useToastStore.getState().undo());
    expect(useCheatPlacesStore.getState().saved.map((p) => p.name)).toEqual(['Quán mẫu B (DỮ LIỆU MẪU)']);
    // History: one row (the wish, or "AI tự chọn"), "Xem lại" opens it in a sheet.
    expect(allText(r)).toContain('🕘 Lịch sử tìm quán (1)');
    expect(allText(r)).toContain('AI tự chọn');
    expect(allText(r)).toContain('Hôm nay · Món mẫu A (giả lập), Món mẫu B (giả lập), Món mẫu C (giả lập) · 3 quán');
    await press(r, 'Xem lại lần tìm: AI tự chọn');
    expect(allText(r)).toContain('Gần: Quận 4, TP.HCM');
    // ✕ removes a search at once; "Hoàn tác" brings it back.
    const id = useCheatPlacesStore.getState().history[0].id;
    await press(r, 'Xóa AI tự chọn · Hôm nay');
    expect(useCheatPlacesStore.getState().history).toEqual([]);
    act(() => useToastStore.getState().undo());
    expect(useCheatPlacesStore.getState().history.map((h) => h.id)).toEqual([id]);
    await press(r, 'Xóa lịch sử');
    await press(r, 'Bấm lần nữa để xóa hết');
    expect(useCheatPlacesStore.getState().history).toEqual([]);
  });

  it('a place photo from the web shows with its credit, and disappears when the picture does not load', async () => {
    const withPhoto = fakeCheatPlaces([], 'Quận 4', NOW);
    withPhoto.places[0].photo = { url: 'https://example.com/a.jpg', pageUrl: 'https://example.com/sample-place-1', credit: 'example.com' };
    mockPlaces.mockResolvedValueOnce({ ok: true, result: withPhoto });
    const r = await mount();
    await press(r, 'Tìm quán');
    expect(allText(r)).toContain('Ảnh: example.com');
    const img = r.root.findAll((n) => n.props.accessibilityLabel === 'Ảnh Quán mẫu A (DỮ LIỆU MẪU)' && typeof n.props.onError === 'function')[0];
    expect(img.props.source).toEqual({ uri: 'https://example.com/a.jpg' });
    await act(async () => {
      img.props.onError();
    });
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Ảnh Quán mẫu A (DỮ LIỆU MẪU)' && typeof n.props.onError === 'function')).toHaveLength(0);
    // Kept with the history entry, so it shows again without a new request.
    expect(useCheatPlacesStore.getState().history[0].places[0].photo?.url).toBe('https://example.com/a.jpg');
  });
});
