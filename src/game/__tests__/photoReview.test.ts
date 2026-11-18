import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  answersOf,
  batchCostUsd,
  capsWith,
  cleanReviewPages,
  collectTasks,
  customIdOf,
  decide,
  DEFAULT_MAX_DISHES,
  DEFAULT_MAX_USD,
  dishTask,
  estimateVerifyUsd,
  estimateWebUsd,
  firstPass,
  groupSubjects,
  labelLine,
  mapAnswers,
  markerAfter,
  mergeBad,
  needsSecond,
  nightOf,
  pickForTasks,
  planRequests,
  poolTask,
  REVIEW_MODEL,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM,
  reviewCaps,
  reviewParams,
  reviewWebPrompt,
  SECOND_MODEL,
  smallThumbUrl,
  verdictKey,
  webAllowed,
  withinBudget,
  type Verdict,
} from '../../../supabase/functions/_shared/photoReview';
import { dishKey } from '../../../supabase/functions/_shared/dishPhoto';

const NOW = new Date('2026-11-19T19:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const flag = (url: string, lastAt = daysAgo(1)) => ({ count: 1, lastAt, url, by: ['abc'] });
const dishRow = (key: string, photo: unknown, name = key) => ({ dish_key: `v2:${key}`, name, photo });
const poolRow = (id: string, item: Record<string, unknown>) => ({ id, item: { name: 'Bún chả', description: 'thịt nướng', ...item } });
const v = (verdict: Verdict['verdict'], confidence: number): Verdict => ({ verdict, confidence });

describe('collect + dedupe', () => {
  it('takes a reported photo still shown, once per row, and skips one replaced after the report', () => {
    const rows = [
      dishRow('bun cha', { url: 'https://a.org/x.jpg', photoFlag: flag('https://a.org/x.jpg') }),
      dishRow('bun cha', { url: 'https://a.org/x.jpg', photoFlag: flag('https://a.org/x.jpg') }),
      dishRow('pho bo', { url: 'https://a.org/new.jpg', photoFlag: flag('https://a.org/old.jpg') }),
      dishRow('com tam', { url: 'https://a.org/c.jpg' }),
      dishRow('xoi', { none: true, photoFlag: flag('https://a.org/x.jpg') }),
    ];
    const tasks = collectTasks(rows, [], new Set(), NOW);
    expect(tasks.map((t) => t.id)).toEqual(['dish:bun cha']);
    expect(tasks[0].bad).toContain('a.org/x.jpg');
  });
  it('skips rows already in an unfinished batch, puts reports first (oldest first), then rows looked at again, then new items', () => {
    const dish = [
      dishRow('a', { url: 'https://a.org/a.jpg', photoFlag: flag('https://a.org/a.jpg', daysAgo(1)) }),
      dishRow('b', { url: 'https://a.org/b.jpg', photoFlag: flag('https://a.org/b.jpg', daysAgo(3)) }),
      dishRow('c', { none: true, photoReview: { at: daysAgo(40), retryAfter: daysAgo(1) } }),
      dishRow('d', { none: true, photoReview: { at: daysAgo(1), retryAfter: daysAgo(-5) } }),
    ];
    const pool = [
      poolRow('p1', { imageUrl: 'https://x.org/p.jpg', photoFlag: flag('https://x.org/p.jpg') }),
      poolRow('p2', { imageUrl: null }),
      poolRow('p3', { imageUrl: null, noPhoto: true, webPhotoTried: true }),
    ];
    expect(collectTasks(dish, pool, new Set(['dish:a']), NOW).map((t) => t.id)).toEqual(['dish:b', 'pool:p1', 'dish:c']);
    const withNew = collectTasks(dish, pool, new Set(), NOW, undefined, { includeNeed: true });
    expect(withNew.map((t) => t.id)).toEqual(['dish:b', 'dish:a', 'pool:p1', 'dish:c', 'pool:p2']);
    expect(withNew.find((t) => t.id === 'pool:p2')?.need).toBe(true);
  });
  it('a pool item left without a photo comes back only after retryAfter, never as a new item before', () => {
    const left = poolRow('p', { imageUrl: null, photoReview: { at: daysAgo(1), retryAfter: daysAgo(-3) } });
    expect(poolTask(left, NOW, true)).toBeNull();
    expect(poolTask({ ...left, item: { ...left.item, photoReview: { at: daysAgo(40), retryAfter: daysAgo(1) } } }, NOW, true)?.need).toBeUndefined();
  });
  it('a new pool item offers its source page as a first candidate', () => {
    expect(poolTask(poolRow('p', { imageUrl: null, sourceUrl: 'https://site.vn/bun-cha' }), NOW, true)?.sourceUrl).toBe('https://site.vn/bun-cha');
    expect(poolTask(poolRow('p', { imageUrl: null, sourceUrl: 'https://site.vn/bun-cha', imageChecked: true }), NOW, true)?.sourceUrl).toBeUndefined();
  });
  it('groups rows of the same normalised name (one search, one check) and merges their bad lists', () => {
    const tasks = collectTasks(
      [dishRow('bun cha', { url: 'https://a.org/1.jpg', bad: ['old.org/z'], photoFlag: flag('https://a.org/1.jpg') }, 'Bún chả')],
      [poolRow('p1', { name: 'BÚN CHẢ!', imageUrl: 'https://b.org/2.jpg', photoFlag: flag('https://b.org/2.jpg') })],
      new Set(),
      NOW
    );
    const subjects = groupSubjects(tasks, dishKey);
    expect(subjects).toHaveLength(1);
    expect(subjects[0].tasks.map((t) => t.id)).toEqual(['dish:bun cha', 'pool:p1']);
    expect(subjects[0].bad).toEqual(expect.arrayContaining(['old.org/z', 'a.org/1.jpg', 'b.org/2.jpg']));
  });
  it('searches the web again only when never searched, older than 30 days, or reported after the search', () => {
    const t = (webAt: string | null, flagAt: string) => ({ tasks: [{ webAt, flagAt } as never] });
    expect(webAllowed(t(null, daysAgo(1)), NOW)).toBe(true);
    expect(webAllowed(t(daysAgo(10), daysAgo(20)), NOW)).toBe(false);
    expect(webAllowed(t(daysAgo(10), daysAgo(2)), NOW)).toBe(true);
    expect(webAllowed(t(daysAgo(31), ''), NOW)).toBe(true);
  });
});

describe('labels', () => {
  const subjects = Array.from({ length: 12 }, (_, i) => ({ key: `dish ${i}`, cands: [0, 1, 2].map((c) => ({ c, url: `https://p.org/${i}-${c}.jpg` })) }));
  const plans = planRequests(subjects, '2026-11-20');
  const labels = Object.fromEntries(plans.map((p) => [p.customId, p.labels]));

  it('puts 10 dishes x 3 candidates per request with rp-<night>-<nn> ids and D/C labels', () => {
    expect(plans.map((p) => p.customId)).toEqual(['rp-2026-11-20-01', 'rp-2026-11-20-02']);
    expect(plans[0].items).toHaveLength(30);
    expect(plans[0].labels['D10-C3']).toEqual({ s: 'dish 9', c: 2, u: 'https://p.org/9-2.jpg' });
    expect(plans[1].labels['D02-C1'].s).toBe('dish 11');
    expect(customIdOf('2026-11-20', 51)).toBe('rp-2026-11-20-51');
    expect(labelLine('D03-C2', 'Bún chả <b>', 'grilled pork [x]')).toBe('[D03-C2] Bún chả b (grilled pork x )'.replace(' )', ')'));
  });
  it('numbers only the shown candidates but keeps their index', () => {
    const p = planRequests([{ key: 'k', cands: [{ c: 2, url: 'u' }] }, { key: 'none', cands: [] }], 'n');
    expect(p[0].labels).toEqual({ 'D01-C1': { s: 'k', c: 2, u: 'u' } });
  });
  it('maps answers back by label in any order; unknown, malformed, repeated and other requests\' labels are ignored', () => {
    const answers = [
      { id: 'D02-C1', verdict: 'exact', confidence: 91 },
      { id: '[D01-C3]', verdict: 'wrong', confidence: 140 },
      { id: 'D02-C1', verdict: 'wrong', confidence: 99 },
      { id: 'D11-C1', verdict: 'exact', confidence: 99 },
      { id: 'D01-C9', verdict: 'exact', confidence: 99 },
      { id: 'pizza', verdict: 'exact', confidence: 99 },
      { id: 'D01-C1', verdict: 'maybe', confidence: 50 },
    ];
    const got = mapAnswers('rp-2026-11-20-01', answers, labels);
    expect([...got.keys()].sort()).toEqual([verdictKey('dish 0', 2), verdictKey('dish 1', 0)].sort());
    expect(got.get(verdictKey('dish 1', 0))).toEqual(v('exact', 91));
    expect(got.get(verdictKey('dish 0', 2))).toEqual(v('wrong', 100));
    expect(mapAnswers('rp-unknown', answers, labels).size).toBe(0);
    // D02-C1 of the second request is another dish.
    expect(mapAnswers('rp-2026-11-20-02', [{ id: 'D02-C1', verdict: 'exact', confidence: 90 }], labels).get(verdictKey('dish 11', 0))).toEqual(v('exact', 90));
  });
  it('reads the JSON answer of a message, null when there is none', () => {
    expect(answersOf({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"answers":[{"id":"D01-C1"}]}' }] })).toEqual([{ id: 'D01-C1' }]);
    expect(answersOf({ content: [{ type: 'text', text: 'sorry' }] })).toBeNull();
    expect(answersOf(null)).toBeNull();
  });
  it('builds requests with the fixed cached instruction first and the structured-output schema', () => {
    const params = reviewParams(REVIEW_MODEL, [{ label: 'D01-C1', name: 'Phở', desc: 'pho', image: { type: 'image' } }]);
    expect(params.system).toEqual([{ type: 'text', text: REVIEW_SYSTEM, cache_control: { type: 'ephemeral' } }]);
    expect(params.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: REVIEW_SCHEMA } });
    const content = (params.messages as { content: unknown[] }[])[0].content;
    expect(content[0]).toEqual({ type: 'text', text: '[D01-C1] Phở (pho)' });
    expect(content[1]).toEqual({ type: 'image' });
    expect(JSON.stringify(REVIEW_SCHEMA)).not.toMatch(/minimum|maximum|maxItems/);
  });
});

describe('cascade', () => {
  it('accepts a sure exact at once, sends the 50-80 band to the second model, decides the rest', () => {
    expect(needsSecond([v('exact', 90), v('exact', 75)])).toBe(false);
    expect(needsSecond([v('wrong', 95), v('exact', 75)])).toBe(true);
    expect(needsSecond([v('similar', 40), v('wrong', 90)])).toBe(false);
    expect(firstPass([v('exact', 85), v('similar', 60), undefined])).toEqual({ sure: [0], unsure: [1], missing: [2] });
  });
  it('without a second look, an exact >= 70 counts; nothing accepted and all judged = none; a missing answer = retry', () => {
    expect(decide([v('wrong', 95), v('exact', 75)], null)).toEqual({ state: 'accept', ranked: [1], rejected: [0] });
    expect(decide([v('wrong', 95), v('similar', 60)], null)).toEqual({ state: 'none', ranked: [], rejected: [0, 1] });
    expect(decide([v('wrong', 95), undefined], null).state).toBe('retry');
    expect(decide([v('exact', 82), v('exact', 95)], null).ranked).toEqual([1, 0]);
  });
  it('the second model decides the unsure ones only', () => {
    const first = [v('wrong', 95), v('exact', 75), v('similar', 55)];
    expect(decide(first, new Map([[1, v('wrong', 80)], [2, v('exact', 72)]]))).toEqual({ state: 'accept', ranked: [2], rejected: [0, 1] });
    expect(decide(first, new Map([[1, v('similar', 80)], [2, undefined]])).state).toBe('retry');
    expect(decide(first, new Map([[1, v('similar', 80)], [2, v('exact', 60)]])).state).toBe('none');
  });
  it('shares accepted pictures out: a dish row the best, each pool row a different one no other pool item shows', () => {
    const taken = new Set(['b']);
    const picks = pickForTasks(
      [
        { id: 'dish:x', kind: 'dish' },
        { id: 'pool:1', kind: 'pool' },
        { id: 'pool:2', kind: 'pool' },
      ],
      [
        { c: 0, key: 'a' },
        { c: 1, key: 'b' },
      ],
      taken
    );
    expect(picks.get('dish:x')).toBe(0);
    expect(picks.get('pool:1')).toBe(0);
    expect(picks.get('pool:2')).toBeNull();
    expect(taken.has('a')).toBe(true);
  });
});

describe('caps and cost', () => {
  it('reads the caps from ai_settings with defaults, and lets one call override them', () => {
    expect(reviewCaps([])).toEqual({ maxDishes: DEFAULT_MAX_DISHES, maxUsd: DEFAULT_MAX_USD });
    expect(reviewCaps([{ key: 'photo_review.max_dishes', value: '40' }, { key: 'photo_review.max_usd', value: '0.5' }])).toEqual({ maxDishes: 40, maxUsd: 0.5 });
    expect(reviewCaps([{ key: 'photo_review.max_dishes', value: 'x' }, { key: 'photo_review.max_usd', value: '-1' }])).toEqual({ maxDishes: 100, maxUsd: 1 });
    expect(capsWith({ maxDishes: 100, maxUsd: 1 }, { maxDishes: 300, maxUsd: 3 })).toEqual({ maxDishes: 300, maxUsd: 3 });
    expect(capsWith({ maxDishes: 100, maxUsd: 1 }, { maxDishes: 5000, maxUsd: 'x' })).toEqual({ maxDishes: 100, maxUsd: 1 });
    expect(capsWith({ maxDishes: 100, maxUsd: 1 }, null)).toEqual({ maxDishes: 100, maxUsd: 1 });
    expect(withinBudget(0.9, 0.1, 1)).toBe(true);
    expect(withinBudget(0.95, 0.1, 1)).toBe(false);
  });
  it('prices batch results at half the list price, cache writes x1.25 and reads x0.1', () => {
    expect(batchCostUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, REVIEW_MODEL)).toBe(0.3);
    expect(batchCostUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, SECOND_MODEL)).toBe(6);
    expect(batchCostUsd({ cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }, SECOND_MODEL)).toBe(1.35);
    expect(batchCostUsd({ server_tool_use: { web_search_requests: 3 } }, REVIEW_MODEL)).toBe(0.03);
    expect(batchCostUsd(undefined, 'unknown')).toBe(0);
  });
  it('estimates a night: 50 dishes x 3 pictures on Haiku cost about a cent, the web dominates', () => {
    const haiku = estimateVerifyUsd(150, REVIEW_MODEL);
    expect(haiku).toBeGreaterThan(0.005);
    expect(haiku).toBeLessThan(0.02);
    expect(estimateVerifyUsd(0, REVIEW_MODEL)).toBe(0);
    expect(estimateWebUsd(5)).toBeCloseTo(0.145, 3);
  });
});

