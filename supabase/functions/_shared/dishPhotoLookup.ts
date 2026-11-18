// Finding a real photo of a dish on the server (Deno): the searches of the two free photo libraries, the web search for a page about
// the dish (its preview picture), the thumbnails, the cache (table dish_photos) and the model's check, shared by dish-photo (the app's
// request and its repair job) and tempt-me (the temptation pool's pictures and their repair). The pure parts are in dishPhoto.ts
// (queries, parsing, licences, the cache values) and photoMatch.ts (which candidates may be shown, the check's prompt and verdicts).
//
// 1.3.x: a library candidate must be NAMED after the dish (libraryTitleOk: the full-text search also matched descriptions, so
// generic files came back for any dish); a web picture must not look generic and must come from a page about one thing; and the
// model judges every picture alone (exact / similar / wrong / not food, with a confidence) instead of picking one of three, so a
// look-alike is no longer taken. A photo is cached with the check's version; older cached photos are looked up again.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AiCall, AiCallResult } from './ai.ts';
import {
  bytesToBase64,
  cacheEntry,
  cacheKey,
  cachePhotoValue,
  loadThumb,
  openverseSearchUrl,
  parseOpenverse,
  parseWikimedia,
  photoUserAgent,
  pickCandidates,
  wikimediaSearchUrl,
  type DishPhotoInfo,
  type DishPhotoRequestDish,
  type PhotoCandidate,
  type PhotoFetch,
} from './dishPhoto.ts';
import {
  bestAccepted,
  cleanVerdicts,
  cleanWebPages,
  genericPictureUrl,
  libraryTitleOk,
  pictureKey,
  VERIFY_ASK,
  VERIFY_SYSTEM,
  VERIFY_TOOL,
  verifyHeading,
  WEB_GROUP,
  WEB_PAGES_SYSTEM,
  WEB_PAGES_TOOL,
  WEB_SEARCHES,
  webPagesPrompt,
  type VerdictOut,
} from './photoMatch.ts';
import { pagePhoto, type PageFetch } from './webImage.ts';
import { seenInEvidence, webToolsFor } from './webtools.ts';

const USER_AGENT = photoUserAgent(Deno.env.get('DISH_PHOTO_CONTACT') ?? undefined);
/** One library search, one thumbnail, and all the searches of a request together. */
const SEARCH_TIMEOUT_MS = 6000;
export const THUMB_TIMEOUT_MS = 6000;
export const LOOKUP_BUDGET_MS = 12_000;
const THUMB_MAX_BYTES = 1_500_000;
const CACHE_TABLE = 'dish_photos';

/** Makes one Claude call for a photo job (the caller picks the feature, model and where the cost is logged); null when it failed. */
export type Runner = (call: AiCall) => Promise<AiCallResult | null>;

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

/** The candidates for one dish (Wikimedia and Openverse in parallel): only files named after the dish (libraryTitleOk), none of
 *  `exclude` (picture keys: a photo found wrong, another dish's), and whether every search answered (a "none" is cached only then). */
