// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy dish-photo
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   Optional: DISH_PHOTO_CONTACT (a URL or e-mail address put in
// the User-Agent sent to Wikimedia, as their API policy asks).
//
// A real photo of each suggested dish (cheat day dishes, the temptation pop-up), instead of an emoji. For each dish (at most 6):
//   1. the cache (table dish_photos, keyed by dishKey: lower case, no accents) answers when it holds a photo, or a "none" younger than
//      30 days; a missing table (schema.sql not run yet) only means no cache;
//   2. otherwise two free photo libraries that need no key are searched at the same time: Wikimedia Commons (the Vietnamese name and
//      the name without accents) and Openverse (an English hint). Only photos (jpeg/png/webp) under CC0 / public domain / CC BY /
//      CC BY-SA are kept, with author, licence and page for the credit line (_shared/dishPhoto.ts);
//   3. up to 3 candidates per dish are fetched (thumbnails) and sent, all dishes in ONE Claude call, with a forced tool that picks the
//      photo really showing that dish as served food (not a sign, a menu, a person, raw ingredients or another dish), or none;
//   4. no photo: null (the app keeps the emoji). TODO(image generation): a generated picture would be the last fallback here, see
//      `generateDishPhoto`, once a provider is chosen.
// Everything is bounded (time per search and per image, a budget for the searches, candidates per dish) so a slow library cannot hang
// the request; dishes are looked up in parallel. A request the cache answers in full makes no Claude call and uses no quota.
// Cost: the verification call's tokens (~400 per candidate photo), logged under the feature `dishphoto`.
// Calls per user per day: app_settings key `ai_quota.dishphoto` (default 40).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { jsonResponse, serveAi } from '../_shared/ai.ts';
import {
  bytesToBase64,
  cacheFresh,
  cleanDishPhoto,
  cleanDishPhotoRequest,
  cleanPicks,
  DISH_PHOTO_ASK,
  DISH_PHOTO_SYSTEM,
  DISH_PHOTO_TOOL,
  dishHeading,
  openverseSearchUrl,
  parseOpenverse,
  parseWikimedia,
  photoHeading,
  photoMime,
  photoUserAgent,
  pickCandidates,
  wikimediaSearchUrl,
  type DishPhotoInfo,
  type DishPhotoRequestDish,
  type DishPhotoResult,
  type PhotoCandidate,
} from '../_shared/dishPhoto.ts';

const USER_AGENT = photoUserAgent(Deno.env.get('DISH_PHOTO_CONTACT') ?? undefined);
/** One library search, one thumbnail, and all the searches of a request together. */
const SEARCH_TIMEOUT_MS = 6000;
const THUMB_TIMEOUT_MS = 6000;
const LOOKUP_BUDGET_MS = 12_000;
const THUMB_MAX_BYTES = 1_500_000;
const CACHE_TABLE = 'dish_photos';

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, 'api-user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!response.ok) {
      console.warn('[dish-photo] search answered', response.status, new URL(url).hostname);
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('[dish-photo] search failed:', new URL(url).hostname, error instanceof Error ? error.message : error);
    return null;
  }
}

/** The candidates for one dish (Wikimedia and Openverse in parallel), and whether every search answered (a "none" is cached only then). */
async function findCandidates(dish: DishPhotoRequestDish): Promise<{ candidates: PhotoCandidate[]; complete: boolean }> {
  const wikiQueries = [...new Set([dish.name, dish.key, dish.en].filter(Boolean).map((q) => q.toLowerCase()))].slice(0, 2);
  const [wiki, open] = await Promise.all([
    Promise.all(wikiQueries.map((q) => fetchJson(wikimediaSearchUrl(q)))),
    fetchJson(openverseSearchUrl(dish.en || dish.key)),
  ]);
  const wikiList: PhotoCandidate[] = [];
  for (const answer of wiki) for (const c of answer ? parseWikimedia(answer) : []) if (!wikiList.some((x) => x.sourceUrl === c.sourceUrl)) wikiList.push(c);
  const complete = wiki.every((a) => a !== null) && open !== null;
  return { candidates: pickCandidates([wikiList, open ? parseOpenverse(open) : []]), complete };
}

