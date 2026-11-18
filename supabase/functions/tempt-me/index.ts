// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy tempt-me
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The temptation challenge, Hard level: the player switched on a game in which the app now and then tries to tempt them with a food
// or drink that fits right now (local date and time, weekday, city, weather).
//
// 0.26: a shared pool instead of one AI call per pop-up. The items live in the table tempt_pool (shared by every player), each with
// tags for when it fits (_shared/tempt.ts: times of day, weekday / weekend, weather, city, an occasion window). A pop-up picks ONE item
// that fits now and that this player was not shown in the last 30 days (table tempt_shown), random among the best-fitting, and records
// it: no AI call, no quota, no cost. When everything fitting was shown, the one shown longest ago comes back.
// Refill: when fewer than 40 fitting items are left unseen for the player, or the newest item is 30 days old, one request claims the
// refill (one UPDATE of tempt_pool_meta, so two requests never refill at once; at most every 12 h, 2 h when the player has nothing
// left) and makes 4 calls at once (POOL_CHUNKS: one with 2 web searches for what is trending, no fetch; three without the web), ~200
// items in all, deduplicated by name against the pool. The pop-up does not wait for it unless it has nothing to show (the first
// pop-up ever: it waits for the first call that answers); the rest finishes in the background (EdgeRuntime.waitUntil).
// Pictures (0.26.2): every item gets a REAL photo on the server before it is served: a web item its source page's og:image (no
// tokens), any other the dish-photo search (Wikimedia Commons / Openverse, checked by the model, cached in dish_photos; shared code in
// _shared/dishPhotoLookup.ts), saved into the pool row with its credit. An item no real photo shows is marked noPhoto and served
// only when nothing with a photo fits. New items of a refill get theirs right after it; a pop-up that finds items still without a
// picture looks for up to 6 in the background. Never a generated picture. These photo checks are logged on the pool, not a player.
// Seed (0.26.2): POST {"action":"seed"} with the header x-cron-secret = PUSH_CRON_SECRET (no player needed; the gateway still wants
// the anon key as Bearer). Each call does one step and says where it stands ({ total, withPhoto, missingPhoto, remaining, done }):
// first the generation of ~200 items (the refill calls at once), then pictures for up to 30 items per call. Call it until `done`.
// Its cost is added to tempt_pool_meta.system_cost_usd (tempt_pool_add_cost), never to a player's usage or budget.
// 0.26.4: the pool calls and the photo checks / web photo search run on the `tempt` / `photo` model (ai_settings model.tempt /
// model.photo, default claude-haiku-5-5). After the libraries, a web search (3 searches per 8 dishes) finds a page showing the dish
// and its og:image is used; "no photo" only after that.
// Without the tables (schema.sql not run yet) the function answers the old way: one AI call with up to 2 searches and 1 fetch.
// Cost (0.26.7): every refill, even one a player's pop-up started, and all picture work are system work: logged on the pool
// (tempt_pool_meta.system_cost_*, tempt_pool_add_cost), never on the player's ai_usage, quota or daily budget. They are held back
// only by the claim guards (one refill at a time, at most every 12 h / 2 h; one picture job at a time) and by the global daily cap
// AI_DAILY_BUDGET_USD when set (ai_cost_on_day counts the pool's cost of the day). A pop-up from the pool costs $0.
// Calls per user per day: app_settings key `ai_quota.tempt` (default 6) only for the old way below (no pool tables).
// Pictures (1.3.x): the photos were often wrong (generic Wikimedia files, site banners, look-alike dishes). All picture work now runs
// on Sonnet 5.5 (photoMatch.ts REPAIR_MODEL), whatever model.photo says: a source page's picture is judged before it is taken, the
// libraries only offer files named after the dish, the web search reads pages about one dish, and every candidate is judged alone
// (exact / similar / wrong / not food + confidence; only a confident "exact" is kept). Shared code: _shared/dishPhotoLookup.ts.
// Re-photo (1.3.x): POST {"action":"rephoto","limit":6} with the x-cron-secret header audits the pool's pictures step by step
// (rephotoStep), library photos first; call it until `done`. Its cost is pool (system) cost like the seed's.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { jsonResponse, runAiCall, serveAi, systemAllowance, type AiContext } from '../_shared/ai.ts';
import { cleanDishPhotoRequest, type DishPhotoInfo } from '../_shared/dishPhoto.ts';
import { findVerifiedPhotos, verifyUrls, within, type Runner } from '../_shared/dishPhotoLookup.ts';
import { genericPictureUrl, PHOTO_CHECK_VERSION, poolRepairQueue, REPAIR_MODEL, repairDecision, repairLimit, verdictAccepts } from '../_shared/photoMatch.ts';
import { cronBody, inBackground, systemContext, systemRecord, type RecordFn } from '../_shared/systemJobs.ts';
import {
  cleanStoredPoolItem,
  cleanTemptAnswer,
  cleanTemptRequest,
  fitNow,
  newPoolItems,
  pickPoolItem,
  POOL_CHUNKS,
  POOL_SYSTEM,
  POOL_TOOL,
  photoFree,
  photoKey,
  rowsToRepair,
  takenPhotos,
  withoutPhoto,
  needsPhoto,
  MAX_PHOTO_TRIES,
  photoQueue,
  photoStage,
  poolAnswerShape,
  poolItemsOf,
  withWebPhoto,
  POPUP_PHOTOS,
  poolAnswer,
  poolNameKey,
  poolSeedStatus,
  SEED_PHOTOS_PER_CALL,
  seedChunks,
  seedGenerated,
  poolNeedsRefill,
  poolPrompt,
  publicHttpsUrl,
  refillGuards,
  TEMPT_SYSTEM,
  TEMPT_TOOL,
  temptPrompt,
  type PoolChunk,
  type PoolRow,
  type TemptPoolItem,
  type TemptRequest,
  withDishPhoto,
  withOgImage,
} from '../_shared/tempt.ts';
import { pagePhoto, type PageFetch } from '../_shared/webImage.ts';
import { seenInEvidence, webToolsFor } from '../_shared/webtools.ts';

