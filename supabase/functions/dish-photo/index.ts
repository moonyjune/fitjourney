// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy dish-photo
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   Optional: DISH_PHOTO_CONTACT (a URL or e-mail address put in
// the User-Agent sent to Wikimedia, as their API policy asks; the app's public page when not set). The repair job uses
// PUSH_CRON_SECRET (the same as send-push's and the tempt-me seed's).
//
// A real photo of each suggested dish (meal ideas, next-meal card, cook book, cheat day dishes, the temptation pop-up), instead of an
// emoji. For each dish (at most 6):
//   0. a long AI name ("Bún bò Huế giò heo + chả cua (1 tô lớn)") is reduced to the dish itself (coreDishName: "Bún bò Huế giò heo"):
//      that is what is searched, checked and cached;
//   1. the cache (table dish_photos, keyed by "v2:" + dishKey of the core name) answers when it holds a photo checked by the current
//      check (1.3.x: `v` 3; an older one is looked up again), or a "none" younger than 30 days; a missing table only means no cache;
//   2. otherwise two free photo libraries that need no key are searched at the same time: Wikimedia Commons and Openverse. Only photos
//      under CC0 / public domain / CC BY / CC BY-SA, and (1.3.x) only files NAMED after the dish (photoMatch.ts libraryTitleOk: the
//      full-text search also matches descriptions, which brought generic "Vietnamese food" / "IMG_1234" files for any dish);
//   3. up to 3 candidates per dish are fetched (thumbnails) and sent, all dishes in ONE Claude call (model.photo), which judges each
//      picture alone: exact / similar / wrong / not food, with a confidence; only an "exact" with confidence >= 70 is kept (before,
//      the model picked one of the three, which nudged it to take a look-alike);
//   4. no confirmed library photo (1.3.x): after the answer, in the background, a web search finds pages about the dish; each page's
//      preview picture (not a generic / banner one, from a page about one thing) is judged the same way, and a confirmed one is saved
//      in dish_photos (source 'web', credited to the site), so the next request (any user) gets it. The web is searched once per
//      dish per 30 days.
// Everything is bounded (time per search and per image, a budget for the searches, candidates per dish). A request the cache answers
// in full makes no Claude call and uses no quota (its background web search, when one is due, checks the quota first).
// Cost: the check's tokens (~400 per candidate photo) and the web searches ($10 / 1000), logged under the feature `dishphoto`.
// Calls per user per day: app_settings key `ai_quota.dishphoto` (default 40).
//
// Repair (1.3.x): POST {"action":"repair","limit":6} with the header x-cron-secret = PUSH_CRON_SECRET (no user; the gateway still wants
// the anon key as Bearer). Each call takes up to `limit` (1-10) cached photos not checked by the current check, judges each with
// Sonnet 5.5, keeps the right ones (marked checked), replaces the others with a confirmed photo from the libraries or the web, or,
// when none is found, turns the row into "none" (the app shows the emoji). {"none":true} also gives the old "none" rows (no web
// search yet) a web search. Answers { processed, kept, replaced, removed, stillNone, failed, remaining, next, done, changes }; call
// again with {"after": <next>} until `done` (the end of the pass; rows that failed are retried by a new pass without `after`).
// Its cost is system cost (tempt_pool_meta.system_cost_usd via tempt_pool_add_cost), never a user's.
//
// Reported photos (1.5, "Ảnh sai?", function report-photo): a cached photo with `photoFlag` is never served. The request that meets
// it answers none (the emoji) and searches the web first after the answer; the repair takes every flagged row (both modes) and
// looks for a new photo on the web first, then the libraries. A reported or replaced picture is kept in the row's `bad` list and
// never taken again for that dish.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { aiAllowance, jsonResponse, runAiCall, serveAi, systemAllowance, type AiContext } from '../_shared/ai.ts';
import { cacheBad, cleanDishPhoto, cleanDishPhotoRequest, DISH_NAME_MAX, type DishPhotoInfo, type DishPhotoRequestDish, type DishPhotoResult } from '../_shared/dishPhoto.ts';
import { isPhotoFlagged } from '../_shared/photoReport.ts';
import { checkItemsOf, chooseLibraryPhotos, findVerifiedPhotos, readCache, searchDishes, verifyCall, verifyUrls, webPhotosFor, writeCache, type CacheWrite, type Runner } from '../_shared/dishPhotoLookup.ts';
import { cleanVerdicts, pictureKey, REPAIR_MODEL, repairDecision, repairLimit } from '../_shared/photoMatch.ts';
import { cronBody, inBackground, systemContext, systemRecord } from '../_shared/systemJobs.ts';

/** Dishes searched on the web per request (in the background). */
const WEB_PER_REQUEST = 6;

/** The web search for dishes no library photo shows, after the answer: the rows are marked "web searched" first (so requests at the
 *  same moment do not search too), then get the confirmed photo, or stay "none"; a failed search is marked to be tried again. */
async function webInBackground(ctx: AiContext, dishes: DishPhotoRequestDish[], bad: Map<string, string[]> = new Map()): Promise<void> {
  const list = dishes.filter((d, i) => dishes.findIndex((x) => x.key === d.key) === i).slice(0, WEB_PER_REQUEST);
  if (list.length === 0) return;
  await inBackground(
    (async () => {
      if (!(await aiAllowance(ctx, 'dishphoto')).ok) return;
      // The pictures known to be wrong (a photo a player reported, 1.5) stay on the row and are never taken again.
      await writeCache(ctx.admin, list.map((d) => ({ dish_key: d.key, name: d.core, photo: null, webTried: true, bad: bad.get(d.key) })));
      const run: Runner = async (call) => {
        const outcome = await runAiCall(ctx, 'dishphoto', call);
        if ('error' in outcome) {
          console.warn('[dish-photo] web photo call failed:', outcome.error);
          return null;
        }
        return outcome;
      };
      const found = await webPhotosFor(list.map((d) => d.core), run, new Set(list.flatMap((d) => bad.get(d.key) ?? [])));
      await writeCache(
        ctx.admin,
        list.map((d, i) => ({ dish_key: d.key, name: d.core, photo: found[i] ?? null, webTried: found[i] !== undefined, bad: bad.get(d.key) }))
      );
    })().catch((error) => console.warn('[dish-photo] web photos failed:', error instanceof Error ? error.message : error))
  );
}

// ----- the repair job -----

type RepairRow = { dish_key: string; name: string | null; photo: unknown };

/** One step of the repair (see the header): up to `limit` rows, judged and fixed with REPAIR_MODEL, cost logged as system cost. */
async function repairStep(admin: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const allowed = await systemAllowance(admin);
  if (!allowed.ok) return jsonResponse({ error: allowed.error }, allowed.status);
  const limit = repairLimit(body.limit, 6, 10);
  const withNone = body.none === true;
  const pending = () => {
    let q = admin.from('dish_photos').select('dish_key,name,photo', { count: 'exact' }).like('dish_key', 'v2:%');
    // Not checked by the current check: a photo without `v` (or, with "none", an old null "none" without a web search); and (1.5)
    // every photo a player reported wrong (`photoFlag`), in both modes.
    q = withNone
      ? q.or('photo.is.null,and(photo->>v.is.null,photo->>none.is.null),photo->>photoFlag.not.is.null')
      : q.not('photo', 'is', null).or('photo->>v.is.null,photo->>photoFlag.not.is.null');
    return q;
  };
  // `after`: the `next` of the previous step (rows are taken in dish_key order), so a row that could not be decided does not hold
  // the queue up; a new pass (no `after`) tries those again.
  const after = typeof body.after === 'string' && body.after.startsWith('v2:') ? body.after : null;
  const { data, error } = await (after ? pending().gt('dish_key', after) : pending()).order('dish_key').limit(limit);
  if (error) return jsonResponse({ error: `dish_photos not read: ${error.message}` }, 500);
  const rows = (data ?? []) as RepairRow[];
  const ctx = systemContext(admin);
  const record = systemRecord(admin, 'dish-photo repair');
  let cost = 0;
  const run: Runner = async (call) => {
    const outcome = await runAiCall(ctx, 'dishphoto', call, {
      model: REPAIR_MODEL,
      record: async (usage, costUsd, model) => {
        cost += costUsd;
        await record(usage, costUsd, model);
      },
    });
    if ('error' in outcome) {
      console.warn('[dish-photo] repair call failed:', outcome.error);
      return null;
    }
    return outcome;
  };

  const items = rows.flatMap((r) => {
    const key = r.dish_key.slice(3);
    const name = (r.name ?? '').trim() || key;
    const dish = cleanDishPhotoRequest({ dishes: [{ name: name.slice(0, DISH_NAME_MAX) }] })?.[0];
    const p = r.photo as Record<string, unknown> | null;
    const url = p && typeof p.url === 'string' && p.none !== true ? p.url : null;
    // A photo a player reported wrong (1.5) is not judged again: it is invalid, and its picture is never taken again (`bad`).
    const flagged = !!url && isPhotoFlagged(p);
    return dish ? [{ key, dish: { ...dish, key }, url, old: p, flagged, bad: cacheBad(p) }] : [];
  });
  // 1. The current photos (not reported), judged.
  const withPhoto = items.filter((x) => x.url && !x.flagged);
  const verdicts = await verifyUrls(withPhoto.map((x) => ({ dish: x.dish.core, url: x.url! })), run);
  if (verdicts === null) return jsonResponse({ error: 'The check failed; nothing changed. Try again.', costUsd: cost }, 502);
  const current = new Map(withPhoto.map((x, i) => [x.key, verdicts[i]]));
  const keeps = (x: (typeof items)[number]) => !!x.url && !x.flagged && repairDecision(current.get(x.key) ?? null, false, true) === 'keep';
  // 2. A new photo for each one that is not confirmed (never the one found wrong, nor one reported): a reported one is searched on
  //    the web first, the others in the libraries first.
  const needNew = items.filter((x) => !keeps(x));
  const excludeOf = (list: typeof items) => new Set(list.flatMap((x) => [...(x.url ? [pictureKey(x.url)] : []), ...x.bad]));
  const reported = needNew.filter((x) => x.flagged);
  const others = needNew.filter((x) => !x.flagged);
  const [foundReported, foundOthers] = await Promise.all([
    reported.length > 0 ? findVerifiedPhotos(reported.map((x) => x.dish), run, { exclude: excludeOf(reported), webFirst: true }) : Promise.resolve([]),
    others.length > 0 ? findVerifiedPhotos(others.map((x) => x.dish), run, { exclude: excludeOf(others) }) : Promise.resolve([]),
  ]);
  const newPhoto = new Map([...reported.map((x, i) => [x.key, foundReported[i]] as const), ...others.map((x, i) => [x.key, foundOthers[i]] as const)]);

  const writes: CacheWrite[] = [];
  const changes: Record<string, unknown>[] = [];
  const tally = { kept: 0, replaced: 0, removed: 0, stillNone: 0, failed: 0 };
  for (const x of items) {
    const v = current.get(x.key) ?? null;
    const got = newPhoto.get(x.key);
    const tag = x.flagged ? { reported: true } : {};
    if (keeps(x)) {
      tally.kept++;
      // Written back as it was, now marked with the check's version.
      writes.push({ dish_key: x.key, name: x.dish.core, photo: cleanDishPhoto(x.old), bad: x.bad });
      continue;
    }
    if (got === undefined) {
      tally.failed++;
      changes.push({ dish: x.dish.core, action: 'failed', old: x.url, verdict: v, ...tag });
      continue;
    }
    const decision = x.flagged ? (got ? 'replace' : 'remove') : repairDecision(x.url ? v : null, !!got, true);
    // The picture that goes is remembered as wrong for the dish.
    const bad = x.url ? [...x.bad, pictureKey(x.url)] : x.bad;
    if (got) {
      tally.replaced++;
      writes.push({ dish_key: x.key, name: x.dish.core, photo: got, webTried: true, bad });
      changes.push({ dish: x.dish.core, action: 'replace', old: x.url, new: got.url, source: got.source, verdict: v, ...tag });
    } else {
      if (x.url) tally.removed++;
      else tally.stillNone++;
      writes.push({ dish_key: x.key, name: x.dish.core, photo: null, webTried: true, bad });
      changes.push({ dish: x.dish.core, action: x.url ? 'remove' : 'none', old: x.url, verdict: v, decision, ...tag });
    }
  }
  await writeCache(admin, writes);
  const { count } = await pending().limit(1);
  // `done`: this pass reached the end (rows that failed stay pending: `remaining` counts them; a new pass without `after` retries).
  const next = rows.length > 0 ? rows[rows.length - 1].dish_key : after;
  return jsonResponse({ processed: items.length, ...tally, remaining: count ?? null, next, done: rows.length < limit, costUsd: Math.round(cost * 1e6) / 1e6, changes });
}

/** The repair bypasses the user sign-in, only with the cron secret. */
async function repairGate(req: Request, admin: SupabaseClient): Promise<Response | null> {
  const got = await cronBody(req);
  if (got === null) return null;
  if ('forbidden' in got) return jsonResponse({ error: 'forbidden' }, 401);
  if (got.body.action !== 'repair') return jsonResponse({ error: 'Unknown action (expected {"action":"repair"}).' }, 400);
  return repairStep(admin, got.body);
}

serveAi(
  'dishphoto',
  async (body, ctx) => {
    const dishes = cleanDishPhotoRequest(body);
    if (!dishes) return jsonResponse({ error: 'Thiếu tên món.' }, 400);
    // `bad`: pictures known to be wrong for each dish, never taken again. 1.5: a photo a player reported reads as a "none" the web
    // was not searched for: the emoji now, the web searched first after the answer.
    const bad = new Map<string, string[]>();
    const cached = await readCache(ctx.admin, dishes.map((d) => d.key), bad);
    const found = new Map<string, DishPhotoInfo | null>([...cached].map(([k, e]) => [k, e.photo]));
    // A cached "none" the web was not searched for yet: searched after the answer.
    const webTodo = dishes.filter((d) => cached.has(d.key) && !cached.get(d.key)!.photo && !cached.get(d.key)!.webTried);
    // Answered by the key of the name the app sent (it matches by that); looked up once per core dish.
    const answer = (): { dishes: DishPhotoResult[] } => ({ dishes: dishes.map((d) => ({ name: d.name, key: d.nameKey, photo: found.get(d.key) ?? null })) });

    const todo = dishes.filter((d, i) => !found.has(d.key) && dishes.findIndex((x) => x.key === d.key) === i);
    if (todo.length === 0) {
      await webInBackground(ctx, webTodo, bad);
      return jsonResponse({ result: answer() });
    }

    // Search every dish at once; one that is not done inside the budget counts as "nothing found" (and is not cached).
    const problems: string[] = [];
    const searched = await searchDishes(todo, problems, new Set(todo.flatMap((d) => bad.get(d.key) ?? [])));
    const toCache: CacheWrite[] = [];
    for (const s of searched) {
      if (s.kept.length > 0) continue;
      found.set(s.dish.key, null);
      if (s.complete && s.candidates.length === 0) {
        toCache.push({ dish_key: s.dish.key, name: s.dish.core, photo: null, bad: bad.get(s.dish.key) });
        webTodo.push(s.dish);
      }
    }
    const asked = searched.filter((x) => x.kept.length > 0);
    if (asked.length === 0) {
      if (problems.length > 0) console.warn('[dish-photo] no candidate photo could be loaded:', JSON.stringify({ dishes: todo.length, problems: problems.slice(0, 12) }));
      await writeCache(ctx.admin, toCache);
      await webInBackground(ctx, webTodo, bad);
      return jsonResponse({ result: answer() });
    }

    const items = checkItemsOf(asked);
    return {
      responseKey: 'result',
      call: verifyCall(items),
      shape: async (input, info) => {
        const picked = chooseLibraryPhotos(asked, cleanVerdicts(input, items.length));
        asked.forEach((s, n) => {
          const photo = picked[n] ?? null;
          found.set(s.dish.key, photo);
          // A "none" is cached only when every library answered (a timeout may have hidden the right photo); then the web is next.
          if (photo || s.complete) toCache.push({ dish_key: s.dish.key, name: s.dish.core, photo, bad: bad.get(s.dish.key) });
          if (!photo && s.complete) webTodo.push(s.dish);
        });
        await writeCache(ctx.admin, toCache);
        await webInBackground(info.ctx, webTodo, bad);
        return answer();
      },
    };
  },
  { preAuth: repairGate }
);
