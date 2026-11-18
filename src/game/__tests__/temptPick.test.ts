import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
type Outcome = { ok: true; result: unknown; sample?: boolean } | { ok: false; message: string; kind: 'offline' | 'quota' | 'generic' };
const mockTempt = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockPool = jest.fn<(etag: string | null) => Promise<unknown>>(async () => null);
const mockRecord = jest.fn<(id: string, at: Date) => Promise<void>>(async () => undefined);
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  requestTemptation: (...a: unknown[]) => mockTempt(...a),
  requestTemptChat: jest.fn(async () => ({ ok: false, message: 'Offline', kind: 'offline' })),
  requestTemptPool: (etag: string | null) => mockPool(etag),
  recordTemptShown: (id: string, at: Date) => mockRecord(id, at),
}));
jest.mock('../../temptation/player', () => ({
  currentTemptPlayer: () => ({ eatenKcal: 900, targetKcal: 1900, recentFoods: [], weaknesses: [], streak: 0, cheatDay: false }),
}));

import type { StateStorage } from 'zustand/middleware';
import {
  activeEvents,
  cleanHabits,
  cleanTagAnswer,
  cleanTags,
  deriveTags,
  EVENT_IDS,
  EXPAND_THEMES,
  EXPAND_TOOL,
  expandedItem,
  foodCategory,
  habitProfile,
  itemFits,
  legacyFields,
  lunarDate,
  needsTags,
  nowOf,
  pickScored,
  poolDownload,
  rankRows,
  scoreItem,
  slotOf,
  TAG_TOOL,
  TAGS_VERSION,
  themesToGrow,
  type PickContext,
  type PickItem,
  type PickRow,
} from '../../../supabase/functions/_shared/temptPick';
import { cleanPoolItem, cleanStoredPoolItem } from '../../../supabase/functions/_shared/tempt';
import { habitEntriesFrom, isSnackEntry, mealStateFrom, pickExtrasNow } from '../../temptation/context';
import { answerOfCompact, cleanPoolCache, forgetPoolCache, markShownLocal, mergeShown, pickFromCache, readPoolCache, refreshPool, type PoolAnswer } from '../../temptation/offlinePool';
import { hardItem } from '../../temptation/summon';
import { useNutritionStore } from '../../store/useNutritionStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

const tags = (patch: Record<string, unknown> = {}) => ({
  v: TAGS_VERSION,
  course: 'snack',
  slots: [],
  weather: [],
  tempMin: null,
  tempMax: null,
  months: [],
  days: 'any',
  office: false,
  events: [],
  eventOnly: false,
  afterMeal: false,
  cat: 'other',
  ...patch,
});
const row = (id: string, name: string, t: Record<string, unknown> = {}, item: Partial<PickItem> = {}): PickRow => ({
  id,
  createdAt: '2026-11-01T00:00:00Z',
  item: { name, imageUrl: `https://img.example.com/${id}.jpg`, kcal: 300, tags: tags(t), ...item },
});
const ctx = (patch: Partial<PickContext> = {}): PickContext => ({ date: '2026-11-18', time: '13:00', weekday: 3, weather: null, ...patch });
const AT = new Date('2026-11-18T06:00:00Z');
const first = (rows: PickRow[], c: PickContext, shown: Record<string, string> = {}) => pickScored(rows, shown, c, AT, () => 0)!.row.item.name;