/** The preview picture (og:image) of a page the search found, or null (not HTML, too slow, an unsafe address on the way, none on the
 *  page, the picture not answering as a photo). webImage.ts pagePhoto: redirects followed one by one, every address checked public. */
async function ogImageOf(pageUrl: string): Promise<string | null> {
  const url = publicHttpsUrl(pageUrl);
  if (!url) return null;
  const photo = await within(pagePhoto(url, fetch as unknown as PageFetch, 5000), 11_000, null);
  return photo && publicHttpsUrl(photo.url) ? photo.url : null;
}

const POOL = 'tempt_pool';
const SHOWN = 'tempt_shown';
const META = 'tempt_pool_meta';
/** Time one refill call may take (it writes ~50 items); the platform stops a function at 150 s (400 s on paid plans). */
const REFILL_CALL_MS = 120_000;
/** Names of the pool sent to a refill call as "already there" (the newest). */
const KNOWN_NAMES_SENT = 300;
/** Time a seed call's picture step may take, and the background picture work after a refill / a pop-up. */
const SEED_PHOTOS_BUDGET_MS = 100_000;
const REFILL_PHOTOS_BUDGET_MS = 40_000;
/** A picture backfill is trusted to be running for this long (only one at a time). */
const PHOTOS_RUNNING_MS = 3 * 60_000;
type Record_ = RecordFn;

const toRows = (data: unknown): PoolRow[] =>
  ((data ?? []) as { id: string; item: unknown; created_at: string }[]).flatMap((r) => {
    const item = cleanStoredPoolItem(r.item);
    return item ? [{ id: r.id, item, createdAt: r.created_at }] : [];
  });

/** The whole pool (newest first) and this player's showings (none without a player), or null when the tables are not there yet. */
async function loadPool(admin: SupabaseClient, userId: string | null): Promise<{ rows: PoolRow[]; shown: Map<string, string> } | null> {
  const [pool, shownRows] = await Promise.all([
    admin.from(POOL).select('id,item,created_at').order('created_at', { ascending: false }).limit(3000),
    userId ? admin.from(SHOWN).select('pool_id,shown_at').eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (pool.error || shownRows.error) {
    console.warn('[tempt-me] pool not read:', JSON.stringify(pool.error ?? shownRows.error));
    return null;
  }
  const shown = new Map<string, string>();
  for (const r of (shownRows.data ?? []) as { pool_id: string; shown_at: string }[]) shown.set(r.pool_id, r.shown_at);
  return { rows: toRows(pool.data), shown };
}

/** Claims the refill (tempt_pool_claim_refill: one UPDATE of the meta row with the guards as conditions, so only one request gets it).
 *  False when someone else is refilling, or the last refill is too recent. */
async function claimRefill(admin: SupabaseClient, g: { runningBefore: string; doneBefore: string; failedBefore: string }): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('tempt_pool_claim_refill', { p_running_before: g.runningBefore, p_done_before: g.doneBefore, p_failed_before: g.failedBefore });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.warn('[tempt-me] refill not claimed:', error instanceof Error ? error.message : JSON.stringify(error));
    return false;
  }
}

