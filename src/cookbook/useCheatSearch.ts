import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { buildTasteProfile } from '../ai/tasteProfile';
import { useAiErrorText } from '../ai/usePhotoAnalysis';
import { useDishPhotos } from '../ai/useDishPhotos';
import { useGameText, type GameKey } from '../game/strings';
import { useCheatPlacesStore } from '../store/useCheatPlacesStore';
import { useCookbookFinderStore } from '../store/useCookbookFinderStore';
import { useCookbookStore } from '../store/useCookbookStore';
import { requestCheatPlaces, requestDinner, type AiErrorKind } from '../sync/cloudSync';
import { placeNameKey, type CheatPlace, type PlacePhoto } from '../../supabase/functions/_shared/places';
import { cheatReadWish, cleanCheatIdeas, cleanWish, dishesToLocate } from './cheat';
import { buildCheatWishContext } from './cheatWish';
import { useFinderBrief } from '../components/quest/CookbookSuggestSheet';
import { reverseGeocode } from './geocode';
import { excludeNames, joinAnswers, newPlaces, placeToSaved, searchFromAnswer } from './placesHistory';
import { recipeFromIdea, recipeKey } from './recipes';

type Position = { lat: number; lon: number; accuracyM: number | null };
type PositionError = 'denied' | 'timeout' | 'unavailable' | 'unsupported';
export const POSITION_ERROR_TEXT: Record<PositionError, GameKey> = {
  denied: 'cheat.locationDenied',
  timeout: 'cheat.locationTimeout',
  unavailable: 'cheat.locationFailed',
  unsupported: 'cheat.locationUnsupported',
};

/** The browser's precise position (web only; the native app has no location module): high accuracy (GPS when there is one), at
 *  most a minute old, 5 decimals (~1 m); or why it could not be had. */
function browserPosition(): Promise<Position | { error: PositionError }> {
  const geo = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo) return Promise.resolve({ error: 'unsupported' });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Math.round(pos.coords.latitude * 100_000) / 100_000,
          lon: Math.round(pos.coords.longitude * 100_000) / 100_000,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
        }),
      (err) => resolve({ error: err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  });
}
export const canLocate = (): boolean => Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.geolocation;

/** Has the user already allowed the position for this site (so asking for it shows no prompt)? */
async function locationGranted(): Promise<boolean> {
  try {
    const perms = typeof navigator !== 'undefined' ? (navigator as Navigator & { permissions?: Permissions }).permissions : undefined;
    if (!perms?.query) return false;
    const st = await perms.query({ name: 'geolocation' as PermissionName });
    return st.state === 'granted';
  } catch {
    return false;
  }
}

export type CheatBusy = 'ai' | 'places' | 'more' | 'locate' | null;

/** Everything the Cheat day screen does (kept from the 0.19–0.26 cook book finder): the AI's cheat dishes (into the cook book's cheat
 *  part, never the shared one; eat-out dishes get places at once), places for the wish / one dish / the AI dishes near the address or
 *  precise position (one call; the answer goes into the history with its photos), "Gợi ý tiếp" (the same search with what was shown
 *  excluded; the server serves it from the saved batch), stars, and "my location" with the address read back. */