describe('temptation tags (1.5)', () => {
  it('cleans tags: known values only, bounded, all slots / months = any, eventOnly needs an event', () => {
    const t = cleanTags({
      v: 1,
      course: 'dessert',
      slots: ['noon', 'noon', 'bogus'],
      weather: ['rain', 'snow'],
      tempMin: 30,
      tempMax: 20,
      months: [12, 1, 13, 1],
      days: 'weekend',
      events: ['trung_thu', 'nope'],
      eventOnly: true,
      afterMeal: true,
      cat: 'che',
      theme: 'dessert',
    })!;
    expect(t).toMatchObject({ course: 'dessert', slots: ['noon'], weather: ['rain'], tempMin: 20, tempMax: 30, months: [1, 12], days: 'weekend', events: ['trung_thu'], eventOnly: true, afterMeal: true, cat: 'che', theme: 'dessert' });
    expect(cleanTags({ course: 'brunch' })).toBeNull();
    expect(cleanTags(null)).toBeNull();
    const all = cleanTags({ course: 'drink', slots: ['morning', 'midmorning', 'noon', 'afternoon', 'evening', 'late'], months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], eventOnly: true })!;
    expect(all.slots).toEqual([]);
    expect(all.months).toEqual([]);
    expect(all.eventOnly).toBe(false);
  });

  it('derives tags for an untagged 0.26 item and knows which items still need the model', () => {
    const d = deriveTags({ name: 'Chè khúc bạch', kind: 'food', times: ['afternoon', 'evening'], weather: ['hot'] });
    expect(d).toMatchObject({ course: 'dessert', slots: ['afternoon', 'evening'], weather: ['hot'], afterMeal: true, cat: 'che', v: 0 });
    expect(deriveTags({ name: 'Trà đào cam sả', kind: 'drink' }).course).toBe('drink');
    expect(deriveTags({ name: 'Bánh tráng trộn' }).course).toBe('snack');
    expect(deriveTags({ name: 'Bún bò Huế' }).course).toBe('main');
    expect(needsTags({ name: 'x' })).toBe(true);
    expect(needsTags({ name: 'x', tags: tags() })).toBe(false);
  });

  it('sorts food names into categories (milk tea before tea, cake before ice cream)', () => {
    expect(foodCategory('Trà sữa trân châu đường đen')).toBe('milktea');
    expect(foodCategory('Trà đào')).toBe('juice');
    expect(foodCategory('Bánh kem dâu')).toBe('cake');
    expect(foodCategory('Kem dừa')).toBe('icecream');
    expect(foodCategory('Cà phê muối')).toBe('coffee');
    expect(foodCategory('Gà rán sốt cay')).toBe('fried');
    expect(foodCategory('Phở bò')).toBe('noodle');
  });

  it('a tagging answer gives tags per numbered dish, at the current version', () => {
    const out = cleanTagAnswer({ tags: [{ n: 2, ...tags({ course: 'drink' }), v: 0 }, { n: 9, course: 'main' }, { n: 2, course: 'main' }] }, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toMatchObject({ course: 'drink', v: TAGS_VERSION });
    expect(out[2]).toBeNull();
    // The tools ask for every tag field.
    expect(TAG_TOOL.input_schema.properties.tags.items.required).toEqual(expect.arrayContaining(['n', 'course', 'slots', 'events', 'afterMeal', 'cat']));
    expect(EXPAND_TOOL.input_schema.properties.items.items.required).toEqual(expect.arrayContaining(['name', 'pitch', 'course', 'slots', 'weather', 'months', 'events', 'eventOnly']));
  });

  it('a generated item keeps its tags and gets the 0.26 fields from them (a lunar event-only item a rough occasion window)', () => {
    const x = expandedItem({ name: 'Bánh trung thu thập cẩm', emoji: '🥮', whyNow: 'Trung thu tới rồi', pitch: 'Một miếng thôi nha', kcal: 700, sugarG: 40, purineMg: 20, ...tags({ course: 'dessert', slots: ['afternoon', 'evening', 'midmorning'], events: ['trung_thu'], eventOnly: true }) }, 'lunar_events')!;
    expect(x.tags).toMatchObject({ theme: 'lunar_events', eventOnly: true, v: TAGS_VERSION });
    expect(x.raw).toMatchObject({ kind: 'food', occasion: { from: '08-20', to: '10-10' } });
    expect(new Set(x.raw.times as string[])).toEqual(new Set(['morning', 'noon', 'afternoon', 'evening']));
    const item = cleanPoolItem(x.raw, () => false)!;
    expect(item.occasion).toEqual({ from: '08-20', to: '10-10' });
    expect(legacyFields(cleanTags(tags({ course: 'drink', weather: ['sunny', 'hot'] }))!)).toMatchObject({ kind: 'drink', weather: ['hot'], times: [] });
    expect(expandedItem({ name: 'x', course: 'nope' }, 'dessert')).toBeNull();
  });

  it('a stored pool item keeps its tags and a wrong-photo report through the cleaning', () => {
    const stored = cleanStoredPoolItem({ name: 'Chè', emoji: '🍧', whyNow: '', pitch: 'Ngon lắm', kcal: 300, sugarG: 30, purineMg: 0, tags: tags({ course: 'dessert' }), photoFlag: { at: '2026-11-18' } })!;
    expect(stored.tags).toMatchObject({ course: 'dessert' });
    expect(stored.photoFlag).toEqual({ at: '2026-11-18' });
    expect(cleanStoredPoolItem({ name: 'Chè', pitch: 'x', photoFlag: false })!.photoFlag).toBeUndefined();
  });

  it('the expand themes add up to about 500 with the 209 items there, and the most short theme goes first', () => {
    expect(EXPAND_THEMES.reduce((a, t) => a + t.count, 0) + 209).toBeGreaterThanOrEqual(500);
    const rows = Array.from({ length: 30 }, (_, i) => row(`d${i}`, `Chè ${i}`, { theme: 'dessert' }));
    const grow = themesToGrow(rows);
    expect(grow.length).toBe(3);
    expect(grow.map((g) => g.theme.id)).not.toContain('dessert');
  });
});

