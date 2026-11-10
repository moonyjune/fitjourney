import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockPush = jest.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
jest.mock('../../sync/cloudSync', () => ({ pushUserData: (...a: unknown[]) => mockPush(...a) }));

import { TEMPTATION_RESIST_XP } from '../constants';
import { computeGameState } from '../state';
import { DEFAULT_PLAN } from '../../constants/plan';
import { TEMPT_CATALOG, slotOfHour } from '../../temptation/catalog';
import { bossForName, candidatesFor, itemFromAi, pickEasy } from '../../temptation/item';
import { DEFAULT_TEMPT_SETTINGS, MAX_PER_DAY, MIN_GAP_MINUTES, inQuietHours, isAllowedMinute, isTemptationDue, planDay, type TemptSettings } from '../../temptation/schedule';
import { applyOutcome, cleanTemptationData, mergeTemptation, NO_TEMPT_STATS, temptationXp } from '../../temptation/stats';
import { sampleTemptation, SAMPLE_LABEL } from '../../temptation/sample';
import { weatherSummary, currentWeather } from '../../temptation/weather';
import { useTemptationStore } from '../../store/useTemptationStore';
import { USER_DATA_KEYS } from '../../sync/userDataKeys';
import { cleanTemptAnswer, cleanTemptRequest, extractOgImage, publicHttpsUrl, temptPrompt } from '../../../supabase/functions/_shared/tempt';
import { collectWebEvidence, emptyEvidence, hasUserLocation, isServerToolUnavailable, seenInEvidence, webSearchCostUsd, webToolsFor, withoutUserLocation } from '../../../supabase/functions/_shared/webtools';
import { DAILY_QUOTA } from '../../../supabase/functions/_shared/usage';

const on = (patch: Partial<TemptSettings> = {}): TemptSettings => ({ ...DEFAULT_TEMPT_SETTINGS, enabled: true, ...patch });
const at = (h: number, m = 0, day = 28) => new Date(2026, 9, day, h, m); // 28/10/2026 is a Wednesday

