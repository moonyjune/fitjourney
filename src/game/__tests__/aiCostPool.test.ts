import { describe, expect, it } from '@jest/globals';
import {
  BATCH_MAX_DISHES,
  BATCH_MAX_PLACES,
  cleanPlacesAnswer,
  cleanPlacesRequest,
  cleanServed,
  cleanStoredBatch,
  PAGE_DISHES,
  PAGE_PLACES,
  PLACES_TOOL,
  placesBatchExclude,
  placesBatchFresh,
  placesBatchLeft,
  placesMaxSearches,
  placesPage,
  placesPrompt,
  placesRequestKey,
  type CheatPlacesAnswer,
} from '../../../supabase/functions/_shared/places';
import {
  cleanPoolItem,
  cleanStoredPoolItem,
  dayPartOf,
  fitNow,
  newPoolItems,
  pickPoolItem,
  POOL_CHUNKS,
  POOL_TARGET,
  POOL_TOOL,
  poolAnswer,
  poolItemFits,
  poolNameKey,
  poolNeedsRefill,
  poolPrompt,
  refillGuards,
  REFILL_BELOW,
  unseenFitting,
  weatherTagsOf,
  MAX_PHOTO_TRIES,
  needsPhoto,
  photoQueue,
  poolSeedStatus,
  SEED_ENOUGH,
  seedChunks,
  seedGenerated,
  withDishPhoto,
  withOgImage,
  type PoolRow,
  type TemptPoolItem,
  type TemptRequest,
} from '../../../supabase/functions/_shared/tempt';
import { itemFromAi } from '../../temptation/item';

// ----- places: one big search, served page by page -----

const today = '2026-11-03';
const url = (n: number) => `https://foody.vn/quan-${n}`;
const dishNames = ['Ốc len xào dừa', 'Lẩu thái', 'Bánh tráng nướng', 'Trà sữa', 'Gà rán', 'Bún bò'];

/** A cleaned batch: `n` places spread over the dishes, place i at i km. */
function batchOf(n: number): CheatPlacesAnswer {
  const places = Array.from({ length: n }, (_, i) => ({
    dish: dishNames[i % dishNames.length],
    name: `Quán số ${i + 1}`,
    distanceKm: i + 1,
    reviews: [],
    sources: [{ title: 'Foody', url: url(i) }],
    reliability: 'medium',
    reliabilityReasons: [],
  }));
  const raw = {
    readWish: 'Bạn muốn ăn gì đó nóng hổi',
    dishes: dishNames.map((name) => ({ name, why: 'Ngon', kcal: 500 })),
    places,
    notFound: ['Phở cuốn'],
  };
  return cleanPlacesAnswer(raw, {
    seenUrls: places.map((_, i) => url(i)),
    today,
    checkedAtISO: `${today}T10:00:00.000Z`,
    searches: 2,
    maxPlaces: BATCH_MAX_PLACES,
    maxDishes: BATCH_MAX_DISHES,
  });
}