async function finishRefill(admin: SupabaseClient, added: number): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from(META)
    .update(added > 0 ? { refill_started_at: null, refilled_at: now, last_added: added } : { refill_started_at: null, failed_at: now, last_added: 0 })
    .eq('id', 1);
  if (error) console.warn('[tempt-me] refill state not saved:', JSON.stringify(error));
}

/** One refill call: its items, cleaned (URLs only when the web showed them), new names only, written to the pool. The rows written. */
/** What each refill call of this invocation did (returned by the seed so a failure can be read without the function logs). */
const refillNotes: Record<string, unknown>[] = [];

async function refillChunk(ctx: AiContext, chunk: PoolChunk, known: Set<string>, knownNames: string[], date: string, record: Record_): Promise<PoolRow[]> {
  const note: Record<string, unknown> = { chunk: chunk.id };
  refillNotes.push(note);
  let items: TemptPoolItem[] = [];
  // An answer with no list (cut short, or the list not given as one) is asked once more.
  for (let attempt = 0; attempt < 2 && items.length === 0; attempt++) {
    const outcome = await runAiCall(
      ctx,
      'tempt',
      {
        tool: POOL_TOOL,
        system: POOL_SYSTEM,
        maxTokens: 16000,
        attemptTimeoutMs: REFILL_CALL_MS,
        messages: [{ role: 'user', content: `<request>${poolPrompt(chunk, date, knownNames)}</request>` }],
        ...(chunk.web ? { serverTools: (model: string) => webToolsFor(model, { maxSearches: 2, maxFetches: 0 }) } : {}),
      },
      { record }
    );
    if ('error' in outcome) {
      console.warn('[tempt-me] refill call failed:', chunk.id, outcome.error);
      note[`try${attempt + 1}`] = { error: String(outcome.error).slice(0, 300) };
      break;
    }
    const evidence = outcome.web?.evidence;
    const raw = poolItemsOf(outcome.input);
    items = newPoolItems(outcome.input, (url) => !!evidence && seenInEvidence(url, evidence), known, chunk.count + 5);
    note[`try${attempt + 1}`] = { model: outcome.model, ...poolAnswerShape(outcome.input, outcome.stopReason), kept: items.length };
    if (raw.length > 0 && items.length === 0) note.sample = JSON.stringify(raw[0]).slice(0, 300);
    // A list whose names are all known already is not worth asking again.
    if (raw.length > 0) break;
  }
  if (items.length === 0) return [];
  const { data, error } = await ctx.admin
    .from(POOL)
    .upsert(
      items.map((item) => ({ name_key: poolNameKey(item.name), item })),
      { onConflict: 'name_key', ignoreDuplicates: true }
    )
    .select('id,item,created_at');
  if (error) {
    console.warn('[tempt-me] refill not written:', chunk.id, JSON.stringify(error));
    note.dbError = JSON.stringify(error).slice(0, 300);
    return [];
  }
  note.written = (data ?? []).length;
  console.log('[tempt-me] refill', chunk.id, 'added', (data ?? []).length);
  return toRows(data);
}

/** Starts a refill with `chunks` at once. `first` resolves with the rows of the first call that added any (or [] when none did), `all`
 *  with every row added, once every call is done (and the meta row is updated). Always system work (0.26.7): the calls run without a
 *  player (systemContext) and are logged on the pool (systemRecord), whoever's pop-up started the refill. */
