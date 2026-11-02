import { cleanPlacePhoto, placeNameKey, type CheatPlace, type CheatPlacesAnswer, type CheatWishDish, type PlacePhoto } from '../../supabase/functions/_shared/places';

// Cheat day > places: what the user found is kept. Every "find places" answer goes into a history (newest first, at most
// MAX_SEARCHES), each place can be starred into "saved places", and both are saved to the cloud (user_data `cheatPlaces`) so they
// survive signing out and show on another device. Kept compact (no reviews or search URLs): name, dish, address, a link, a short
// note, and the real photo already found (so it shows again without asking). "Suggest more" pages are joined here for showing,
// each place and dish once. Pure: unit-tested in jest.

export const MAX_SEARCHES = 30;
export const MAX_SAVED = 100;
/** Places kept per search (a first answer plus "suggest more" pages). */
export const MAX_PLACES_PER_SEARCH = 18;
const MAX_REMOVED = 200;

/** A place as kept in the history and in "saved places". */
export interface SavedPlace {
  /** The same place: its name and address compared without accents or punctuation. */
  key: string;
  name: string;
  dish: string;
  address: string | null;
  /** Its Google Maps page when the search saw one, else its first source. */
  link: string | null;
  /** One short line: rating with its source, price, opening hours. */
  notes: string;
  distanceKm: number | null;
  photo: PlacePhoto | null;
  /** The area it was searched around, and the wish of that search. */
  near: string;
  wish: string;
  /** When it was found (history) or starred (saved). */
  atISO: string;
}

export interface SavedDish {
  name: string;
  why: string;
  kcal: number | null;
  emoji: string | null;
  photo: PlacePhoto | null;
}

/** One "find places" answer as kept. */
export interface PlacesSearch {
  id: string;
  atISO: string;
  wish: string;
  near: string;
  readWish: string | null;
  dishes: SavedDish[];
  places: SavedPlace[];
}

/** Something removed on one device, so a merge with another device's copy does not bring it back (unless it was added again
 *  after: saved again, or a newer search). `id`: "s:<search id>" or "p:<place key>". */
export interface Removed {
  id: string;
  atISO: string;
}

export interface CheatPlacesData {
  history: PlacesSearch[];
  saved: SavedPlace[];
  removed: Removed[];
  /** "Clear history": every search made before this is gone everywhere. */
  clearedAtISO: string | null;
}

export const EMPTY_CHEAT_PLACES: CheatPlacesData = { history: [], saved: [], removed: [], clearedAtISO: null };

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const iso = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const httpUrl = (v: unknown): string | null => (typeof v === 'string' && /^https?:\/\/[^\s<>"]+$/i.test(v) && v.length <= 1000 ? v : null);

/** The key a place is known by: its name and address without accents or punctuation. */
export const savedPlaceKey = (name: string, address: string | null): string => `${placeNameKey(name)}|${placeNameKey(address ?? '')}`;

/** A place of an answer as it is kept. */
export function placeToSaved(p: CheatPlace, ctx: { near: string; wish: string; atISO: string }): SavedPlace {
  const notes = [
    p.rating ? `${p.rating.value}★ ${p.rating.source}` : '',
    p.priceRange ?? '',
    p.openStatus ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 160);
  return {
    key: savedPlaceKey(p.name, p.address),
    name: p.name,
    dish: p.dish,
    address: p.address,
    link: p.mapsUrl ?? p.sources[0]?.url ?? p.rating?.url ?? null,
    notes,
    distanceKm: p.distanceKm,
    photo: p.photo ?? null,
    near: text(ctx.near, 160),
    wish: text(ctx.wish, 200),
    atISO: ctx.atISO,
  };
}

const dishToSaved = (d: CheatWishDish): SavedDish => ({ name: d.name, why: d.why, kcal: d.kcal, emoji: d.emoji, photo: d.photo ?? null });

/** An answer (with its "suggest more" pages joined) as a history entry. */
export function searchFromAnswer(answer: CheatPlacesAnswer, ctx: { id: string; near: string; wish: string }): PlacesSearch {
  const atISO = answer.checkedAtISO;
  return {
    id: ctx.id,
    atISO,
    wish: text(ctx.wish, 200),
    near: text(ctx.near, 160),
    readWish: answer.readWish,
    dishes: answer.dishes.slice(0, 8).map(dishToSaved),
    places: answer.places.slice(0, MAX_PLACES_PER_SEARCH).map((p) => placeToSaved(p, { near: ctx.near, wish: ctx.wish, atISO })),
  };
}

export function cleanSavedPlace(raw: unknown): SavedPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 100);
  const atISO = iso(r.atISO);
  if (!name || !atISO) return null;
  const address = text(r.address, 160) || null;
  const km = typeof r.distanceKm === 'number' && Number.isFinite(r.distanceKm) && r.distanceKm >= 0 && r.distanceKm <= 200 ? r.distanceKm : null;
  return {
    key: savedPlaceKey(name, address),
    name,
    dish: text(r.dish, 80),
    address,
    link: httpUrl(r.link),
    notes: text(r.notes, 160),
    distanceKm: km,
    photo: cleanPlacePhoto(r.photo),
    near: text(r.near, 160),
    wish: text(r.wish, 200),
    atISO,
  };
}