describe('places: the saved batch (0.26)', () => {
  const req = cleanPlacesRequest({ dishes: [], location: 'Quận 1, TP.HCM', today, wish: 'trời mưa' })!;

  it('asks for a big batch with 2 searches, first search and "suggest more" alike', () => {
    expect(placesMaxSearches(req)).toBe(2);
    expect(placesMaxSearches({ ...req, exclude: ['Ốc Oanh'] })).toBe(2);
    const p = placesPrompt(req);
    expect(p).toContain('10–15 quán');
    expect(p).toContain('chỉ có 2 lần tìm kiếm web');
    expect(PLACES_TOOL.input_schema.properties.places.maxItems).toBe(BATCH_MAX_PLACES);
    expect(PLACES_TOOL.input_schema.properties.dishes.maxItems).toBe(BATCH_MAX_DISHES);
  });

  it('keeps a batch whole but an answer to the old size by default', () => {
    const b = batchOf(14);
    expect(b.places).toHaveLength(14);
    expect(b.dishes).toHaveLength(6);
    const again = cleanPlacesAnswer(b, { seenUrls: b.seenUrls ?? null, today, checkedAtISO: b.checkedAtISO, keepPhotos: true });
    expect(again.places).toHaveLength(PAGE_PLACES);
    expect(again.dishes).toHaveLength(PAGE_DISHES);
  });

  it('keys a request by place, dishes, wish and meal slot, not by what was shown', () => {
    const k = placesRequestKey(req);
    expect(placesRequestKey({ ...req, exclude: ['Ốc Oanh'] })).toBe(k);
    expect(placesRequestKey({ ...req, location: 'quận 1 tp hcm' })).toBe(k);
    expect(placesRequestKey({ ...req, wish: 'muốn ăn cay' })).not.toBe(k);
    const near = cleanPlacesRequest({ location: 'A', coords: { lat: 10.77312, lon: 106.70041 }, today })!;
    const moved = cleanPlacesRequest({ location: 'B', coords: { lat: 10.7738, lon: 106.7009 }, today })!;
    expect(placesRequestKey(near)).toBe(placesRequestKey(moved));
    expect(placesRequestKey(near)).not.toBe(placesRequestKey(cleanPlacesRequest({ location: 'A', coords: { lat: 10.8, lon: 106.7 }, today })!));
    const ctx = { time: '20:10', weekday: 6, slot: 'dinner', recent: [], favorites: [], overTarget: [], loggedDays: 0, overDays: 0 };
    expect(placesRequestKey(cleanPlacesRequest({ ...req, context: ctx })!)).not.toBe(placesRequestKey(cleanPlacesRequest({ ...req, context: { ...ctx, slot: 'late' } })!));
  });

  it('is fresh for 7 days', () => {
    const now = new Date('2026-11-10T09:00:00Z');
    expect(placesBatchFresh('2026-11-04T10:00:00Z', now)).toBe(true);
    expect(placesBatchFresh('2026-11-03T08:00:00Z', now)).toBe(false);
    expect(placesBatchFresh('nonsense', now)).toBe(false);
  });

  it('serves pages of the old size until the batch is used up, each place once, nearest first', () => {
    const b = batchOf(14);
    const p1 = placesPage(b, []);
    expect(p1.answer.places).toHaveLength(PAGE_PLACES);
    expect(p1.answer.dishes.length).toBeLessThanOrEqual(PAGE_DISHES);
    expect(new Set(p1.answer.places.map((p) => p.dish)).size).toBeLessThanOrEqual(PAGE_DISHES);
    expect(p1.answer.notFound).toEqual(['Phở cuốn']);
    expect(p1.answer.searches).toBe(2);
    const km = p1.answer.places.map((p) => p.distanceKm ?? 0);
    expect([...km].sort((a, c) => a - c)).toEqual(km);
    // Every place of the page has its dish in the page.
    const dishKeys = p1.answer.dishes.map((d) => d.name);
    p1.answer.places.forEach((p) => expect(dishKeys).toContain(p.dish));
    const p2 = placesPage(b, p1.served);
    expect(p2.answer.notFound).toEqual([]);
    expect(p2.answer.searches).toBe(0);
    const names1 = p1.answer.places.map((p) => p.name);
    p2.answer.places.forEach((p) => expect(names1).not.toContain(p.name));
    const p3 = placesPage(b, p2.served);
    expect(p1.answer.places.length + p2.answer.places.length + p3.answer.places.length).toBe(14);
    expect(p3.left).toBe(0);
    expect(placesBatchLeft(b, p3.served)).toBe(0);
    // The app's own re-check keeps a page as it is.
    const checked = cleanPlacesAnswer(p2.answer, { seenUrls: p2.answer.seenUrls ?? null, today, checkedAtISO: p2.answer.checkedAtISO, keepPhotos: true });
    expect(checked.places.map((p) => p.name)).toEqual(p2.answer.places.map((p) => p.name));
  });

  it('skips the places the app says it has shown, and names every served place for the next batch', () => {
    const b = batchOf(8);
    expect(placesBatchLeft(b, [], ['Quán số 1', 'quan so 2'])).toBe(6);
    const p = placesPage(b, [], ['Quán số 1']);
    expect(p.answer.places.map((x) => x.name)).not.toContain('Quán số 1');
    const ex = placesBatchExclude(b, p.served, ['Ốc Oanh']);
    expect(ex[0]).toBe('Ốc Oanh');
    expect(ex).toEqual(expect.arrayContaining(p.answer.places.map((x) => x.name)));
  });

  it('reads a stored batch and served list back safely', () => {
    const b = batchOf(12);
    const back = cleanStoredBatch(JSON.parse(JSON.stringify(b)))!;
    expect(back.places).toHaveLength(12);
    expect(back.dropped).toBe(b.dropped);
    expect(cleanStoredBatch({ places: 'x' })).toBeNull();
    expect(cleanServed(['p:quan so 1', 'p:quan so 1', 'x', 3, 'd:tra sua'])).toEqual(['p:quan so 1', 'd:tra sua']);
  });
});