describe('temptation schedule', () => {
  it('knows quiet hours across midnight, the same day, and none', () => {
    expect(inQuietHours(23, 22, 7)).toBe(true);
    expect(inQuietHours(3, 22, 7)).toBe(true);
    expect(inQuietHours(7, 22, 7)).toBe(false);
    expect(inQuietHours(13, 13, 15)).toBe(true);
    expect(inQuietHours(15, 13, 15)).toBe(false);
    expect(inQuietHours(3, 5, 5)).toBe(false);
  });

  it('allows only the eating window (12:00-20:00) when fasting, and never in quiet hours', () => {
    const s = on();
    expect(isAllowedMinute(9 * 60, s, false)).toBe(true);
    expect(isAllowedMinute(9 * 60, s, true)).toBe(false);
    expect(isAllowedMinute(12 * 60, s, true)).toBe(true);
    expect(isAllowedMinute(20 * 60, s, true)).toBe(false);
    expect(isAllowedMinute(23 * 60, s, false)).toBe(false);
    expect(isAllowedMinute(6 * 60 + 55, s, false)).toBe(false);
  });

  it('plans at most the daily number, inside allowed minutes, at least 45 minutes apart, the same way each time', () => {
    for (const frequency of ['low', 'mid', 'high'] as const) {
      for (const fasting of [true, false]) {
        for (const day of ['2026-10-28', '2026-10-29', '2026-11-01']) {
          const s = on({ frequency });
          const plan = planDay(day, s, fasting, 'salt1');
          expect(plan.length).toBe(MAX_PER_DAY[frequency]);
          plan.forEach((m) => expect(isAllowedMinute(m, s, fasting)).toBe(true));
          for (let i = 1; i < plan.length; i++) expect(plan[i] - plan[i - 1]).toBeGreaterThanOrEqual(MIN_GAP_MINUTES);
          expect(planDay(day, s, fasting, 'salt1')).toEqual(plan);
        }
      }
    }
    expect(planDay('2026-10-28', on(), false, 'a')).not.toEqual(planDay('2026-10-28', on(), false, 'b'));
  });

  it('is due only when on, allowed, under the limit, 45 min after the last, and a planned moment has passed', () => {
    const s = on({ frequency: 'mid' });
    const plan = planDay('2026-10-28', s, false, 'x');
    const first = plan[0];
    const atMinute = (m: number) => at(Math.floor(m / 60), m % 60);
    const base = { settings: s, fasting: false, salt: 'x', shownAt: [] as number[] };
    expect(isTemptationDue({ ...base, now: atMinute(first) })).toBe(true);
    if (first > 7 * 60) expect(isTemptationDue({ ...base, now: atMinute(first - 5) })).toBe(false);
    expect(isTemptationDue({ ...base, settings: { ...s, enabled: false }, now: atMinute(first) })).toBe(false);
    // Shown once already: the next one waits for the next planned moment and the gap.
    const shownAt = [atMinute(first).getTime()];
    expect(isTemptationDue({ ...base, shownAt, now: atMinute(first + 10) })).toBe(false);
    expect(isTemptationDue({ ...base, shownAt, now: atMinute(plan[1]) })).toBe(true);
    // A pop-up 20 min ago (e.g. caught up) blocks even a due moment.
    expect(isTemptationDue({ ...base, shownAt: [atMinute(plan[1] - 20).getTime(), atMinute(first).getTime()], now: atMinute(plan[1]) })).toBe(false);
    // The day's number reached: nothing more.
    const full = plan.map((m) => atMinute(m).getTime());
    expect(isTemptationDue({ ...base, shownAt: full, now: at(21, 50) })).toBe(false);
    // Quiet hours, even with moments missed.
    expect(isTemptationDue({ ...base, now: at(23, 30) })).toBe(false);
    // Yesterday's pop-ups do not count today.
    expect(isTemptationDue({ ...base, shownAt: full.map((t) => t - 86_400_000), now: atMinute(first) })).toBe(true);
  });
});

describe('easy picker', () => {
  it('has ~40 items, each with names, an emoji, figures and 2+ pitches in both languages', () => {
    expect(TEMPT_CATALOG.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TEMPT_CATALOG.map((i) => i.id)).size).toBe(TEMPT_CATALOG.length);
    for (const i of TEMPT_CATALOG) {
      expect(i.vi && i.en && i.emoji).toBeTruthy();
      expect(i.kcal).toBeGreaterThan(0);
      expect(i.pitchVi.length).toBeGreaterThanOrEqual(2);
      expect(i.pitchEn.length).toBeGreaterThanOrEqual(2);
      expect(i.slots.length).toBeGreaterThan(0);
    }
  });

  it('suggests what fits the time of day: morning coffee, afternoon milk tea, late-night noodles, weekend beer', () => {
    expect(slotOfHour(7)).toBe('morning');
    expect(slotOfHour(15)).toBe('afternoon');
    expect(slotOfHour(23)).toBe('late');
    const ids = (d: Date) => candidatesFor(d).map((i) => i.id);
    expect(ids(at(7))).toContain('ca-phe-sua-da');
    expect(ids(at(7))).not.toContain('bia');
    expect(ids(at(15))).toContain('milk-tea');
    expect(ids(at(23, 30))).toContain('mi-tom-dem');
    candidatesFor(at(23, 30)).forEach((i) => expect(i.slots).toContain('late'));
    // Saturday evening: weekend items count twice.
    const saturday = candidatesFor(new Date(2026, 9, 31, 19));
    expect(saturday.filter((i) => i.id === 'bia').length).toBe(2);
    expect(candidatesFor(at(19)).filter((i) => i.id === 'bia').length).toBe(1);
  });

  it('avoids items shown lately while others fit, and builds a two-bubble pitch in the language', () => {
    const all = candidatesFor(at(15)).map((i) => i.id);
    const avoid = all.slice(0, all.length - 1);
    expect(candidatesFor(at(15), avoid).map((i) => i.id)).toEqual([all[all.length - 1]]);
    const vi = pickEasy(at(7), 'vi', [], () => 0);
    expect(vi.lines).toHaveLength(2);
    expect(vi.source).toBe('easy');
    const chosen = TEMPT_CATALOG.find((i) => i.id === vi.id)!;
    expect(vi.name).toBe(chosen.vi);
    expect(chosen.pitchVi).toContain(vi.lines[1]);
    const en = pickEasy(at(7), 'en', [], () => 0.99);
    expect(TEMPT_CATALOG.find((i) => i.id === en.id)!.pitchEn).toContain(en.lines[1]);
  });

  it('gives AI items a fitting boss', () => {
    expect(bossForName('Bia Tiger Crystal')).toBe('beer');
    expect(bossForName('Trà sữa Phô Mai')).toBe('tea');
    expect(bossForName('Mì cay Seoul')).toBe('noodle');
    expect(bossForName('Bánh flan')).toBe('sweet');
    expect(bossForName('Gà rán')).toBe('fried');
  });
});