function startRefill(admin: SupabaseClient, rows: PoolRow[], date: string, chunks: PoolChunk[]): { first: Promise<PoolRow[]>; all: Promise<PoolRow[]> } {
  const ctx = systemContext(admin);
  const record = systemRecord(admin);
  const known = new Set(rows.map((r) => poolNameKey(r.item.name)));
  const knownNames = rows.slice(0, KNOWN_NAMES_SENT).map((r) => r.item.name);
  let resolveFirst: (rows: PoolRow[]) => void = () => undefined;
  const first = new Promise<PoolRow[]>((resolve) => (resolveFirst = resolve));
  const calls = chunks.map((chunk) =>
    refillChunk(ctx, chunk, known, knownNames, date, record)
      .catch((error) => {
        console.warn('[tempt-me] refill call crashed:', chunk.id, error instanceof Error ? error.message : error);
        return [] as PoolRow[];
      })
      .then((got) => {
        if (got.length > 0) resolveFirst(got);
        return got;
      })
  );
  const all = Promise.all(calls).then(async (lists) => {
    resolveFirst([]);
    const added = lists.flat();
    await finishRefill(ctx.admin, added.length);
    return added;
  });
  return { first, all };
}

async function saveItem(admin: SupabaseClient, id: string, item: TemptPoolItem): Promise<void> {
  const { error } = await admin.from(POOL).update({ item }).eq('id', id);
  if (error) console.warn('[tempt-me] pool item not saved:', JSON.stringify(error));
}

/** Runs the pool's picture calls on REPAIR_MODEL (Sonnet 5.5, 1.3.x: the Haiku checks let wrong photos through), logged as pool
 *  cost; `spent` gets the cost of each call. */
function poolRunner(admin: SupabaseClient, spent?: { usd: number }): Runner {
  const ctx = systemContext(admin);
  const record = systemRecord(admin, 'tempt-me');
  return async (call) => {
    const outcome = await runAiCall(ctx, 'dishphoto', call, {
      model: REPAIR_MODEL,
      record: async (usage, costUsd, model) => {
        if (spent) spent.usd += costUsd;
        await record(usage, costUsd, model);
      },
    });
    if ('error' in outcome) {
      console.warn('[tempt-me] picture call failed:', outcome.error);
      return null;
    }
    return outcome;
  };
}

/** The item with a confirmed photo (a library one credited "author · licence · library", a web one credited to the site). */
function withFoundPhoto(item: TemptPoolItem, photo: DishPhotoInfo): TemptPoolItem {
  if (photo.source === 'web') return { ...withWebPhoto(item, { pageUrl: photo.sourceUrl, imageUrl: photo.url, verified: true }), libraryNone: true };
  return withDishPhoto(item, { ...photo, source: photo.source });
}

/** The item when no photo shows it (libraries and web searched): served only when nothing with a photo fits. */
const withNoPhoto = (item: TemptPoolItem): TemptPoolItem => ({ ...item, imageUrl: null, noPhoto: true, libraryNone: true, webPhotoTried: true });

/** Real pictures for up to `max` rows without one (the newest first), each row saved as soon as it is decided (1.3.x): a web item's
 *  source page picture, when the model confirms it shows the dish; then the photo libraries (files named after the dish) and the web
 *  (pages about the dish), every candidate judged by the model alone, only an "exact" kept. A picture is taken only when it is not
 *  generic and no other pool item has it. Calls on Sonnet 5.5, logged on the pool. Stops waiting after `budgetMs` (what is not
 *  decided by then is looked for next time). The number of rows worked on. */
async function backfillPhotos(admin: SupabaseClient, rows: PoolRow[], max: number, budgetMs: number): Promise<number> {
  const queue = photoQueue(rows, max);
  if (queue.length === 0) return 0;
  const all = await loadPool(admin, null);
  const taken = takenPhotos(all ? all.rows : rows);
  const run = poolRunner(admin);
  const work = (async () => {
    // 1. Web items: their page's picture, judged.
    const sourced = await Promise.all(queue.map(async (row) => ({ row, og: photoStage(row.item) === 'source' ? await ogImageOf(row.item.sourceUrl!) : null })));
    const ogList = sourced.filter((x) => x.og && !genericPictureUrl(x.og) && photoFree(x.og, x.row.item, taken));
    const ogVerdicts = ogList.length > 0 ? await verifyUrls(ogList.map((x) => ({ dish: x.row.item.name, url: x.og! })), run) : [];
    const rest: PoolRow[] = [];
    for (const x of sourced) {
      const n = ogList.indexOf(x);
      const ok = n >= 0 && !!ogVerdicts && verdictAccepts(ogVerdicts[n]) && photoFree(x.og, x.row.item, taken);
      if (ok) {
        taken.add(photoKey(x.og));
        await saveItem(admin, x.row.id, { ...withOgImage(x.row.item, x.og), photoVerified: true, photoAudit: PHOTO_CHECK_VERSION });
      } else rest.push(photoStage(x.row.item) === 'source' ? { ...x.row, item: { ...x.row.item, imageChecked: true } } : x.row);
    }
    // 2. The libraries, then the web, all judged.
    const groups = Array.from({ length: Math.ceil(rest.length / 6) }, (_, i) => rest.slice(i * 6, i * 6 + 6));
    await Promise.all(groups.map((group) => photosForGroup(admin, group, taken, run)));
  })().catch((error) => console.warn('[tempt-me] pictures failed:', error instanceof Error ? error.message : error));
  await within(work, budgetMs, undefined);
  return queue.length;
}

