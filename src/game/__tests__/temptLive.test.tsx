import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
const mockUpdateOutcome = jest.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
const mockDeleteHistory = jest.fn<() => Promise<boolean>>(async () => true);
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPush(...a),
  updateTemptOutcome: (...a: unknown[]) => mockUpdateOutcome(...a),
  deleteTemptHistory: () => mockDeleteHistory(),
  recordTemptInteraction: async () => null,
  requestTemptation: async () => ({ ok: false, message: 'Offline', kind: 'offline' }),
  requestTemptChat: async () => ({ ok: false, message: 'Offline', kind: 'offline' }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useSegments: () => ['(tabs)'] }));

import { Linking } from 'react-native';
import { analyzeDiary, cleanHabitSummary, habitPromptLines, habitWhyLine, type DiaryEntry } from '../../../supabase/functions/_shared/eatingHabits';
import {
  appendTurns,
  boostOf,
  CAT_BOOST_MAX,
  CAT_BOOST_MIN,
  cleanCatBoost,
  cleanInteraction,
  cleanTurns,
  effectiveOutcome,
  gaveInByLog,
  interactionRow,
  learnPromptLines,
  learnSummary,
  outcomeOf,
  retentionCutoffISO,
  withinRetention,
  type Interaction,
} from '../../../supabase/functions/_shared/temptLearn';
import { foodCategory, scoreItem, type PickRow } from '../../../supabase/functions/_shared/temptPick';
import {
  cleanArea,
  cleanShopOut,
  cleanShopsAnswer,
  isOpenAt,
  matchShop,
  parseHours,
  SHOPS_ALLOWED_DOMAINS,
  SHOPS_MAX_SEARCHES,
  SHOPS_MODEL,
  SHOPS_TTL_MS,
  shopLine,
  shopOut,
  shopSlotOf,
  shopsCacheKey,
  shopsFresh,
  shopsOpenAt,
  shopsPrompt,
  shopsSearchTool,
  type TemptShop,
} from '../../../supabase/functions/_shared/temptShops';
import { cleanSmartPick, playerDataBlock } from '../../../supabase/functions/_shared/temptSmart';
import { featureConfig, GROUP_DEFAULT_MODEL, modelGroupOf } from '../../../supabase/functions/_shared/usage';
import { webSearchTool } from '../../../supabase/functions/_shared/webSearch';
import { TemptationDialog, TYPING_MS } from '../../components/quest/TemptationDialog';
import { TemptationSettings } from '../../components/quest/TemptationSettings';
import { useTemptationStore } from '../../store/useTemptationStore';
import { areaFromNominatim } from '../../temptation/area';
import { areaFromSettings } from '../../temptation/context';
import type { TemptItem } from '../../temptation/item';
import { itemFromAi } from '../../temptation/item';
import { reconcileLogged } from '../../temptation/learn';
import { DEFAULT_TEMPT_SETTINGS } from '../../temptation/schedule';
import { NO_TEMPT_STATS } from '../../temptation/stats';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const TODAY = '2026-11-20';
const e = (date: string, name: string, kcal: number, hhmm: string | null, meal: DiaryEntry['meal'], snack: boolean, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  date,
  name,
  kcal,
  minutes: hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null,
  meal,
  snack,
  ...extra,
});

