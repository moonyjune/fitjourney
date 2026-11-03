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

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { jsonResponse, runAiCall, serveAi, systemAllowance, type AiContext } from '../_shared/ai.ts';
import { cleanDishPhotoRequest } from '../_shared/dishPhoto.ts';
import { imageBlockOf, lookupDishPhotos, within } from '../_shared/dishPhotoLookup.ts';
import type { TokenUsage } from '../_shared/usage.ts';
import {
  cleanStoredPoolItem,
  cleanTemptAnswer,
  cleanTemptRequest,
  extractOgImage,
  fitNow,
  newPoolItems,
  pickPoolItem,
  POOL_CHUNKS,
  POOL_SYSTEM,
  POOL_TOOL,
  cleanPictureAnswers,
  cleanWebPhotoPages,
  photoFree,
  photoKey,
  PICTURE_CHECK_ASK,
  PICTURE_CHECK_SYSTEM,
  PICTURE_CHECK_TOOL,
  pictureHeading,
  rowsToRepair,
  takenPhotos,
  withoutPhoto,
  needsPhoto,
  photoQueue,
  photoStage,
  poolAnswerShape,
  poolItemsOf,
  WEB_PHOTO_GROUP,
  WEB_PHOTO_SEARCHES,
  WEB_PHOTO_SYSTEM,
  WEB_PHOTO_TOOL,
  webPhotoPrompt,
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
import { seenInEvidence, webToolsFor } from '../_shared/webtools.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const PAGE_TIMEOUT_MS = 5000;
const PAGE_MAX_BYTES = 400_000;

/** The og:image of a page the search found, or null (not HTML, too slow, an unsafe address, none on the page). */
async function ogImageOf(pageUrl: string): Promise<string | null> {
  const url = publicHttpsUrl(pageUrl);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (FitQuest temptation preview)', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!response.ok || !publicHttpsUrl(response.url || url)) return null;
    if (!(response.headers.get('content-type') ?? '').includes('html')) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < PAGE_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    const html = new TextDecoder().decode(bytes);
    return extractOgImage(html, response.url || url);
  } catch (error) {
    console.warn('[tempt-me] page not read:', error instanceof Error ? error.message : error);
    return null;
  }
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
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? '';

type Record_ = (usage: TokenUsage | undefined, costUsd: number, model: string) => Promise<void>;

/** Logs a call made for the pool itself (refills, seed, pictures) on the pool's meta row, not on any player's usage. */
const systemRecord =
  (admin: SupabaseClient): Record_ =>
  async (usage, costUsd, model) => {
    const { error } = await admin.rpc('tempt_pool_add_cost', { p_in: usage?.input_tokens ?? 0, p_out: usage?.output_tokens ?? 0, p_cost: costUsd });
    if (error) console.warn('[tempt-me] pool cost not recorded:', JSON.stringify(error));
    console.log('[tempt-me] pool call', model, 'cost', costUsd.toFixed(4));
  };

/** A context for work done for nobody in particular (refills, the seed, pictures): service role everywhere, no player. */
const systemContext = (admin: SupabaseClient): AiContext => ({ userId: '', userClient: admin, admin });

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

/** Keeps `work` running after the answer is sent (Supabase's EdgeRuntime.waitUntil); awaited where that is not available. */
async function inBackground(work: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work;
}

async function saveItem(admin: SupabaseClient, id: string, item: TemptPoolItem): Promise<void> {
  const { error } = await admin.from(POOL).update({ item }).eq('id', id);
  if (error) console.warn('[tempt-me] pool item not saved:', JSON.stringify(error));
}

/** The model's look at web pictures (one Haiku call for the group): whether each picture shows its dish. A picture that cannot be
 *  downloaded counts as no; a failed call as no for all (tried again later only through the next stage's budget). */
async function checkPictures(admin: SupabaseClient, list: { dish: string; url: string }[], record: Record_): Promise<boolean[]> {
  const blocks = await Promise.all(list.map((c) => within(imageBlockOf(c.url), 8000, null)));
  const shown = list.map((c, i) => ({ ...c, block: blocks[i] })).filter((x) => x.block !== null);
  if (shown.length === 0) return list.map(() => false);
  const content: unknown[] = [];
  shown.forEach((x, n) => content.push({ type: 'text', text: pictureHeading(n + 1, x.dish) }, x.block));
  content.push({ type: 'text', text: PICTURE_CHECK_ASK });
  const outcome = await runAiCall(
    systemContext(admin),
    'dishphoto',
    { tool: PICTURE_CHECK_TOOL, system: PICTURE_CHECK_SYSTEM, maxTokens: 800, messages: [{ role: 'user', content }] },
    { record }
  );
  if ('error' in outcome) {
    console.warn('[tempt-me] picture check failed:', outcome.error);
    return list.map(() => false);
  }
  const yes = cleanPictureAnswers(outcome.input, shown.length);
  return list.map((c) => {
    const n = shown.findIndex((x) => x.url === c.url && x.dish === c.dish);
    return n >= 0 && yes[n];
  });
}

/** The web photo search for up to WEB_PHOTO_GROUP rows: one call (up to 3 searches) for a page about each dish, each page's og:image
 *  read here, refused when generic or another item's, then checked by the model. Every row is saved (a photo, or "no photo"). */
async function webPhotos(admin: SupabaseClient, group: PoolRow[], taken: Set<string>, record: Record_): Promise<void> {
  const outcome = await runAiCall(
    systemContext(admin),
    'dishphoto',
    {
      tool: WEB_PHOTO_TOOL,
      system: WEB_PHOTO_SYSTEM,
      maxTokens: 3000,
      attemptTimeoutMs: 90_000,
      messages: [{ role: 'user', content: `<request>${webPhotoPrompt(group.map((r) => r.item.name))}</request>` }],
      serverTools: (model: string) => webToolsFor(model, { maxSearches: WEB_PHOTO_SEARCHES, maxFetches: 0 }),
    },
    { record }
  );
  if ('error' in outcome) {
    // Not decided: tried again by a later step.
    console.warn('[tempt-me] web photo search failed:', outcome.error);
    return;
  }
  const evidence = outcome.web?.evidence;
  const pages = cleanWebPhotoPages(outcome.input, group.length, (url) => !!evidence && seenInEvidence(url, evidence));
  const images = await Promise.all(pages.map((page) => (page ? ogImageOf(page) : Promise.resolve(null))));
  // Generic, refused before, another item's, or the same picture twice in this group: not a candidate.
  const inGroup = new Set<string>();
  const candidates = group.map((row, i) => {
    const url = images[i];
    if (!url || !photoFree(url, row.item, taken) || inGroup.has(photoKey(url))) return null;
    inGroup.add(photoKey(url));
    return { dish: row.item.name, url, page: pages[i]! };
  });
  const listed = candidates.filter((c): c is NonNullable<typeof c> => c !== null);
  const verdicts = await checkPictures(admin, listed, record);
  await Promise.all(
    group.map(async (row, i) => {
      const c = candidates[i];
      const ok = !!c && verdicts[listed.indexOf(c)] && photoFree(c.url, row.item, taken);
      if (ok) taken.add(photoKey(c!.url));
      await saveItem(admin, row.id, withWebPhoto(row.item, ok ? { pageUrl: c!.page, imageUrl: c!.url, verified: true } : null));
    })
  );
}

/** Real pictures for up to `max` rows without one (the newest first), each row saved as soon as it is decided: a web item's source
 *  page og:image; then the photo libraries + the model's check (6 dishes per check); then, for what the libraries do not have, a web
 *  search for a page about the dish, its og:image checked by the model (8 dishes per search call). A picture is taken only when it is
 *  not generic and no other pool item has it (0.26.5). All at once, calls logged on the pool. Stops waiting after `budgetMs` (what is
 *  not decided by then is looked for next time). The number of rows worked on. */
async function backfillPhotos(admin: SupabaseClient, rows: PoolRow[], max: number, budgetMs: number): Promise<number> {
  const queue = photoQueue(rows, max);
  if (queue.length === 0) return 0;
  const all = await loadPool(admin, null);
  const taken = takenPhotos(all ? all.rows : rows);
  const ctx = systemContext(admin);
  const record = systemRecord(admin);
  const work = (async () => {
    // 1. Web items: their page's picture (no tokens).
    const afterSource = await Promise.all(
      queue.map(async (row) => {
        if (photoStage(row.item) !== 'source') return row;
        const og = await ogImageOf(row.item.sourceUrl!);
        const free = og && photoFree(og, row.item, taken);
        if (free) taken.add(photoKey(og));
        const item = withOgImage(row.item, free ? og : null);
        await saveItem(admin, row.id, item);
        return { ...row, item };
      })
    );
    const library = afterSource.filter((r) => photoStage(r.item) === 'library');
    const web = afterSource.filter((r) => photoStage(r.item) === 'web');
    const groups = (list: PoolRow[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
    await Promise.all([
      // 2. The photo libraries, checked by the model.
      ...groups(library, 6).map(async (group) => {
        const dishes = group.map((r) => cleanDishPhotoRequest({ dishes: [{ name: r.item.name }] })?.[0] ?? null);
        const found = await lookupDishPhotos(
          admin,
          dishes.filter((d): d is NonNullable<typeof d> => d !== null),
          async (call) => {
            const outcome = await runAiCall(ctx, 'dishphoto', call, { record });
            if ('error' in outcome) {
              console.warn('[tempt-me] photo check failed:', outcome.error);
              return null;
            }
            return outcome.input;
          }
        );
        await Promise.all(
          group.map((row, i) => {
            let photo = dishes[i] ? found.get(dishes[i]!.key) : null;
            // Another item's picture (two names of one dish): this one looks on the web instead.
            if (photo && !photoFree(photo.url, row.item, taken)) photo = null;
            if (photo) taken.add(photoKey(photo.url));
            return saveItem(admin, row.id, withDishPhoto(row.item, photo));
          })
        );
      }),
      // 3. What the libraries do not have: a page on the web.
      ...groups(web, WEB_PHOTO_GROUP).map((group) => webPhotos(admin, group, taken, record)),
    ]);
  })().catch((error) => console.warn('[tempt-me] pictures failed:', error instanceof Error ? error.message : error));
  await within(work, budgetMs, undefined);
  return queue.length;
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

/** The seed bypasses the player sign-in, only with the cron secret (PUSH_CRON_SECRET, the same as send-push's). */
async function seedGate(req: Request, admin: SupabaseClient): Promise<Response | null> {
  const secret = req.headers.get('x-cron-secret');
  if (secret === null) return null;
  if (!sameSecret(secret, CRON_SECRET)) return jsonResponse({ error: 'forbidden' }, 401);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // no body
  }
  if (body?.action !== 'seed') return jsonResponse({ error: 'Unknown action (expected {"action":"seed"}).' }, 400);
  return seedStep(admin);
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
