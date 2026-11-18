// Supabase Edge Function (Deno runtime).
// Deploy (no user JWT: pg_cron calls it with the shared secret instead, like send-push):
//   npx supabase functions deploy photo-review --no-verify-jwt
// Secrets: ANTHROPIC_API_KEY, PUSH_CRON_SECRET (the same value as the vault secret 'push_cron_secret'); optional DISH_PHOTO_CONTACT.
// Table: photo_review_batches (supabase/schema.sql, "Duyệt ảnh bị báo sai mỗi đêm"); cron: photo-review-submit / photo-review-collect.
//
// The nightly review of photos players reported as wrong ("Ảnh sai?": `photoFlag` on dish_photos.photo and tempt_pool.item), in
// batches so it spends few tokens and never pays twice for the same work. Every request needs the header x-cron-secret; the body
// picks the step:
//
//   {"action":"review-submit"}  (pg_cron every 5 minutes from 02:00 to 02:55 Asia/Ho_Chi_Minh; {"final":true} submits at once)
//     1. Collect (no AI): every row with photoFlag (and rows this review left without a photo whose retryAfter passed), one task per
//        row (`dish:<key>` / `pool:<id>`), rows whose photo was replaced since the report skipped, rows already in an unfinished batch
//        skipped; grouped by normalised dish name (one search and one check per name). At most photo_review.max_dishes names a night.
//     2. Candidates, cheapest first: the free photo libraries (Wikimedia / Openverse, files named after the dish), never a picture on
//        the rows' `bad` lists; the web only for names still without a candidate, unless searched in the last 30 days and not reported
//        since: one synchronous Sonnet 5.5 request per 5 names, one search per name (web_search max_uses = names), each page's
//        preview picture taken. Up to 3 candidates per name. A name with no candidate anywhere is decided at once (no photo).
//        Each call gathers up to GATHER_PER_CALL names into tonight's draft row; the call that finds nothing more to gather (or the
//        caps, or a draft older than 45 minutes) submits it:
//     3. One Message Batches job (50% off) of grouped vision requests: 10 names x <=3 candidates per request, each picture (a
//        512 px Wikimedia thumbnail when there is one) after a line "[D03-C2] <dish> (<description>)", the fixed instruction first
//        and cached, the answer a JSON array {id, verdict, confidence} (structured outputs). custom_id rp-<night>-<nn>; the label
//        map (label -> name key, candidate) stays in the row and is the only way an answer is read back.
//   {"action":"review-collect"}  (pg_cron hourly at :25): for each submitted batch that ended, the answers mapped back by label
//        (unknown labels ignored, missing ones = looked at again next night), the cost of the results' usage at batch prices logged
//        as system cost (tempt_pool_add_cost). Haiku 5.5's answers with confidence 50-80 (and no sure "exact") go to a second Sonnet
//        5.5 batch when the night's dollars allow (else they count as they are); then only an "exact" >= 70 is taken. Accepted: the
//        new photo is set, the flag cleared, the old picture and the rejected candidates added to the row's bad list. Nothing
//        accepted: the photo is removed (the app shows the emoji) with a retryAfter. A row changed since it was collected is left.
//   {"action":"review-status"}: the batches of the last nights.
// Options of review-submit (kept on the draft, so the cron's later calls on the same draft go on with them):
//   "include":"needPhoto"   also pool items that never had a photo (tempt-me `expand`'s new dishes), after the reported ones; their
//                           source page's preview picture is a free first candidate. While gathering, the call holds tempt-me's
//                           picture lock (tempt_pool_claim_photos), so no rephoto / backfill / expand photo step runs at the same
//                           time (lock busy: only reported rows this call); an item that got a photo meanwhile is left as it is.
//   "maxDishes":300, "maxUsd":3   caps of this run instead of ai_settings (dishes 1-1000, dollars 0-20).
//   "again":true            a second run the same night (e.g. to clear a backlog); "final":true submits what is gathered now.
// Caps: ai_settings photo_review.max_dishes (default 100) and photo_review.max_usd (default 1, web searches + both batches), plus
// the global AI_DAILY_BUDGET_USD (systemAllowance). Pure logic: _shared/photoReview.ts.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, runAiCall, systemAllowance } from '../_shared/ai.ts';
import { cachePhotoValue, cleanDishPhoto, cleanDishPhotoRequest, coreDishName, dishKey, englishHint } from '../_shared/dishPhoto.ts';
import { findCandidates, imageBlockOf, LOOKUP_BUDGET_MS, within, type ImageBlock } from '../_shared/dishPhotoLookup.ts';
import { genericPictureUrl, PHOTO_CHECK_VERSION, specificPage } from '../_shared/photoMatch.ts';
import {
  answersOf,
  BAD_KEEP_DISH,
  BAD_KEEP_POOL,
  batchCostUsd,
  CANDIDATES_PER_DISH,
  capsWith,
  cleanReviewPages,
  collectTasks,
  decide,
  estimateVerifyUsd,
  estimateWebUsd,
  firstPass,
  groupSubjects,
  mapAnswers,
  markerAfter,
  mergeBad,
  needsSecond,
  nightOf,
  pickForTasks,
  pictureKey,
  planRequests,
  readMarker,
  REVIEW_MODEL,
  REVIEW_WEB_SYSTEM,
  REVIEW_WEB_TOOL,
  reviewCaps,
  reviewParams,
  reviewWebPrompt,
  SECOND_MODEL,
  SETTING_MAX_DISHES,
  SETTING_MAX_USD,
  smallThumbUrl,
  verdictKey,
  WEB_DISHES_PER_REQUEST,
  WEB_MODEL,
  webAllowed,
  withinBudget,
  dishTask,
  poolTask,
  type BatchUsage,
  type LabelMap,
  type ReviewCandidate,
  type ReviewSubject,
  type ReviewTask,
  type Verdict,
} from '../_shared/photoReview.ts';
import { cronBody, systemContext, systemRecord } from '../_shared/systemJobs.ts';
import { cleanStoredPoolItem, unflagged, withFoundPhoto, withNoPhoto, withoutPhoto, type TemptPoolItem } from '../_shared/tempt.ts';
import { anthropicHeaders } from '../_shared/usage.ts';
import { pagePhoto, type PageFetch } from '../_shared/webImage.ts';
import { seenInEvidence, webToolsFor } from '../_shared/webtools.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const BATCHES_URL = 'https://api.anthropic.com/v1/messages/batches';
const TABLE = 'photo_review_batches';

