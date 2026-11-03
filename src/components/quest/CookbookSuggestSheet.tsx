import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { acceptDinner, cleanAiDinner, type DinnerBrief, type DinnerIdea } from '../../ai/dinner';
import { buildMealPlan, dayTotals } from '../../ai/mealSplit';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { filtersEmpty, purineWarning, rankCookbook, usesAvoided, type FilterTag } from '../../cookbook/filters';
import { filterBrief } from '../../cookbook/finderBrief';
import { recipeFromIdea, recipeKey } from '../../cookbook/recipes';
import { foodKey } from '../../food/remember';
import { useGameText, type GameKey } from '../../game/strings';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { pick as pickPrefs, useMealPrefStore } from '../../store/useMealPrefStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { openRecipe } from '../../store/useRecipeViewStore';
import { requestDinner, searchSharedCookbookFiltered, shareToCookbook, type AiErrorKind } from '../../sync/cloudSync';
import { quest } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { FILTER_GROUPS, LeftLine } from './CookbookFilterSheet';
import { DishCard } from './DishCard';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

const pad = (n: number) => String(n).padStart(2, '0');

/** What the suggestions are for: the next meal, or the snack / meal the filters ask for. */
export function useFinderBrief() {
  const filters = useCookbookFinderStore((s) => s.filters);
  const logs = useNutritionStore((s) => s.logs);
  const kcal = useMealPrefStore((s) => s.kcal);
  const proteinG = useMealPrefStore((s) => s.proteinG);
  const strictKcal = useMealPrefStore((s) => s.strictKcal);
  const prefs = useMemo(() => pickPrefs({ kcal, proteinG, strictKcal }), [kcal, proteinG, strictKcal]);
  const day = useMemo(() => {
    const now = new Date();
    return { totals: dayTotals(now), meals: buildMealPlan(now, prefs)?.split.meals ?? [] };
  }, [logs, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const brief = useMemo(() => filterBrief(day.totals, day.meals, filters, prefs), [day, filters, prefs]);
  return { brief, day, prefs };
}

/** "bữa trưa", "món ăn vặt / đồ uống": the words for what a brief is for. */
export function useBriefWhat(brief: DinnerBrief): string {
  const g = useGameText();
  return brief.snack ? g('cookbook.finder.snack') : g(`meals.kind.${brief.meal ?? 'dinner'}` as GameKey).toLowerCase();
}

/** Cook book > "✨ Gợi ý món mới cho <bữa>" (dialog 24): opening it ranks the user's cook book by the filters at once and asks the
 *  shared cook book (no AI); "Gợi ý bằng AI" asks suggest-dinner for new dishes (saved into the cook book; the AI dishes they replace go
 *  to the shared cook book). Results are kept on the device. A dish opens its recipe page. */
export function CookbookSuggestSheet({ visible, onClose, onEditFilters }: { visible: boolean; onClose: () => void; onEditFilters: () => void }) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const aiOn = useAiPhotoStore((s) => s.aiEnabled);
  const filters = useCookbookFinderStore((s) => s.filters);
  const searched = useCookbookFinderStore((s) => s.searched);
  const shared = useCookbookFinderStore((s) => s.shared);
  const ai = useCookbookFinderStore((s) => s.ai);
  const aiAtISO = useCookbookFinderStore((s) => s.aiAtISO);
  const book = useCookbookStore((s) => s.recipes);
  const { brief, day, prefs } = useFinderBrief();
  const what = useBriefWhat(brief);
  const searchedBrief = useMemo(() => (searched ? filterBrief(day.totals, day.meals, searched, prefs) : null), [day, searched, prefs]);
  const [busy, setBusy] = useState<'ai' | 'shared' | null>(null);
  const [failure, setFailure] = useState<AiErrorKind | null>(null);
  const [notice, setNotice] = useState<GameKey | null>(null);
  const busyRef = useRef(false);

  const elsewhere = new Set([...ai, ...shared].map((i) => foodKey(i.name)));
  const local = useMemo(() => (searched ? rankCookbook(book, searched, searchedBrief) : []), [book, searched, searchedBrief]).filter((r) => !elsewhere.has(foodKey(r.idea.name)));

  async function suggest() {
    if (busyRef.current) return;
    const f = useCookbookFinderStore.getState().filters;
    useCookbookFinderStore.getState().search(f);
    setFailure(null);
    setNotice(null);
    const own = rankCookbook(book, f, brief).map((r) => r.idea.name);
    busyRef.current = true;
    setBusy('shared');
    const outcome = await searchSharedCookbookFiltered(brief, f, [...own, ...ai.map((i) => i.name)]);
    busyRef.current = false;
    setBusy(null);
    if (!outcome.ok) return setNotice('cookbook.sharedFailed');
    useCookbookFinderStore.getState().setShared(outcome.ideas);
    if (outcome.ideas.length === 0) setNotice('cookbook.finder.sharedNone');
  }

  async function askAi() {
    if (busyRef.current) return;
    const f = filters;
    const forBrief = brief;
    busyRef.current = true;
    setBusy('ai');
    setFailure(null);
    setNotice(null);
    const recipes = useCookbookStore.getState().recipes;
    const known = new Set([...recipes.map((r) => r.id), ...ai.map((i) => recipeKey(i.name))]);
    const avoidNames = [...ai.map((i) => i.name), ...recipes.map((r) => r.name)].slice(0, 40);
    const outcome = await requestDinner(forBrief, buildTasteProfile().favorites, avoidNames, filtersEmpty(f) ? undefined : f);
    busyRef.current = false;
    setBusy(null);
    if (!outcome.ok) return setFailure(outcome.kind);
    const fresh = cleanAiDinner(outcome.result, forBrief).filter((i) => !usesAvoided(i, f) && !known.has(recipeKey(i.name)));
    if (fresh.length === 0) {
      setNotice('cookbook.finder.aiNone');
      if (ai.length > 0) return; // the earlier ideas stay
    }
    useCookbookStore.getState().saveMany(fresh.map((i) => recipeFromIdea(i)));
    const freshKeys = new Set(fresh.map((i) => recipeKey(i.name)));
    const replaced = ai.filter((i) => i.source === 'ai' && !freshKeys.has(recipeKey(i.name)));
    if (replaced.length > 0) void shareToCookbook(replaced, forBrief.meal);
    useCookbookFinderStore.getState().setAi(fresh, new Date().toISOString());
  }

  // Opening the sheet searches at once (no AI).
  useEffect(() => {
    if (visible) void suggest();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const tagText = (t: FilterTag) => (t.group === 'have' ? t.name : g(`${FILTER_GROUPS.find((x) => x.group === `${t.group}s`)!.prefix}${t.id}` as GameKey));
  const at = aiAtISO ? new Date(aiAtISO) : null;
  const activeTags: string[] = [
    ...filters.occasions.map((id) => g(`cookbook.occ.${id}` as GameKey)),
    ...filters.cravings.map((id) => g(`cookbook.crave.${id}` as GameKey)),
    ...filters.types.map((id) => g(`cookbook.type.${id}` as GameKey)),
    ...filters.have.map((n) => `✓ ${n}`),
    ...filters.avoid.map((n) => `⊘ ${n}`),
  ];

  const row = (idea: DinnerIdea, tags: FilterTag[] | null, forBrief: DinnerBrief) => {
    const saved = book.find((r) => r.id === recipeKey(idea.name));
    return (
      <DishCard
        key={`${idea.source}-${idea.name}`}
        idea={idea}
        onPress={() => {
          onClose();
          openRecipe(idea, forBrief);
        }}
        purineHigh={purineWarning(idea)}
        rating={saved?.rating}
        cooked={saved?.cookedCount}
        fits={acceptDinner(forBrief, idea)}
        sub={tags && tags.length > 0 ? g('cookbook.finder.matches', { tags: tags.map(tagText).join(', ') }) : undefined}
      />
    );
  };
  const head = (text: string) => (
    <HudText size={13} color={quest.goldLight} accessibilityRole="header">
      {text}
    </HudText>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      tone="mana"
      testID="cookbook-suggest"
      eyebrow={g('cookbook.finder.title')}
      title={g('rd4.suggest.title', { meal: what })}
      footer={
        aiOn ? (
          <QuestButton variant="mana" icon="chart" title={busy === 'ai' ? g('dinner.asking') : g('cookbook.finder.suggestAi')} loading={busy === 'ai'} disabled={!!busy && busy !== 'ai'} onPress={() => void askAi()} />
        ) : null
      }
    >
      <View style={styles.body}>
        <View style={styles.tags}>
          {activeTags.length === 0 ? (
            <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
              {g('cookbook.ui.noFilters')}
            </HudText>
          ) : (
            <HudText size={12} weight="semibold" color={quest.manaText} style={styles.flex}>
              {activeTags.join(' · ')}
            </HudText>
          )}
          <QuestButton variant="ghost" title={g('rd4.suggest.editFilters')} onPress={onEditFilters} />
        </View>
        <LeftLine brief={brief} what={what} />
        {busy === 'shared' ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cookbook.searching')}
          </HudText>
        ) : null}
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
        {searched && searchedBrief ? (
          <View style={styles.section}>
            {head(g('cookbook.finder.fromBook', { n: local.length }))}
            {local.length === 0 ? (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('cookbook.finder.noLocal')}
              </HudText>
            ) : (
              local.map((r) => row(r.idea, r.tags, searchedBrief))
            )}
          </View>
        ) : null}
        {shared.length > 0 && searchedBrief ? (
          <View style={styles.section}>
            {head(g('cookbook.finder.fromShared', { n: shared.length }))}
            {shared.map((idea) => row(idea, null, searchedBrief))}
          </View>
        ) : null}
        {ai.length > 0 ? (
          <View style={styles.section}>
            {head(g('cookbook.finder.fromAi', { n: ai.length, time: at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '' }))}
            {ai.map((idea) => row(idea, null, brief))}
            <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={2}>
              {`${g('meals.savedToBook')} · ${g('swap.disclaimer')}`}
            </HudText>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 6 },
});