/** Library + web photos for a group of rows, each saved: the photo, "no photo", or one more try (after MAX_PHOTO_TRIES: no photo). */
async function photosForGroup(admin: SupabaseClient, group: PoolRow[], taken: Set<string>, run: Runner): Promise<void> {
  const dishes = group.map((r) => cleanDishPhotoRequest({ dishes: [{ name: r.item.name }] })?.[0] ?? null);
  const asked = group.flatMap((r, i) => (dishes[i] ? [{ r, d: dishes[i]! }] : []));
  const exclude = new Set(group.flatMap((r) => r.item.badPhotos ?? []));
  const found = asked.length > 0 ? await findVerifiedPhotos(asked.map((x) => x.d), run, { taken, exclude }) : [];
  await Promise.all(
    group.map((row) => {
      const n = asked.findIndex((x) => x.r === row);
      const photo = n >= 0 ? found[n] : null;
      if (photo) return saveItem(admin, row.id, { ...withFoundPhoto(row.item, photo), photoAudit: PHOTO_CHECK_VERSION });
      if (photo === null) return saveItem(admin, row.id, { ...withNoPhoto(row.item), photoAudit: PHOTO_CHECK_VERSION });
      const tried = withDishPhoto(row.item, undefined);
      return saveItem(admin, row.id, (tried.photoTries ?? 0) >= MAX_PHOTO_TRIES ? withNoPhoto(tried) : tried);
    })
  );
}

/** Repair steps that could not decide an item before it is left as it is. */
const AUDIT_MAX_FAILS = 2;

/** One step of the picture repair (POST {"action":"rephoto","limit":6} with the x-cron-secret header; called again until `done`):
 *  up to `limit` (1-12) items not audited by the current photo check, library photos first (the generic Wikimedia ones were there).
 *  Sonnet 5.5 judges each current picture alone; a confirmed one stays (marked checked); for the others a new photo is looked for in
 *  the libraries and on the web (never the one found wrong, nor another item's) and judged the same way. A picture is replaced only
 *  by a confirmed better one; a clearly wrong one (wrong dish / not food) with nothing better is taken away (the item is then served
 *  only when nothing with a photo fits, and the app shows the dish's photo from dish_photos or its emoji); a "similar" one stays.
 *  Every item looked at is marked audited (photoAudit), so the next step goes on with the next ones. Cost: pool (system) cost. */