describe('the Vietnamese calendar', () => {
  it('converts to lunar dates (Tết and Trung thu of several years)', () => {
    for (const [d, m, y] of [[29, 1, 2025], [17, 2, 2026], [6, 2, 2027], [26, 1, 2028], [13, 2, 2029]]) expect(lunarDate(d, m, y)).toMatchObject({ day: 1, month: 1, leap: false });
    for (const [d, m, y] of [[6, 10, 2025], [25, 9, 2026], [15, 9, 2027]]) expect(lunarDate(d, m, y)).toMatchObject({ day: 15, month: 8 });
  });

  it('knows the events on a date: lunar, solar, payday and a football tournament', () => {
    expect(activeEvents('2026-09-25')).toContain('trung_thu');
    expect(activeEvents('2026-11-19')).toEqual(['teachers']);
    expect(activeEvents('2026-02-14')).toEqual(expect.arrayContaining(['tet', 'valentine']));
    expect(activeEvents('2026-12-24')).toContain('christmas');
    expect(activeEvents('2026-06-20')).toEqual(expect.arrayContaining(['football', 'summer']));
    expect(activeEvents('2026-03-02')).toContain('payday');
    expect(activeEvents('2026-03-15')).toEqual([]);
    expect(EVENT_IDS).toContain('ong_tao');
  });

  it('cuts the day into working-day slots', () => {
    expect([6 * 60, 10 * 60, 12 * 60, 15 * 60, 19 * 60, 23 * 60, 2 * 60].map(slotOf)).toEqual(['morning', 'midmorning', 'noon', 'afternoon', 'evening', 'late', 'late']);
    const n = nowOf(ctx({ time: '15:00', weekday: 2, weather: { tempC: 18, summary: 'mưa' } }));
    expect(n).toMatchObject({ slot: 'afternoon', workHours: true, weekend: false, weather: ['cold', 'rain'], month: 11 });
  });
});

