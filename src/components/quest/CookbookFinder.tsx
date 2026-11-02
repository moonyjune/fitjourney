import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { acceptDinner, cleanAiDinner, type DinnerBrief, type DinnerIdea } from '../../ai/dinner';
import { buildMealPlan, dayTotals } from '../../ai/mealSplit';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { useDishPhotos } from '../../ai/useDishPhotos';
import { excludeNames, joinAnswers, newPlaces, placeToSaved, searchFromAnswer } from '../../cookbook/placesHistory';
import { useCheatPlacesStore } from '../../store/useCheatPlacesStore';
import {
  CRAVING_IDS,
  DISH_TYPE_IDS,
  filtersEmpty,
  ingredientPool,
  MAX_INGREDIENTS_PICKED,
  OCCASION_IDS,
  purineWarning,
  rankCookbook,
  suggestIngredients,
  usesAvoided,
  EMPTY_FILTERS,
  type CookbookFilters,
  type FilterTag,
} from '../../cookbook/filters';
import { CHEAT_WHERE, cheatReadWish, cleanCheatIdeas, cleanWish, dishesToLocate, type CheatWhere } from '../../cookbook/cheat';
import { buildCheatWishContext } from '../../cookbook/cheatWish';
import { filterBrief } from '../../cookbook/finderBrief';
import { osmUrl, reverseGeocode } from '../../cookbook/geocode';
import { recipeFromIdea, recipeKey } from '../../cookbook/recipes';
import { foodKey } from '../../food/remember';
import { useGameText, type GameKey } from '../../game/strings';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useAllFoods } from '../../store/useFoodDbStore';
import { pick as pickPrefs, useMealPrefStore } from '../../store/useMealPrefStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { requestCheatPlaces, requestDinner, searchSharedCookbookFiltered, shareToCookbook, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { placeNameKey, WISH_MAX_CHARS, type CheatPlace, type PlacePhoto } from '../../../supabase/functions/_shared/places';
import { CheatPlacesList } from './CheatPlacesList';
import { CheatPlacesSaved } from './CheatPlacesSaved';
import { DishCard } from './DishCard';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { RecipeDialog } from './RecipeDialog';