async function rephotoStep(admin: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const loaded = await loadPool(admin, null);
  if (!loaded) return jsonResponse({ error: 'Chưa có bảng tempt_pool: hãy chạy supabase/schema.sql.' }, 503);
  const allowed = await systemAllowance(admin);
  if (!allowed.ok) return jsonResponse({ error: allowed.error }, allowed.status);
  const limit = repairLimit(body.limit, 6, 12);
  const { data: claimed, error: claimError } = await admin.rpc('tempt_pool_claim_photos', { p_running_before: new Date(Date.now() - PHOTOS_RUNNING_MS).toISOString() });
  if (claimError || claimed !== true) return jsonResponse({ busy: true, error: claimError ? JSON.stringify(claimError) : 'Another picture job is running; try again in a few minutes.' }, 409);
  const spent = { usd: 0 };
  const changes: Record<string, unknown>[] = [];
  const tally = { kept: 0, keptSimilar: 0, replaced: 0, removed: 0, stillNone: 0, failed: 0 };
  let rows = loaded.rows;
  try {
    const queue = poolRepairQueue(rows, limit);
    const run = poolRunner(admin, spent);
    const taken = takenPhotos(rows);
    // 1. The current pictures, judged.
    const withPic = queue.filter((r) => r.item.imageUrl);
    const verdicts = await verifyUrls(withPic.map((r) => ({ dish: r.item.name, url: r.item.imageUrl! })), run);
    if (verdicts === null) return jsonResponse({ error: 'The check failed; nothing changed. Try again.', costUsd: spent.usd }, 502);
    const current = new Map(withPic.map((r, i) => [r.id, verdicts[i]]));
    // 2. A new photo for each item whose picture is not confirmed (never the one found wrong, nor another item's).
    const needNew = queue.filter((r) => !(r.item.imageUrl && verdictAccepts(current.get(r.id))));
    const dishes = needNew.map((r) => cleanDishPhotoRequest({ dishes: [{ name: r.item.name }] })?.[0] ?? null);
    const asked = needNew.flatMap((r, i) => (dishes[i] ? [{ r, d: dishes[i]! }] : []));
    const exclude = new Set(needNew.flatMap((r) => [...(r.item.badPhotos ?? []), ...(r.item.imageUrl ? [photoKey(r.item.imageUrl)] : [])]));
    const found = asked.length > 0 ? await findVerifiedPhotos(asked.map((x) => x.d), run, { taken, exclude }) : [];
    const fresh = new Map(asked.map((x, i) => [x.r.id, found[i]]));
    // 3. Decide and save each item.
    const updated = new Map<string, TemptPoolItem>();
    for (const row of queue) {
      const item = row.item;
      const v = item.imageUrl ? (current.get(row.id) ?? null) : null;
      // A confirmed picture needs nothing new; an item whose name gives no search counts as "nothing found".
      const got = verdictAccepts(v) ? null : fresh.has(row.id) ? fresh.get(row.id) : null;
      const note = { name: item.name, old: item.imageUrl ?? null, verdict: v?.verdict ?? null, confidence: v?.confidence ?? null };
      let next: TemptPoolItem;
      if (got === undefined) {
        const fails = (item.photoAuditFails ?? 0) + 1;
        tally.failed++;
        changes.push({ ...note, action: 'failed' });
        next = fails >= AUDIT_MAX_FAILS ? { ...item, photoAuditFails: fails, photoAudit: PHOTO_CHECK_VERSION } : { ...item, photoAuditFails: fails };
      } else {
        const decision = repairDecision(v, !!got);
        if (decision === 'keep') {
          if (verdictAccepts(v)) tally.kept++;
          else {
            tally.keptSimilar++;
            changes.push({ ...note, action: 'keep' });
          }
          next = { ...item, ...(verdictAccepts(v) ? { photoVerified: true } : {}) };
        } else if (decision === 'replace') {
          tally.replaced++;
          changes.push({ ...note, action: 'replace', new: got!.url, source: got!.source });
          next = withFoundPhoto(item.imageUrl ? withoutPhoto(item) : item, got!);
        } else if (decision === 'remove') {
          tally.removed++;
          changes.push({ ...note, action: 'remove' });
          next = withNoPhoto(withoutPhoto(item));
        } else {
          tally.stillNone++;
          next = withNoPhoto(item);
        }
        next = { ...next, photoAudit: PHOTO_CHECK_VERSION };
        delete next.photoAuditFails;
      }
      updated.set(row.id, next);
      await saveItem(admin, row.id, next);
    }
    rows = rows.map((r) => (updated.has(r.id) ? { ...r, item: updated.get(r.id)! } : r));
  } finally {
    await admin.from(META).update({ photos_started_at: null }).eq('id', 1);
  }
  const remaining = poolRepairQueue(rows, rows.length).length;
  const { data: m } = await admin.from(META).select('system_cost_usd').eq('id', 1).maybeSingle();
  return jsonResponse({
    step: 'rephoto',
    processed: Object.values(tally).reduce((a, b) => a + b, 0),
    ...tally,
    remaining,
    done: remaining === 0,
    costUsd: Math.round(spent.usd * 1e6) / 1e6,
    poolCostUsd: Number(m?.system_cost_usd ?? 0),
    changes,
  });
}

/** Takes away the pictures that are generic or shared by several items (rowsToRepair) so those items look again. The rows changed. */
async function repairPhotos(admin: SupabaseClient, rows: PoolRow[]): Promise<PoolRow[]> {
  const bad = rowsToRepair(rows);
  const fixed = bad.map((r) => ({ ...r, item: withoutPhoto(r.item) }));
  await Promise.all(fixed.map((r) => saveItem(admin, r.id, r.item)));
  return fixed;
}