describe('scoring for now', () => {
  const POOL = [
    row('pho', 'Phở bò tái', { course: 'main', slots: ['morning', 'noon', 'evening'], cat: 'noodle' }),
    row('che', 'Chè khúc bạch', { course: 'dessert', slots: ['noon', 'afternoon', 'evening'], afterMeal: true, cat: 'che' }),
    row('btt', 'Bánh tráng trộn', { course: 'snack', slots: ['afternoon', 'evening'], cat: 'street' }),
    row('lau', 'Lẩu Thái hải sản', { course: 'main', slots: ['evening'], weather: ['cold', 'rain'], tempMax: 25, cat: 'hotpot' }),
    row('trachanh', 'Trà chanh giã tay', { course: 'drink', slots: ['afternoon', 'evening'], weather: ['hot'], tempMin: 28, cat: 'juice' }),
    row('kem', 'Kem dừa', { course: 'dessert', slots: ['afternoon', 'evening'], weather: ['hot', 'sunny'], cat: 'icecream' }),
    row('tts', 'Trà sữa trân châu đường đen', { course: 'drink', slots: ['midmorning', 'afternoon', 'evening'], office: true, cat: 'milktea' }),
    row('cfs', 'Cà phê sữa đá', { course: 'drink', slots: ['midmorning', 'afternoon', 'evening'], office: true, cat: 'coffee' }),
    row('btt2', 'Bánh trung thu thập cẩm', { course: 'dessert', events: ['trung_thu'], eventOnly: true, cat: 'cake' }),
  ];

  it('right after lunch it offers a dessert, not another meal', () => {
    const c = ctx({ time: '13:00', meal: { sinceMealMin: 20, sinceFoodMin: 20 } });
    expect(first(POOL, c)).toBe('Chè khúc bạch');
    const pho = scoreItem(POOL[0], c).score;
    const che = scoreItem(POOL[1], c).score;
    expect(che).toBeGreaterThan(pho + 8);
  });

  it('on a rainy, cold evening the hot pot wins and the iced drinks lose', () => {
    const c = ctx({ time: '19:30', weather: { tempC: 17, summary: 'mưa rào' }, meal: { sinceMealMin: null, sinceFoodMin: 300 } });
    expect(first(POOL, c)).toBe('Lẩu Thái hải sản');
    expect(scoreItem(POOL[4], c).score).toBeLessThan(0);
    expect(scoreItem(POOL[5], c).why.join(' ')).toContain('wrong weather');
  });

  it('a mooncake is served only around Trung thu, and wins then', () => {
    const tt = ctx({ date: '2026-09-22', time: '16:00', weekday: 2 });
    expect(first(POOL, tt)).toBe('Bánh trung thu thập cẩm');
    const nov = nowOf(ctx());
    expect(itemFits(POOL[8], nov, AT)).toBe(false);
    expect(rankRows(POOL, {}, ctx(), AT).map((r) => r.row.id)).not.toContain('btt2');
  });

  it('boosts what the player tends to snack on, more so at their usual hour', () => {
    const habits = habitProfile([
      ...Array.from({ length: 5 }, () => ({ name: 'Trà sữa trân châu', minutes: 15 * 60, snack: true })),
      { name: 'Cơm tấm', minutes: 12 * 60, snack: false },
      { name: 'Bánh quy', minutes: 10 * 60, snack: true },
    ]);
    expect(habits.total).toBe(6);
    expect(habits.cats.milktea.n).toBe(5);
    expect(habits.names).toEqual(['Trà sữa trân châu']);
    const c = ctx({ time: '15:00', weekday: 3, habits, meal: { sinceMealMin: 180, sinceFoodMin: 180 } });
    const tea = scoreItem(POOL[6], c);
    const coffee = scoreItem(POOL[7], c);
    expect(tea.score).toBeGreaterThan(coffee.score + 4);
    expect(tea.why.join(' ')).toMatch(/habit milktea.*habit at afternoon.*favourite/);
    expect(first([POOL[6], POOL[7]], c)).toBe('Trà sữa trân châu đường đen');
    // Sent over the wire and cleaned on the server, it scores the same.
    expect(scoreItem(POOL[6], { ...c, habits: cleanHabits(JSON.parse(JSON.stringify(habits))) }).score).toBe(tea.score);
  });

  it('after a long gap in the afternoon a snack beats a meal; at an office break the office items get a lift', () => {
    const c = ctx({ time: '15:30', meal: { sinceMealMin: 200, sinceFoodMin: 200 } });
    expect(scoreItem(POOL[2], c).score).toBeGreaterThan(scoreItem(POOL[0], c).score);
    expect(scoreItem(POOL[6], ctx({ time: '10:00', weekday: 2 })).why).toContain('+2 office break');
    expect(scoreItem(POOL[6], ctx({ time: '10:00', weekday: 6 })).why).not.toContain('+2 office break');
  });

  it('never repeats within 30 days; when everything fitting was shown, the oldest showing comes back', () => {
    const two = [POOL[1], POOL[2]];
    const c = ctx({ time: '16:00' });
    const shown = { che: '2026-11-17T00:00:00Z' };
    expect(first(two, c, shown)).toBe('Bánh tráng trộn');
    const all = { che: '2026-11-17T00:00:00Z', btt: '2026-11-10T00:00:00Z' };
    const again = pickScored(two, all, c, AT, () => 0)!;
    expect(again).toMatchObject({ repeat: true });
    expect(again.row.id).toBe('btt');
    expect(pickScored(two, { che: '2026-09-01T00:00:00Z' }, c, AT, () => 0)!.repeat).toBe(false);
    expect(pickScored([], {}, c, AT)).toBeNull();
  });

  it('scores an untagged 0.26 item from its old fields', () => {
    const old = row('old', 'Bánh flan caramen', {}, { tags: undefined, kind: 'food', times: ['afternoon'] });
    expect(scoreItem(old, ctx({ time: '15:00' })).why).toContain('+3 slot afternoon');
  });
});

