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
// Pictures: an item from the web without a picture gets its source page's og:image once (no tokens), saved into the pool row so the
// next player has it; otherwise the app shows the dish's real photo (dish-photo, cached for everyone in dish_photos). Never generated.
// Without the tables (schema.sql not run yet) the function answers the old way: one AI call with up to 2 searches and 1 fetch.
// Cost: a refill ~$0.5 (logged under the feature `tempt` for the player who triggered it); a pop-up from the pool $0.
// Calls per user per day: app_settings key `ai_quota.tempt` (default 6; a refill counts its calls).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { aiAllowance, jsonResponse, runAiCall, serveAi, type AiContext } from '../_shared/ai.ts';
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
  poolAnswer,
  poolNameKey,
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
const REFILL_CALL_MS = 140_000;
/** Names of the pool sent to a refill call as "already there" (the newest). */
const KNOWN_NAMES_SENT = 300;

/** The whole pool (newest first) and this player's showings, or null when the tables are not there yet. */
async function loadPool(admin: SupabaseClient, userId: string): Promise<{ rows: PoolRow[]; shown: Map<string, string> } | null> {
  const [pool, shownRows] = await Promise.all([
    admin.from(POOL).select('id,item,created_at').order('created_at', { ascending: false }).limit(3000),
    admin.from(SHOWN).select('pool_id,shown_at').eq('user_id', userId),
  ]);
  if (pool.error || shownRows.error) {
    console.warn('[tempt-me] pool not read, answering the old way:', JSON.stringify(pool.error ?? shownRows.error));
    return null;
  }
  const rows: PoolRow[] = [];
  for (const r of (pool.data ?? []) as { id: string; item: unknown; created_at: string }[]) {
    const item = cleanStoredPoolItem(r.item);
    if (item) rows.push({ id: r.id, item, createdAt: r.created_at });
  }
  const shown = new Map<string, string>();
  for (const r of (shownRows.data ?? []) as { pool_id: string; shown_at: string }[]) shown.set(r.pool_id, r.shown_at);
  return { rows, shown };
}

/** Claims the refill (tempt_pool_claim_refill: one UPDATE of the meta row with the guards as conditions, so only one request gets it). False when someone else is refilling,
 *  or the last refill is too recent. */
async function claimRefill(admin: SupabaseClient, urgent: boolean): Promise<boolean> {
  const g = refillGuards(new Date(), urgent);
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
  await admin
    .from(META)
    .update(added > 0 ? { refill_started_at: null, refilled_at: now, last_added: added } : { refill_started_at: null, failed_at: now })
    .eq('id', 1)
    .then(({ error }) => error && console.warn('[tempt-me] refill state not saved:', JSON.stringify(error)));
}

/** One refill call: its items, cleaned (URLs only when the web showed them), new names only, written to the pool. The rows written. */
async function refillChunk(ctx: AiContext, chunk: PoolChunk, known: Set<string>, knownNames: string[], req: TemptRequest): Promise<PoolRow[]> {
  const outcome = await runAiCall(ctx, 'tempt', {
    tool: POOL_TOOL,
    system: POOL_SYSTEM,
    maxTokens: 14000,
    attemptTimeoutMs: REFILL_CALL_MS,
    messages: [{ role: 'user', content: `<request>${poolPrompt(chunk, req.date, knownNames)}</request>` }],
    ...(chunk.web ? { serverTools: (model: string) => webToolsFor(model, { maxSearches: 2, maxFetches: 0 }) } : {}),
  });
  if ('error' in outcome) {
    console.warn('[tempt-me] refill call failed:', chunk.id, outcome.error);
    return [];
  }
  const evidence = outcome.web?.evidence;
  const items = newPoolItems(outcome.input, (url) => !!evidence && seenInEvidence(url, evidence), known, chunk.count + 5);
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
    return [];
  }
  console.log('[tempt-me] refill', chunk.id, 'added', (data ?? []).length);
  return ((data ?? []) as { id: string; item: unknown; created_at: string }[]).flatMap((r) => {
    const item = cleanStoredPoolItem(r.item);
    return item ? [{ id: r.id, item, createdAt: r.created_at }] : [];
  });
}