/** Runs a picture backfill when no other one is running (tempt_pool_claim_photos), then frees the claim. */
async function backfillClaimed(admin: SupabaseClient, rows: PoolRow[], max: number, budgetMs: number): Promise<number | null> {
  if (!rows.some((r) => needsPhoto(r.item))) return 0;
  if (!(await systemAllowance(admin)).ok) return null;
  const { data, error } = await admin.rpc('tempt_pool_claim_photos', { p_running_before: new Date(Date.now() - PHOTOS_RUNNING_MS).toISOString() });
  if (error || data !== true) {
    if (error) console.warn('[tempt-me] picture work not claimed:', JSON.stringify(error));
    return null;
  }
  try {
    return await backfillPhotos(admin, rows, max, budgetMs);
  } finally {
    await admin.from(META).update({ photos_started_at: null }).eq('id', 1);
  }
}

/** Serves one pool item to this player and records it; pictures still missing in the pool are looked for after the answer. */
async function serve(ctx: AiContext, row: PoolRow, repeat: boolean, rows: PoolRow[]): Promise<Response> {
  const { error } = await ctx.admin.from(SHOWN).upsert({ user_id: ctx.userId, pool_id: row.id, shown_at: new Date().toISOString() }, { onConflict: 'user_id,pool_id' });
  if (error) console.warn('[tempt-me] showing not recorded:', JSON.stringify(error));
  if (rows.some((r) => needsPhoto(r.item))) await inBackground(backfillClaimed(ctx.admin, rows, POPUP_PHOTOS, REFILL_PHOTOS_BUDGET_MS));
  return jsonResponse({ result: poolAnswer(row.item, repeat) });
}

/** A pop-up from the pool, refilling it when it runs low; null when the pool tables are not there (the caller answers the old way). */
async function fromPool(ctx: AiContext, req: TemptRequest): Promise<Response | null> {
  const loaded = await loadPool(ctx.admin, ctx.userId);
  if (!loaded) return null;
  const { rows, shown } = loaded;
  const now = fitNow(req);
  const at = new Date();
  const pick = pickPoolItem(rows, shown, now, at, req.avoid);
  const urgent = !pick || pick.repeat;
  // A refill is system work (0.26.7): not this player's quota or budget, only the claim guards and the global daily cap.
  if (poolNeedsRefill(rows, shown, now, at) && (await systemAllowance(ctx.admin)).ok && (await claimRefill(ctx.admin, refillGuards(at, urgent)))) {
    const refill = startRefill(ctx.admin, rows, req.date, POOL_CHUNKS);
    // The new items get their pictures right after (what does not fit in the time is done by later pop-ups).
    const afterwards = refill.all.then((added) => backfillClaimed(ctx.admin, added, added.length, REFILL_PHOTOS_BUDGET_MS));
    if (!urgent) {
      // Something fresh to show already: the refill finishes after the answer.
      await inBackground(afterwards);
      return serve(ctx, pick!.row, false, []);
    }
    // Nothing fresh: wait for the first call that adds items, the rest goes on in the background.
    const got = await refill.first;
    await inBackground(afterwards);
    const fresh = pickPoolItem([...got, ...rows], shown, now, at, req.avoid);
    if (fresh) return serve(ctx, fresh.row, fresh.repeat, []);
  }
  if (pick) return serve(ctx, pick.row, pick.repeat, rows);
  return jsonResponse({ error: 'Quỷ Cám Dỗ đang chuẩn bị thực đơn mới, lát nữa quay lại nhé.' }, 503);
}

/** One step of the seed (POST {"action":"seed"} with the x-cron-secret header; called again until `done`): while the pool is short of
 *  its first ~200 items, one generation step (the refill calls at once); after that, real pictures for up to SEED_PHOTOS_PER_CALL
 *  items. Every call is logged on the pool (tempt_pool_meta), never on a player. */