describe('resist / give-in record and XP', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useTemptationStore.setState({ settings: on(), stats: NO_TEMPT_STATS, history: [], open: null, busy: false });
  });

  it('counts resists into a streak; giving in only breaks it', () => {
    let s = applyOutcome(NO_TEMPT_STATS, 'resisted');
    s = applyOutcome(s, 'resisted');
    expect(s).toEqual({ resisted: 2, gaveIn: 0, streak: 2, bestStreak: 2 });
    s = applyOutcome(s, 'gaveIn');
    expect(s).toEqual({ resisted: 2, gaveIn: 1, streak: 0, bestStreak: 2 });
    expect(temptationXp(s)).toBe(2 * TEMPTATION_RESIST_XP);
    expect(TEMPTATION_RESIST_XP).toBeLessThanOrEqual(20);
  });

  it('adds the bonus to the game XP', () => {
    const base = { now: at(12), startDateISO: at(12).toISOString(), logs: {}, workoutEntries: [], mealTemplatesByDayType: DEFAULT_PLAN.mealTemplates, tdeeKcal: 2500, proteinTargetG: 150 };
    expect(computeGameState({ ...base, bonusXp: 45 }).totalXp - computeGameState(base).totalXp).toBe(45);
  });

  it('records an answer, keeps a history and saves { settings, stats, history } to user_data "temptation"; practice changes nothing', () => {
    const item = pickEasy(at(15), 'vi', [], () => 0);
    const store = useTemptationStore.getState();
    store.show(item, true);
    useTemptationStore.getState().answer('resisted');
    expect(useTemptationStore.getState().stats).toEqual(NO_TEMPT_STATS);
    expect(mockPush).not.toHaveBeenCalled();

    useTemptationStore.getState().show(item);
    useTemptationStore.getState().answer('resisted', at(15, 5));
    const state = useTemptationStore.getState();
    expect(state.stats.resisted).toBe(1);
    expect(state.history[0]).toEqual({ at: at(15, 5).toISOString(), name: item.name, emoji: item.emoji, kcal: item.kcal, outcome: 'resisted', level: 'easy' });
    expect(mockPush).toHaveBeenLastCalledWith(USER_DATA_KEYS.temptation, { settings: state.settings, stats: state.stats, history: state.history });
    expect(USER_DATA_KEYS.temptation).toBe('temptation');

    useTemptationStore.getState().setSettings({ frequency: 'high', quietStartHour: 30 as number });
    expect(useTemptationStore.getState().settings.frequency).toBe('high');
    expect(useTemptationStore.getState().settings.quietStartHour).toBe(22);
    expect(mockPush).toHaveBeenLastCalledWith('temptation', expect.objectContaining({ settings: expect.objectContaining({ frequency: 'high' }) }));
  });

  it('cleans what comes from the cloud and merges it with the device', () => {
    expect(cleanTemptationData('junk')).toEqual({ settings: DEFAULT_TEMPT_SETTINGS, stats: NO_TEMPT_STATS, history: [] });
    const remote = cleanTemptationData({
      settings: { enabled: true, level: 'hard', frequency: 'nope', quietStartHour: 23, quietEndHour: 6, city: 'Hà <b>Nội' },
      stats: { resisted: 5, gaveIn: 2, streak: 9, bestStreak: 3 },
      history: [{ at: '2026-10-27T10:00:00.000Z', name: 'Bia', emoji: '🍺', kcal: 300, outcome: 'gaveIn', level: 'hard' }, { at: 'bad', outcome: 'resisted' }, { at: '2026-10-26T10:00:00.000Z', outcome: 'maybe' }],
    });
    expect(remote.settings).toEqual({ enabled: true, level: 'hard', frequency: 'mid', quietStartHour: 23, quietEndHour: 6, city: 'Hà  b Nội', aiChat: false });
    expect(remote.settings.city).not.toMatch(/[<>]/);
    expect(remote.stats).toEqual({ resisted: 5, gaveIn: 2, streak: 5, bestStreak: 5 });
    expect(remote.history).toHaveLength(1);
    const local = cleanTemptationData({ stats: { resisted: 1, gaveIn: 0, streak: 1, bestStreak: 1 }, history: [{ at: '2026-10-28T10:00:00.000Z', name: 'Kem', emoji: '🍦', kcal: 280, outcome: 'resisted', level: 'easy' }] });
    const merged = mergeTemptation(local, remote);
    expect(merged.settings).toEqual(remote.settings); // device still on the defaults
    expect(merged.stats).toEqual(remote.stats); // more answers
    expect(merged.history.map((h) => h.name)).toEqual(['Kem', 'Bia']);
    const changed = mergeTemptation({ ...local, settings: on({ frequency: 'low' }) }, remote);
    expect(changed.settings.frequency).toBe('low');
  });
});