/** Names gathered per submit call, the time after which no new web request is started, a draft's longest gathering. */
const GATHER_PER_CALL = 15;
const GATHER_WEB_MS = 80_000;
const DRAFT_MAX_MS = 45 * 60_000;
/** A row lock is trusted this long (one submit / collect works on a row at a time). */
const LOCK_MS = 4 * 60_000;
/** tempt-me's picture lock (tempt_pool_claim_photos) is trusted this long; a gathering call takes well under it. */
const PHOTOS_LOCK_MS = 3 * 60_000;
/** The first custom_id number of the second (Sonnet) batch of a night. */
const SECOND_START = 51;
/** A submitted batch that has not ended after this long is given up (the API expires it after 24 h). */
const BATCH_GIVE_UP_MS = 26 * 3_600_000;

type BatchRow = {
  id: string;
  night: string;
  stage: 'haiku' | 'sonnet';
  status: 'gathering' | 'submitted' | 'applied' | 'failed';
  model: string;
  batch_id: string | null;
  subjects: ReviewSubject[];
  labels: LabelMap;
  first_verdicts: Record<string, Verdict> | null;
  options: { include?: string; maxDishes?: number; maxUsd?: number } | null;
  web_cost_usd: number;
  est_usd: number;
  cost_usd: number;
  created_at: string;
  submitted_at: string | null;
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const describe = (name: string) => englishHint(coreDishName(name));
const keyOf = (name: string) => dishKey(coreDishName(name));

/** Runs `fn` over `list`, `limit` at a time. */
async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i], i);
      }
    })
  );
  return out;
}

// ----- the table -----

async function loadCaps(admin: SupabaseClient) {
  const { data } = await admin.from('ai_settings').select('key,value').in('key', [SETTING_MAX_DISHES, SETTING_MAX_USD]);
  return reviewCaps(data ?? []);
}

/** Dollars of a night so far: the web searches, and each batch's actual cost once applied (its estimate before). */
async function spentOn(admin: SupabaseClient, night: string): Promise<number> {
  const { data } = await admin.from(TABLE).select('status,web_cost_usd,est_usd,cost_usd').eq('night', night);
  return (data ?? []).reduce((sum, r) => sum + Number(r.web_cost_usd ?? 0) + Number(r.status === 'applied' ? r.cost_usd ?? 0 : r.est_usd ?? 0), 0);
}

/** Tasks in a batch that is not finished (gathering or submitted): not collected again. */
async function busyTasks(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin.from(TABLE).select('subjects').in('status', ['gathering', 'submitted']);
  const out = new Set<string>();
  for (const r of data ?? []) for (const s of (r.subjects ?? []) as ReviewSubject[]) for (const t of s.tasks ?? []) out.add(t.id);
  return out;
}