// ----- temptations: the shared pool -----

const reqAt = (time: string, patch: Partial<TemptRequest> = {}): TemptRequest => ({ date: '2026-11-04', time, weekday: 3, city: '', weather: null, avoid: [], ...patch });

const poolItem = (name: string, patch: Partial<TemptPoolItem> = {}): TemptPoolItem =>
  cleanPoolItem({ name, emoji: '🧋', kind: 'drink', whyNow: 'Hợp lúc này', pitch: 'Ngon lắm nè~', kcal: 300, sugarG: 30, purineMg: 0, times: [], days: 'any', ...patch }, () => true)!;

let seq = 0;
const row = (item: TemptPoolItem, createdAt = '2026-11-01T00:00:00Z'): PoolRow => ({ id: `id-${++seq}`, item, createdAt });

describe('temptations: the shared pool (0.26)', () => {
  it('cleans an item the model wrote: tags, an occasion window, a URL only when seen', () => {
    const item = cleanPoolItem(
      {
        name: 'Trà sữa Phô Mai Kem Cháy',
        emoji: '🧋',
        kind: 'drink',
        whyNow: 'Món mới',
        pitch: 'Béo ngậy~',
        kcal: 450,
        sugarG: 45,
        purineMg: 0,
        times: ['afternoon', 'evening', 'midnight'],
        days: 'weekend',
        weather: ['hot', 'snow'],
        city: 'Toàn quốc',
        occasion: { from: '09-20', to: '10-10' },
        trending: true,
        sourceUrl: 'https://brand.vn/new',
      },
      (u) => u === 'https://brand.vn/new'
    )!;
    expect(item.times).toEqual(['afternoon', 'evening']);
    expect(item.weather).toEqual(['hot']);
    expect(item.city).toBe('');
    expect(item.occasion).toEqual({ from: '09-20', to: '10-10' });
    expect(item.sourceUrl).toBe('https://brand.vn/new');
    expect(item.sourceDomain).toBe('brand.vn');
    expect(cleanPoolItem({ name: 'X', pitch: 'y', sourceUrl: 'https://made.up/x', occasion: { from: '13-01', to: '01-01' } }, () => false)).toMatchObject({ sourceUrl: null, occasion: null, times: [] });
    expect(cleanPoolItem({ name: 'No pitch' }, () => true)).toBeNull();
    expect(cleanStoredPoolItem({ ...item, imageChecked: true })?.imageChecked).toBe(true);
  });

  it('drops names already in the pool or twice in one answer', () => {
    const known = new Set([poolNameKey('Bánh mì chảo')]);
    const items = newPoolItems(
      { items: [{ name: 'banh mi chao', pitch: 'a' }, { name: 'Xôi mặn', pitch: 'b' }, { name: 'XÔI MẶN!', pitch: 'c' }, { name: '', pitch: 'd' }] },
      () => false,
      known
    );
    expect(items.map((i) => i.name)).toEqual(['Xôi mặn']);
    expect(known.has('xoi man')).toBe(true);
  });

  it('reads now from the request: part of day, weekend, weather', () => {
    expect(dayPartOf(6)).toBe('morning');
    expect(dayPartOf(23)).toBe('late');
    expect(dayPartOf(2)).toBe('late');
    expect(fitNow(reqAt('18:30', { weekday: 5 })).weekend).toBe(true);
    expect(fitNow(reqAt('10:00', { weekday: 5 })).weekend).toBe(false);
    expect(weatherTagsOf({ tempC: 33, summary: 'nắng' })).toEqual(['hot']);
    expect(weatherTagsOf({ tempC: 20, summary: 'mưa phùn' })).toEqual(['cold', 'rain']);
    expect(weatherTagsOf(null)).toEqual([]);
  });

  it('fits by time of day, occasion window (across the new year too) and city', () => {
    const now = fitNow(reqAt('07:30', { city: 'Hà Nội' }));
    expect(poolItemFits(poolItem('Cà phê', { times: ['morning'] }), now)).toBe(true);
    expect(poolItemFits(poolItem('Bia', { times: ['evening', 'late'] }), now)).toBe(false);
    expect(poolItemFits(poolItem('Bánh trung thu', { occasion: { from: '09-01', to: '10-06' } }), now)).toBe(false);
    expect(poolItemFits(poolItem('Mứt Tết', { occasion: { from: '12-20', to: '02-20' } }), fitNow(reqAt('07:30', { date: '2027-01-10' })))).toBe(true);
    expect(poolItemFits(poolItem('Bún chả', { city: 'Hà Nội' }), now)).toBe(true);
    expect(poolItemFits(poolItem('Bánh tráng trộn Sài Gòn', { city: 'TP.HCM' }), now)).toBe(false);
    expect(poolItemFits(poolItem('Bánh tráng trộn Sài Gòn', { city: 'TP.HCM' }), fitNow(reqAt('07:30')))).toBe(true);
  });

  it('picks an unseen fitting item, the best-fitting first, never one shown in the last 30 days', () => {
    const now = fitNow(reqAt('14:30', { weather: { tempC: 34, summary: 'nắng' } }));
    const at = new Date('2026-11-04T07:30:00Z');
    const iced = row(poolItem('Trà tắc đá', { times: ['afternoon'], weather: ['hot'] }));
    const soup = row(poolItem('Lẩu nóng', { times: ['afternoon'], weather: ['cold'] }));
    const any = row(poolItem('Bánh flan'));
    const shown = new Map<string, string>();
    expect(pickPoolItem([iced, soup, any], shown, now, at, [], () => 0)!.row).toBe(iced);
    // The iced drink on a hot afternoon scores 2 above the rest: always it.
    expect(pickPoolItem([iced, soup, any], shown, now, at, [], () => 0.99)!.row).toBe(iced);
    shown.set(iced.id, '2026-10-20T00:00:00Z');
    // Then soup (time, but wrong weather) and flan (no tags) tie: random among them.
    expect(pickPoolItem([iced, soup, any], shown, now, at, [], () => 0)!.row).toBe(soup);
    expect(pickPoolItem([iced, soup, any], shown, now, at, [], () => 0.99)!.row).toBe(any);
    shown.set(any.id, '2026-11-01T00:00:00Z');
    expect(pickPoolItem([iced, soup, any], shown, now, at)).toEqual({ row: soup, repeat: false });
    // Seen long enough ago, it may come back.
    shown.set(iced.id, '2026-09-01T00:00:00Z');
    expect(unseenFitting([iced, soup, any], shown, now, at)).toEqual([iced, soup]);
    // The app's recent names are avoided too.
    expect(unseenFitting([iced, soup, any], shown, now, at, ['TRÀ TẮC ĐÁ'])).toEqual([soup]);
  });

  it('falls back to the item shown longest ago when every fitting one was shown, and to nothing only for an empty pool', () => {
    const now = fitNow(reqAt('20:00'));
    const at = new Date('2026-11-04T13:00:00Z');
    const a = row(poolItem('Bia hơi', { times: ['evening'] }));
    const b = row(poolItem('Ốc xào', { times: ['evening'] }));
    const morning = row(poolItem('Xôi', { times: ['morning'] }));
    const shown = new Map([
      [a.id, '2026-11-03T00:00:00Z'],
      [b.id, '2026-10-30T00:00:00Z'],
    ]);
    expect(pickPoolItem([a, b, morning], shown, now, at)).toEqual({ row: b, repeat: true });
    expect(pickPoolItem([], shown, now, at)).toBeNull();
  });

  it('does not serve an old trend', () => {
    const now = fitNow(reqAt('15:00'));
    const at = new Date('2026-11-04T08:00:00Z');
    const old = row(poolItem('Trend cũ', { trending: true }), '2026-08-01T00:00:00Z');
    const classic = row(poolItem('Chè thái'), '2026-08-01T00:00:00Z');
    expect(unseenFitting([old, classic], new Map(), now, at)).toEqual([classic]);
  });

  it('asks for a refill when few fitting items are left unseen or the pool is stale', () => {
    const now = fitNow(reqAt('15:00'));
    const at = new Date('2026-11-04T08:00:00Z');
    expect(poolNeedsRefill([], new Map(), now, at)).toBe(true);
    const many = Array.from({ length: REFILL_BELOW }, (_, i) => row(poolItem(`Món ${i}`)));
    expect(poolNeedsRefill(many, new Map(), now, at)).toBe(false);
    expect(poolNeedsRefill(many, new Map([[many[0].id, '2026-11-03T00:00:00Z']]), now, at)).toBe(true);
    const stale = many.map((r) => ({ ...r, createdAt: '2026-09-01T00:00:00Z' }));
    expect(poolNeedsRefill(stale, new Map(), now, at)).toBe(true);
  });

  it('plans a refill of ~200 items in a few calls, one with the web, and guards it in time', () => {
    expect(POOL_CHUNKS.reduce((n, c) => n + c.count, 0)).toBeGreaterThanOrEqual(POOL_TARGET);
    expect(POOL_CHUNKS.length).toBeLessThanOrEqual(4);
    expect(POOL_CHUNKS.filter((c) => c.web)).toHaveLength(1);
    const p = poolPrompt(POOL_CHUNKS[0], '2026-11-04', ['Bánh mì chảo']);
    expect(p).toContain('tối đa 2 lần tìm kiếm web');
    expect(p).toContain('<seen>Bánh mì chảo</seen>');
    expect(poolPrompt(POOL_CHUNKS[1], '2026-11-04', [])).toContain('Không cần tìm web');
    expect(POOL_TOOL.input_schema.required).toEqual(['items']);
    const at = new Date('2026-11-04T08:00:00Z');
    const g = refillGuards(at, false);
    expect(g.doneBefore).toBe('2026-11-03T20:00:00.000Z');
    expect(refillGuards(at, true).doneBefore).toBe('2026-11-04T06:00:00.000Z');
    expect(g.runningBefore).toBe('2026-11-04T07:50:00.000Z');
  });

  it('answers a pop-up in the shape the app reads, marked as from the pool', () => {
    const answer = poolAnswer(poolItem('Trà đào'), true);
    expect(answer).toMatchObject({ name: 'Trà đào', pitch: 'Ngon lắm nè~', web: 'pool', repeat: true, imageUrl: null });
    expect(answer).not.toHaveProperty('times');
  });
});