export function useCheatSearch() {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const cheatWhere = useCookbookFinderStore((s) => s.cheatWhere);
  const location = useCookbookFinderStore((s) => s.location);
  const coords = useCookbookFinderStore((s) => s.coords);
  const cheatAi = useCookbookFinderStore((s) => s.cheatAi);
  const places = useCookbookFinderStore((s) => s.places);
  const placesMore = useCookbookFinderStore((s) => s.placesMore);
  const placesAsk = useCookbookFinderStore((s) => s.placesAsk);
  const placesSearchId = useCookbookFinderStore((s) => s.placesSearchId);
  const placesNear = useCookbookFinderStore((s) => s.placesNear);
  const savedPlaces = useCheatPlacesStore((s) => s.saved);
  const placesHistory = useCheatPlacesStore((s) => s.history);
  const [busy, setBusy] = useState<CheatBusy>(null);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [failure, setFailure] = useState<AiErrorKind | null>(null);
  const [notice, setNotice] = useState<GameKey | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const store = () => useCookbookFinderStore.getState();
  // What suggest-dinner is told about the day (a cheat day has no budget: the server drops the rules for cheat dishes).
  const { brief } = useFinderBrief();

  const shownPlaces = useMemo(() => (places ? joinAnswers([places, ...placesMore]) : null), [places, placesMore]);
  const savedKeys = useMemo(() => new Set(savedPlaces.map((p) => p.key)), [savedPlaces]);
  const shownSearch = placesSearchId ? placesHistory.find((h) => h.id === placesSearchId) : undefined;
  const knownDishPhotos = useMemo(() => {
    const out: Record<string, PlacePhoto> = {};
    for (const d of shownSearch?.dishes ?? []) if (d.photo) out[placeNameKey(d.name)] = d.photo;
    return out;
  }, [shownSearch]);
  // Dish photos found for the shown search are kept with it (history), so it shows them again without asking.
  const photoNames = shownPlaces ? shownPlaces.dishes.filter((d) => !d.photo && !knownDishPhotos[placeNameKey(d.name)]).map((d) => d.name) : [];
  const dishPhotoStates = useDishPhotos(photoNames);
  useEffect(() => {
    if (!placesSearchId) return;
    const found: Record<string, PlacePhoto> = {};
    for (const [name, st] of Object.entries(dishPhotoStates)) {
      if (st?.status !== 'done' || !st.photo || st.sample) continue;
      const p = st.photo;
      found[name] = { url: p.url, pageUrl: p.sourceUrl, credit: `${p.author} · ${p.license} · ${p.source === 'wikimedia' ? 'Wikimedia' : 'Openverse'}` };
    }
    if (Object.keys(found).length > 0) useCheatPlacesStore.getState().setDishPhotos(placesSearchId, found);
  }, [dishPhotoStates, placesSearchId]);

  const clearMessages = () => {
    setNotice(null);
    setPlacesError(null);
    setFailure(null);
  };

  function showPlacesError(outcome: { message: string; kind: AiErrorKind | 'unavailable' }) {
    if (outcome.kind === 'unavailable') setPlacesError(g('cheat.unavailable', { why: outcome.message.replace(/^[^:]*:\s*/, '') }));
    else setPlacesError(g('cheat.placesFailed', { why: aiErrorText(outcome.kind, outcome.message) }));
  }

  /** Dishes for the wish AND places near the address / position, in one call: for the wish alone (`wish`), one dish the user picked
   *  (`typed`) or the AI's eat-out dishes (`ai`). The wish and the user's recent eating always go with it. */
  async function findPlaces(dishes: string[], mode: 'wish' | 'typed' | 'ai', force = false) {
    if (busy && !force) return;
    clearMessages();
    if (mode === 'ai' && dishes.length === 0) return setNotice('cheat.noOutDishes');
    const { location: loc, coords: at, query: wishText } = store();
    if (!loc && !at) return setNotice('cheat.needLocation');
    const near = loc || (at ? `${at.lat}, ${at.lon}` : g('cheat.here'));
    setBusy('places');
    const wish = cleanWish(wishText);
    const ask = { dishes: mode === 'wish' ? [] : dishes, typed: mode === 'typed', wish };
    const outcome = await requestCheatPlaces(ask.dishes, loc, at ?? undefined, {
      typed: ask.typed,
      ...(wish ? { wish } : {}),
      context: buildCheatWishContext(),
    });
    setBusy(null);
    if (!outcome.ok) return showPlacesError(outcome);
    const id = `ps-${Date.now().toString(36)}`;
    store().setPlaces(outcome.result, near, ask, id);
    useCheatPlacesStore.getState().putSearch(searchFromAnswer(outcome.result, { id, near, wish }));
  }

  /** The AI's cheat-day dishes for the wish (no rules, no budget): kept in the cook book's Cheat day part; eating out with an area
   *  set, places for them are looked up at once. */
  async function askCheat() {
    if (busy) return;
    const where = cheatWhere;
    setBusy('ai');
    clearMessages();
    const recipes = useCookbookStore.getState().recipes;
    const known = new Set([...recipes.map((r) => r.id), ...cheatAi.map((i) => recipeKey(i.name))]);
    const avoidNames = [...cheatAi.map((i) => i.name), ...recipes.filter((r) => r.cheat).map((r) => r.name)].slice(0, 40);
    const wish = cleanWish(store().query);
    const outcome = await requestDinner(brief, buildTasteProfile().favorites, avoidNames, undefined, {
      where,
      ...(wish ? { wish } : {}),
      context: buildCheatWishContext(),
    });
    setBusy(null);
    if (!outcome.ok) return setFailure(outcome.kind);
    const fresh = cleanCheatIdeas(outcome.result, where).filter((i) => !known.has(recipeKey(i.name)));
    if (fresh.length === 0) return setNotice('cheat.aiNone');
    useCookbookStore.getState().saveMany(fresh.map((i) => recipeFromIdea(i)));
    store().setCheatAi(fresh, new Date().toISOString(), cheatReadWish(outcome.result));
    const out = dishesToLocate(fresh, where);
    if (out.length > 0 && (store().location || store().coords)) await findPlaces(out, 'ai', true);
  }

  /** "Gợi ý tiếp": the same search again, telling the server which places were shown already (this search, and the saved / earlier
   *  places for the same wish); what comes back is added below, each place once. */
  async function suggestMore() {
    if (busy || !places || !shownPlaces) return;
    clearMessages();
    const { location: loc, coords: at, placesSearchId: id } = store();
    if (!loc && !at) return setNotice('cheat.needLocation');
    const ask = placesAsk ?? { dishes: [], typed: false, wish: cleanWish(store().query) };
    const kept = useCheatPlacesStore.getState();
    const exclude = excludeNames(
      shownPlaces.places.map((p) => p.name),
      { history: kept.history, saved: kept.saved },
      ask.wish
    );
    setBusy('more');
    const outcome = await requestCheatPlaces(ask.dishes, loc, at ?? undefined, {
      typed: ask.typed,
      ...(ask.wish ? { wish: ask.wish } : {}),
      context: buildCheatWishContext(),
      exclude,
      excludeDishes: shownPlaces.dishes.map((d) => d.name).slice(0, 8),
    });
    setBusy(null);
    if (!outcome.ok) return showPlacesError(outcome);
    const dishKeys = new Set(shownPlaces.dishes.map((d) => placeNameKey(d.name)));
    const newDishes = outcome.result.dishes.filter((d) => !dishKeys.has(placeNameKey(d.name))).length;
    if (newPlaces(shownPlaces, outcome.result) === 0 && newDishes === 0) return setNotice('cheat.moreNone');
    store().addMorePlaces(outcome.result);
    const joined = joinAnswers([places, ...store().placesMore]);
    if (joined && id) useCheatPlacesStore.getState().putSearch(searchFromAnswer(joined, { id, near: store().placesNear, wish: ask.wish }));
  }

  const toggleSave = (p: CheatPlace) =>
    useCheatPlacesStore.getState().toggleSaved(placeToSaved(p, { near: placesNear, wish: placesAsk?.wish ?? '', atISO: new Date().toISOString() }));

  async function useMyLocation() {
    if (busy) return;
    setBusy('locate');
    setNotice(null);
    const pos = await browserPosition();
    if ('error' in pos) {
      setBusy(null);
      return setNotice(POSITION_ERROR_TEXT[pos.error]);
    }
    const at = { lat: pos.lat, lon: pos.lon };
    setAccuracyM(pos.accuracyM);
    store().setLocation(store().location, at);
    const address = await reverseGeocode(at.lat, at.lon);
    setBusy(null);
    if (address) store().setLocation(address, at);
    else setNotice('cheat.addressFailed');
  }

  // The location chip fills itself: with no area yet and the position already allowed for this site, it is read once (no prompt).
  useEffect(() => {
    const { location: loc, coords: at } = store();
    if (loc || at || !canLocate()) return;
    let live = true;
    void locationGranted().then((ok) => {
      if (ok && live) void useMyLocation();
    });
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    busy,
    failure: failure ? aiErrorText(failure) : null,
    placesError,
    notice,
    accuracyM,
    clearCoords: () => {
      store().setLocation(store().location, null);
      setAccuracyM(null);
    },
    location,
    coords,
    cheatWhere,
    cheatAi,
    shownPlaces,
    placesNear,
    savedKeys,
    knownDishPhotos,
    searchWish: () => void findPlaces([], 'wish'),
    searchDish: (name: string) => void findPlaces([name], 'typed'),
    searchAiDishes: () => void findPlaces(dishesToLocate(cheatAi, cheatWhere), 'ai'),
    askCheat: () => void askCheat(),
    suggestMore: () => void suggestMore(),
    toggleSave,
    useMyLocation: () => void useMyLocation(),
  };
}
