import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { acceptDinner, cleanAiDinner, dinnerIdeasFromFoods, dinnerVerdict, type DinnerBrief, type DinnerIdea } from '../../ai/dinner';
import { ideaFromRecipe, recipeFromIdea, recipeKey, recipesFitting } from '../../cookbook/recipes';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useMealIdeasStore } from '../../store/useMealIdeasStore';
import { toDateKey } from '../../utils/date';
import { RecipeDialog } from './RecipeDialog';
import { buildMealPlan, DAY_BAND_KCAL, MAX_MEAL_KCAL, mealBrief, mealCardVisible, mealTimeFor, type MealKind, type SplitMeal } from '../../ai/mealSplit';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { useGameText, type GameKey } from '../../game/strings';
import { useAllFoods } from '../../store/useFoodDbStore';
import { useMealModeStore } from '../../store/useMealModeStore';
import { pick as pickPrefs, useMealPrefStore } from '../../store/useMealPrefStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { requestDinner, searchSharedCookbook, shareToCookbook, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { MealPrefsEditor } from './MealPrefsEditor';

/** Ideas shown per meal from the user's own foods (the AI adds its own on request). */
const DB_IDEAS_PER_MEAL = 2;
/** Dishes listed per meal at a time, whatever their source: the suggestions first, then the user's foods and cook book. */
const IDEAS_SHOWN = 3;

const KIND_KEY: Record<MealKind, GameKey> = {
  breakfast: 'meals.kind.breakfast',
  lunch: 'meals.kind.lunch',
  dinner: 'meals.kind.dinner',
  meal: 'meals.kind.meal',
};

const pad = (n: number) => String(n).padStart(2, '0');
const room = (n: number) => Math.max(0, Math.round(n * 10) / 10);

/** Opens Add food with an idea filled in (nothing is saved: the user checks and confirms there). */
function openInAddFood(idea: DinnerIdea, kind: MealKind) {
  router.push({
    pathname: '/add-food',
    params: {
      name: idea.name,
      calories: String(idea.calories),
      protein: String(idea.proteinG),
      purine: String(idea.purineMg),
      salt: String(idea.saltG),
      sugar: String(idea.sugarG),
      mealTime: mealTimeFor(kind),
      ...(idea.source === 'db' ? { from: 'db' } : {}),
    },
  });
}

/** Camp: "what to eat next". It works out what is left of today (calories, protein, room in the limits, all on the device), finds the
 *  meals still to come (fasting on: the plan's meals; off: breakfast, lunch, dinner) and splits what is left over them: one meal late
 *  in the day or with little left, two or three when there is room for them. Each meal gets ideas from the user's own foods, sized to
 *  its share; the AI is asked per meal, on request, and every idea of its is re-checked against that meal's share first. */