describe('temptations: seeded once with real photos (0.26.2)', () => {
  const wiki = { url: 'https://upload.wikimedia.org/x/640px-Pho.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pho.jpg', author: 'An', license: 'CC BY-SA 4.0', source: 'wikimedia' as const };

  it('gives a web item its page picture with the host as credit, or marks it checked', () => {
    const web = poolItem('Trà mới');
    const withPic = withOgImage({ ...web, sourceUrl: 'https://www.brand.vn/new' }, 'https://cdn.brand.vn/a.jpg');
    expect(withPic).toMatchObject({ imageUrl: 'https://cdn.brand.vn/a.jpg', imageChecked: true, photo: { pageUrl: 'https://www.brand.vn/new', credit: 'brand.vn' } });
    expect(withOgImage({ ...web, sourceUrl: 'https://www.brand.vn/new' }, null)).toMatchObject({ imageChecked: true });
    expect(needsPhoto(withOgImage({ ...web, sourceUrl: 'https://www.brand.vn/new' }, null))).toBe(true);
  });

  it('takes a checked dish photo with its credit, marks "no photo", and gives up after a few undecided tries', () => {
    const item = poolItem('Phở bò');
    const got = withDishPhoto({ ...item, photoTries: 1 }, wiki);
    expect(got.imageUrl).toBe(wiki.url);
    expect(got.photo).toEqual({ url: wiki.url, pageUrl: wiki.sourceUrl, credit: 'An · CC BY-SA 4.0 · Wikimedia' });
    expect(got.photoTries).toBeUndefined();
    expect(withDishPhoto(item, null).noPhoto).toBe(true);
    let tried = item;
    for (let i = 0; i < MAX_PHOTO_TRIES; i++) tried = withDishPhoto(tried, undefined);
    expect(tried).toMatchObject({ photoTries: MAX_PHOTO_TRIES, noPhoto: true });
    expect(withDishPhoto(item, undefined).noPhoto).toBeUndefined();
    // Kept through the store.
    const back = cleanStoredPoolItem(JSON.parse(JSON.stringify(got)))!;
    expect(back.photo).toEqual(got.photo);
    expect(cleanStoredPoolItem(JSON.parse(JSON.stringify(withDishPhoto(item, null))))!.noPhoto).toBe(true);
  });

  it('serves items with a photo first, the others only when none fits', () => {
    const now = fitNow(reqAt('15:00'));
    const at = new Date('2026-11-04T08:00:00Z');
    const bare = row(poolItem('Không ảnh', { times: ['afternoon'] }));
    const none = row({ ...poolItem('Chẳng có ảnh', { times: ['afternoon'] }), noPhoto: true });
    const pic = row(withDishPhoto(poolItem('Có ảnh'), wiki));
    expect(pickPoolItem([bare, none, pic], new Map(), now, at, [], () => 0)!.row).toBe(pic);
    expect(pickPoolItem([bare, none], new Map(), now, at, [], () => 0)!.row).toBe(bare);
    const shown = new Map([[pic.id, '2026-11-03T00:00:00Z'], [bare.id, '2026-11-02T00:00:00Z'], [none.id, '2026-11-01T00:00:00Z']]);
    expect(pickPoolItem([bare, none, pic], shown, now, at)).toEqual({ row: pic, repeat: true });
    expect(photoQueue([bare, none, pic], 5)).toEqual([bare]);
  });

  it('reports the seed and plans its generation', () => {
    const rows = [row(withDishPhoto(poolItem('A'), wiki)), row({ ...poolItem('B'), noPhoto: true }), row(poolItem('C'))];
    expect(poolSeedStatus(rows, true)).toEqual({ total: 3, withPhoto: 1, missingPhoto: 1, remaining: 1, done: false });
    expect(poolSeedStatus(rows.slice(0, 2), true).done).toBe(true);
    expect(poolSeedStatus(rows.slice(0, 2), false).done).toBe(false);
    expect(seedChunks(0)).toEqual(POOL_CHUNKS);
    expect(seedChunks(150).map((c) => c.id)).toEqual(['trend', 'drinks']);
    expect(seedChunks(200)).toEqual([]);
    expect(seedGenerated(SEED_ENOUGH, null)).toBe(true);
    expect(seedGenerated(100, 50)).toBe(false);
    expect(seedGenerated(100, 5)).toBe(true);
    expect(seedGenerated(0, 0)).toBe(false);
  });

  it('answers with the photo credit, which the app keeps', () => {
    const answer = poolAnswer(withDishPhoto(poolItem('Phở bò'), wiki), false);
    expect(answer.photo?.credit).toBe('An · CC BY-SA 4.0 · Wikimedia');
    const item = itemFromAi(answer)!;
    expect(item.imageUrl).toBe(wiki.url);
    expect(item.photo).toMatchObject({ pageUrl: wiki.sourceUrl, credit: 'An · CC BY-SA 4.0 · Wikimedia' });
    expect(itemFromAi({ ...answer, imageUrl: undefined })!.photo).toBeUndefined();
  });
});
