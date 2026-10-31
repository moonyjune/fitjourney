import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { acceptDinner, cleanAiDinner, type DinnerBrief, type DinnerIdea } from '../../ai/dinner';
import { buildMealPlan, dayTotals } from '../../ai/mealSplit';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
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
import { filterBrief } from '../../cookbook/finderBrief';
import { recipeFromIdea, recipeKey } from '../../cookbook/recipes';
import { foodKey } from '../../food/remember';
import { useGameText, type GameKey } from '../../game/strings';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useAllFoods } from '../../store/useFoodDbStore';
import { pick as pickPrefs, useMealPrefStore } from '../../store/useMealPrefStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { requestDinner, searchSharedCookbookFiltered, shareToCookbook, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
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
  const book = useCookbookStore((s) => s.recipes);
  const foods = useAllFoods();
  const logs = useNutritionStore((s) => s.logs);
  const prefKcal = useMealPrefStore((s) => s.kcal);
  const prefProtein = useMealPrefStore((s) => s.proteinG);
  const prefStrict = useMealPrefStore((s) => s.strictKcal);
  const prefs = useMemo(() => pickPrefs({ kcal: prefKcal, proteinG: prefProtein, strictKcal: prefStrict }), [prefKcal, prefProtein, prefStrict]);
  const [mode, setMode] = useState<'have' | 'avoid'>('have');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'ai' | 'shared' | null>(null);
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

  const elsewhere = new Set([...ai, ...shared].map((i) => foodKey(i.name)));
  const local = useMemo(() => (searched ? rankCookbook(book, searched, searchedBrief) : []), [book, searched, searchedBrief]).filter((r) => !elsewhere.has(foodKey(r.idea.name)));

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

  async function askAi() {
    if (busy) return;
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

  const row = (idea: DinnerIdea, tags: FilterTag[] | null, forBrief: DinnerBrief) => {
    const fits = acceptDinner(forBrief, idea);
    return (
      <Pressable key={`${idea.source}-${idea.name}`} accessibilityRole="button" accessibilityLabel={idea.name} onPress={() => setOpen({ idea, brief: forBrief })} style={styles.result}>
        <HudText size={14}>{`${idea.recipe?.emoji ?? '🍽️'} ${idea.name}`}</HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('swap.figures', { kcal: idea.calories, p: idea.proteinG, purine: idea.purineMg, salt: idea.saltG, sugar: idea.sugarG })}
        </HudText>
        {idea.source === 'ai' ? (
          <HudText size={11} color={quest.goldLight}>
            {g('swap.fromAi')}
            {idea.accuracy !== undefined ? ` · ${g('ai.accuracy', { pct: idea.accuracy })}` : ''}
          </HudText>
        ) : null}
        {tags && tags.length > 0 ? (
          <HudText size={12} weight="medium" color={quest.manaText}>
            {g('cookbook.finder.matches', { tags: tags.map(tagText).join(', ') })}
          </HudText>
        ) : null}
        <HudText size={12} weight="medium" color={fits ? quest.manaText : quest.goldLight}>
          {fits ? g('cookbook.finder.fits') : g('cookbook.finder.notFits')}
        </HudText>
        {purineWarning(idea) ? (
          <HudText size={12} weight="medium" color={quest.hpText}>
            {g('cookbook.finder.purineWarn')}
          </HudText>
        ) : null}
        {idea.how ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {idea.how}
          </HudText>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.card} accessibilityLabel={g('cookbook.finder.title')}>
      <HudText size={15}>{g('cookbook.finder.title')}</HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('cookbook.finder.hint')}
      </HudText>
      {GROUPS.map(({ group, ids, title, prefix }) => (
        <View key={group} style={styles.section}>
          <HudText size={13} color={quest.goldLight}>
            {g(title)}
          </HudText>
          <View style={styles.chips}>
            {ids.map((id) => {
              const on = (filters[group] as string[]).includes(id);
              const label = g(`${prefix}${id}` as GameKey);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: on }}
                  onPress={() => setFilters({ ...filters, [group]: toggle(filters[group] as string[], id) })}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <HudText size={12} color={on ? quest.onGold : quest.text}>
                    {label}
                  </HudText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <View style={styles.section}>
        <HudText size={13} color={quest.goldLight}>
          {g('cookbook.finder.ingredients')}
        </HudText>
        <View style={styles.chips}>
          {(['have', 'avoid'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`${g('cookbook.finder.addTo')}: ${g(`cookbook.finder.${m}`)}`}
              accessibilityState={{ selected: mode === m }}
              onPress={() => setMode(m)}
              style={[styles.chip, mode === m && (m === 'have' ? styles.chipOn : styles.chipAvoid)]}
            >
              <HudText size={12} color={mode === m ? quest.onGold : quest.text}>
                {g(`cookbook.finder.${m}`)}
              </HudText>
            </Pressable>
          ))}
        </View>
        {picked.length > 0 && (
          <View style={styles.chips}>
            {filters.have.map((n) => (
              <Pressable key={`h-${n}`} accessibilityRole="button" accessibilityLabel={g('cookbook.finder.remove', { name: n })} onPress={() => setFilters({ ...filters, have: filters.have.filter((x) => x !== n) })} style={[styles.chip, styles.chipOn]}>
                <HudText size={12} color={quest.onGold}>{`✓ ${n} ✕`}</HudText>
              </Pressable>
            ))}
            {filters.avoid.map((n) => (
              <Pressable key={`a-${n}`} accessibilityRole="button" accessibilityLabel={g('cookbook.finder.remove', { name: n })} onPress={() => setFilters({ ...filters, avoid: filters.avoid.filter((x) => x !== n) })} style={[styles.chip, styles.chipAvoid]}>
                <HudText size={12} color={quest.onGold}>{`⊘ ${n} ✕`}</HudText>
              </Pressable>
            ))}
          </View>
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
        <View style={styles.chips}>
          {query.trim() && !options.some((o) => foodKey(o) === foodKey(query)) ? (
            <Pressable accessibilityRole="button" accessibilityLabel={g('cookbook.finder.add', { name: query.trim() })} onPress={() => addIngredient(query)} style={styles.chip}>
              <HudText size={12}>{`+ ${query.trim()}`}</HudText>
            </Pressable>
          ) : null}
          {options.map((n) => (
            <Pressable key={n} accessibilityRole="button" accessibilityLabel={g('cookbook.finder.add', { name: n })} onPress={() => addIngredient(n)} style={styles.chip}>
              <HudText size={12}>{`+ ${n}`}</HudText>
            </Pressable>
          ))}
        </View>
      </View>

      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('cookbook.finder.budget', {
          what: brief.snack ? g('cookbook.finder.snack') : g(`meals.kind.${brief.meal ?? 'dinner'}` as GameKey),
          kcal: Math.round(brief.budgetKcal),
          protein: Math.round(brief.proteinLeftG),
          purine: room(brief.headroom.purine),
          salt: room(brief.headroom.salt),
          sugar: room(brief.headroom.sugar),
        })}
      </HudText>
      <QuestButton variant="gold" icon="list" title={busy === 'shared' ? g('cookbook.searching') : g('cookbook.finder.suggest')} loading={busy === 'shared'} disabled={busy === 'ai'} onPress={() => void suggest()} />
      <QuestButton variant="mana" icon="chart" title={busy === 'ai' ? g('dinner.asking') : g('cookbook.finder.suggestAi')} loading={busy === 'ai'} disabled={busy === 'shared'} onPress={() => void askAi()} />
      {!filtersEmpty(filters) && <QuestButton variant="ghost" icon="x" title={g('cookbook.finder.clear')} onPress={() => setFilters(EMPTY_FILTERS)} />}
      {failure && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
          {aiErrorText(failure)}
        </HudText>
      )}
      {notice && (
        <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityRole="alert">
          {g(notice)}
        </HudText>
      )}

      {ai.length > 0 && (
        <View style={styles.section}>
          <HudText size={13} color={quest.goldLight}>
            {g('cookbook.finder.fromAi', { n: ai.length, time: at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '' })}
          </HudText>
          {ai.map((idea) => row(idea, null, brief))}
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`${g('meals.savedToBook')} · ${g('swap.disclaimer')}`}
          </HudText>
        </View>
      )}
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
      {shared.length > 0 && searchedBrief && (
        <View style={styles.section}>
          <HudText size={13} color={quest.goldLight}>
            {g('cookbook.finder.fromShared', { n: shared.length })}
          </HudText>
          {shared.map((idea) => row(idea, null, searchedBrief))}
        </View>
      )}
      <RecipeDialog idea={open?.idea ?? null} brief={open?.brief} mealLabel="" onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, marginTop: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  section: { gap: 6, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  chipAvoid: { backgroundColor: quest.hp, borderColor: quest.hp },
  input: { borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 10, paddingVertical: 8, color: quest.text, backgroundColor: quest.bg },
  result: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
});