describe('diary + habit analysis (eatingHabits.ts)', () => {
  const entries: DiaryEntry[] = [
    e(TODAY, 'Phở bò', 450, '07:30', 'breakfast', false),
    e(TODAY, 'Trà sữa trân châu', 380, '15:10', null, true, { sugarG: 40 }),
    e('2026-11-19', 'Cơm gà', 650, '12:00', 'lunch', false),
    e('2026-11-19', 'Trà sữa trân châu', 380, '15:30', null, true, { sugarG: 40 }),
    e('2026-11-19', 'Mì tôm', 350, '23:10', null, true),
    e('2026-11-18', 'Bánh flan', 150, '15:00', null, true, { sugarG: 20 }),
    e('2026-11-17', 'Gà rán', 500, '22:00', null, true),
    e('2026-11-10', 'Bánh tráng trộn', 300, '16:00', null, true), // outside the week
    e(TODAY, 'Không ăn', 0, '12:00', 'lunch', false),
  ];
  const s = analyzeDiary({ today: TODAY, nowMinutes: 15 * 60 + 20, entries, targetKcal: 1250, categorize: foodCategory });

  it('counts today against the target, the meals logged and missed', () => {
    expect(s.today).toEqual({ kcal: 830, targetKcal: 1250, leftKcal: 420, meals: ['breakfast'], missing: ['lunch'], snacks: 1 });
    expect(s.yesterday).toEqual({ kcal: 1380, overTarget: true, snacks: 2 });
    expect(s.week.daysLogged).toBe(4);
    expect(s.week.overDays).toBe(1);
    expect(s.week.snacks).toBe(5);
  });
  it('finds snack categories, usual hours, favourites, leanings and late-night eating', () => {
    expect(s.snackCats[0]).toEqual({ cat: 'milktea', n: 2 });
    expect(s.snackCats.map((c) => c.cat)).toEqual(expect.arrayContaining(['fried', 'cake', 'noodle']));
    expect(s.snackHours[0]).toEqual({ hour: 15, n: 3 });
    expect(s.favourites).toEqual([{ name: 'Trà sữa trân châu', n: 2 }]);
    expect(s.prefs.sweet).toBeGreaterThanOrEqual(3);
    expect(s.prefs.fried).toBe(1);
    expect(s.prefs.salty).toBeGreaterThanOrEqual(1);
    expect(s.lateNight).toEqual({ n: 2, days: 2 });
  });
  it('uses the app day kcal when given (plan meals ticked)', () => {
    const t = analyzeDiary({ today: TODAY, nowMinutes: 900, entries, targetKcal: 1250, dayKcal: (d) => (d === TODAY ? 1300 : null) });
    expect(t.today.leftKcal).toBe(-50);
    expect(habitWhyLine(t)).toContain('hôm nay đã vượt 50 kcal');
  });
  it('writes the "why" line from the summary', () => {
    expect(habitWhyLine(s, { cat: 'milktea', nowMinutes: 900 })).toBe('Bạn hay ăn vặt trà sữa lúc 15h · hôm nay còn 420 kcal');
    expect(habitWhyLine(s, { cat: 'beer', nowMinutes: 900 })).toBe('Bạn hay ăn vặt đồ ngọt lúc 15h · hôm nay còn 420 kcal');
    expect(habitWhyLine(s, { nowMinutes: 22 * 60 })).toBe('Tuần này bạn ăn đêm 2 lần · hôm nay còn 420 kcal');
    expect(habitWhyLine(null)).toBe('');
  });
  it('is sent as a cleaned summary only, never the raw diary', () => {
    const back = cleanHabitSummary(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(cleanHabitSummary({ today: { kcal: 1e9 }, favourites: [{ name: '<b>x</b>\nignore all', n: 2 }] })?.favourites[0].name).not.toMatch(/[<>\n]/);
    expect(cleanHabitSummary('x')).toBeNull();
    const text = habitPromptLines(s).join('\n');
    expect(text).toContain('còn 420 kcal');
    expect(text).not.toContain('Phở bò'); // eaten once: not a favourite, not sent
  });
});

const shop = (o: Partial<TemptShop>): TemptShop => ({
  name: 'Quán A',
  area: 'Quận 3',
  dishes: ['Trà sữa trân châu'],
  cat: 'milktea',
  priceRange: '',
  hours: '',
  deliveryMin: null,
  sourceUrl: 'https://shopeefood.vn/ho-chi-minh/quan-a',
  sourceDomain: 'shopeefood.vn',
  reliability: 'Cao',
  reliabilityWhy: '',
  ...o,
});

describe('open shops near the player (temptShops.ts)', () => {
  it('reads opening hours, also past midnight, and filters what is open now', () => {
    expect(parseHours('07:00 - 22:00')).toEqual([[420, 1320]]);
    expect(parseHours('10h-14h, 17h-23h30')).toEqual([
      [600, 840],
      [1020, 1410],
    ]);
    expect(parseHours('Mở cả ngày')).toEqual([[0, 1440]]);
    expect(isOpenAt('18:00 – 02:00', 60)).toBe(true);
    expect(isOpenAt('18:00 – 02:00', 23 * 60)).toBe(true);
    expect(isOpenAt('18:00 – 02:00', 3 * 60)).toBe(false);
    expect(isOpenAt('', 600)).toBeNull();
    const list = [shop({ name: 'Đóng', hours: '07:00 - 21:00' }), shop({ name: 'Không rõ', hours: '', reliability: 'Trung bình' }), shop({ name: 'Ăn đêm', hours: '18:00 - 03:00', reliability: 'Trung bình' })];
    expect(shopsOpenAt(list, 23 * 60).map((x) => [x.shop.name, x.open])).toEqual([
      ['Ăn đêm', true],
      ['Không rõ', null],
    ]);
    expect(shopSlotOf(23 * 60)).toBe('late');
    expect(shopSlotOf(2 * 60)).toBe('late');
    expect(shopSlotOf(15 * 60)).toBe('afternoon');
  });
  it('matches a shop to the item by dish or category, open ones first', () => {
    const list = [shop({ name: 'Chè Cô Ba', dishes: ['Chè bưởi'], cat: 'che', hours: '09:00-22:00' }), shop({ name: 'Gong Cha', hours: '09:00-22:00' })];
    expect(matchShop(list, { name: 'Trà sữa trân châu đường đen', cat: 'milktea' }, 900)?.shop.name).toBe('Gong Cha');
    expect(matchShop(list, { name: 'Chè bưởi', cat: 'che' }, 900)?.shop.name).toBe('Chè Cô Ba');
    expect(matchShop(list, { name: 'Bia hơi', cat: 'beer' }, 900)).toBeNull();
    expect(matchShop(list, { name: 'Chè bưởi', cat: 'che' }, 23 * 60)).toBeNull(); // closed
  });
  it('builds the pop-up shop line without inventing a delivery time', () => {
    expect(shopLine(shop({ deliveryMin: 25 }), true)).toBe('Đang mở · giao ~25 phút · Quán A');
    expect(shopLine(shop({}), null)).toBe('Quán A');
    const out = shopOut(shop({ deliveryMin: 25, hours: '07:00-22:00' }), true);
    expect(cleanShopOut(out)).toEqual(out);
    expect(cleanShopOut({ ...out, url: 'http://x.vn' })).toBeNull();
  });
  it('keeps only shops the search really returned; empty fields stay empty', () => {
    const seen = ['https://shopeefood.vn/ho-chi-minh/quan-a', 'https://www.foody.vn/ho-chi-minh/quan-b', 'https://example.com/c'];
    const got = cleanShopsAnswer(
      {
        shops: [
          { name: 'Quán A', dishes: ['Trà sữa'], sourceUrl: seen[0], openingHours: '', deliveryMinutes: 25, reliability: 'Cao', reliabilityReason: 'ShopeeFood' },
          { name: 'Quán B', dishes: ['Gà rán'], area: '123 Lê Lợi', sourceUrl: seen[1] + '/', openingHours: '10:00 - 22:00', deliveryMinutes: 999, reliability: 'Cao', reliabilityReason: 'Foody' },
          { name: 'Quán C', dishes: ['Bánh'], sourceUrl: seen[2], reliability: 'Cao', reliabilityReason: '' },
          { name: 'Bịa', dishes: ['x'], sourceUrl: 'https://shopeefood.vn/fake', reliability: 'Cao', reliabilityReason: '' },
          { name: 'Không món', dishes: [], sourceUrl: seen[0], reliability: 'Cao', reliabilityReason: '' },
        ],
      },
      seen
    );
    expect(got.map((s) => s.name)).toEqual(['Quán A', 'Quán B', 'Quán C']);
    expect(got[0]).toMatchObject({ hours: '', priceRange: '', deliveryMin: 25, reliability: 'Trung bình' }); // no hours: capped
    expect(got[1]).toMatchObject({ area: '', deliveryMin: null, reliability: 'Cao' }); // street dropped, absurd delivery dropped
    expect(got[2].reliability).toBe('Thấp'); // not a listing site
  });
  it('caches per area and slot for a few hours', () => {
    const area = cleanArea({ district: 'Quận 3', city: 'TP.HCM' })!;
    expect(shopsCacheKey(area, 'late')).toBe('quan 3|tp hcm|late');
    expect(shopsCacheKey(area, 'late')).not.toBe(shopsCacheKey(area, 'evening'));
    const now = new Date('2026-11-20T15:00:00Z');
    expect(SHOPS_TTL_MS).toBeGreaterThanOrEqual(3 * 3_600_000);
    expect(SHOPS_TTL_MS).toBeLessThanOrEqual(6 * 3_600_000);
    expect(shopsFresh(new Date(now.getTime() - 3_600_000).toISOString(), now)).toBe(true);
    expect(shopsFresh(new Date(now.getTime() - SHOPS_TTL_MS - 1).toISOString(), now)).toBe(false);
    expect(shopsFresh('nonsense', now)).toBe(false);
  });
  it('never lets a street address out: district / city only, position rounded to ~1 km', () => {
    expect(cleanArea({ district: '12 Nguyễn Huệ', city: 'TP.HCM' })).toEqual({ district: '', city: 'TP.HCM' });
    expect(cleanArea({ district: 'Hẻm 45/3', city: '' })).toBeNull();
    expect(cleanArea({ district: 'Quận 1', city: 'TP.HCM', lat: 10.776889, lon: 106.700806 })).toEqual({ district: 'Quận 1', city: 'TP.HCM', lat: 10.78, lon: 106.7 });
    expect(areaFromSettings({ ...DEFAULT_TEMPT_SETTINGS, district: 'Quận Ba Đình', city: 'Hà Nội', coords: { lat: 21.0345, lon: 105.8123 } })).toEqual({ district: 'Quận Ba Đình', city: 'Hà Nội', lat: 21.03, lon: 105.81 });
    const prompt = shopsPrompt({ area: { district: 'Quận 3', city: 'TP.HCM' }, minutes: 22 * 60 + 30, weekday: 5, date: TODAY, cravings: ['trà sữa'] });
    expect(prompt).toContain('Quận 3, TP.HCM');
    expect(prompt).toContain('ăn đêm');
    expect(prompt).toContain('ĐANG MỞ');
  });
  it('reads a district and city from the reverse lookup', () => {
    expect(areaFromNominatim({ address: { road: 'Lê Lợi', house_number: '12', city_district: 'Quận 1', city: 'Thành phố Hồ Chí Minh' } })).toEqual({ district: 'Quận 1', city: 'TP.HCM' });
    expect(areaFromNominatim({ address: { suburb: 'Quận Cầu Giấy', city: 'Thành phố Hà Nội' } })).toEqual({ district: 'Quận Cầu Giấy', city: 'Hà Nội' });
    expect(areaFromNominatim(null)).toEqual({ district: '', city: '' });
  });
  it('searches with Sonnet 5.5 and web search, at most 3 uses, on the listing sites only', () => {
    expect(SHOPS_MODEL).toBe('claude-sonnet-5-5');
    expect(SHOPS_MAX_SEARCHES).toBeLessThanOrEqual(3);
    expect(shopsSearchTool()).toEqual({ type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_domains: SHOPS_ALLOWED_DOMAINS });
    expect(SHOPS_ALLOWED_DOMAINS).toEqual(expect.arrayContaining(['shopeefood.vn', 'foody.vn']));
    // The request as ai.ts builds it from the call's webSearch options.
    const tool = webSearchTool({ maxUses: SHOPS_MAX_SEARCHES, allowedDomains: SHOPS_ALLOWED_DOMAINS, toolType: 'web_search_20260209', userLocation: { country: 'VN', timezone: 'Asia/Ho_Chi_Minh' } });
    expect(tool).toMatchObject({ type: 'web_search_20260209', max_uses: 3, allowed_domains: SHOPS_ALLOWED_DOMAINS, user_location: { type: 'approximate', timezone: 'Asia/Ho_Chi_Minh' } });
    expect((tool.user_location as Record<string, unknown>).country).toBeUndefined();
    const live = read('supabase/functions/_shared/temptLive.ts');
    expect(live).toMatch(/runAiCall\(ctx, 'temptshops'[\s\S]*webSearch: \{ maxUses: SHOPS_MAX_SEARCHES, allowedDomains: SHOPS_ALLOWED_DOMAINS, toolType: SHOPS_SEARCH_TOOL_TYPE/);
    expect(live).toMatch(/aiAllowance\(ctx, 'temptshops'\)/);
  });
  it('runs every live temptation call on Sonnet 5.5 by default, the admin override still wins', () => {
    const global = { model: 'claude-haiku-5-5', priceInPerMtok: 0.1, priceOutPerMtok: 0.5 };
    expect(GROUP_DEFAULT_MODEL.temptlive).toBe('claude-sonnet-5-5');
    for (const f of ['temptchat', 'temptpick', 'temptshops'] as const) {
      expect(modelGroupOf(f)).toBe('temptlive');
      expect(featureConfig(global, [], modelGroupOf(f))).toEqual({ model: 'claude-sonnet-5-5', priceInPerMtok: 2, priceOutPerMtok: 10 });
      expect(featureConfig(global, [{ key: 'model.temptlive', value: 'claude-opus-5-5' }], modelGroupOf(f)).model).toBe('claude-opus-5-5');
    }
    // The pool's refills stay on the cheap model.
    expect(featureConfig(global, [], modelGroupOf('tempt')).model).toBe('claude-haiku-5-5');
    const fn = read('supabase/functions/tempt-me/index.ts');
    expect(fn).toMatch(/playerCall\(ctx, 'temptpick'/);
  });
});

const inter = (o: Partial<Interaction>): Interaction => ({
  shownAt: '2026-11-19T08:00:00.000Z',
  poolId: null,
  name: 'Trà sữa',
  cat: 'milktea',
  kind: 'drink',
  context: { slot: 'afternoon', weekday: 3, weather: ['rain'], tempC: 26, kcalLeft: 400, sinceMealMin: 120, area: 'Quận 3, TP.HCM', shop: '' },
  outcome: 'gave_in',
  turns: [],
  bonusXp: 0,
  model: 'claude-sonnet-5-5',
  angle: '',
  ...o,
});
const NOW = new Date('2026-11-20T08:00:00.000Z');

describe('learning from the temptation history (temptLearn.ts)', () => {
  it('records the outcome and the chat with the tease-back lines, bounded', () => {
    expect(outcomeOf('resisted')).toBe('resisted');
    expect(outcomeOf('gaveIn')).toBe('gave_in');
    expect(outcomeOf('resisted', true)).toBe('practice');
    expect(outcomeOf('dismissed')).toBe('dismissed');
    let turns = cleanTurns([{ from: 'boss', text: 'Trà sữa nè cưng' }]);
    for (let i = 0; i < 5; i++) turns = appendTurns(turns, `Không ${i} ${'x'.repeat(300)}`, ['Hứ!']);
    const mine = turns.filter((t) => t.from === 'me');
    expect(mine).toHaveLength(3);
    expect(mine.every((t) => t.text.length <= 200)).toBe(true);
    const row = interactionRow('u1', { shownAt: NOW.toISOString(), poolId: null, name: 'Trà sữa', cat: 'milktea', kind: 'drink', context: inter({}).context, model: 'm', angle: 'a', turns });
    expect(row).toMatchObject({ user_id: 'u1', outcome: null, bonus_xp: 0, cat: 'milktea', kind: 'drink' });
    expect(cleanInteraction({ ...row, id: 'x' })?.turns).toEqual(turns);
    expect(cleanInteraction({ name: 'x' })).toBeNull();
  });
  it('turns the history into bounded category boosts with a floor, and prompt lines', () => {
    const list = [
      inter({ shownAt: '2026-11-19T08:00:00.000Z' }),
      inter({ shownAt: '2026-11-18T08:00:00.000Z' }),
      inter({ shownAt: '2026-11-17T08:00:00.000Z', outcome: 'gave_in_logged', angle: 'Trời mưa + trà sữa' }),
      ...[1, 2, 3, 4, 5, 6].map((d) => inter({ shownAt: `2026-11-0${d}T08:00:00.000Z`, name: 'Bia', cat: 'beer', kind: 'drink', outcome: 'resisted', context: { ...inter({}).context, slot: 'evening', weather: [] } })),
      inter({ shownAt: '2026-11-16T08:00:00.000Z', outcome: 'practice', cat: 'cake' }),
      inter({ shownAt: '2026-11-15T08:00:00.000Z', outcome: 'reported_photo', cat: 'cake' }),
      inter({ shownAt: '2026-11-14T08:00:00.000Z', outcome: 'resisted', cat: 'che', name: 'Chè', turns: [{ from: 'boss', text: 'Chè nè' }, { from: 'me', text: 'Quỷ ơi về đi' }] }),
    ];
    const s = learnSummary(list, NOW);
    expect(s.n).toBe(10);
    expect(s.catBoost.milktea).toBeGreaterThan(0);
    expect(s.catBoost.milktea).toBeLessThanOrEqual(CAT_BOOST_MAX);
    expect(s.catBoost.beer).toBeLessThan(0);
    expect(s.catBoost.beer).toBeGreaterThanOrEqual(CAT_BOOST_MIN);
    expect(s.catBoost.cake).toBeUndefined(); // practice / photo reports are not learned from
    expect(s.catBoost.che).toBeUndefined(); // one try is not enough
    expect(boostOf({ key: 'x', gaveIn: 0, held: 50 })).toBe(CAT_BOOST_MIN);
    expect(s.teaseRate).toBe(1);
    expect(s.mocked).toEqual(['Quỷ ơi về đi']);
    expect(s.worked[0]).toContain('Trời mưa + trà sữa');
    expect(s.recent).toContain('Trà sữa');
    const lines = learnPromptLines(s, { milktea: 'trà sữa', beer: 'bia rượu' }).join('\n');
    expect(lines).toContain('Hay chịu thua với: trà sữa (chịu thua 3/3)');
    expect(lines).toContain('Luôn cứng rắn với: bia rượu (chịu thua 0/6)');
    expect(lines).toContain('trời mưa');
    expect(learnPromptLines(null)).toEqual([]);
    expect(cleanCatBoost({ milktea: 9, beer: -9, 'bad key': 1 })).toEqual({ milktea: CAT_BOOST_MAX, beer: CAT_BOOST_MIN });
  });
  it('counts an unanswered temptation as ignored after an hour', () => {
    expect(effectiveOutcome(inter({ outcome: null, shownAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() }), NOW)).toBeNull();
    expect(effectiveOutcome(inter({ outcome: null, shownAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() }), NOW)).toBe('ignored');
  });
  it('keeps 180 days', () => {
    expect(retentionCutoffISO(NOW)).toBe('2026-05-24T08:00:00.000Z');
    expect(withinRetention([inter({ shownAt: '2026-05-01T00:00:00.000Z' }), inter({})], NOW)).toHaveLength(1);
    const sql = read('supabase/schema.sql');
    expect(read('supabase/functions/_shared/temptLive.ts')).toMatch(/delete\(\)\.eq\('user_id', userId\)\.lt\('shown_at', retentionCutoffISO\(\)\)/);
    expect(sql).toMatch(/create table if not exists public\.tempt_interactions/);
    expect(sql).toMatch(/grant update \(outcome, bonus_xp\) on public\.tempt_interactions to authenticated/);
    expect(sql).toMatch(/"tempt_interactions_own_delete" on public\.tempt_interactions for delete\s+to authenticated using \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/create table if not exists public\.tempt_shops/);
  });
  it('reads "gave in" from the food log within 2 hours', () => {
    const i = { shownAt: '2026-11-20T08:00:00.000Z', name: 'Trà sữa trân châu', cat: 'milktea' };
    expect(gaveInByLog(i, [{ name: 'Trà sữa trân châu đường đen', atISO: '2026-11-20T09:00:00.000Z' }])).toBe(true);
    expect(gaveInByLog(i, [{ name: 'Trà sữa', atISO: '2026-11-20T11:00:00.000Z' }])).toBe(false);
    expect(gaveInByLog(i, [{ name: 'Hồng trà sữa', atISO: '2026-11-20T08:30:00.000Z' }], foodCategory)).toBe(true);
    expect(gaveInByLog(i, [{ name: 'Phở', atISO: '2026-11-20T08:30:00.000Z' }], foodCategory)).toBe(false);
    const day = { dateISO: '', mealsEaten: {}, extraCalories: 0, extraProteinG: 0, waterMl: 0, extraItems: [{ id: '1', name: 'Trà sữa trân châu', calories: 380, proteinG: 0, loggedAtISO: new Date(2026, 10, 20, 15, 40).toISOString(), mealTime: null }] };
    const shownAt = new Date(2026, 10, 20, 15, 0).toISOString();
    const got = reconcileLogged(
      [
        { id: 'a', shownAt, name: 'Trà sữa trân châu', outcome: 'resisted' },
        { id: 'b', shownAt, name: 'Bia', outcome: 'dismissed' },
        { id: 'c', shownAt: new Date(2026, 10, 20, 10, 0).toISOString(), name: 'Bia', outcome: 'resisted' },
      ],
      { '2026-11-20': day },
      new Date(2026, 10, 20, 16, 0)
    );
    expect(got.eaten).toEqual(['a']);
    expect(got.keep.map((p) => p.id)).toEqual(['b']);
  });
  it('feeds a bounded boost into the pick score', () => {
    const row: PickRow = { id: '1', item: { name: 'Trà sữa trân châu', kind: 'drink' }, createdAt: '2026-11-01T00:00:00.000Z' };
    const ctx = { date: TODAY, time: '15:00', weekday: 5, weather: null };
    const base = scoreItem(row, ctx).score;
    expect(scoreItem(row, { ...ctx, learned: { milktea: 2 } }).score).toBe(base + 2);
    expect(scoreItem(row, { ...ctx, learned: { milktea: -9 } }).score).toBe(base - 1.5);
  });
});

describe('the Sonnet pick (temptSmart.ts)', () => {
  it('accepts only items and shops of the lists', () => {
    expect(cleanSmartPick({ itemId: 'b', shop: 1, angle: 'a', lines: ['x', 'y', 'z'] }, ['a', 'b'], 2)).toEqual({ id: 'b', shop: 1, angle: 'a', lines: ['x', 'y'] });
    expect(cleanSmartPick({ itemId: 'b', shop: 5, angle: '', lines: [] }, ['a', 'b'], 2)?.shop).toBeNull();
    expect(cleanSmartPick({ itemId: 'zz', shop: 0 }, ['a'], 1)).toBeNull();
    expect(playerDataBlock(['d'], [], ['0. Quán'])).toBe('<diary>\nd\n</diary>\n<shops>\nQuán gần người chơi đang mở / có thể mở lúc này (nguồn: trang giao đồ ăn; chỉ nhắc tên quán, không bịa thêm):\n0. Quán\n</shops>');
  });
});

let r: ReactTestRenderer;
const textOf = (tree: ReactTestRenderer): string => {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join('');
};

describe('the pop-up and the settings (1.7)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 20, 15, 0) });
    mockUpdateOutcome.mockClear();
    mockDeleteHistory.mockClear();
    useTemptationStore.setState({ settings: { ...DEFAULT_TEMPT_SETTINGS, enabled: true, level: 'hard' }, stats: NO_TEMPT_STATS, history: [], shownAt: [], salt: 't', open: null, busy: false, answered: false, pending: [] });
  });
  afterEach(() => {
    act(() => r?.unmount());
    jest.useRealTimers();
  });

  const served = itemFromAi({
    name: 'Trà sữa trân châu',
    emoji: '🧋',
    kcal: 380,
    sugarG: 40,
    purineMg: 5,
    whyNow: 'Chiều rồi',
    pitch: 'Một ly thôi',
    interactionId: '11111111-2222-3333-4444-555555555555',
    why: 'Bạn hay ăn vặt trà sữa lúc 15h · hôm nay còn 420 kcal',
    shop: { name: 'Gong Cha', line: 'Đang mở · giao ~25 phút · Gong Cha', url: 'https://shopeefood.vn/ho-chi-minh/gong-cha', open: true, reliability: 'Cao' },
  }) as TemptItem;

  it('shows the shop line with its source link and the "why" line', async () => {
    expect(served.shop?.domain).toBe('shopeefood.vn');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => {
      r = create(<TemptationDialog open={{ item: served, practice: false }} onAnswer={() => undefined} onLog={() => undefined} onClose={() => undefined} streak={0} />);
    });
    for (let i = 0; i < 4; i++)
      await act(async () => {
        jest.advanceTimersByTime(TYPING_MS);
      });
    const text = textOf(r);
    expect(text).toContain('Đang mở · giao ~25 phút · Gong Cha');
    expect(text).toContain('nguồn: shopeefood.vn');
    expect(text).toContain('Vì sao gợi ý món này? Bạn hay ăn vặt trà sữa lúc 15h · hôm nay còn 420 kcal');
    const link = r.root.findAll((n) => n.props.testID === 'tempt-shop' && typeof n.props.onPress === 'function')[0];
    await act(async () => link.props.onPress());
    expect(open).toHaveBeenCalledWith('https://shopeefood.vn/ho-chi-minh/gong-cha');
    open.mockRestore();
  });
  it('records the answer, a close without answer, and a practice round', () => {
    const store = useTemptationStore.getState();
    store.show(served);
    useTemptationStore.getState().answer('resisted', new Date(), 10);
    expect(mockUpdateOutcome).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555', 'resisted', 10);
    expect(useTemptationStore.getState().pending[0]).toMatchObject({ id: served.interactionId, outcome: 'resisted' });
    useTemptationStore.getState().close();
    expect(mockUpdateOutcome).toHaveBeenCalledTimes(1);
    useTemptationStore.getState().show(served);
    useTemptationStore.getState().close();
    expect(mockUpdateOutcome).toHaveBeenLastCalledWith(served.interactionId, 'dismissed');
    useTemptationStore.getState().show(served, true);
    expect(mockUpdateOutcome).toHaveBeenLastCalledWith(served.interactionId, 'practice');
  });
  it('"Xoá lịch sử cám dỗ" deletes the server history and the device list', async () => {
    useTemptationStore.setState({ history: [{ at: '2026-11-19T08:00:00.000Z', name: 'Bia', emoji: '🍺', kcal: 300, outcome: 'gaveIn', level: 'hard' }] });
    await act(async () => {
      r = create(<TemptationSettings />);
    });
    expect(textOf(r)).toContain('Khu vực của tôi');
    expect(textOf(r)).toContain('không bao giờ gửi số nhà hay tên đường'.replace('không', 'Không'));
    const btn = r.root.findAll((n) => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel === 'Xoá lịch sử cám dỗ' || n.props.title === 'Xoá lịch sử cám dỗ'))[0];
    await act(async () => btn.props.onPress());
    expect(mockDeleteHistory).toHaveBeenCalled();
    expect(useTemptationStore.getState().history).toEqual([]);
    expect(textOf(r)).toContain('Đã xoá lịch sử cám dỗ.');
  });
});