type Group = 'occasions' | 'cravings' | 'types';
const GROUPS: { group: Group; ids: readonly string[]; title: GameKey; prefix: string }[] = [
  { group: 'occasions', ids: OCCASION_IDS, title: 'cookbook.finder.occasion', prefix: 'cookbook.occ.' },
  { group: 'cravings', ids: CRAVING_IDS, title: 'cookbook.finder.craving', prefix: 'cookbook.crave.' },
  { group: 'types', ids: DISH_TYPE_IDS, title: 'cookbook.finder.type', prefix: 'cookbook.type.' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const room = (n: number) => Math.max(0, Math.round(n * 10) / 10);
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

type Position = { lat: number; lon: number; accuracyM: number | null };
type PositionError = 'denied' | 'timeout' | 'unavailable' | 'unsupported';
const POSITION_ERROR_TEXT: Record<PositionError, GameKey> = {
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
const canLocate = (): boolean => Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.geolocation;

/** Cook book > "what do I feel like": chips for the occasion, cravings and kinds of dish, ingredients to use or avoid, then
 *  "Suggest" (the user's own cook book ranked by the filters at once, then the shared cook book; no AI) or "Suggest with AI"
 *  (suggest-dinner with the filters and what is left of today; daily quota). Filters and answers are kept on the device. */
export function CookbookFinder() {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const filters = useCookbookFinderStore((s) => s.filters);
  const searched = useCookbookFinderStore((s) => s.searched);
  const shared = useCookbookFinderStore((s) => s.shared);
  const ai = useCookbookFinderStore((s) => s.ai);
  const aiAtISO = useCookbookFinderStore((s) => s.aiAtISO);
  const cheat = useCookbookFinderStore((s) => s.cheat);
  const cheatWhere = useCookbookFinderStore((s) => s.cheatWhere);
  const location = useCookbookFinderStore((s) => s.location);
  const coords = useCookbookFinderStore((s) => s.coords);
  const want = useCookbookFinderStore((s) => s.query);
  const cheatAi = useCookbookFinderStore((s) => s.cheatAi);
  const cheatAiAtISO = useCookbookFinderStore((s) => s.cheatAiAtISO);
  const cheatAiReadWish = useCookbookFinderStore((s) => s.cheatAiReadWish);
  const places = useCookbookFinderStore((s) => s.places);
  const placesMore = useCookbookFinderStore((s) => s.placesMore);
  const placesAsk = useCookbookFinderStore((s) => s.placesAsk);
  const placesSearchId = useCookbookFinderStore((s) => s.placesSearchId);
  const placesNear = useCookbookFinderStore((s) => s.placesNear);
  const savedPlaces = useCheatPlacesStore((s) => s.saved);
  const placesHistory = useCheatPlacesStore((s) => s.history);
  const book = useCookbookStore((s) => s.recipes);
  const foods = useAllFoods();
  const logs = useNutritionStore((s) => s.logs);
  const prefKcal = useMealPrefStore((s) => s.kcal);
  const prefProtein = useMealPrefStore((s) => s.proteinG);
  const prefStrict = useMealPrefStore((s) => s.strictKcal);
  const prefs = useMemo(() => pickPrefs({ kcal: prefKcal, proteinG: prefProtein, strictKcal: prefStrict }), [prefKcal, prefProtein, prefStrict]);
  const [mode, setMode] = useState<'have' | 'avoid'>('have');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'ai' | 'shared' | 'places' | 'more' | 'locate' | null>(null);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [help, setHelp] = useState(false);
  const [failure, setFailure] = useState<AiErrorKind | null>(null);
  const [notice, setNotice] = useState<GameKey | null>(null);
  const [open, setOpen] = useState<{ idea: DinnerIdea; brief: DinnerBrief } | null>(null);

  // What is left of today, and the meals still to come (Camp's split).
  const day = useMemo(() => {
    const now = new Date();
    return { totals: dayTotals(now), meals: buildMealPlan(now, prefs)?.split.meals ?? [] };
  }, [logs, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const brief = useMemo(() => filterBrief(day.totals, day.meals, filters, prefs), [day, filters, prefs]);
  const searchedBrief = useMemo(() => (searched ? filterBrief(day.totals, day.meals, searched, prefs) : null), [day, searched, prefs]);
  const pool = useMemo(() => ingredientPool(book, foods), [book, foods]);
  const picked = [...filters.have, ...filters.avoid];
  const options = suggestIngredients(pool, query, picked, query.trim() ? 8 : 12);

  // The places shown: the first answer and its "suggest more" pages, each place and dish once.
  const shownPlaces = useMemo(() => (places ? joinAnswers([places, ...placesMore]) : null), [places, placesMore]);
  const savedKeys = useMemo(() => new Set(savedPlaces.map((p) => p.key)), [savedPlaces]);
  const shownSearch = placesSearchId ? placesHistory.find((h) => h.id === placesSearchId) : undefined;
  const knownDishPhotos = useMemo(() => {
    const out: Record<string, PlacePhoto> = {};
    for (const d of shownSearch?.dishes ?? []) if (d.photo) out[placeNameKey(d.name)] = d.photo;
    return out;
  }, [shownSearch]);
  // Dish photos found for the shown search are kept with it (history), so it shows them again without asking.
  const photoNames = cheat && shownPlaces ? shownPlaces.dishes.filter((d) => !d.photo && !knownDishPhotos[placeNameKey(d.name)]).map((d) => d.name) : [];
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

  const shownAi = cheat ? cheatAi : ai;
  const elsewhere = new Set([...shownAi, ...(cheat ? [] : shared)].map((i) => foodKey(i.name)));
  // On a cheat day the cook book's cheat dishes take part too (first), and nothing is checked against what is left today.
  const local = useMemo(() => (searched ? rankCookbook(book, searched, cheat ? null : searchedBrief, undefined, cheat) : []), [book, searched, searchedBrief, cheat]).filter(
    (r) => !elsewhere.has(foodKey(r.idea.name))
  );
  const store = () => useCookbookFinderStore.getState();

  const setFilters = (f: CookbookFilters) => useCookbookFinderStore.getState().setFilters(f);

  function addIngredient(raw: string) {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = foodKey(name);
    if (!key) return;
    const other = mode === 'have' ? 'avoid' : 'have';
    const list = filters[mode].filter((n) => foodKey(n) !== key);
    if (list.length >= MAX_INGREDIENTS_PICKED) return;
    setFilters({ ...filters, [mode]: [...list, name], [other]: filters[other].filter((n) => foodKey(n) !== key) });
    setQuery('');
  }

  async function suggest() {
    if (busy) return;
    const f = filters;
    useCookbookFinderStore.getState().search(f);
    setFailure(null);
    setNotice(null);
    if (cheat) return; // the shared cook book holds everyday dishes only
    const own = rankCookbook(book, f, brief).map((r) => r.idea.name);
    setBusy('shared');
    const outcome = await searchSharedCookbookFiltered(brief, f, [...own, ...ai.map((i) => i.name)]);
    setBusy(null);
    if (!outcome.ok) {
      setNotice('cookbook.sharedFailed');
      return;
    }
    useCookbookFinderStore.getState().setShared(outcome.ideas);
    if (outcome.ideas.length === 0) setNotice('cookbook.finder.sharedNone');
  }

  async function askCheat() {
    const f = filters;
    const where = cheatWhere;
    setBusy('ai');
    setFailure(null);
    setNotice(null);
    setPlacesError(null);
    const recipes = useCookbookStore.getState().recipes;
    const known = new Set([...recipes.map((r) => r.id), ...cheatAi.map((i) => recipeKey(i.name))]);
    const avoidNames = [...cheatAi.map((i) => i.name), ...recipes.filter((r) => r.cheat).map((r) => r.name)].slice(0, 40);
    // The wish (may be empty) and the user's recent eating go with it, so the dishes fit what they feel like.
    const wish = cleanWish(store().query);
    const outcome = await requestDinner(brief, buildTasteProfile().favorites, avoidNames, filtersEmpty(f) ? undefined : f, {
      where,
      ...(wish ? { wish } : {}),
      context: buildCheatWishContext(),
    });
    setBusy(null);
    if (!outcome.ok) {
      setFailure(outcome.kind);
      return;
    }
    const fresh = cleanCheatIdeas(outcome.result, where).filter((i) => !usesAvoided(i, f) && !known.has(recipeKey(i.name)));
    if (fresh.length === 0) {
      setNotice('cheat.aiNone');
      return;
    }
    // Into the cook book's Cheat day part (never the shared cook book: that one feeds everyday suggestions).
    useCookbookStore.getState().saveMany(fresh.map((i) => recipeFromIdea(i)));
    store().setCheatAi(fresh, new Date().toISOString(), cheatReadWish(outcome.result));
    // Eating out with an area set: look up places for the new dishes straight away.
    const out = dishesToLocate(fresh, where);
    if (out.length > 0 && (location || coords)) await findPlaces(out, 'ai');
  }

  /** Dishes for the wish AND places near the address / position, in one call: for the wish alone (`wish`: the AI picks the dishes,
   *  even with an empty box), one dish the user picked (`typed`) or the AI's eat-out dishes (`ai`). The wish and the user's recent
   *  eating always go with it. A failure is shown with its real reason (the server's message), never as nothing. */
  async function findPlaces(dishes: string[], mode: 'wish' | 'typed' | 'ai') {
    if (busy) return;
    setNotice(null);
    setPlacesError(null);
    setFailure(null);
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
    // Kept in the history at once (with its photos), so it can be opened again later without a new search.
    const id = `ps-${Date.now().toString(36)}`;
    store().setPlaces(outcome.result, near, ask, id);
    useCheatPlacesStore.getState().putSearch(searchFromAnswer(outcome.result, { id, near, wish }));
  }

  function showPlacesError(outcome: { message: string; kind: AiErrorKind | 'unavailable' }) {
    if (outcome.kind === 'unavailable') setPlacesError(g('cheat.unavailable', { why: outcome.message.replace(/^[^:]*:\s*/, '') }));
    else setPlacesError(g('cheat.placesFailed', { why: aiErrorText(outcome.kind, outcome.message) }));
  }

  /** "Suggest more": the same search again (dishes, wish, area), telling the server which places were shown already (this search,
   *  and the saved / earlier places for the same wish) so it finds others; what comes back is added below, each place once. */
  async function suggestMore() {
    if (busy || !places || !shownPlaces) return;
    setNotice(null);
    setPlacesError(null);
    setFailure(null);
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

  /** The star of a shown place: saved with its photo, the area and the wish of this search. */
  const toggleSave = (p: CheatPlace) =>
    useCheatPlacesStore.getState().toggleSaved(placeToSaved(p, { near: placesNear, wish: placesAsk?.wish ?? '', atISO: new Date().toISOString() }));

  /** "Find places" for the wish in the box (empty is fine). */
  const searchWant = () => findPlaces([], 'wish');

  /** A cheat dish's "find places": that dish exactly (the wish in the box stays and goes with it). */
  const searchDish = (name: string) => void findPlaces([name], 'typed');

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
    // The readable address of the spot, so the user can check it and edit it; the coordinates are sent with it either way.
    const address = await reverseGeocode(at.lat, at.lon);
    setBusy(null);
    if (address) store().setLocation(address, at);
    else setNotice('cheat.addressFailed');
  }

  async function askAi() {
    if (busy) return;
    if (cheat) return askCheat();
    const f = filters;
    const forBrief = brief;
    setBusy('ai');
    setFailure(null);
    setNotice(null);
    const recipes = useCookbookStore.getState().recipes;
    const known = new Set([...recipes.map((r) => r.id), ...ai.map((i) => recipeKey(i.name))]);
    const avoidNames = [...ai.map((i) => i.name), ...recipes.map((r) => r.name)].slice(0, 40);
    const outcome = await requestDinner(forBrief, buildTasteProfile().favorites, avoidNames, filtersEmpty(f) ? undefined : f);
    setBusy(null);
    if (!outcome.ok) {
      setFailure(outcome.kind);
      return;
    }
    const fresh = cleanAiDinner(outcome.result, forBrief).filter((i) => !usesAvoided(i, f) && !known.has(recipeKey(i.name)));
    if (fresh.length === 0) {
      setNotice('cookbook.finder.aiNone');
      if (ai.length > 0) return; // the earlier ideas stay
    }
    // Like Camp's suggestions: the AI's dishes go into the user's cook book; the ones they replace into the shared one.
    useCookbookStore.getState().saveMany(fresh.map((i) => recipeFromIdea(i)));
    const freshKeys = new Set(fresh.map((i) => recipeKey(i.name)));
    const replaced = ai.filter((i) => i.source === 'ai' && !freshKeys.has(recipeKey(i.name)));
    if (replaced.length > 0) void shareToCookbook(replaced, forBrief.meal);
    useCookbookFinderStore.getState().setAi(fresh, new Date().toISOString());
  }

  const tagText = (t: FilterTag) => (t.group === 'have' ? t.name : g(`${GROUPS.find((x) => x.group === `${t.group}s`)!.prefix}${t.id}` as GameKey));
  const at = aiAtISO ? new Date(aiAtISO) : null;
  const cheatAt = cheatAiAtISO ? new Date(cheatAiAtISO) : null;

  const row = (idea: DinnerIdea, tags: FilterTag[] | null, forBrief: DinnerBrief) => {
    const isCheat = cheat || !!idea.cheat;
    const book1 = book.find((r) => r.id === recipeKey(idea.name));
    return (
      <DishCard
        key={`${idea.source}-${idea.name}`}
        idea={idea}
        onPress={() => setOpen({ idea, brief: forBrief })}
        purineHigh={!isCheat && purineWarning(idea)}
        cheat={isCheat}
        photo={isCheat}
        rating={book1?.rating}
        cooked={book1?.cookedCount}
        fits={isCheat ? undefined : acceptDinner(forBrief, idea)}
        sub={tags && tags.length > 0 ? g('cookbook.finder.matches', { tags: tags.map(tagText).join(', ') }) : undefined}
      />
    );
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void, avoid = false) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={4} style={[styles.chip, on && (avoid ? styles.chipAvoid : styles.chipOn)]}>
      <HudText size={12} color={on ? quest.onGold : quest.text}>
        {label}
      </HudText>
    </Pressable>
  );
  /** A row of chips that scrolls sideways instead of wrapping into a wall. */
  const strip = (children: ReactNode) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
  const activeTags: string[] = [
    ...filters.occasions.map((id) => g(`cookbook.occ.${id}` as GameKey)),
    ...filters.cravings.map((id) => g(`cookbook.crave.${id}` as GameKey)),
    ...filters.types.map((id) => g(`cookbook.type.${id}` as GameKey)),
    ...filters.have.map((n) => `✓ ${n}`),
    ...filters.avoid.map((n) => `⊘ ${n}`),
  ];
  const what = brief.snack ? g('cookbook.finder.snack') : g(`meals.kind.${brief.meal ?? 'dinner'}` as GameKey);

  return (
    <View style={styles.wrap} accessibilityLabel={g('cookbook.finder.title')}>
      <View style={styles.card}>
        <View style={styles.head}>
          <HudText size={15} style={styles.flex} numberOfLines={1}>
            {g('cookbook.finder.title')}
          </HudText>
          <Pressable accessibilityRole="button" accessibilityLabel={g('cookbook.ui.help')} accessibilityState={{ expanded: help }} onPress={() => setHelp(!help)} hitSlop={8} style={styles.round}>
            <HudText size={13} color={quest.textSecondary}>
              ?
            </HudText>
          </Pressable>
        </View>
        {help ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {`${g('cookbook.finder.hint')} ${g('cheat.toggleHint')}`}
          </HudText>
        ) : null}

        {/* Compact bar: cheat day, the filters chosen, and the button that opens them. */}
        <View style={styles.barRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={g('cheat.toggle')}
            accessibilityState={{ checked: cheat }}
            onPress={() => {
              store().setCheat(!cheat);
              setFailure(null);
              setNotice(null);
              setPlacesError(null);
            }}
            hitSlop={4}
            style={[styles.chip, cheat && styles.chipOn]}
          >
            <HudText size={12} color={cheat ? quest.onGold : quest.text}>{`${cheat ? '☑' : '☐'} 🎉 ${g('cheat.toggle')}`}</HudText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeTags.length ? g('cookbook.ui.filtersCount', { n: activeTags.length }) : g('cookbook.ui.filters')}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            hitSlop={4}
            style={[styles.chip, activeTags.length > 0 && styles.chipMana]}
          >
            <HudText size={12} color={quest.text}>{`⚙ ${activeTags.length ? g('cookbook.ui.filtersCount', { n: activeTags.length }) : g('cookbook.ui.filters')} ${expanded ? '▴' : '▾'}`}</HudText>
          </Pressable>
          {!filtersEmpty(filters) && (
            <Pressable accessibilityRole="button" accessibilityLabel={g('cookbook.finder.clear')} onPress={() => setFilters(EMPTY_FILTERS)} hitSlop={8} style={styles.round}>
              <HudText size={12} color={quest.textSecondary}>
                ✕
              </HudText>
            </Pressable>
          )}
        </View>
        {!expanded &&
          (activeTags.length > 0 ? (
            strip(
              activeTags.map((t) => (
                <View key={t} style={styles.tag}>
                  <HudText size={11} weight="semibold" color={quest.manaText}>
                    {t}
                  </HudText>
                </View>
              ))
            )
          ) : (
            <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={1}>
              {g('cookbook.ui.noFilters')}
            </HudText>
          ))}

        {expanded && (
          <View style={styles.panel}>
            {GROUPS.map(({ group, ids, title, prefix }) => (
              <View key={group} style={styles.group}>
                <HudText size={12} color={quest.goldLight}>
                  {g(title)}
                </HudText>
                {strip(
                  ids.map((id) => {
                    const on = (filters[group] as string[]).includes(id);
                    return chip(id, g(`${prefix}${id}` as GameKey), on, () => setFilters({ ...filters, [group]: toggle(filters[group] as string[], id) }));
                  })
                )}
              </View>
            ))}
            <View style={styles.group}>
              <HudText size={12} color={quest.goldLight}>
                {g('cookbook.finder.ingredients')}
              </HudText>
              {strip(
                <>
                  {(['have', 'avoid'] as const).map((m) => chip(m, `${g('cookbook.finder.addTo')}: ${g(`cookbook.finder.${m}`)}`, mode === m, () => setMode(m), m === 'avoid'))}
                  {filters.have.map((n) => chip(`h-${n}`, g('cookbook.finder.remove', { name: n }), true, () => setFilters({ ...filters, have: filters.have.filter((x) => x !== n) })))}
                  {filters.avoid.map((n) => chip(`a-${n}`, g('cookbook.finder.remove', { name: n }), true, () => setFilters({ ...filters, avoid: filters.avoid.filter((x) => x !== n) }), true))}
                </>
              )}
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => addIngredient(query)}
                placeholder={g('cookbook.finder.ingredientInput')}
                placeholderTextColor={quest.textSecondary}
                accessibilityLabel={g('cookbook.finder.ingredientInput')}
                maxLength={40}
                returnKeyType="done"
              />
              {strip(
                <>
                  {query.trim() && !options.some((o) => foodKey(o) === foodKey(query)) ? chip('typed', g('cookbook.finder.add', { name: query.trim() }), false, () => addIngredient(query)) : null}
                  {options.map((n) => chip(n, g('cookbook.finder.add', { name: n }), false, () => addIngredient(n)))}
                </>
              )}
            </View>
          </View>
        )}

        {cheat && (
          <View style={styles.group}>
            {strip(CHEAT_WHERE.map((w: CheatWhere) => chip(w, g(`cheat.where.${w}` as GameKey), cheatWhere === w, () => store().setCheatWhere(w))))}
            {/* Places: what the user wants (works without any AI idea), near the address / precise position. */}
            <HudText size={12} color={quest.goldLight}>
              {g('cheat.want')}
            </HudText>
            <View style={styles.locRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={want}
                onChangeText={(t) => store().setQuery(t)}
                onSubmitEditing={() => void searchWant()}
                placeholder={g('cheat.wantPlaceholder')}
                placeholderTextColor={quest.textSecondary}
                accessibilityLabel={g('cheat.want')}
                maxLength={WISH_MAX_CHARS}
                returnKeyType="search"
              />
              <QuestButton variant="mana" icon="map" title={g('cheat.searchWant')} loading={busy === 'places'} disabled={!!busy} onPress={() => void searchWant()} />
            </View>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('cheat.wishHint')}
            </HudText>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={(t) => store().setLocation(t)}
              placeholder={g('cheat.locationPlaceholder')}
              placeholderTextColor={quest.textSecondary}
              accessibilityLabel={g('cheat.location')}
              maxLength={160}
              multiline
              returnKeyType="done"
              blurOnSubmit
            />
            <View style={styles.barRow}>
              {canLocate() ? (
                <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.useLocation')} onPress={() => void useMyLocation()} disabled={!!busy} hitSlop={4} style={styles.chip}>
                  <HudText size={12} color={quest.text}>
                    {busy === 'locate' ? g('cheat.locating') : g('cheat.useLocation')}
                  </HudText>
                </Pressable>
              ) : null}
              {coords ? (
                <>
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {`${g('cheat.coords', { lat: coords.lat, lon: coords.lon })}${accuracyM !== null ? ` (${g('cheat.accuracy', { m: accuracyM })})` : ''}`}
                  </HudText>
                  <Pressable accessibilityRole="link" accessibilityLabel={g('cheat.viewMap')} onPress={() => void Linking.openURL(osmUrl(coords.lat, coords.lon)).catch(() => undefined)} hitSlop={6}>
                    <HudText size={12} weight="medium" color={quest.manaText} style={styles.link}>
                      {`🗺 ${g('cheat.viewMap')}`}
                    </HudText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={g('cheat.clearCoords')}
                    onPress={() => {
                      store().setLocation(store().location, null);
                      setAccuracyM(null);
                    }}
                    hitSlop={8}
                    style={styles.round}
                  >
                    <HudText size={12} color={quest.textSecondary}>
                      ✕
                    </HudText>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.left} accessibilityLabel={cheat ? g('cheat.noBudget') : `${g('cookbook.ui.left', { what })}`}>
          {cheat ? (
            <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={2}>
              {g('cheat.noBudget')}
            </HudText>
          ) : (
            <>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('cookbook.ui.left', { what })}
              </HudText>
              <HudText size={12} weight="semibold" color={quest.text}>
                {g('cookbook.ui.leftNums', {
                  kcal: Math.round(brief.budgetKcal),
                  protein: Math.round(brief.proteinLeftG),
                  purine: room(brief.headroom.purine),
                  salt: room(brief.headroom.salt),
                  sugar: room(brief.headroom.sugar),
                })}
              </HudText>
            </>
          )}
        </View>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <QuestButton variant="gold" icon="list" title={busy === 'shared' ? g('cookbook.searching') : g('cookbook.finder.suggest')} loading={busy === 'shared'} disabled={!!busy && busy !== 'shared'} onPress={() => void suggest()} />
          </View>
          <View style={styles.flex}>
            <QuestButton variant="mana" icon="chart" title={busy === 'ai' ? g('dinner.asking') : g('cookbook.finder.suggestAi')} loading={busy === 'ai'} disabled={!!busy && busy !== 'ai'} onPress={() => void askAi()} />
          </View>
        </View>
        {cheat && cheatWhere !== 'home' && dishesToLocate(cheatAi, cheatWhere).length > 0 && (
          <QuestButton variant="ghost" icon="map" title={g('cheat.findPlaces')} loading={busy === 'places'} disabled={!!busy} onPress={() => void findPlaces(dishesToLocate(cheatAi, cheatWhere), 'ai')} />
        )}
        {busy === 'places' && (
          <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityRole="alert">
            {g('cheat.searchingPlaces')}
          </HudText>
        )}
        {failure && (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
            {aiErrorText(failure)}
          </HudText>
        )}
        {placesError && (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
            {placesError}
          </HudText>
        )}
        {notice && (
          <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityRole="alert">
            {g(notice)}
          </HudText>
        )}
      </View>

      {shownAi.length > 0 && (
        <View style={styles.section}>
          <HudText size={13} color={quest.goldLight}>
            {cheat
              ? g('cheat.fromAi', { n: cheatAi.length, time: cheatAt ? `${pad(cheatAt.getHours())}:${pad(cheatAt.getMinutes())}` : '' })
              : g('cookbook.finder.fromAi', { n: ai.length, time: at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '' })}
          </HudText>
          {cheat && cheatAiReadWish ? (
            <HudText size={12} weight="medium" color={quest.manaText}>
              {g('cheat.readWish', { text: cheatAiReadWish })}
            </HudText>
          ) : null}
          {shownAi.map((idea) => row(idea, null, brief))}
          {cheat &&
            strip(cheatAi.filter((i) => i.where !== 'home').map((i) => chip(`find-${i.name}`, g('cheat.findForDish', { dish: i.name }), false, () => searchDish(i.name))))}
          <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={2}>
            {`${cheat ? g('cheat.saved') : g('meals.savedToBook')} · ${g('swap.disclaimer')}`}
          </HudText>
        </View>
      )}
      {cheat && shownPlaces && (
        <View style={styles.section}>
          <CheatPlacesList answer={shownPlaces} near={placesNear} onFindDish={busy ? undefined : searchDish} savedKeys={savedKeys} onToggleSave={toggleSave} knownDishPhotos={knownDishPhotos} />
          <QuestButton variant="ghost" icon="map" title={g('cheat.more')} loading={busy === 'more'} disabled={!!busy} onPress={() => void suggestMore()} />
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {busy === 'more' ? g('cheat.searchingPlaces') : g('cheat.moreHint')}
          </HudText>
        </View>
      )}
      {cheat && <CheatPlacesSaved />}
      {searched && searchedBrief && (
        <View style={styles.section}>
          <HudText size={13} color={quest.goldLight}>
            {g('cookbook.finder.fromBook', { n: local.length })}
          </HudText>
          {local.length === 0 ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('cookbook.finder.noLocal')}
            </HudText>
          ) : (
            local.map((r) => row(r.idea, r.tags, searchedBrief))
          )}
        </View>
      )}
      {!cheat && shared.length > 0 && searchedBrief && (
        <View style={styles.section}>
          <HudText size={13} color={quest.goldLight}>
            {g('cookbook.finder.fromShared', { n: shared.length })}
          </HudText>
          {shared.map((idea) => row(idea, null, searchedBrief))}
        </View>
      )}
      <RecipeDialog idea={open?.idea ?? null} brief={open && !open.idea.cheat && !cheat ? open.brief : undefined} mealLabel="" onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { gap: 8, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  round: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: quest.border },
  barRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  panel: { gap: 10, paddingTop: 4 },
  group: { gap: 6 },
  section: { gap: 6 },
  strip: { gap: 6, paddingRight: 8, alignItems: 'center' },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  chipAvoid: { backgroundColor: quest.hp, borderColor: quest.hp },
  chipMana: { borderColor: quest.mana },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: quest.manaBorder },
  input: { minHeight: 44, borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 10, paddingVertical: 8, color: quest.text, backgroundColor: quest.bg },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { textDecorationLine: 'underline' },
  left: { gap: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: quest.bg },
  buttons: { flexDirection: 'row', gap: 8 },
});
