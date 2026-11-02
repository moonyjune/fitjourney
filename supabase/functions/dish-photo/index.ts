// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy dish-photo
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   Optional: DISH_PHOTO_CONTACT (a URL or e-mail address put in
// the User-Agent sent to Wikimedia, as their API policy asks; the app's public page when not set).
//
// A real photo of each suggested dish (cheat day dishes, the temptation pop-up), instead of an emoji. For each dish (at most 6):
//   0. a long AI name ("Bún bò Huế giò heo + chả cua (1 tô lớn)") is reduced to the dish itself (coreDishName: "Bún bò Huế giò heo"):
//      that is what is searched, checked and cached (the whole name found nothing, so every such dish was cached as "none");
//   1. the cache (table dish_photos, keyed by "v2:" + dishKey of the core name: lower case, no accents; rows of the old whole-name
//      keys are never read) answers when it holds a photo, or a "none" younger than 30 days; a missing table only means no cache;
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
  cacheKey,
  cleanDishPhoto,
  cleanDishPhotoRequest,
  cleanPicks,
  DISH_PHOTO_ASK,
  DISH_PHOTO_SYSTEM,
  DISH_PHOTO_TOOL,
  dishHeading,
  loadThumb,
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
  type PhotoFetch,
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
  // The core name and a shorter one (the whole AI name, with portions and side dishes, finds nothing), and the English hint.
  const [wiki, open] = await Promise.all([
    Promise.all(dish.queries.slice(0, 2).map((q) => fetchJson(wikimediaSearchUrl(q)))),
    fetchJson(openverseSearchUrl(dish.en || dish.key)),
  ]);
  const wikiList: PhotoCandidate[] = [];
  for (const answer of wiki) for (const c of answer ? parseWikimedia(answer) : []) if (!wikiList.some((x) => x.sourceUrl === c.sourceUrl)) wikiList.push(c);
  const complete = wiki.every((a) => a !== null) && open !== null;
  return { candidates: pickCandidates([wikiList, open ? parseOpenverse(open) : []]), complete };
}

/** A candidate's thumbnail as a Claude image block, or null (not reachable in time, not a photo, too big); why goes to `problems`. */
async function thumbBlock(c: PhotoCandidate, problems: string[]): Promise<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | null> {
  const got = await loadThumb(c.url, fetch as unknown as PhotoFetch, { userAgent: USER_AGENT, maxBytes: THUMB_MAX_BYTES, signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
  if (!got.ok) {
    problems.push(`${c.source}:${got.why}`);
    return null;
  }
  return { type: 'image', source: { type: 'base64', media_type: got.mime, data: bytesToBase64(got.bytes) } };
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

/** The cached answers by dish key (rows are stored under `cacheKey`: rows of an older version are never read). */
async function readCache(admin: SupabaseClient, keys: string[]): Promise<Map<string, DishPhotoInfo | null>> {
  const out = new Map<string, DishPhotoInfo | null>();
  const byRow = new Map(keys.map((k) => [cacheKey(k), k]));
  try {
    const { data, error } = await admin.from(CACHE_TABLE).select('dish_key,photo,checked_at').in('dish_key', [...byRow.keys()]);
    if (error) throw error;
    for (const row of (data ?? []) as CacheRow[]) {
      const key = byRow.get(row.dish_key);
      if (key && cacheFresh(row)) out.set(key, cleanDishPhoto(row.photo));
    }
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
    const { error } = await admin.from(CACHE_TABLE).upsert(rows.map((r) => ({ ...r, dish_key: cacheKey(r.dish_key), checked_at: now })), { onConflict: 'dish_key' });
    if (error) throw error;
  } catch (error) {
    console.warn('[dish-photo] cache not written:', error instanceof Error ? error.message : JSON.stringify(error));
  }
}

serveAi('dishphoto', async (body, ctx) => {
  const dishes = cleanDishPhotoRequest(body);
  if (!dishes) return jsonResponse({ error: 'Thiếu tên món.' }, 400);
  const found = new Map<string, DishPhotoInfo | null>(await readCache(ctx.admin, dishes.map((d) => d.key)));
  // Answered by the key of the name the app sent (it matches by that); looked up once per core dish.
  const answer = (): { dishes: DishPhotoResult[] } => ({ dishes: dishes.map((d) => ({ name: d.name, key: d.nameKey, photo: found.get(d.key) ?? null })) });

  const todo = dishes.filter((d, i) => !found.has(d.key) && dishes.findIndex((x) => x.key === d.key) === i);
  if (todo.length === 0) return jsonResponse({ result: answer() });

  // Search every dish at once; one that is not done inside the budget counts as "nothing found" (and is not cached).
  const searched = await Promise.all(todo.map((d) => within(findCandidates(d), LOOKUP_BUDGET_MS, { candidates: [], complete: false })));
  const problems: string[] = [];
  const withThumbs = await Promise.all(
    searched.map(async (s) => {
      const blocks = await Promise.all(s.candidates.map((c) => within(thumbBlock(c, problems), THUMB_TIMEOUT_MS + 500, null)));
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
    if (withThumbs[i].complete && withThumbs[i].candidates.length === 0) toCache.push({ dish_key: todo[i].key, name: todo[i].core, photo: null });
  }
  if (asked.length === 0) {
    // Nothing for the model to look at: no call, so no usage row either. Say why in the logs (a library refusing every download).
    console.warn('[dish-photo] no candidate photo could be loaded:', JSON.stringify({ dishes: todo.length, candidates: searched.reduce((n, s) => n + s.candidates.length, 0), problems: problems.slice(0, 12) }));
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
        if (chosen || complete) toCache.push({ dish_key: dish.key, name: dish.core, photo: chosen });
      }
      await writeCache(ctx.admin, toCache);
      return answer();
    },
  };
});