export async function findCandidates(dish: DishPhotoRequestDish, exclude?: Set<string>): Promise<{ candidates: PhotoCandidate[]; complete: boolean }> {
  // The core name and a shorter one (the whole AI name, with portions and side dishes, finds nothing), and the English hint.
  const [wiki, open] = await Promise.all([
    Promise.all(dish.queries.slice(0, 2).map((q) => fetchJson(wikimediaSearchUrl(q)))),
    fetchJson(openverseSearchUrl(dish.en || dish.key)),
  ]);
  const ok = (c: PhotoCandidate) => libraryTitleOk(c.title, dish) && !exclude?.has(pictureKey(c.url));
  const wikiList: PhotoCandidate[] = [];
  for (const answer of wiki) for (const c of answer ? parseWikimedia(answer) : []) if (ok(c) && !wikiList.some((x) => x.sourceUrl === c.sourceUrl)) wikiList.push(c);
  const complete = wiki.every((a) => a !== null) && open !== null;
  return { candidates: pickCandidates([wikiList, open ? parseOpenverse(open).filter(ok) : []]), complete };
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

/** Any picture URL as a Claude image block (downloaded here, bounded like a thumbnail), or null. */
export async function imageBlockOf(url: string): Promise<ImageBlock | null> {
  const got = await loadThumb(url, fetch as unknown as PhotoFetch, { userAgent: USER_AGENT, maxBytes: THUMB_MAX_BYTES * 2, signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
  return got.ok ? { type: 'image', source: { type: 'base64', media_type: got.mime, data: bytesToBase64(got.bytes) } } : null;
}

/** Resolves to `fallback` when `work` takes longer than `ms`. */
export function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

type CacheRow = { dish_key: string; photo: unknown; checked_at: string };
/** A cache row still good: its photo (null: none found) and whether the web was searched for it; `flagged`: its photo was reported
 *  wrong by a player (1.5, "Ảnh sai?"), so it reads as none and the web is searched first; `bad`: pictures never to take again. */
export type CachedPhoto = { photo: DishPhotoInfo | null; webTried: boolean; flagged?: boolean; bad?: string[] };

/** The good cached answers by dish key (rows are stored under `cacheKey`: rows of an older key version are never read; a photo
 *  checked by an older check is not good, so it is looked up again). `badOut` gets every row's wrong pictures, stale rows included,
 *  so a new search leaves them out. */
export async function readCache(admin: SupabaseClient, keys: string[], badOut?: Map<string, string[]>): Promise<Map<string, CachedPhoto>> {
  const out = new Map<string, CachedPhoto>();
  const byRow = new Map(keys.map((k) => [cacheKey(k), k]));
  try {
    const { data, error } = await admin.from(CACHE_TABLE).select('dish_key,photo,checked_at').in('dish_key', [...byRow.keys()]);
    if (error) throw error;
    for (const row of (data ?? []) as CacheRow[]) {
      const key = byRow.get(row.dish_key);
      const entry = cacheEntry(row);
      if (key && entry.bad.length > 0) badOut?.set(key, entry.bad);
      if (key && entry.fresh) out.set(key, { photo: entry.photo, webTried: entry.webTried, ...(entry.flagged ? { flagged: true } : {}), ...(entry.bad.length ? { bad: entry.bad } : {}) });
    }
  } catch (error) {
    // The table is created by schema.sql, which is run by hand: until then there is simply no cache.
    console.warn('[dish-photo] cache not read:', error instanceof Error ? error.message : JSON.stringify(error));
  }
  return out;
}

export type CacheWrite = { dish_key: string; name: string; photo: DishPhotoInfo | null; webTried?: boolean; bad?: string[] };

/** Writes answers to the cache (`dish_key` without the version prefix): a photo with the check's version, or a "none" marker. */
export async function writeCache(admin: SupabaseClient, rows: CacheWrite[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const now = new Date().toISOString();
    const { error } = await admin
      .from(CACHE_TABLE)
      .upsert(rows.map((r) => ({ dish_key: cacheKey(r.dish_key), name: r.name, photo: cachePhotoValue(r.photo, r.webTried === true || r.photo?.source === 'web', r.bad), checked_at: now })), { onConflict: 'dish_key' });
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
export async function searchDishes(dishes: DishPhotoRequestDish[], problems: string[] = [], exclude?: Set<string>): Promise<SearchedDish[]> {
  const searched = await Promise.all(dishes.map((d) => within(findCandidates(d, exclude), LOOKUP_BUDGET_MS, { candidates: [], complete: false })));
  return Promise.all(
    searched.map(async (s, i) => {
      const blocks = await Promise.all(s.candidates.map((c) => within(thumbBlock(c, problems), THUMB_TIMEOUT_MS + 500, null)));
      const kept = s.candidates.flatMap((c, j) => (blocks[j] ? [{ c, block: blocks[j]! }] : []));
      return { dish: dishes[i], ...s, kept };
    })
  );
}

/** One picture for the model's check: the dish it should show, its title when known, and the image. */
export type CheckItem = { dish: string; title?: string; block: ImageBlock };

/** The call that judges each picture alone (photoMatch.ts VERIFY_*), pictures numbered 1..n. */
export function verifyCall(items: CheckItem[]): AiCall {
  const content: unknown[] = [];
  items.forEach((x, i) => content.push({ type: 'text', text: verifyHeading(i + 1, x.dish, x.title) }, x.block));
  content.push({ type: 'text', text: VERIFY_ASK });
  return { tool: VERIFY_TOOL, system: VERIFY_SYSTEM, maxTokens: 300 + 60 * items.length, messages: [{ role: 'user', content }] };
}

/** The verdicts of `items` (one call), or null when the call failed. */
export async function verifyItems(items: CheckItem[], run: Runner): Promise<VerdictOut[] | null> {
  if (items.length === 0) return [];
  const outcome = await run(verifyCall(items));
  return outcome ? cleanVerdicts(outcome.input, items.length) : null;
}

/** The verdicts of pictures given by URL (each downloaded; one that cannot be has the verdict null), or null when the call failed. */
export async function verifyUrls(list: { dish: string; url: string }[], run: Runner): Promise<VerdictOut[] | null> {
  const blocks = await Promise.all(list.map((c) => within(imageBlockOf(c.url), THUMB_TIMEOUT_MS + 2000, null)));
  const shown = list.flatMap((c, i) => (blocks[i] ? [{ i, item: { dish: c.dish, block: blocks[i]! } }] : []));
  const out: VerdictOut[] = list.map(() => ({ verdict: null, confidence: 0 }));
  if (shown.length === 0) return out;
  const verdicts = await verifyItems(shown.map((s) => s.item), run);
  if (verdicts) {
    shown.forEach((s, n) => (out[s.i] = verdicts[n]));
    return out;
  }
  if (shown.length === 1) return null;
  // 1.6.0: one picture the API rejects (format, size) used to fail the whole check, every time, so a rephoto loop stuck on the same
  // queue head. Check each picture alone instead; a picture that still fails gets no verdict (= not confirmed → a new photo is sought).
  let anyOk = false;
  for (const s of shown) {
    const one = await verifyItems([s.item], run);
    if (one) {
      out[s.i] = one[0];
      anyOk = true;
    }
  }
  return anyOk ? out : null;
}

/** The thumbnails of searched dishes as one list for the check (dish by dish, in order). */
export const checkItemsOf = (searched: SearchedDish[]): CheckItem[] => searched.flatMap((s) => s.kept.map((k) => ({ dish: s.dish.core, title: k.c.title, block: k.block })));

/** Each dish's photo from the verdicts of `checkItemsOf(searched)`: its best accepted candidate, or null. `taken` (picture keys) is
 *  skipped and gets the chosen ones. */
export function chooseLibraryPhotos(searched: SearchedDish[], verdicts: VerdictOut[], taken?: Set<string>): (DishPhotoInfo | null)[] {
  let at = 0;
  return searched.map((s) => {
    const own = verdicts.slice(at, at + s.kept.length);
    at += s.kept.length;
    const usable = own.map((v, i) => (taken?.has(pictureKey(s.kept[i].c.url)) ? { verdict: null, confidence: 0 } : v));
    const best = bestAccepted(usable);
    if (best === null) return null;
    const { title: _t, ...photo } = s.kept[best].c;
    taken?.add(pictureKey(photo.url));
    return photo;
  });
}

/** The library photos of searched dishes, checked in one call: per dish the photo or null; undefined for every dish that had
 *  candidates when the check failed. */
export async function pickLibraryPhotos(searched: SearchedDish[], run: Runner, taken?: Set<string>): Promise<(DishPhotoInfo | null | undefined)[]> {
  const items = checkItemsOf(searched);
  if (items.length === 0) return searched.map(() => null);
  const verdicts = await verifyItems(items, run);
  if (!verdicts) return searched.map((s) => (s.kept.length > 0 ? undefined : null));
  return chooseLibraryPhotos(searched, verdicts, taken);
}

/** Photos from the web for `names` (WEB_GROUP per search call, the groups at once): the model searches for pages about each dish
 *  (only pages the search really showed, about one thing), each page's preview picture is read here (redirects checked, public
 *  addresses only), refused when it looks generic, is in `taken` or appears twice, and then judged by the model. Per name: the photo
 *  (source 'web', credited to the site), null when none was confirmed, undefined when a call failed. */
export async function webPhotosFor(names: string[], run: Runner, taken: Set<string> = new Set()): Promise<(DishPhotoInfo | null | undefined)[]> {
  const out: (DishPhotoInfo | null | undefined)[] = names.map(() => undefined);
  const groups = Array.from({ length: Math.ceil(names.length / WEB_GROUP) }, (_, g) => g * WEB_GROUP);
  await Promise.all(
    groups.map(async (start) => {
      const group = names.slice(start, start + WEB_GROUP);
      const outcome = await run({
        tool: WEB_PAGES_TOOL,
        system: WEB_PAGES_SYSTEM,
        maxTokens: 3000,
        attemptTimeoutMs: 90_000,
        messages: [{ role: 'user', content: `<request>${webPagesPrompt(group)}</request>` }],
        serverTools: (model: string) => webToolsFor(model, { maxSearches: WEB_SEARCHES, maxFetches: 0 }),
      });
      if (!outcome) return;
      const evidence = outcome.web?.evidence;
      const pages = cleanWebPages(outcome.input, group.length, (url) => !!evidence && seenInEvidence(url, evidence));
      const photos = await Promise.all(pages.map((list) => Promise.all(list.map((p) => within(pagePhoto(p, fetch as unknown as PageFetch), 9000, null)))));
      const seen = new Set<string>();
      const candidates: { n: number; dish: string; url: string; pageUrl: string; credit: string }[] = [];
      photos.forEach((list, n) =>
        list.forEach((p) => {
          const key = p ? pictureKey(p.url) : '';
          if (!p || genericPictureUrl(p.url) || taken.has(key) || seen.has(key)) return;
          seen.add(key);
          candidates.push({ n, dish: group[n], url: p.url, pageUrl: p.pageUrl, credit: p.credit });
        })
      );
      const verdicts = await verifyUrls(candidates, run);
      group.forEach((_, n) => {
        if (!verdicts) return; // undecided
        const own = candidates.flatMap((c, i) => (c.n === n ? [{ c, v: verdicts[i] }] : []));
        const best = bestAccepted(own.map((x) => x.v));
        const pick = best !== null ? own[best].c : null;
        if (pick && !taken.has(pictureKey(pick.url))) {
          taken.add(pictureKey(pick.url));
          out[start + n] = { url: pick.url, sourceUrl: pick.pageUrl, author: pick.credit, license: '', source: 'web' };
        } else out[start + n] = null;
      });
    })
  );
  return out;
}

/** A confirmed photo for each dish, the cache not read: the libraries first, then the web for the rest. Per dish: the photo, null
 *  when none was confirmed anywhere (only when every search answered), undefined when it could not be decided. `exclude`: pictures
 *  that must not come back (found wrong); `taken`: other dishes' pictures (gets the chosen ones). */
export async function findVerifiedPhotos(
  dishes: DishPhotoRequestDish[],
  run: Runner,
  opts: { exclude?: Set<string>; taken?: Set<string>; web?: boolean; webFirst?: boolean } = {}
): Promise<(DishPhotoInfo | null | undefined)[]> {
  const taken = opts.taken ?? new Set<string>();
  const exclude = new Set([...(opts.exclude ?? []), ...taken]);
  if (opts.webFirst && dishes.length > 0) {
    // 1.5, a photo a player reported wrong: the web first (a page about the dish), the libraries only for the dishes it did not
    // settle. The excluded pictures count as taken, so the web never brings the reported one back.
    const webTaken = new Set([...exclude, ...taken]);
    const web = await webPhotosFor(dishes.map((d) => d.core), run, webTaken);
    for (const p of web) if (p) taken.add(pictureKey(p.url));
    const rest = web.flatMap((p, i) => (p ? [] : [i]));
    if (rest.length === 0) return web;
    const lib = await findVerifiedPhotos(rest.map((i) => dishes[i]), run, { exclude, taken, web: false });
    const out = [...web];
    rest.forEach((i, n) => {
      // Found in a library: the photo. Not there either: none when the web answered (null), else undecided.
      out[i] = lib[n] ? lib[n] : web[i] === null && lib[n] === null ? null : undefined;
    });
    return out;
  }
  const searched = await searchDishes(dishes, [], exclude);
  const library = await pickLibraryPhotos(searched, run, taken);
  const out = library.map((p, i) => (p === null && !searched[i].complete ? undefined : p));
  if (opts.web === false) return out;
  const missing = out.flatMap((p, i) => (p ? [] : [i]));
  if (missing.length === 0) return out;
  const web = await webPhotosFor(missing.map((i) => dishes[i].core), run, taken);
  missing.forEach((i, n) => {
    // Found on the web: the photo. Not found there: none, unless the library side could not decide (then it is tried again).
    out[i] = web[n] ? web[n] : web[n] === null ? out[i] : undefined;
  });
  return out;
}