describe('small pieces', () => {
  it('asks Wikimedia for a 512 px thumbnail, leaves other pictures', () => {
    expect(smallThumbUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pho.jpg/640px-Pho.jpg')).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pho.jpg/512px-Pho.jpg'
    );
    expect(smallThumbUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pho.jpg/320px-Pho.jpg')).toMatch(/320px/);
    expect(smallThumbUrl('https://site.vn/pho.jpg')).toBe('https://site.vn/pho.jpg');
  });
  it('keeps the reported picture last in a bounded bad list', () => {
    expect(mergeBad(['a', 'b', 'c'], ['b', 'r'], 3)).toEqual(['c', 'b', 'r']);
    expect(mergeBad(null, ['', 'x'], 5)).toEqual(['x']);
  });
  it('marks a decision: web time, and retryAfter 1 day when only the libraries were searched, else 30 days', () => {
    expect(markerAfter(null, NOW, { web: true, found: true, webAllowed: true })).toEqual({ at: NOW.toISOString(), webAt: NOW.toISOString() });
    expect(markerAfter({ at: 'x', webAt: 'w' }, NOW, { web: false, found: false, webAllowed: true }).retryAfter).toBe(daysAgo(-1));
    expect(markerAfter({ at: 'x', webAt: 'w' }, NOW, { web: false, found: false, webAllowed: false })).toEqual({ at: NOW.toISOString(), webAt: 'w', retryAfter: daysAgo(-30) });
  });
  it('dates a night in Vietnam time', () => {
    expect(nightOf(new Date('2026-11-19T19:00:00Z'))).toBe('2026-11-20');
    expect(nightOf(new Date('2026-11-19T16:59:00Z'))).toBe('2026-11-19');
  });
  it('asks one search per dish and keeps only allowed, distinct pages, at most 3 per dish', () => {
    expect(reviewWebPrompt(['a', 'b'])).toMatch(/tối đa 2 lần tìm/);
    const input = { pages: [1, 1, 1, 1].map((n, i) => ({ n, url: `https://s.vn/a${i}` })).concat([{ n: 2, url: 'https://s.vn/a0' }, { n: 3, url: 'https://s.vn/x' }, { n: 2, url: 'http://s.vn/b' }]) };
    expect(cleanReviewPages(input, 2, (u) => !u.endsWith('a1'))).toEqual([['https://s.vn/a0', 'https://s.vn/a2', 'https://s.vn/a3'], []]);
  });
  it('dish rows without the v2 key or a photo are not tasks', () => {
    expect(dishTask({ dish_key: 'pho', photo: { photoFlag: flag('https://a/x') } }, NOW)).toBeNull();
    expect(dishTask({ dish_key: 'v2:pho', photo: null }, NOW)).toBeNull();
  });
});

describe('the function and its schedule', () => {
  const sql = readFileSync(join(__dirname, '../../../supabase/schema.sql'), 'utf8');
  const fn = readFileSync(join(__dirname, '../../../supabase/functions/photo-review/index.ts'), 'utf8');
  it('creates the batch table and the two cron jobs with the vault secret', () => {
    expect(sql).toMatch(/create table if not exists public\.photo_review_batches/);
    expect(sql).toMatch(/'photo-review-submit',\s*'\*\/5 19 \* \* \*'/);
    expect(sql).toMatch(/'photo-review-collect',\s*'25 \* \* \* \*'/);
    expect(sql).toMatch(/'photo_review\.max_dishes', 'photo_review\.max_usd'/);
  });
  it('checks the cron secret on every call and logs every cost as system cost', () => {
    expect(fn).toMatch(/cronBody\(req\)/);
    expect(fn).toMatch(/got === null \|\| 'forbidden' in got/);
    expect(fn).toMatch(/systemRecord\(admin, 'photo-review batch'\)/);
    expect(fn).toMatch(/tempt_pool_claim_photos/);
  });
});