function cleanSavedDish(raw: unknown): SavedDish | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 80);
  if (!name) return null;
  const kcal = typeof r.kcal === 'number' && Number.isFinite(r.kcal) && r.kcal > 0 && r.kcal <= 5000 ? Math.round(r.kcal) : null;
  return { name, why: text(r.why, 200), kcal, emoji: text(r.emoji, 8) || null, photo: cleanPlacePhoto(r.photo) };
}

export function cleanPlacesSearch(raw: unknown): PlacesSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 60);
  const atISO = iso(r.atISO);
  if (!id || !atISO) return null;
  const places: SavedPlace[] = [];
  for (const p of Array.isArray(r.places) ? r.places : []) {
    const c = cleanSavedPlace(p);
    if (c && !places.some((x) => x.key === c.key)) places.push(c);
    if (places.length === MAX_PLACES_PER_SEARCH) break;
  }
  const dishes: SavedDish[] = [];
  for (const d of Array.isArray(r.dishes) ? r.dishes : []) {
    const c = cleanSavedDish(d);
    if (c && !dishes.some((x) => placeNameKey(x.name) === placeNameKey(c.name))) dishes.push(c);
    if (dishes.length === 8) break;
  }
  return { id, atISO, wish: text(r.wish, 200), near: text(r.near, 160), readWish: text(r.readWish, 200) || null, dishes, places };
}

const newestFirst = <T extends { atISO: string }>(list: T[]): T[] => [...list].sort((a, b) => b.atISO.localeCompare(a.atISO));

/** Whether a tombstone hides an item added at `atISO`. */
const hidden = (removed: Map<string, string>, id: string, atISO: string): boolean => {
  const at = removed.get(id);
  return at !== undefined && at >= atISO;
};

/** The two lists without what was removed after it was added, newest first, capped; tombstones kept (newest, capped). */
function settle(history: PlacesSearch[], saved: SavedPlace[], removedList: Removed[], clearedAtISO: string | null): CheatPlacesData {
  const removed = new Map<string, string>();
  for (const r of removedList) if (!removed.has(r.id) || removed.get(r.id)! < r.atISO) removed.set(r.id, r.atISO);
  const h = new Map<string, PlacesSearch>();
  for (const s of history) {
    if ((clearedAtISO && s.atISO <= clearedAtISO) || hidden(removed, `s:${s.id}`, s.atISO)) continue;
    const before = h.get(s.id);
    // The same search on both sides: the copy with more places ("suggest more" was used there), then the one with more photos.
    const photos = (x: PlacesSearch) => x.places.filter((p) => p.photo).length + x.dishes.filter((d) => d.photo).length;
    if (!before || s.places.length > before.places.length || (s.places.length === before.places.length && photos(s) > photos(before))) h.set(s.id, s);
  }
  const sv = new Map<string, SavedPlace>();
  for (const p of saved) {
    if (hidden(removed, `p:${p.key}`, p.atISO)) continue;
    const before = sv.get(p.key);
    if (!before || p.atISO > before.atISO || (!before.photo && p.photo && p.atISO === before.atISO)) sv.set(p.key, p);
  }
  return {
    history: newestFirst([...h.values()]).slice(0, MAX_SEARCHES),
    saved: newestFirst([...sv.values()]).slice(0, MAX_SAVED),
    removed: [...removed.entries()].map(([id, atISO]) => ({ id, atISO })).sort((a, b) => b.atISO.localeCompare(a.atISO)).slice(0, MAX_REMOVED),
    clearedAtISO,
  };
}