/** Starts a refill: every chunk at once. `first` resolves with the rows of the first call that added any (or [] when none did), `all`
 *  when every call is done (and the meta row is updated). */
function startRefill(ctx: AiContext, rows: PoolRow[], req: TemptRequest): { first: Promise<PoolRow[]>; all: Promise<void> } {
  const known = new Set(rows.map((r) => poolNameKey(r.item.name)));
  const knownNames = rows.slice(0, KNOWN_NAMES_SENT).map((r) => r.item.name);
  let added = 0;
  let resolveFirst: (rows: PoolRow[]) => void = () => undefined;
  const first = new Promise<PoolRow[]>((resolve) => (resolveFirst = resolve));
  const calls = POOL_CHUNKS.map((chunk) =>
    refillChunk(ctx, chunk, known, knownNames, req)
      .catch((error) => {
        console.warn('[tempt-me] refill call crashed:', chunk.id, error instanceof Error ? error.message : error);
        return [] as PoolRow[];
      })
      .then((got) => {
        added += got.length;
        if (got.length > 0) resolveFirst(got);
        return got;
      })
  );
  const all = Promise.all(calls).then(async () => {
    resolveFirst([]);
    await finishRefill(ctx.admin, added);
  });
  return { first, all };
}

/** Keeps `work` running after the answer is sent (Supabase's EdgeRuntime.waitUntil); awaited where that is not available. */
async function inBackground(work: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work;
}

/** The picture of a web item without one: its source page's og:image, looked for once and saved into the pool row. */
async function withPicture(admin: SupabaseClient, row: PoolRow): Promise<TemptPoolItem> {
  const item = row.item;
  if (item.imageUrl || !item.sourceUrl || item.imageChecked) return item;
  const imageUrl = await ogImageOf(item.sourceUrl);
  const next: TemptPoolItem = { ...item, imageChecked: true, ...(imageUrl ? { imageUrl } : {}) };
  const { error } = await admin.from(POOL).update({ item: next }).eq('id', row.id);
  if (error) console.warn('[tempt-me] picture not saved:', JSON.stringify(error));
  return next;
}

/** Serves one pool item to this player and records it. */
async function serve(ctx: AiContext, row: PoolRow, repeat: boolean): Promise<Response> {
  const item = await withPicture(ctx.admin, row);
  const { error } = await ctx.admin.from(SHOWN).upsert({ user_id: ctx.userId, pool_id: row.id, shown_at: new Date().toISOString() }, { onConflict: 'user_id,pool_id' });
  if (error) console.warn('[tempt-me] showing not recorded:', JSON.stringify(error));
  return jsonResponse({ result: poolAnswer(item, repeat) });
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
  if (poolNeedsRefill(rows, shown, now, at) && (await aiAllowance(ctx, 'tempt')).ok && (await claimRefill(ctx.admin, urgent))) {
    const refill = startRefill(ctx, rows, req);
    if (!urgent) {
      // Something fresh to show already: the refill finishes after the answer.
      await inBackground(refill.all);
      return serve(ctx, pick!.row, false);
    }
    // Nothing fresh: wait for the first call that adds items, the rest goes on in the background.
    const got = await refill.first;
    await inBackground(refill.all);
    const all = [...got, ...rows];
    const fresh = pickPoolItem(all, shown, now, at, req.avoid);
    if (fresh) return serve(ctx, fresh.row, fresh.repeat);
  }
  if (pick) return serve(ctx, pick.row, pick.repeat);
  return jsonResponse({ error: 'Quỷ Cám Dỗ đang chuẩn bị thực đơn mới, lát nữa quay lại nhé.' }, 503);
}

serveAi('tempt', async (body, ctx) => {
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
});