async function seedStep(admin: SupabaseClient): Promise<Response> {
  const loaded = await loadPool(admin, null);
  if (!loaded) return jsonResponse({ error: 'Chưa có bảng tempt_pool: hãy chạy supabase/schema.sql.' }, 503);
  let rows = loaded.rows;
  const { data: meta } = await admin.from(META).select('seeded_at,last_added,system_cost_usd').eq('id', 1).maybeSingle();
  // Generating goes on until the pool is nearly full or a step adds only a few (the model has run out of new items); a failed step
  // (nothing added) is tried again.
  let generated = seedGenerated(rows.length, meta?.seeded_at ? (meta.last_added ?? null) : null);
  const report = async (step: string, extra: Record<string, unknown> = {}) => {
    const { data: m } = await admin.from(META).select('system_cost_usd').eq('id', 1).maybeSingle();
    return jsonResponse({ step, ...poolSeedStatus(rows, generated), ...extra, poolCostUsd: Number(m?.system_cost_usd ?? 0) });
  };
  const allowed = await systemAllowance(admin);
  if (!allowed.ok) return report(generated ? 'photos' : 'generate', { error: allowed.error });
  if (!generated) {
    const now = new Date();
    // Any earlier refill does not matter for the seed; one running does.
    const far = new Date(now.getTime() + 86_400_000).toISOString();
    if (!(await claimRefill(admin, { runningBefore: new Date(now.getTime() - 10 * 60_000).toISOString(), doneBefore: far, failedBefore: far }))) return report('generate', { busy: true });
    const today = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    const added = await startRefill(admin, rows, today, seedChunks(rows.length)).all;
    rows = [...added, ...rows];
    generated = seedGenerated(rows.length, added.length);
    if (generated) await admin.from(META).update({ seeded_at: new Date().toISOString() }).eq('id', 1);
    return report('generate', { added: added.length, calls: refillNotes });
  }
  if (!meta?.seeded_at) await admin.from(META).update({ seeded_at: new Date().toISOString() }).eq('id', 1);
  // Pictures shared by several items or generic lose them first (0.26.5).
  const repaired = await repairPhotos(admin, rows);
  if (repaired.length > 0) {
    const ids = new Map(repaired.map((r) => [r.id, r]));
    rows = rows.map((r) => ids.get(r.id) ?? r);
  }
  const decided = await backfillClaimed(admin, rows, SEED_PHOTOS_PER_CALL, SEED_PHOTOS_BUDGET_MS);
  if (decided === null) return report('photos', { busy: true, repaired: repaired.length });
  const again = await loadPool(admin, null);
  if (again) rows = again.rows;
  return report('photos', { decided, repaired: repaired.length });
}

/** The maintenance calls bypass the player sign-in, only with the cron secret (PUSH_CRON_SECRET, the same as send-push's):
 *  {"action":"seed"} (seedStep) and {"action":"rephoto","limit":6} (rephotoStep, 1.3.x). */
async function seedGate(req: Request, admin: SupabaseClient): Promise<Response | null> {
  const got = await cronBody(req);
  if (got === null) return null;
  if ('forbidden' in got) return jsonResponse({ error: 'forbidden' }, 401);
  if (got.body.action === 'seed') return seedStep(admin);
  if (got.body.action === 'rephoto') return rephotoStep(admin, got.body);
  return jsonResponse({ error: 'Unknown action (expected {"action":"seed"} or {"action":"rephoto"}).' }, 400);
}

serveAi(
  'tempt',
  async (body, ctx) => {
    const req = cleanTemptRequest(body);
    if (!req) return jsonResponse({ error: 'Thiếu ngày giờ hiện tại.' }, 400);
    const pooled = await fromPool(ctx, req);
    if (pooled) return pooled;
    // The old way (no pool tables yet): one item from one AI call that may search the web.
    return {
      responseKey: 'result',
      call: {
        tool: TEMPT_TOOL,
        system: TEMPT_SYSTEM,
        maxTokens: 4000,
        messages: [{ role: 'user', content: `<request>${temptPrompt(req, true)}</request>` }],
        serverTools: (model) => webToolsFor(model, { maxSearches: 2, maxFetches: 1, city: req.city || undefined }),
      },
      shape: async (input, { web: outcome }) => {
        const web = outcome!;
        const item = cleanTemptAnswer(input, (url) => seenInEvidence(url, web.evidence));
        if (!item) return { error: 'empty' };
        if (!item.imageUrl && item.sourceUrl) {
          item.imageUrl = await ogImageOf(item.sourceUrl);
          if (item.imageUrl && !item.sourceDomain) item.sourceDomain = new URL(item.sourceUrl).hostname.replace(/^www\./, '');
        }
        return { ...item, web: !web.available ? 'unavailable' : web.searches > 0 ? 'used' : 'unused' };
      },
    };
  },
  { preAuth: seedGate }
);