describe('Hard level: the tempt-me request and answer (server, pure)', () => {
  it('cleans the request and writes the prompt', () => {
    expect(cleanTemptRequest({ date: 'x', time: '10:00', weekday: 1 })).toBeNull();
    const req = cleanTemptRequest({ date: '2026-10-31', time: '19:30', weekday: 6, city: 'Hà Nội\n<ignore>', weather: { tempC: 21.44, summary: 'mưa' }, avoid: ['Bia', 3, '<x>'] })!;
    expect(req).toEqual({ date: '2026-10-31', time: '19:30', weekday: 6, city: 'Hà Nội ignore', weather: { tempC: 21.4, summary: 'mưa' }, avoid: ['Bia', 'x'] });
    const prompt = temptPrompt(req, true);
    expect(prompt).toContain('Thứ bảy');
    expect(prompt).toContain('21.4°C');
    expect(prompt).toContain('tìm trên web');
    expect(temptPrompt({ ...req, weather: null }, false)).toContain('tự suy ra từ mùa');
  });

  it('declares the web tools the model takes', () => {
    const sonnet = webToolsFor('claude-sonnet-5-5', { maxSearches: 2, maxFetches: 1, city: 'Hà Nội' });
    expect(sonnet.map((t) => t.type)).toEqual(['web_search_20260209', 'web_fetch_20260209']);
    // Never the country VN (the API answers "country not supported"); the city and the time zone still go.
    expect(sonnet[0]).toMatchObject({ name: 'web_search', max_uses: 2, user_location: { type: 'approximate', city: 'Hà Nội', timezone: 'Asia/Ho_Chi_Minh' } });
    expect(sonnet[0].user_location).not.toHaveProperty('country');
    expect(webToolsFor('claude-sonnet-5-5', { maxSearches: 2, maxFetches: 0, country: 'VN' })[0].user_location).not.toHaveProperty('country');
    expect(webToolsFor('claude-sonnet-5-5', { maxSearches: 2, maxFetches: 0, country: 'SG' })[0].user_location).toMatchObject({ country: 'SG' });
    // A refused location: the same tools without it.
    expect(hasUserLocation(sonnet)).toBe(true);
    const bare = withoutUserLocation(sonnet);
    expect(hasUserLocation(bare)).toBe(false);
    expect(bare.map((t) => t.type)).toEqual(['web_search_20260209', 'web_fetch_20260209']);
    expect(bare[0]).toMatchObject({ name: 'web_search', max_uses: 2 });
    expect(isServerToolUnavailable(403, 'Web search is not available in your country')).toBe(true);
    expect(webToolsFor('claude-opus-4-7', { maxSearches: 2, maxFetches: 1 })[0].type).toBe('web_search_20260209');
    expect(webToolsFor('claude-haiku-4-5', { maxSearches: 2, maxFetches: 1 }).map((t) => t.type)).toEqual(['web_search_20250305']);
    expect(isServerToolUnavailable(400, '{"error":{"message":"web_search is not enabled for this organization"}}')).toBe(true);
    expect(isServerToolUnavailable(400, 'max_tokens too large')).toBe(false);
    expect(isServerToolUnavailable(500, 'web_search')).toBe(false);
    expect(webSearchCostUsd(2)).toBeCloseTo(0.02, 6);
    expect(webSearchCostUsd(undefined)).toBe(0);
    expect(DAILY_QUOTA.tempt).toBe(6);
  });

  it('collects what the web tools showed, ignoring errors', () => {
    const ev = collectWebEvidence([
      { type: 'server_tool_use', name: 'web_search', input: { query: 'trà sữa hot' } },
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://brand.vn/menu/tra-sua-moi', title: 'Món mới' }] },
      { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
      { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: 'https://brand.vn/menu/tra-sua-moi', content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'Ảnh: https://cdn.brand.vn/img/tra-sua.jpg ...' } } } },
      { type: 'text', text: 'x', citations: [{ type: 'web_search_result_location', url: 'https://news.vn/a' }] },
    ]);
    expect(ev.urls).toEqual(['https://brand.vn/menu/tra-sua-moi', 'https://news.vn/a']);
    expect(seenInEvidence('https://cdn.brand.vn/img/tra-sua.jpg', ev)).toBe(true);
    expect(seenInEvidence('https://brand.vn/menu/tra-sua-moi/', ev)).toBe(true);
    expect(seenInEvidence('https://made-up.vn/x.jpg', ev)).toBe(false);
    expect(seenInEvidence('https://x.vn', undefined)).toBe(false);
    expect(collectWebEvidence('nope', emptyEvidence())).toEqual(emptyEvidence());
  });

  it('keeps only URLs the web showed: an invented image or page is dropped', () => {
    const ev = collectWebEvidence([
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://www.brand.vn/sp/1' }] },
      { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: 'https://www.brand.vn/sp/1', content: { type: 'document', source: { type: 'text', data: 'og https://cdn.brand.vn/a.jpg' } } } },
    ]);
    const seen = (u: string) => seenInEvidence(u, ev);
    const base = { name: ' Trà sữa  mới ', emoji: '🧋', whyNow: 'Hot', pitch: 'Uống đi mà', kcal: 480.6, sugarG: -3, purineMg: 'x' };
    const good = cleanTemptAnswer({ ...base, sourceUrl: 'https://www.brand.vn/sp/1', imageUrl: 'https://cdn.brand.vn/a.jpg' }, seen)!;
    expect(good).toMatchObject({ name: 'Trà sữa mới', kcal: 481, sugarG: 0, purineMg: 0, sourceUrl: 'https://www.brand.vn/sp/1', imageUrl: 'https://cdn.brand.vn/a.jpg', sourceDomain: 'brand.vn' });
    const invented = cleanTemptAnswer({ ...base, sourceUrl: 'https://fake-brand.vn/x', imageUrl: 'https://images.example.com/milk-tea.png' }, seen)!;
    expect(invented.sourceUrl).toBeNull();
    expect(invented.imageUrl).toBeNull();
    expect(invented.sourceDomain).toBeNull();
    // http, an IP address or localhost never pass, even if "seen".
    expect(cleanTemptAnswer({ ...base, imageUrl: 'http://cdn.brand.vn/a.jpg' }, () => true)!.imageUrl).toBeNull();
    expect(cleanTemptAnswer({ ...base, imageUrl: 'https://10.0.0.1/a.jpg' }, () => true)!.imageUrl).toBeNull();
    expect(cleanTemptAnswer({ name: '' }, () => true)).toBeNull();
    expect(publicHttpsUrl('https://localhost/x')).toBeNull();
    expect(publicHttpsUrl('https://user:pw@brand.vn/x')).toBeNull();
    expect(publicHttpsUrl('https://brand.vn:8443/x')).toBeNull();
    expect(publicHttpsUrl('https://brand.vn/x')).toBe('https://brand.vn/x');
  });

  it('reads the og:image of a found page, made absolute, https only', () => {
    expect(extractOgImage('<head><meta property="og:image" content="/img/a.jpg?w=1&amp;h=2"></head>', 'https://brand.vn/sp/1')).toBe('https://brand.vn/img/a.jpg?w=1&h=2');
    expect(extractOgImage('<meta content="https://cdn.x.vn/b.png" name="twitter:image">', 'https://x.vn')).toBe('https://cdn.x.vn/b.png');
    expect(extractOgImage('<meta property="og:image" content="http://x.vn/b.png">', 'https://x.vn')).toBeNull();
    expect(extractOgImage('<p>no meta</p>', 'https://x.vn')).toBeNull();
  });
});

