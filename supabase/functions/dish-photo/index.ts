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

import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { cleanDishPhoto, cleanDishPhotoRequest, cleanPicks, type DishPhotoInfo, type DishPhotoRequestDish, type DishPhotoResult } from '../_shared/dishPhoto.ts';
import { checkCall, readCache, searchDishes, writeCache } from '../_shared/dishPhotoLookup.ts';

/** TODO(image generation): the last fallback when no real photo shows the dish. Returns null until an image provider is chosen; a
 *  generated picture must then be labelled as such in the app (source 'generated'), never passed off as a photograph. */
async function generateDishPhoto(_dish: DishPhotoRequestDish): Promise<DishPhotoInfo | null> {
  return null;
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
  const problems: string[] = [];
  const withThumbs = await searchDishes(todo, problems);

  const toCache: { dish_key: string; name: string; photo: DishPhotoInfo | null }[] = [];
  const asked = withThumbs.filter((x) => x.kept.length > 0);
  for (let i = 0; i < todo.length; i++) {
    if (withThumbs[i].kept.length > 0) continue;
    const photo = await generateDishPhoto(todo[i]);
    found.set(todo[i].key, photo);
    if (withThumbs[i].complete && withThumbs[i].candidates.length === 0) toCache.push({ dish_key: todo[i].key, name: todo[i].core, photo: null });
  }
  if (asked.length === 0) {
    // Nothing for the model to look at: no call, so no usage row either. Say why in the logs (a library refusing every download).
    console.warn('[dish-photo] no candidate photo could be loaded:', JSON.stringify({ dishes: todo.length, candidates: withThumbs.reduce((n, s) => n + s.candidates.length, 0), problems: problems.slice(0, 12) }));
    await writeCache(ctx.admin, toCache);
    return jsonResponse({ result: answer() });
  }

  return {
    responseKey: 'result',
    call: checkCall(asked),
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