describe('the pool on the device (offline pick)', () => {
  const memoryStorage = (): StateStorage & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return { data, getItem: async (k) => data[k] ?? null, setItem: async (k, v) => void (data[k] = v), removeItem: async (k) => void delete data[k] };
  };
  const serverRows = [
    row('p1', 'Chè bưởi', { course: 'dessert', slots: ['afternoon'], cat: 'che' }),
    row('p2', 'Ngô nướng mỡ hành', { course: 'snack', slots: ['afternoon', 'evening'], weather: ['cold', 'rain'], cat: 'sweetpotato' }),
  ];

  beforeEach(() => {
    forgetPoolCache();
    mockPool.mockReset();
    mockRecord.mockClear();
    mockTempt.mockReset();
  });

  it('downloads the compact pool with an etag, keeps it, and only merges showings when it did not change', async () => {
    const storage = memoryStorage();
    const dl = poolDownload(serverRows);
    expect(dl.etag).toBe(poolDownload([...serverRows].reverse()).etag);
    expect(dl.items[0]).toMatchObject({ id: 'p1', name: 'Chè bưởi', tags: { course: 'dessert' } });
    const fetchPool = jest.fn<(e: string | null) => Promise<PoolAnswer | null>>(async () => ({ pool: { etag: dl.etag, items: JSON.parse(JSON.stringify(dl.items)) }, shown: [{ id: 'p1', at: '2026-11-17T00:00:00Z' }] }));
    const t0 = new Date('2026-11-18T00:00:00Z');
    expect(await refreshPool({ now: t0, fetchPool, storage })).toBe('updated');
    expect(fetchPool).toHaveBeenLastCalledWith(null);
    expect(await refreshPool({ now: new Date(t0.getTime() + 3_600_000), fetchPool, storage })).toBe('fresh');
    fetchPool.mockResolvedValueOnce({ pool: { etag: dl.etag, notModified: true }, shown: [{ id: 'p2', at: '2026-11-18T01:00:00Z' }] });
    expect(await refreshPool({ now: new Date(t0.getTime() + 13 * 3_600_000), fetchPool, storage })).toBe('same');
    expect(fetchPool).toHaveBeenLastCalledWith(dl.etag);
    forgetPoolCache();
    const back = (await readPoolCache(storage))!;
    expect(back.items.map((i) => i.id)).toEqual(['p1', 'p2']);
    expect(Object.keys(back.shown).sort()).toEqual(['p1', 'p2']);
    // No answer (offline): the copy stays.
    expect(await refreshPool({ force: true, fetchPool: async () => null, storage })).toBe('unavailable');
    expect((await readPoolCache(storage))!.items.length).toBe(2);
  });

  it('picks from the copy with the same scoring, never one shown lately, and records the showing', async () => {
    const storage = memoryStorage();
    const dl = poolDownload(serverRows);
    await refreshPool({ force: true, now: new Date('2026-11-18T00:00:00Z'), fetchPool: async () => ({ pool: { etag: dl.etag, items: dl.items } }), storage });
    const cache = await readPoolCache(storage);
    const rainy = ctx({ time: '16:00', weather: { tempC: 19, summary: 'mưa' } });
    expect(pickFromCache(cache, rainy, AT, () => 0)!.item.name).toBe('Ngô nướng mỡ hành');
    await markShownLocal('p2', AT, storage);
    expect(mockRecord).toHaveBeenCalledWith('p2', AT);
    expect(pickFromCache(await readPoolCache(storage), rainy, AT, () => 0)!.item.name).toBe('Chè bưởi');
    expect(pickFromCache(null, rainy)).toBeNull();
    expect(answerOfCompact(cache!.items[0], false)).toMatchObject({ name: 'Chè bưởi', imageUrl: 'https://img.example.com/p1.jpg', web: 'pool' });
  });

  it('reads a broken cache safely and drops showings older than 30 days', () => {
    expect(cleanPoolCache({ etag: 'x', items: [{ id: 'a', name: 'Kem' }, { id: '', name: 'bad' }, null], shown: { a: '2026-11-01T00:00:00Z', b: 5 } })).toMatchObject({ etag: 'x', items: [{ id: 'a', name: 'Kem', kind: 'food', tags: { course: 'dessert' } }], shown: { a: '2026-11-01T00:00:00Z' } });
    expect(cleanPoolCache({ items: [] })).toBeNull();
    expect(mergeShown({ a: '2026-09-01T00:00:00Z', b: '2026-11-01T00:00:00Z' }, { b: '2026-11-10T00:00:00Z' }, AT)).toEqual({ b: '2026-11-10T00:00:00Z' });
  });

  it('the Hard level falls back to the copy when the server cannot be reached', async () => {
    const dl = poolDownload(serverRows);
    mockPool.mockResolvedValue({ pool: { etag: dl.etag, items: dl.items } });
    expect(await refreshPool({ force: true })).toBe('updated');
    mockTempt.mockResolvedValue({ ok: false, message: 'Offline', kind: 'offline' });
    const item = await hardItem(new Date(2026, 10, 18, 16, 0), 'vi');
    expect(item.source).toBe('ai');
    expect(['Chè bưởi', 'Ngô nướng mỡ hành']).toContain(item.name);
    expect(item.note).toBeUndefined();
    // The request carried what was eaten today and the habits.
    expect(mockTempt.mock.calls[0][0]).toMatchObject({ meal: { sinceMealMin: null, sinceFoodMin: null }, habits: { total: 0 } });
  });
});