/** Stored / cloud data as a clean object (bad entries dropped, one per id / key, newest first, capped). */
export function cleanCheatPlacesData(raw: unknown): CheatPlacesData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const history = (Array.isArray(r.history) ? r.history : []).map(cleanPlacesSearch).filter((x): x is PlacesSearch => x !== null);
  const saved = (Array.isArray(r.saved) ? r.saved : []).map(cleanSavedPlace).filter((x): x is SavedPlace => x !== null);
  const removed: Removed[] = [];
  for (const x of Array.isArray(r.removed) ? r.removed : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = text(o.id, 300);
    const at = iso(o.atISO);
    if (/^[sp]:/.test(id) && at) removed.push({ id, atISO: at });
  }
  return settle(history, saved, removed, iso(r.clearedAtISO));
}

/** This device's data and the cloud's joined: everything from either side, minus what either side removed after it was added. */
export function mergeCheatPlaces(a: CheatPlacesData, b: CheatPlacesData): CheatPlacesData {
  const cleared = [a.clearedAtISO, b.clearedAtISO].filter((x): x is string => !!x).sort().pop() ?? null;
  return settle([...a.history, ...b.history], [...a.saved, ...b.saved], [...a.removed, ...b.removed], cleared);
}

/** Names sent as `exclude` with "suggest more": the places shown now first, then the places found before for the same wish (in the
 *  history) and the saved places of that wish, each once, at most `max`. */
export function excludeNames(shown: string[], data: Pick<CheatPlacesData, 'history' | 'saved'>, wish: string, max = 20): string[] {
  const wishKey = placeNameKey(wish);
  const fromBefore = [
    ...data.history.filter((s) => placeNameKey(s.wish) === wishKey).flatMap((s) => s.places.map((p) => p.name)),
    ...data.saved.filter((p) => placeNameKey(p.wish) === wishKey).map((p) => p.name),
  ];
  const out: string[] = [];
  const keys = new Set<string>();
  for (const name of [...shown, ...fromBefore]) {
    const key = placeNameKey(name);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    out.push(name);
    if (out.length === max) break;
  }
  return out;
}

/** A first answer and its "suggest more" pages as one answer to show: the first page's places, then each later page's places that
 *  were not shown yet (by name), likewise the dishes; searches and dropped added up; the newest check time. Not cleaned again (each
 *  page already was). */
export function joinAnswers(pages: CheatPlacesAnswer[]): CheatPlacesAnswer | null {
  if (pages.length === 0) return null;
  const [first, ...rest] = pages;
  const places = [...first.places];
  const dishes = [...first.dishes];
  const placeKeys = new Set(places.map((p) => placeNameKey(p.name)));
  const dishKeys = new Set(dishes.map((d) => placeNameKey(d.name)));
  const errors = new Set(first.searchErrors);
  let searches = first.searches;
  let dropped = first.dropped;
  let checkedAtISO = first.checkedAtISO;
  for (const page of rest) {
    for (const p of page.places) {
      const k = placeNameKey(p.name);
      if (!k || placeKeys.has(k)) continue;
      placeKeys.add(k);
      places.push(p);
    }
    for (const d of page.dishes) {
      const k = placeNameKey(d.name);
      if (!k || dishKeys.has(k)) continue;
      dishKeys.add(k);
      dishes.push(d);
    }
    page.searchErrors.forEach((e) => errors.add(e));
    searches += page.searches;
    dropped += page.dropped;
    if (page.checkedAtISO > checkedAtISO) checkedAtISO = page.checkedAtISO;
  }
  const found = new Set(places.map((p) => placeNameKey(p.dish)));
  const notFound = [...new Set(pages.flatMap((p) => p.notFound))].filter((d) => !found.has(placeNameKey(d))).slice(0, 3);
  return {
    readWish: first.readWish ?? rest.find((p) => p.readWish)?.readWish ?? null,
    dishes,
    places,
    notFound,
    note: first.note,
    checkedAtISO,
    searches,
    dropped,
    searchErrors: [...errors].slice(0, 5),
    ...(pages.some((p) => p.sample) ? { sample: true as const } : {}),
  };
}

/** How many places of `page` are not in `before` yet. */
export const newPlaces = (before: CheatPlacesAnswer, page: CheatPlacesAnswer): number => {
  const keys = new Set(before.places.map((p) => placeNameKey(p.name)));
  return page.places.filter((p) => !keys.has(placeNameKey(p.name))).length;
};

/** The photo to show for a dish without its own: the photo of a place found for that very dish (same name), else null. */
export function placePhotoForDish(dish: string, places: { dish: string; photo?: PlacePhoto | null }[]): PlacePhoto | null {
  const k = placeNameKey(dish);
  return places.find((p) => p.photo && placeNameKey(p.dish) === k)?.photo ?? null;
}