export function MealSuggestionsCard({ now }: { now: Date }) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const foods = useAllFoods();
  const logs = useNutritionStore((s) => s.logs);
  const workouts = useWorkoutStore((s) => s.entries);
  const settings = useSettingsStore((s) => s.targetDailyDeficitKcal + s.proteinTargetG + s.calorieTargetKcal);
  const fasting = useMealModeStore((s) => s.fasting);
  const prefKcal = useMealPrefStore((s) => s.kcal);
  const prefProtein = useMealPrefStore((s) => s.proteinG);
  const prefStrict = useMealPrefStore((s) => s.strictKcal);
  const prefs = useMemo(() => pickPrefs({ kcal: prefKcal, proteinG: prefProtein, strictKcal: prefStrict }), [prefKcal, prefProtein, prefStrict]);
  const minute = Math.floor(now.getTime() / 60_000);
  const plan = useMemo(() => buildMealPlan(new Date(minute * 60_000), prefs), [minute, logs, workouts, settings, fasting, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const signature = plan ? `${plan.fasting}|${prefKcal}|${prefProtein}|${prefStrict}|${plan.totals.budgetKcal}|${plan.totals.proteinLeftG}|${plan.split.meals.map((m) => `${m.slot.id}:${m.kcal}`).join()}` : '';
  // The suggestions on screen (the AI's 3, or 3 from the shared cookbook) are kept per day and meal, so reloading the page shows them again
  // without asking (and paying) again; the AI's also go into the user's cook book. A new request replaces them, and the old ones go into
  // the cookbook shared by all users.
  const day = toDateKey(new Date(minute * 60_000));
  const storedIdeas = useMealIdeasStore((s) => s.byDay[day]);
  const book = useCookbookStore((s) => s.recipes);
  const aiIdeas: Record<string, DinnerIdea[]> = storedIdeas ?? {};
  const [viewing, setViewing] = useState<{ idea: DinnerIdea; brief: DinnerBrief; label: string; kind: MealKind } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; kind: AiErrorKind } | null>(null);
  const [notice, setNotice] = useState<{ id: string; key: 'cookbook.sharedNone' | 'cookbook.sharedFailed' | 'meals.none' } | null>(null);
  const [query, setQuery] = useState('');
  // Meals whose list of dishes the user folded away (not kept: every list is open when the card is built).
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  // What is left changes when something is logged or the mode is switched: the failure message no longer applies, and kept AI answers
  // are re-checked against the new share when they are shown (the ones that no longer fit are hidden, not asked for again).
  useEffect(() => {
    setFailure(null);
    setNotice(null);
  }, [signature]);

  if (!plan || !mealCardVisible(now, plan)) return null;
  const { totals, split } = plan;
  const labelOf = (m: SplitMeal) => m.slot.label ?? g(KIND_KEY[m.slot.kind]);

  async function askAi(meal: SplitMeal, dbNames: Set<string>, shown: DinnerIdea[]) {
    if (busyId || !plan) return;
    const brief = mealBrief(plan.totals, meal, prefs);
    setBusyId(meal.slot.id);
    setFailure(null);
    setNotice(null);
    // Dishes the user already has (cook book, and the ideas on screen) are not asked for again.
    const have = new Set([...useCookbookStore.getState().recipes.map((r) => r.id), ...shown.map((i) => recipeKey(i.name))]);
    const avoid = [...useCookbookStore.getState().recipes.map((r) => r.name), ...shown.map((i) => i.name)].slice(0, 40);
    const outcome = await requestDinner(brief, buildTasteProfile().favorites, avoid);
    setBusyId(null);
    if (!outcome.ok) {
      setFailure({ id: meal.slot.id, kind: outcome.kind });
      return;
    }
    const fresh = cleanAiDinner(outcome.result, brief).filter((i) => !dbNames.has(i.name) && !have.has(recipeKey(i.name)));
    useCookbookStore.getState().saveMany(fresh.map((i) => recipeFromIdea(i)));
    replaceIdeas(meal, fresh);
  }

  /** The new suggestions take the place of the ones on screen; the AI's old ones go into the shared cookbook. Nothing new that fits:
   *  the old ones stay (an empty list is only stored when there was nothing before, meaning "asked, nothing fit"). */
  function replaceIdeas(meal: SplitMeal, fresh: DinnerIdea[]) {
    const previous = useMealIdeasStore.getState().get(day, meal.slot.id) ?? [];
    if (fresh.length === 0 && previous.length > 0) {
      setNotice({ id: meal.slot.id, key: 'meals.none' });
      return;
    }
    useMealIdeasStore.getState().set(day, meal.slot.id, fresh);
    const freshKeys = new Set(fresh.map((i) => recipeKey(i.name)));
    const replaced = previous.filter((i) => i.source === 'ai' && !freshKeys.has(recipeKey(i.name)));
    if (replaced.length > 0) void shareToCookbook(replaced, meal.slot.kind);
  }

  /** 3 dishes from the cookbook shared by all users that fit this meal (and the search text, if any): no AI, no quota. */
  async function askCookbook(meal: SplitMeal, shown: DinnerIdea[]) {
    if (busyId || !plan) return;
    const brief = mealBrief(plan.totals, meal, prefs);
    setBusyId(meal.slot.id);
    setFailure(null);
    setNotice(null);
    const outcome = await searchSharedCookbook(brief, query, shown.map((i) => i.name));
    setBusyId(null);
    if (!outcome.ok) {
      setNotice({ id: meal.slot.id, key: 'cookbook.sharedFailed' });
      return;
    }
    if (outcome.ideas.length === 0) {
      setNotice({ id: meal.slot.id, key: 'cookbook.sharedNone' });
      return;
    }
    replaceIdeas(meal, outcome.ideas);
  }

  return (
    <View style={styles.card} accessibilityLabel={g('meals.title')}>
      <HudText size={15}>{g('meals.title')}</HudText>
      <HudText size={13} weight="medium" color={quest.textSecondary}>
        {g('dinner.left', { kcal: totals.budgetKcal, protein: totals.proteinLeftG })}
      </HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('dinner.room', { purine: room(totals.headroom.purine), salt: room(totals.headroom.salt), sugar: room(totals.headroom.sugar) })}
      </HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('meals.dayBand', { low: Math.max(0, totals.dayTargetKcal - DAY_BAND_KCAL), high: totals.dayTargetKcal, max: MAX_MEAL_KCAL })}
      </HudText>
      <MealPrefsEditor />
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={g('cookbook.searchShared')}
        placeholderTextColor={quest.textSecondary}
        accessibilityLabel={g('cookbook.searchShared')}
        maxLength={60}
      />
      <QuestButton variant="ghost" icon="list" title={g('cookbook.open', { n: book.length })} accessibilityLabel={g('cookbook.open', { n: book.length })} onPress={() => router.push('/cookbook')} />
      {split.meals.length > 1 && (
        <HudText size={12} weight="medium" color={quest.manaText}>
          {g('meals.split', { kcal: totals.budgetKcal, n: split.meals.length })}
        </HudText>
      )}
      {split.merged.length > 0 && !split.meals[0]?.light && (
        <HudText size={12} weight="medium" color={quest.goldLight}>
          {g('meals.merged', { names: split.merged.map((m) => m.label ?? g(KIND_KEY[m.kind])).join(', '), kcal: totals.budgetKcal })}
        </HudText>
      )}

      {split.meals.map((meal) => {
        const brief = mealBrief(totals, meal, prefs);
        const dbIdeas = dinnerIdeasFromFoods(brief, foods).slice(0, DB_IDEAS_PER_MEAL);
        const aiList = (aiIdeas[meal.slot.id] ?? []).filter((i) => acceptDinner(brief, i));
        const aiKeys = new Set([...dbIdeas, ...aiList].map((i) => recipeKey(i.name)));
        const asked = aiIdeas[meal.slot.id] !== undefined;
        // Once there are suggestions for this meal they take the place of the user's own cook book dishes.
        const bookIdeas = asked ? [] : recipesFitting(book, brief, 3).filter((r) => !aiKeys.has(r.id)).map(ideaFromRecipe);
        const ideas = [...aiList, ...dbIdeas, ...bookIdeas].slice(0, IDEAS_SHOWN);
        const verdict = meal.slot.plan && !meal.light ? dinnerVerdict(brief) : null;
        const name = labelOf(meal);
        return (
          <View key={meal.slot.id} style={styles.meal} accessibilityLabel={name}>
            <HudText size={14}>{`${name} · ${pad(meal.slot.startHour)}:${pad(meal.slot.startMinute)}`}</HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('meals.budget', { kcal: meal.kcal, protein: meal.proteinG, purine: room(meal.headroom.purine), salt: room(meal.headroom.salt), sugar: room(meal.headroom.sugar) })}
            </HudText>
            {!meal.light && prefs.kcal ? (
              <HudText size={12} weight="medium" color={quest.goldLight}>
                {g('meals.prefs.target', {
                  kcal: meal.kcal,
                  protein: prefs.proteinG ? g('meals.prefs.targetProtein', { protein: prefs.proteinG }) : '',
                  strict: prefs.strictKcal ? g('meals.prefs.targetStrict') : '',
                })}
              </HudText>
            ) : null}
            {meal.light && (
              <HudText size={12} weight="medium" color={quest.manaText}>
                {g('dinner.light')}
              </HudText>
            )}
            {verdict && verdict.kind !== 'light' && (
              <HudText size={12} weight="medium" color={verdict.kind === 'over' ? quest.goldLight : quest.manaText}>
                {verdict.kind === 'over'
                  ? g('dinner.planOver', { label: meal.slot.label ?? name, kcal: meal.slot.plan?.kcal ?? 0, over: verdict.overKcal })
                  : g('dinner.planFits', { label: meal.slot.label ?? name, kcal: meal.slot.plan?.kcal ?? 0 })}
              </HudText>
            )}

            {ideas.length > 0 && (
              <Pressable
                style={styles.listHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: !folded[meal.slot.id] }}
                accessibilityLabel={g(folded[meal.slot.id] ? 'meals.expand' : 'meals.collapse', { meal: name })}
                onPress={() => setFolded((f) => ({ ...f, [meal.slot.id]: !f[meal.slot.id] }))}
              >
                <HudText size={13} color={quest.goldLight}>{`${g('meals.listTitle', { n: ideas.length })} ${folded[meal.slot.id] ? '▸' : '▾'}`}</HudText>
              </Pressable>
            )}
            {!folded[meal.slot.id] && ideas.map((idea) => (
              <View key={`${idea.source}-${idea.name}`} style={styles.idea}>
                <HudText size={13}>{idea.recipe?.emoji ? `${idea.recipe.emoji} ${idea.name}` : idea.name}</HudText>
                <HudText size={11} color={idea.source === 'db' ? quest.manaText : quest.goldLight}>
                  {idea.source === 'db' ? g('dinner.fromDb') : idea.source === 'book' ? g('cookbook.fromBook') : idea.source === 'shared' ? g('cookbook.fromShared') : g('swap.fromAi')}
                  {idea.source === 'ai' && idea.accuracy !== undefined ? ` · ${g('ai.accuracy', { pct: idea.accuracy })}` : ''}
                </HudText>
                {idea.amount ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {g('swap.amount', { amount: idea.amount })}
                  </HudText>
                ) : null}
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('swap.figures', { kcal: idea.calories, p: idea.proteinG, purine: idea.purineMg, salt: idea.saltG, sugar: idea.sugarG })}
                </HudText>
                {idea.how ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {idea.how}
                  </HudText>
                ) : null}
                <View style={styles.ideaButtons}>
                  <QuestButton variant="ghost" title={g('meals.viewRecipe')} accessibilityLabel={`${g('meals.viewRecipe')}: ${idea.name}`} onPress={() => setViewing({ idea, brief, label: name, kind: meal.slot.kind })} />
                  <QuestButton variant="mana" title={g('dinner.log')} accessibilityLabel={g('dinner.logLabel', { name: idea.name })} onPress={() => openInAddFood(idea, meal.slot.kind)} />
                </View>
              </View>
            ))}

            <QuestButton
              variant="ghost"
              icon="chart"
              title={busyId === meal.slot.id ? g('dinner.asking') : asked ? g('meals.more') : g('meals.askAi', { meal: name })}
              accessibilityLabel={busyId === meal.slot.id ? g('dinner.asking') : asked ? `${g('meals.more')}: ${name}` : g('meals.askAi', { meal: name })}
              onPress={() => {
                void askAi(meal, new Set(dbIdeas.map((i) => i.name)), ideas);
              }}
              loading={busyId === meal.slot.id}
            />
            <QuestButton
              variant="ghost"
              icon="list"
              title={busyId === meal.slot.id ? g('cookbook.searching') : g('cookbook.askShared')}
              accessibilityLabel={busyId === meal.slot.id ? g('cookbook.searching') : g('cookbook.askSharedLabel', { meal: name })}
              onPress={() => {
                void askCookbook(meal, ideas);
              }}
              loading={busyId === meal.slot.id}
            />
            {asked && ideas.length === 0 && (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('meals.none', { meal: name })}
              </HudText>
            )}
            {failure?.id === meal.slot.id && (
              <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
                {aiErrorText(failure.kind)}
              </HudText>
            )}
            {notice?.id === meal.slot.id && (
              <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityRole="alert">
                {g(notice.key, { meal: name })}
              </HudText>
            )}
            {aiList.length > 0 && (
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('meals.replacedNote')} {aiList.some((i) => i.source === 'ai') ? `${g('meals.savedToBook')} · ${g('swap.disclaimer')}` : ''}
              </HudText>
            )}
          </View>
        );
      })}
      <RecipeDialog idea={viewing?.idea ?? null} brief={viewing?.brief} mealLabel={viewing?.label} onClose={() => setViewing(null)} onLog={viewing ? (i) => { setViewing(null); openInAddFood(i, viewing.kind); } : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  meal: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  ideaButtons: { gap: 6 },
  listHead: { paddingVertical: 4 },
  search: { borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 10, paddingVertical: 8, color: quest.text, backgroundColor: quest.bg },
  idea: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
});