/** A candidate's thumbnail as a Claude image block, or null (not reachable in time, not a photo, too big). */
async function thumbBlock(c: PhotoCandidate): Promise<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | null> {
  try {
    const response = await fetch(c.url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
    const mime = response.ok ? photoMime(response.headers.get('content-type')) : null;
    if (!mime) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > THUMB_MAX_BYTES) return null;
    return { type: 'image', source: { type: 'base64', media_type: mime, data: bytesToBase64(bytes) } };
  } catch (error) {
    console.warn('[dish-photo] thumbnail not read:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Resolves to `fallback` when `work` takes longer than `ms`. */
function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** TODO(image generation): the last fallback when no real photo shows the dish. Returns null until an image provider is chosen; a
 *  generated picture must then be labelled as such in the app (source 'generated'), never passed off as a photograph. */
async function generateDishPhoto(_dish: DishPhotoRequestDish): Promise<DishPhotoInfo | null> {
  return null;
}

type CacheRow = { dish_key: string; photo: unknown; checked_at: string };

async function readCache(admin: SupabaseClient, keys: string[]): Promise<Map<string, DishPhotoInfo | null>> {
  const out = new Map<string, DishPhotoInfo | null>();
  try {
    const { data, error } = await admin.from(CACHE_TABLE).select('dish_key,photo,checked_at').in('dish_key', keys);
    if (error) throw error;
    for (const row of (data ?? []) as CacheRow[]) if (cacheFresh(row)) out.set(row.dish_key, cleanDishPhoto(row.photo));
  } catch (error) {
    // The table is created by schema.sql, which is run by hand: until then there is simply no cache.
    console.warn('[dish-photo] cache not read:', error instanceof Error ? error.message : JSON.stringify(error));
  }
  return out;
}

async function writeCache(admin: SupabaseClient, rows: { dish_key: string; name: string; photo: DishPhotoInfo | null }[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const now = new Date().toISOString();
    const { error } = await admin.from(CACHE_TABLE).upsert(rows.map((r) => ({ ...r, checked_at: now })), { onConflict: 'dish_key' });
    if (error) throw error;
  } catch (error) {
    console.warn('[dish-photo] cache not written:', error instanceof Error ? error.message : JSON.stringify(error));
  }
}

serveAi('dishphoto', async (body, ctx) => {
  const dishes = cleanDishPhotoRequest(body);
  if (!dishes) return jsonResponse({ error: 'Thiếu tên món.' }, 400);
  const found = new Map<string, DishPhotoInfo | null>(await readCache(ctx.admin, dishes.map((d) => d.key)));
  const answer = (): { dishes: DishPhotoResult[] } => ({ dishes: dishes.map((d) => ({ name: d.name, key: d.key, photo: found.get(d.key) ?? null })) });

  const todo = dishes.filter((d) => !found.has(d.key));
  if (todo.length === 0) return jsonResponse({ result: answer() });

  // Search every dish at once; one that is not done inside the budget counts as "nothing found" (and is not cached).
  const searched = await Promise.all(todo.map((d) => within(findCandidates(d), LOOKUP_BUDGET_MS, { candidates: [], complete: false })));
  const withThumbs = await Promise.all(
    searched.map(async (s) => {
      const blocks = await Promise.all(s.candidates.map((c) => within(thumbBlock(c), THUMB_TIMEOUT_MS + 500, null)));
      const kept = s.candidates.map((c, i) => ({ c, block: blocks[i] })).filter((x) => x.block !== null);
      return { ...s, kept };
    })
  );

  const toCache: { dish_key: string; name: string; photo: DishPhotoInfo | null }[] = [];
  const asked = todo.map((d, i) => ({ dish: d, ...withThumbs[i] })).filter((x) => x.kept.length > 0);
  for (let i = 0; i < todo.length; i++) {
    if (withThumbs[i].kept.length > 0) continue;
    const photo = await generateDishPhoto(todo[i]);
    found.set(todo[i].key, photo);
    if (withThumbs[i].complete && withThumbs[i].candidates.length === 0) toCache.push({ dish_key: todo[i].key, name: todo[i].name, photo: null });
  }
  if (asked.length === 0) {
    await writeCache(ctx.admin, toCache);
    return jsonResponse({ result: answer() });
  }

  const content: unknown[] = [];
  asked.forEach((x, n) => {
    content.push({ type: 'text', text: dishHeading(n + 1, x.dish) });
    x.kept.forEach((k, j) => content.push({ type: 'text', text: photoHeading(n + 1, j + 1, k.c) }, k.block));
  });
  content.push({ type: 'text', text: DISH_PHOTO_ASK });

  return {
    responseKey: 'result',
    call: { tool: DISH_PHOTO_TOOL, system: DISH_PHOTO_SYSTEM, maxTokens: 600, messages: [{ role: 'user', content }] },
    shape: async (input) => {
      const picks = cleanPicks(input, asked.map((x) => x.kept.length));
      for (let n = 0; n < asked.length; n++) {
        const { dish, kept, complete } = asked[n];
        const pick = picks[n];
        const chosen = pick !== null ? cleanDishPhoto(kept[pick].c) : await generateDishPhoto(dish);
        found.set(dish.key, chosen);
        // A "none" is cached only when every library answered (a timeout may have hidden the right photo).
        if (chosen || complete) toCache.push({ dish_key: dish.key, name: dish.name, photo: chosen });
      }
      await writeCache(ctx.admin, toCache);
      return answer();
    },
  };
});