describe('Hard level on the device', () => {
  it('turns the answer into an item, labels the sample and the no-web note, keeps only https pictures', () => {
    const item = itemFromAi({ name: 'Bia Craft mùa thu', emoji: '🍺', whyNow: 'Lễ hội bia cuối tuần', pitch: 'Một ly thôi', kcal: 220, sugarG: 2, purineMg: 40, imageUrl: 'https://cdn.brew.vn/a.jpg', sourceDomain: 'brew.vn', web: 'used' })!;
    expect(item).toMatchObject({ boss: 'beer', lines: ['Lễ hội bia cuối tuần', 'Một ly thôi'], imageUrl: 'https://cdn.brew.vn/a.jpg', sourceDomain: 'brew.vn', source: 'ai' });
    expect(item.note).toBeUndefined();
    expect(itemFromAi({ name: 'X', imageUrl: 'javascript:alert(1)', web: 'unavailable' })).toMatchObject({ note: 'noWeb' });
    expect(itemFromAi({ name: 'X', imageUrl: 'javascript:alert(1)' })!.imageUrl).toBeUndefined();
    const sample = itemFromAi(sampleTemptation(at(15)), 'sample')!;
    expect(sample.name.startsWith(SAMPLE_LABEL)).toBe(true);
    expect(sample.imageUrl).toBeUndefined();
    expect(sample.source).toBe('sample');
    expect(itemFromAi(null)).toBeNull();
  });

  it('gets the weather from Open-Meteo for a typed city, and gives up quietly', async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      if (url.includes('geocoding')) return { ok: true, json: async () => ({ results: [{ latitude: 21.03, longitude: 105.85 }] }) };
      return { ok: true, json: async () => ({ current: { temperature_2m: 18.6, weather_code: 61 } }) };
    };
    await expect(currentWeather('Hà Nội', fake)).resolves.toEqual({ tempC: 19, summary: 'mưa' });
    expect(calls[0]).toContain(encodeURIComponent('Hà Nội'));
    expect(calls[1]).toContain('latitude=21.030');
    await expect(currentWeather('Nowhere', async () => ({ ok: true, json: async () => ({}) }))).resolves.toBeNull();
    await expect(currentWeather('', fake)).resolves.toBeNull(); // no city and no granted location (not web)
    expect(weatherSummary(0)).toBe('trời quang, nắng');
    expect(weatherSummary(95)).toBe('giông bão');
  });
});
