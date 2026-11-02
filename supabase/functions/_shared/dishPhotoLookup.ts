// Finding a real photo of a dish on the server (Deno): the searches of the two free photo libraries, the thumbnails, the cache
// (table dish_photos) and the model's check, shared by dish-photo (the app's request) and tempt-me (the temptation pool's pictures,
// 0.26.2). The pure parts (queries, parsing, licences, the prompt and tool) are in dishPhoto.ts.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  bytesToBase64,
  cacheFresh,
  cacheKey,
  cleanDishPhoto,
  cleanPicks,
  DISH_PHOTO_ASK,
  DISH_PHOTO_SYSTEM,
  DISH_PHOTO_TOOL,
  dishHeading,
  loadThumb,
  MAX_DISHES,
  openverseSearchUrl,
  parseOpenverse,
  parseWikimedia,
  photoHeading,
  photoUserAgent,
  pickCandidates,
  wikimediaSearchUrl,
  type DishPhotoInfo,
  type DishPhotoRequestDish,
  type PhotoCandidate,
  type PhotoFetch,
} from './dishPhoto.ts';

const USER_AGENT = photoUserAgent(Deno.env.get('DISH_PHOTO_CONTACT') ?? undefined);
/** One library search, one thumbnail, and all the searches of a request together. */
const SEARCH_TIMEOUT_MS = 6000;
export const THUMB_TIMEOUT_MS = 6000;
export const LOOKUP_BUDGET_MS = 12_000;
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
export async function findCandidates(dish: DishPhotoRequestDish): Promise<{ candidates: PhotoCandidate[]; complete: boolean }> {
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

export type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** A candidate's thumbnail as a Claude image block, or null (not reachable in time, not a photo, too big); why goes to `problems`. */
export async function thumbBlock(c: PhotoCandidate, problems: string[]): Promise<ImageBlock | null> {
  const got = await loadThumb(c.url, fetch as unknown as PhotoFetch, { userAgent: USER_AGENT, maxBytes: THUMB_MAX_BYTES, signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
  if (!got.ok) {
    problems.push(`${c.source}:${got.why}`);
    return null;
  }
  return { type: 'image', source: { type: 'base64', media_type: got.mime, data: bytesToBase64(got.bytes) } };
}

/** Resolves to `fallback` when `work` takes longer than `ms`. */
export function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

type CacheRow = { dish_key: string; photo: unknown; checked_at: string };

/** The cached answers by dish key (rows are stored under `cacheKey`: rows of an older version are never read). */
export async function readCache(admin: SupabaseClient, keys: string[]): Promise<Map<string, DishPhotoInfo | null>> {
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

export async function writeCache(admin: SupabaseClient, rows: { dish_key: string; name: string; photo: DishPhotoInfo | null }[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const now = new Date().toISOString();
    const { error } = await admin.from(CACHE_TABLE).upsert(rows.map((r) => ({ ...r, dish_key: cacheKey(r.dish_key), checked_at: now })), { onConflict: 'dish_key' });
    if (error) throw error;
  } catch (error) {
    console.warn('[dish-photo] cache not written:', error instanceof Error ? error.message : JSON.stringify(error));
  }
}

/** A dish whose candidates were searched and whose thumbnails loaded. */
export interface SearchedDish {
  dish: DishPhotoRequestDish;
  candidates: PhotoCandidate[];
  complete: boolean;
  kept: { c: PhotoCandidate; block: ImageBlock }[];
}

/** Searches every dish at once and loads the candidates' thumbnails (a dish not done inside the budget has none, not complete). */
export async function searchDishes(dishes: DishPhotoRequestDish[], problems: string[] = []): Promise<SearchedDish[]> {
  const searched = await Promise.all(dishes.map((d) => within(findCandidates(d), LOOKUP_BUDGET_MS, { candidates: [], complete: false })));
  return Promise.all(
    searched.map(async (s, i) => {
      const blocks = await Promise.all(s.candidates.map((c) => within(thumbBlock(c, problems), THUMB_TIMEOUT_MS + 500, null)));
      const kept = s.candidates.flatMap((c, j) => (blocks[j] ? [{ c, block: blocks[j]! }] : []));
      return { dish: dishes[i], ...s, kept };
    })
  );
}

/** The user message of the model's check: each dish with its candidate photos, then the instruction. */
export function checkContent(asked: SearchedDish[]): unknown[] {
  const content: unknown[] = [];
  asked.forEach((x, n) => {
    content.push({ type: 'text', text: dishHeading(n + 1, x.dish) });
    x.kept.forEach((k, j) => content.push({ type: 'text', text: photoHeading(n + 1, j + 1, k.c) }, k.block));
  });
  content.push({ type: 'text', text: DISH_PHOTO_ASK });
  return content;
}

/** The call that checks the candidates (the same as dish-photo's). */
export const checkCall = (asked: SearchedDish[]) => ({ tool: DISH_PHOTO_TOOL, system: DISH_PHOTO_SYSTEM, maxTokens: 600, messages: [{ role: 'user', content: checkContent(asked) }] });

/** What a lookup found for one dish: the photo, null when none shows it, or undefined when it could not be decided (a library did
 *  not answer, or the check failed): try again later. */
export type LookupResult = DishPhotoInfo | null | undefined;

/** Real photos for up to MAX_DISHES dishes: the cache first, then the libraries and ONE check by the model (`check`: makes the call
 *  and returns its tool input, or null when it failed). Writes the cache like dish-photo. Results by dish key. */
export async function lookupDishPhotos(
  admin: SupabaseClient,
  dishes: DishPhotoRequestDish[],
  check: (call: ReturnType<typeof checkCall>) => Promise<unknown | null>
): Promise<Map<string, LookupResult>> {
  const list = dishes.filter((d, i) => dishes.findIndex((x) => x.key === d.key) === i).slice(0, MAX_DISHES);
  const found = new Map<string, LookupResult>(await readCache(admin, list.map((d) => d.key)));
  const todo = list.filter((d) => !found.has(d.key));
  if (todo.length === 0) return found;
  const searched = await searchDishes(todo);
  const toCache: { dish_key: string; name: string; photo: DishPhotoInfo | null }[] = [];
  for (const s of searched) {
    if (s.kept.length > 0) continue;
    if (s.complete && s.candidates.length === 0) {
      found.set(s.dish.key, null);
      toCache.push({ dish_key: s.dish.key, name: s.dish.core, photo: null });
    } else found.set(s.dish.key, s.complete ? null : undefined);
  }
  const asked = searched.filter((s) => s.kept.length > 0);
  if (asked.length > 0) {
    const input = await check(checkCall(asked));
    if (input === null) {
      asked.forEach((a) => found.set(a.dish.key, undefined));
    } else {
      const picks = cleanPicks(input, asked.map((a) => a.kept.length));
      asked.forEach((a, n) => {
        const pick = picks[n];
        const chosen = pick !== null ? cleanDishPhoto(a.kept[pick].c) : null;
        found.set(a.dish.key, chosen);
        if (chosen || a.complete) toCache.push({ dish_key: a.dish.key, name: a.dish.core, photo: chosen });
      });
    }
  }
  await writeCache(admin, toCache);
  return found;
}