describe('the eating context from the food log', () => {
  const food = (name: string, at: Date, patch: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({ id: name, name, calories: 500, proteinG: 10, loggedAtISO: at.toISOString(), mealTime: null, ...patch });
  const day = (items: ExtraFoodItem[]): DailyNutritionLog => ({ dateISO: '2026-11-18', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: items, waterMl: 0 });

  it('knows how long ago the last meal and the last food were', () => {
    const now = new Date(2026, 10, 18, 13, 0);
    const logs = { '2026-11-18': day([food('Cơm gà', new Date(2026, 10, 18, 12, 30), { mealTime: 'lunch' }), food('Cà phê sữa', new Date(2026, 10, 18, 9, 30), { calories: 120, mealTime: 'morning_snack' })]) };
    expect(mealStateFrom(now, logs)).toEqual({ sinceMealMin: 30, sinceFoodMin: 30 });
    expect(mealStateFrom(new Date(2026, 10, 18, 11, 0), logs)).toEqual({ sinceMealMin: null, sinceFoodMin: 90 });
    expect(mealStateFrom(now, {})).toEqual({ sinceMealMin: null, sinceFoodMin: null });
  });

  it('counts snacks: a snack meal time, an "ăn vặt" mark, junk, a sweet thing, an off-hours food', () => {
    const at = new Date(2026, 10, 18, 12, 0);
    expect(isSnackEntry(food('Bánh', at, { mealTime: 'afternoon_snack' }))).toBe(true);
    expect(isSnackEntry({ ...food('Xôi', at, { mealTime: 'breakfast' }), snack: true } as ExtraFoodItem)).toBe(true);
    expect(isSnackEntry(food('Khoai chiên', at, { junk: true, mealTime: 'lunch' }))).toBe(true);
    expect(isSnackEntry(food('Cơm', at, { mealTime: 'lunch' }))).toBe(false);
    expect(isSnackEntry(food('Bánh mì', new Date(2026, 10, 18, 16, 0)))).toBe(true);
    const entries = habitEntriesFrom(new Date(2026, 10, 18, 20, 0), { '2026-11-17': day([food('Trà sữa', new Date(2026, 10, 17, 15, 0), { mealTime: 'afternoon_snack' })]) });
    expect(entries).toEqual([{ name: 'Trà sữa', minutes: 900, snack: true }]);
  });

  it('reads the device food log for the request', () => {
    const now = new Date(2026, 10, 18, 15, 0);
    useNutritionStore.setState({ logs: { '2026-11-18': day([food('Trà sữa', new Date(2026, 10, 18, 14, 30), { mealTime: 'afternoon_snack' }), food('Trà sữa', new Date(2026, 10, 18, 10, 0), { mealTime: 'morning_snack' })]) } });
    const x = pickExtrasNow(now);
    expect(x.meal).toEqual({ sinceMealMin: null, sinceFoodMin: 30 });
    expect(x.habits).toMatchObject({ total: 2, names: ['Trà sữa'], cats: { milktea: { n: 2 } } });
    useNutritionStore.setState({ logs: {} });
  });
});