/** Takes a row's lock (one UPDATE with the condition), false when another call holds it. */
async function lock(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await admin
    .from(TABLE)
    .update({ locked_at: new Date().toISOString() })
    .eq('id', id)
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - LOCK_MS).toISOString()}`)
    .select('id');
  return (data ?? []).length > 0;
}
const unlock = (admin: SupabaseClient, id: string) => admin.from(TABLE).update({ locked_at: null }).eq('id', id);

async function loadRows(admin: SupabaseClient, includeNeed: boolean) {
  const poolFilter = `item->>photoFlag.not.is.null,item->photoReview->>retryAfter.not.is.null${includeNeed ? ',item->>imageUrl.is.null' : ''}`;
  const [dish, pool] = await Promise.all([
    admin.from('dish_photos').select('dish_key,name,photo').like('dish_key', 'v2:%').or('photo->>photoFlag.not.is.null,photo->photoReview->>retryAfter.not.is.null').limit(3000),
    admin.from('tempt_pool').select('id,item').or(poolFilter).order('created_at', { ascending: true }).limit(3000),
  ]);
  if (dish.error) console.warn('[photo-review] dish_photos not read:', JSON.stringify(dish.error));
  if (pool.error) console.warn('[photo-review] tempt_pool not read:', JSON.stringify(pool.error));
  return { dishRows: (dish.data ?? []) as { dish_key: string; name: string | null; photo: unknown }[], poolRows: (pool.data ?? []) as { id: string; item: unknown }[] };
}

// ----- the Message Batches API -----

async function createBatch(requests: { custom_id: string; params: Record<string, unknown> }[]): Promise<{ id: string } | { error: string }> {
  try {
    const response = await fetch(BATCHES_URL, {
      method: 'POST',
      headers: anthropicHeaders(ANTHROPIC_API_KEY!, Deno.env.get('AI_WORKSPACE_ID')),
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    if (!response.ok) return { error: `batch not created (${response.status}): ${text.slice(0, 300)}` };
    const id = (JSON.parse(text) as { id?: unknown }).id;
    return typeof id === 'string' ? { id } : { error: 'batch created without an id' };
  } catch (error) {
    return { error: `batch not created: ${error instanceof Error ? error.message : 'network'}` };
  }
}

async function getBatch(id: string): Promise<{ processing_status: string; results_url: string | null } | null> {
  try {
    const response = await fetch(`${BATCHES_URL}/${encodeURIComponent(id)}`, { headers: anthropicHeaders(ANTHROPIC_API_KEY!, Deno.env.get('AI_WORKSPACE_ID')), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      console.warn('[photo-review] batch not read', id, response.status, (await response.text()).slice(0, 200));
      return null;
    }
    return (await response.json()) as { processing_status: string; results_url: string | null };
  } catch (error) {
    console.warn('[photo-review] batch not read', id, error instanceof Error ? error.message : error);
    return null;
  }
}

/** The results (JSONL, in any order), or null when they could not be read. */
async function batchResults(url: string): Promise<Record<string, unknown>[] | null> {
  try {
    const response = await fetch(url, { headers: anthropicHeaders(ANTHROPIC_API_KEY!, Deno.env.get('AI_WORKSPACE_ID')), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const out: Record<string, unknown>[] = [];
    for (const line of (await response.text()).split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // a broken line: its labels count as missing
      }
    }
    return out;
  } catch {
    return null;
  }
}

// ----- candidates -----

/** A picture as an image block for the model: a smaller copy when the source has one, else the picture itself; null when neither
 *  loads. */
async function blockFor(url: string): Promise<ImageBlock | null> {
  const small = smallThumbUrl(url);
  const first = await within(imageBlockOf(small), 9000, null);
  if (first || small === url) return first;
  return within(imageBlockOf(url), 9000, null);
}

type Gathered = { ready: ReviewSubject[]; none: ReviewSubject[]; failed: number; webCost: number; webRequests: number; budgetStop: boolean };

/** Candidates for `subjects`: the libraries first, then (names still without any, when allowed) the web; see the header. */
async function gather(admin: SupabaseClient, subjects: ReviewSubject[], now: Date, budget: { spent: number; maxUsd: number }): Promise<Gathered> {
  const started = Date.now();
  const out: Gathered = { ready: [], none: [], failed: 0, webCost: 0, webRequests: 0, budgetStop: false };
  const complete = new Map<string, boolean>();
  // 0. A new pool item's own source page: its preview picture (free).
  await mapLimit(
    subjects.filter((s) => s.tasks.some((t) => t.sourceUrl)),
    5,
    async (s) => {
      const bad = new Set(s.bad);
      for (const t of s.tasks) {
        if (!t.sourceUrl || s.candidates.length >= CANDIDATES_PER_DISH) continue;
        const p = await within(pagePhoto(t.sourceUrl, fetch as unknown as PageFetch), 9000, null);
        const key = p ? pictureKey(p.url) : '';
        if (!p || !key || genericPictureUrl(p.url) || bad.has(key) || s.candidates.some((c) => pictureKey(c.url) === key)) continue;
        s.candidates.push({ url: p.url, sourceUrl: p.pageUrl, author: p.credit, license: '', source: 'web' });
      }
    }
  );
  // 1. The photo libraries (free).
  await mapLimit(subjects, 5, async (s) => {
    const dish = cleanDishPhotoRequest({ dishes: [{ name: s.name }] })?.[0];
    if (!dish) {
      complete.set(s.key, true);
      return;
    }
    const found = await within(findCandidates(dish, new Set(s.bad)), LOOKUP_BUDGET_MS, { candidates: [], complete: false });
    complete.set(s.key, found.complete);
    const own = new Set(s.candidates.map((c) => pictureKey(c.url)));
    const lib = found.candidates.filter((c) => !own.has(pictureKey(c.url))).map(({ url, sourceUrl, author, license, source, title }) => ({ url, sourceUrl, author, license, source, title }));
    s.candidates = [...s.candidates, ...lib].slice(0, CANDIDATES_PER_DISH);
  });
  // 2. The web, for names no library has a candidate for (one search each, WEB_DISHES_PER_REQUEST names per request).
  const webTodo = subjects.filter((s) => s.candidates.length === 0 && webAllowed(s, now));
  const webFailed = new Set<string>();
  const groups = Array.from({ length: Math.ceil(webTodo.length / WEB_DISHES_PER_REQUEST) }, (_, g) => webTodo.slice(g * WEB_DISHES_PER_REQUEST, (g + 1) * WEB_DISHES_PER_REQUEST));
  const ctx = systemContext(admin);
  const record = systemRecord(admin, 'photo-review web');
  await mapLimit(groups, 3, async (group) => {
    const est = estimateWebUsd(group.length);
    if (Date.now() - started > GATHER_WEB_MS || !withinBudget(budget.spent + out.webCost, est, budget.maxUsd)) {
      if (Date.now() - started <= GATHER_WEB_MS) out.budgetStop = true;
      group.forEach((s) => webFailed.add(s.key));
      return;
    }
    // Counted as spent while it runs, so groups at the same time respect the cap; the real cost replaces it.
    out.webCost += est;
    let real = 0;
    const outcome = await runAiCall(
      ctx,
      'dishphoto',
      {
        tool: REVIEW_WEB_TOOL,
        system: REVIEW_WEB_SYSTEM,
        maxTokens: 3000,
        attemptTimeoutMs: 90_000,
        messages: [{ role: 'user', content: `<request>${reviewWebPrompt(group.map((s) => s.name))}</request>` }],
        serverTools: (model: string) => webToolsFor(model, { maxSearches: group.length, maxFetches: 0 }),
      },
      {
        model: WEB_MODEL,
        record: async (usage, costUsd, model) => {
          real = costUsd;
          await record(usage, costUsd, model);
        },
      }
    );
    out.webCost += real - est;
    out.webRequests += 1;
    if ('error' in outcome) {
      console.warn('[photo-review] web search failed:', outcome.error);
      group.forEach((s) => webFailed.add(s.key));
      return;
    }
    const evidence = outcome.web?.evidence;
    const pages = cleanReviewPages(outcome.input, group.length, (url) => specificPage(url) && !!evidence && seenInEvidence(url, evidence));
    await Promise.all(
      group.map(async (s, n) => {
        s.web = true;
        const bad = new Set(s.bad);
        const photos = await Promise.all(pages[n].map((p) => within(pagePhoto(p, fetch as unknown as PageFetch), 9000, null)));
        for (const p of photos) {
          const key = p ? pictureKey(p.url) : '';
          if (!p || !key || genericPictureUrl(p.url) || bad.has(key) || s.candidates.some((c) => pictureKey(c.url) === key)) continue;
          s.candidates.push({ url: p.url, sourceUrl: p.pageUrl, author: p.credit, license: '', source: 'web' });
          if (s.candidates.length >= CANDIDATES_PER_DISH) break;
        }
      })
    );
  });
  // 3. Ready for the check, decided now (nothing anywhere, every search answered), or left for the next night.
  for (const s of subjects) {
    if (s.candidates.length > 0) out.ready.push(s);
    else if (complete.get(s.key) && !webFailed.has(s.key)) out.none.push(s);
    else out.failed += 1;
  }
  out.webCost = round6(out.webCost);
  return out;
}

// ----- applying a decision -----

type Tally = { accepted: number; removed: number; retry: number; changed: number; second: number };
const emptyTally = (): Tally => ({ accepted: 0, removed: 0, retry: 0, changed: 0, second: 0 });

/** Writes one task's outcome (`photo` null: no photo), when its row still is as it was collected. */
async function applyTask(admin: SupabaseClient, s: ReviewSubject, t: ReviewTask, photo: ReviewCandidate | null, rejected: string[], now: Date): Promise<'done' | 'changed'> {
  const reported = t.picture ? [pictureKey(t.picture)] : [];
  if (t.kind === 'dish') {
    const { data } = await admin.from('dish_photos').select('dish_key,name,photo').eq('dish_key', `v2:${t.ref}`).maybeSingle();
    const still = data ? dishTask(data as { dish_key: string; name: string | null; photo: unknown }, now) : null;
    if (!still || still.picture !== t.picture) return 'changed';
    const old = data!.photo as Record<string, unknown>;
    const info = photo ? cleanDishPhoto(photo) : null;
    const bad = mergeBad(old.bad, [...rejected, ...reported], BAD_KEEP_DISH);
    const marker = markerAfter(readMarker(old), now, { web: s.web, found: !!info, webAllowed: webAllowed(s, now) });
    const value = { ...cachePhotoValue(info, s.web || info?.source === 'web' || old.web === true, bad), photoReview: marker };
    const { error } = await admin.from('dish_photos').update({ photo: value, checked_at: now.toISOString() }).eq('dish_key', `v2:${t.ref}`);
    if (error) throw new Error(`dish_photos not written: ${error.message}`);
    return 'done';
  }
  const { data } = await admin.from('tempt_pool').select('id,item').eq('id', t.ref).maybeSingle();
  // Still as collected (an item tempt-me gave a photo meanwhile is no longer "needs a photo": left as it is).
  const still = data ? poolTask(data as { id: string; item: unknown }, now, t.need === true) : null;
  const item = data ? cleanStoredPoolItem(data.item) : null;
  if (!still || !item || still.picture !== t.picture) return 'changed';
  const base: TemptPoolItem = unflagged(item.imageUrl ? withoutPhoto(item) : item);
  if (t.sourceUrl) base.imageChecked = true;
  base.badPhotos = mergeBad(base.badPhotos, [...rejected, ...reported], BAD_KEEP_POOL);
  const marker = markerAfter(readMarker(data!.item), now, { web: s.web, found: !!photo, webAllowed: webAllowed(s, now) });
  const next: TemptPoolItem = { ...(photo ? withFoundPhoto(base, photo) : withNoPhoto(base)), photoAudit: PHOTO_CHECK_VERSION, photoReview: { ...marker } };
  delete next.photoAuditFails;
  const { error } = await admin.from('tempt_pool').update({ item: next }).eq('id', t.ref);
  if (error) throw new Error(`tempt_pool not written: ${error.message}`);
  return 'done';
}

/** Applies a subject's decision to each of its rows: the accepted candidates shared out (pickForTasks), else no photo. */
async function applySubject(
  admin: SupabaseClient,
  s: ReviewSubject,
  d: { state: 'accept' | 'none' | 'retry'; ranked: number[]; rejected: number[] },
  poolTaken: Set<string>,
  now: Date,
  tally: Tally
): Promise<void> {
  if (d.state === 'retry') {
    tally.retry += s.tasks.length;
    return;
  }
  const ranked = d.ranked.map((c) => ({ c, key: pictureKey(s.candidates[c]?.url) })).filter((x) => x.key);
  const picks = pickForTasks(s.tasks, ranked, poolTaken);
  const rejected = d.rejected.map((c) => pictureKey(s.candidates[c]?.url)).filter(Boolean);
  for (const t of s.tasks) {
    const c = picks.get(t.id);
    const photo = c === null || c === undefined ? null : (s.candidates[c] ?? null);
    try {
      const done = await applyTask(admin, s, t, photo, rejected, now);
      if (done === 'changed') tally.changed++;
      else if (photo) tally.accepted++;
      else tally.removed++;
    } catch (error) {
      console.warn('[photo-review] not applied', t.id, error instanceof Error ? error.message : error);
      tally.retry++;
    }
  }
}

/** Picture keys every pool item shows now (a pool item never takes another one's picture). */
async function poolPictures(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin.from('tempt_pool').select('item').limit(5000);
  const out = new Set<string>();
  for (const r of data ?? []) {
    const k = pictureKey((r.item as Record<string, unknown> | null)?.imageUrl);
    if (k) out.add(k);
  }
  return out;
}

// ----- building a batch -----

/** The requests for `subjects` (only the candidates `which` lets through), each picture loaded; null when no picture loaded. */
async function buildRequests(
  subjects: ReviewSubject[],
  night: string,
  model: string,
  effort: 'low' | 'medium',
  which: (s: ReviewSubject) => number[],
  start: number
): Promise<{ requests: { custom_id: string; params: Record<string, unknown> }[]; labels: LabelMap; images: number } | null> {
  const wanted = subjects.flatMap((s) => which(s).map((c) => ({ s, c, url: s.candidates[c]?.url })).filter((x) => !!x.url));
  const blocks = new Map<string, ImageBlock>();
  await mapLimit(wanted, 12, async (x) => {
    const block = await blockFor(x.url!);
    if (block) blocks.set(verdictKey(x.s.key, x.c), block);
  });
  const shown = subjects.map((s) => ({ key: s.key, cands: which(s).filter((c) => blocks.has(verdictKey(s.key, c))).map((c) => ({ c, url: s.candidates[c].url })) }));
  const plans = planRequests(shown, night, { start });
  if (plans.length === 0) return null;
  const byKey = new Map(subjects.map((s) => [s.key, s]));
  const requests = plans.map((p) => ({
    custom_id: p.customId,
    params: reviewParams(
      model,
      p.items.map((it) => ({ label: it.label, name: byKey.get(it.s)!.name, desc: byKey.get(it.s)!.desc, image: blocks.get(verdictKey(it.s, it.c)) })),
      effort
    ),
  }));
  return { requests, labels: Object.fromEntries(plans.map((p) => [p.customId, p.labels])), images: plans.reduce((n, p) => n + p.items.length, 0) };
}

/** Submits a gathering draft as the night's first (Haiku) batch. */
async function finalizeDraft(admin: SupabaseClient, draft: BatchRow): Promise<Record<string, unknown>> {
  const all = (s: ReviewSubject) => s.candidates.map((_, i) => i);
  const built = draft.subjects.length > 0 ? await buildRequests(draft.subjects, draft.night, REVIEW_MODEL, 'low', all, 1) : null;
  if (!built) {
    await admin.from(TABLE).update({ status: 'applied', ended_at: new Date().toISOString(), summary: { empty: true, subjects: draft.subjects.length } }).eq('id', draft.id);
    return { submitted: false, empty: true };
  }
  const created = await createBatch(built.requests);
  if ('error' in created) {
    console.warn('[photo-review]', created.error);
    return { submitted: false, error: created.error };
  }
  const est = estimateVerifyUsd(built.images, REVIEW_MODEL, built.requests.length);
  await admin
    .from(TABLE)
    .update({ status: 'submitted', batch_id: created.id, labels: built.labels, est_usd: est, submitted_at: new Date().toISOString() })
    .eq('id', draft.id);
  return { submitted: true, batchId: created.id, requests: built.requests.length, images: built.images, estUsd: est };
}

// ----- the steps -----

async function submitStep(admin: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const now = new Date();
  const night = nightOf(now);
  const allowed = await systemAllowance(admin);
  if (!allowed.ok) return jsonResponse({ error: allowed.error }, allowed.status);
  const saved = await loadCaps(admin);

  // Tonight's draft (or an older one never submitted).
  const { data: drafts, error: draftError } = await admin.from(TABLE).select('*').eq('status', 'gathering').eq('stage', 'haiku').order('created_at', { ascending: false }).limit(1);
  if (draftError) return jsonResponse({ error: `${TABLE} not read (run supabase/schema.sql): ${draftError.message}` }, 503);
  let draft = (drafts?.[0] ?? null) as BatchRow | null;
  const asked = {
    ...(body.include === 'needPhoto' ? { include: 'needPhoto' } : {}),
    ...(body.maxDishes !== undefined ? { maxDishes: Number(body.maxDishes) } : {}),
    ...(body.maxUsd !== undefined ? { maxUsd: Number(body.maxUsd) } : {}),
  };
  if (!draft) {
    const { data: tonight } = await admin.from(TABLE).select('id,status,batch_id').eq('night', night).eq('stage', 'haiku').order('created_at', { ascending: false }).limit(1);
    if (tonight?.[0] && body.again !== true) return jsonResponse({ step: 'submit', night, done: true, already: tonight[0].status, batchId: tonight[0].batch_id });
    const { data: created, error } = await admin.from(TABLE).insert({ night, stage: 'haiku', model: REVIEW_MODEL, status: 'gathering', options: asked }).select('*').single();
    if (error || !created) return jsonResponse({ busy: true, error: error?.message ?? 'draft not created' }, 409);
    draft = created as BatchRow;
  } else if (Object.keys(asked).length > 0) {
    // A call's own options replace the draft's (kept for the later calls on it).
    draft = { ...draft, options: { ...(draft.options ?? {}), ...asked } };
    await admin.from(TABLE).update({ options: draft.options }).eq('id', draft.id);
  }
  const caps = capsWith(saved, draft.options);
  if (!(await lock(admin, draft.id))) return jsonResponse({ busy: true, error: 'Another review call is working; try again in a few minutes.' }, 409);
  // New pool items: only while holding tempt-me's picture lock (no rephoto / backfill / expand photo step at the same time).
  let includeNeed = draft.options?.include === 'needPhoto';
  let photosLocked = false;
  if (includeNeed) {
    const { data: claimed } = await admin.rpc('tempt_pool_claim_photos', { p_running_before: new Date(Date.now() - PHOTOS_LOCK_MS).toISOString() });
    photosLocked = claimed === true;
    includeNeed = photosLocked;
  }
  try {
    const subjects = (draft.subjects ?? []) as ReviewSubject[];
    const inDraft = new Set(subjects.map((s) => s.key));
    const { dishRows, poolRows } = await loadRows(admin, includeNeed);
    const tasks = collectTasks(dishRows, poolRows, await busyTasks(admin), now, describe, { includeNeed });
    const pending = groupSubjects(tasks, keyOf).filter((s) => !inDraft.has(s.key));
    const room = Math.max(0, caps.maxDishes - subjects.length);
    const chunk = pending.slice(0, Math.min(room, GATHER_PER_CALL));
    const spent = await spentOn(admin, draft.night);
    const draftEst = estimateVerifyUsd(subjects.reduce((n, s) => n + s.candidates.length, 0), REVIEW_MODEL);
    const got = chunk.length > 0 ? await gather(admin, chunk, now, { spent: spent - Number(draft.est_usd ?? 0) + draftEst, maxUsd: caps.maxUsd }) : null;

    // Names with no candidate anywhere: no photo now (the emoji), looked at again after retryAfter.
    const tally = emptyTally();
    const poolTaken = got && got.none.length > 0 ? await poolPictures(admin) : new Set<string>();
    for (const s of got?.none ?? []) await applySubject(admin, s, { state: 'none', ranked: [], rejected: [] }, poolTaken, now, tally);

    const nextSubjects = [...subjects, ...(got?.ready ?? [])];
    const webCost = round6(Number(draft.web_cost_usd ?? 0) + (got?.webCost ?? 0));
    const estUsd = estimateVerifyUsd(nextSubjects.reduce((n, s) => n + s.candidates.length, 0), REVIEW_MODEL);
    await admin.from(TABLE).update({ subjects: nextSubjects, web_cost_usd: webCost, est_usd: estUsd }).eq('id', draft.id);
    draft = { ...draft, subjects: nextSubjects, web_cost_usd: webCost, est_usd: estUsd };

    const remaining = Math.min(pending.length - chunk.length + (got?.failed ?? 0), Math.max(0, room - chunk.length));
    const old = Date.now() - Date.parse(draft.created_at) > DRAFT_MAX_MS;
    const final = body.final === true || pending.length <= chunk.length || room <= chunk.length || old || !!got?.budgetStop;
    const submitted = final ? await finalizeDraft(admin, draft) : null;
    return jsonResponse({
      step: 'submit',
      night: draft.night,
      gathered: got?.ready.length ?? 0,
      noPhoto: tally.removed,
      changed: tally.changed,
      failed: got?.failed ?? 0,
      webRequests: got?.webRequests ?? 0,
      webCostUsd: got?.webCost ?? 0,
      inDraft: nextSubjects.length,
      remaining,
      caps,
      ...(draft.options?.include === 'needPhoto' ? { needPhoto: includeNeed, ...(includeNeed ? {} : { photosBusy: true }) } : {}),
      ...(submitted ?? {}),
      done: final && !!submitted && submitted.error === undefined,
    });
  } finally {
    if (photosLocked) await admin.from('tempt_pool_meta').update({ photos_started_at: null }).eq('id', 1);
    await unlock(admin, draft.id);
  }
}

/** Submits the second (Sonnet) look at the unsure answers of a Haiku batch; false when it could not. */
async function submitSecond(admin: SupabaseClient, row: BatchRow, subjects: ReviewSubject[], first: Map<string, Verdict>): Promise<boolean> {
  const unsureOf = (s: ReviewSubject) => firstPass(s.candidates.map((_, i) => first.get(verdictKey(s.key, i)))).unsure;
  const built = await buildRequests(subjects, row.night, SECOND_MODEL, 'medium', unsureOf, SECOND_START);
  if (!built) return false;
  const created = await createBatch(built.requests);
  if ('error' in created) {
    console.warn('[photo-review] second batch:', created.error);
    return false;
  }
  const keep: Record<string, Verdict> = {};
  for (const s of subjects) s.candidates.forEach((_, i) => {
    const v = first.get(verdictKey(s.key, i));
    if (v) keep[verdictKey(s.key, i)] = v;
  });
  const { error } = await admin.from(TABLE).insert({
    night: row.night,
    stage: 'sonnet',
    model: SECOND_MODEL,
    status: 'submitted',
    batch_id: created.id,
    subjects,
    labels: built.labels,
    first_verdicts: keep,
    parent: row.id,
    options: row.options ?? {},
    est_usd: estimateVerifyUsd(built.images, SECOND_MODEL, built.requests.length),
    submitted_at: new Date().toISOString(),
  });
  if (error) console.warn('[photo-review] second batch row not saved:', error.message);
  return !error;
}

/** Applies one ended batch. */
async function collectRow(admin: SupabaseClient, row: BatchRow, now: Date, maxUsd: number): Promise<Record<string, unknown>> {
  const batch = await getBatch(row.batch_id!);
  if (!batch) return { id: row.id, state: 'unreadable' };
  if (batch.processing_status !== 'ended') {
    if (row.submitted_at && now.getTime() - Date.parse(row.submitted_at) > BATCH_GIVE_UP_MS) {
      await admin.from(TABLE).update({ status: 'failed', error: 'not ended after 26 h', ended_at: now.toISOString() }).eq('id', row.id);
      return { id: row.id, state: 'given up' };
    }
    return { id: row.id, stage: row.stage, state: batch.processing_status };
  }
  const results = batch.results_url ? await batchResults(batch.results_url) : null;
  if (!results) return { id: row.id, state: 'results not read' };

  const verdicts = new Map<string, Verdict>();
  const usage = { input_tokens: 0, output_tokens: 0 };
  let cost = 0;
  const counts: Record<string, number> = {};
  for (const r of results) {
    const customId = typeof r.custom_id === 'string' ? r.custom_id : '';
    const result = (r.result ?? {}) as { type?: string; message?: { usage?: BatchUsage } };
    counts[result.type ?? '?'] = (counts[result.type ?? '?'] ?? 0) + 1;
    if (result.type !== 'succeeded' || !result.message) continue;
    const u = result.message.usage ?? {};
    cost += batchCostUsd(u, row.model);
    usage.input_tokens += Number(u.input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0) + Number(u.cache_read_input_tokens ?? 0);
    usage.output_tokens += Number(u.output_tokens ?? 0);
    for (const [k, v] of mapAnswers(customId, answersOf(result.message), row.labels ?? {})) verdicts.set(k, v);
  }
  cost = round6(cost);
  await systemRecord(admin, 'photo-review batch')(usage, cost, row.model);

  const tally = emptyTally();
  const poolTaken = await poolPictures(admin);
  const subjects = (row.subjects ?? []) as ReviewSubject[];
  const firstOf = (s: ReviewSubject, from: Map<string, Verdict>) => s.candidates.map((_, i) => from.get(verdictKey(s.key, i)));
  if (row.stage === 'haiku') {
    let toSecond = subjects.filter((s) => needsSecond(firstOf(s, verdicts)));
    if (toSecond.length > 0) {
      const unsure = toSecond.reduce((n, s) => n + firstPass(firstOf(s, verdicts)).unsure.length, 0);
      const spent = (await spentOn(admin, row.night)) - Number(row.est_usd ?? 0) + cost;
      const sent = withinBudget(spent, estimateVerifyUsd(unsure, SECOND_MODEL), maxUsd) && (await submitSecond(admin, row, toSecond, verdicts));
      if (sent) tally.second = toSecond.length;
      else toSecond = [];
    }
    const waiting = new Set(toSecond.map((s) => s.key));
    for (const s of subjects) if (!waiting.has(s.key)) await applySubject(admin, s, decide(firstOf(s, verdicts), null), poolTaken, now, tally);
  } else {
    const first = new Map(Object.entries(row.first_verdicts ?? {}));
    for (const s of subjects) {
      const f = firstOf(s, first);
      const second = new Map(firstPass(f).unsure.map((i) => [i, verdicts.get(verdictKey(s.key, i))] as const));
      await applySubject(admin, s, decide(f, second), poolTaken, now, tally);
    }
  }
  const summary = { results: counts, verdicts: verdicts.size, ...tally };
  await admin.from(TABLE).update({ status: 'applied', cost_usd: cost, ended_at: now.toISOString(), summary }).eq('id', row.id);
  return { id: row.id, stage: row.stage, state: 'applied', costUsd: cost, ...summary };
}

async function collectStep(admin: SupabaseClient): Promise<Response> {
  const now = new Date();
  const { data, error } = await admin.from(TABLE).select('*').eq('status', 'submitted').order('created_at').limit(4);
  if (error) return jsonResponse({ error: `${TABLE} not read (run supabase/schema.sql): ${error.message}` }, 503);
  const caps = await loadCaps(admin);
  const out: Record<string, unknown>[] = [];
  for (const row of (data ?? []) as BatchRow[]) {
    if (!row.batch_id || !(await lock(admin, row.id))) continue;
    try {
      out.push(await collectRow(admin, row, now, capsWith(caps, row.options).maxUsd));
    } catch (e) {
      out.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    } finally {
      await unlock(admin, row.id);
    }
  }
  const { count } = await admin.from(TABLE).select('id', { count: 'exact', head: true }).eq('status', 'submitted');
  return jsonResponse({ step: 'collect', batches: out, pending: count ?? null, done: (count ?? 0) === 0 });
}

async function statusStep(admin: SupabaseClient): Promise<Response> {
  const { data, error } = await admin
    .from(TABLE)
    .select('id,night,stage,status,model,batch_id,web_cost_usd,est_usd,cost_usd,summary,error,created_at,submitted_at,ended_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return jsonResponse({ error: error.message }, 503);
  return jsonResponse({ step: 'status', batches: data });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const got = await cronBody(req);
    if (got === null || 'forbidden' in got) return jsonResponse({ error: 'forbidden' }, 401);
    if (Deno.env.get('AI_DISABLED') === '1') return jsonResponse({ error: 'Tính năng AI đang tạm tắt.' }, 503);
    if (!ANTHROPIC_API_KEY) return jsonResponse({ error: 'Server chưa cấu hình ANTHROPIC_API_KEY.' }, 500);
    if (!SERVICE_ROLE_KEY) return jsonResponse({ error: 'Server chưa cấu hình khóa dịch vụ (SUPABASE_SERVICE_ROLE_KEY).' }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const action = got.body.action;
    if (action === 'review-submit') return await submitStep(admin, got.body);
    if (action === 'review-collect') return await collectStep(admin);
    if (action === 'review-status') return await statusStep(admin);
    return jsonResponse({ error: 'Unknown action (expected "review-submit", "review-collect" or "review-status").' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
  }
});
