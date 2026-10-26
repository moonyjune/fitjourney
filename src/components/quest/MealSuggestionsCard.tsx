import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { cleanAiDinner, dinnerIdeasFromFoods, dinnerVerdict, type DinnerIdea } from '../../ai/dinner';
import { buildMealPlan, mealBrief, mealCardVisible, mealTimeFor, type MealKind, type SplitMeal } from '../../ai/mealSplit';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { useGameText, type GameKey } from '../../game/strings';
import { useAllFoods } from '../../store/useFoodDbStore';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { requestDinner, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

/** Ideas shown per meal from the user's own foods (the AI adds its own on request). */
const DB_IDEAS_PER_MEAL = 2;

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
  const minute = Math.floor(now.getTime() / 60_000);
  const plan = useMemo(() => buildMealPlan(new Date(minute * 60_000)), [minute, logs, workouts, settings, fasting]); // eslint-disable-line react-hooks/exhaustive-deps
  const signature = plan ? `${plan.fasting}|${plan.totals.budgetKcal}|${plan.totals.proteinLeftG}|${plan.split.meals.map((m) => `${m.slot.id}:${m.kcal}`).join()}` : '';
  const [aiIdeas, setAiIdeas] = useState<Record<string, DinnerIdea[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; kind: AiErrorKind } | null>(null);

  // What is left changes when something is logged or the mode is switched: earlier AI answers no longer fit.
  useEffect(() => {
    setAiIdeas({});
    setFailure(null);
  }, [signature]);

  if (!plan || !mealCardVisible(now, plan)) return null;
  const { totals, split } = plan;
  const labelOf = (m: SplitMeal) => m.slot.label ?? g(KIND_KEY[m.slot.kind]);

  async function askAi(meal: SplitMeal, dbNames: Set<string>) {
    if (busyId || !plan) return;
    const brief = mealBrief(plan.totals, meal);
    setBusyId(meal.slot.id);
    setFailure(null);
    const outcome = await requestDinner(brief, buildTasteProfile().favorites);
    setBusyId(null);
    if (!outcome.ok) {
      setFailure({ id: meal.slot.id, kind: outcome.kind });
      return;
    }
    setAiIdeas((prev) => ({ ...prev, [meal.slot.id]: cleanAiDinner(outcome.result, brief).filter((i) => !dbNames.has(i.name)) }));
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
        const brief = mealBrief(totals, meal);
        const dbIdeas = dinnerIdeasFromFoods(brief, foods).slice(0, DB_IDEAS_PER_MEAL);
        const ideas = [...dbIdeas, ...(aiIdeas[meal.slot.id] ?? [])];
        const asked = aiIdeas[meal.slot.id] !== undefined;
        const verdict = meal.slot.plan && !meal.light ? dinnerVerdict(brief) : null;
        const name = labelOf(meal);
        return (
          <View key={meal.slot.id} style={styles.meal} accessibilityLabel={name}>
            <HudText size={14}>{`${name} · ${pad(meal.slot.startHour)}:${pad(meal.slot.startMinute)}`}</HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('meals.budget', { kcal: meal.kcal, protein: meal.proteinG, purine: room(meal.headroom.purine), salt: room(meal.headroom.salt), sugar: room(meal.headroom.sugar) })}
            </HudText>
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

            {ideas.map((idea) => (
              <View key={`${idea.source}-${idea.name}`} style={styles.idea}>
                <HudText size={13}>{idea.name}</HudText>
                <HudText size={11} color={idea.source === 'db' ? quest.manaText : quest.goldLight}>
                  {idea.source === 'db' ? g('dinner.fromDb') : g('swap.fromAi')}
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
                <QuestButton variant="mana" title={g('dinner.log')} accessibilityLabel={g('dinner.logLabel', { name: idea.name })} onPress={() => openInAddFood(idea, meal.slot.kind)} />
              </View>
            ))}

            {!asked && (
              <QuestButton
                variant="ghost"
                icon="chart"
                title={busyId === meal.slot.id ? g('dinner.asking') : g('meals.askAi', { meal: name })}
                accessibilityLabel={busyId === meal.slot.id ? g('dinner.asking') : g('meals.askAi', { meal: name })}
                onPress={() => {
                  void askAi(meal, new Set(dbIdeas.map((i) => i.name)));
                }}
                loading={busyId === meal.slot.id}
              />
            )}
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
            {(aiIdeas[meal.slot.id] ?? []).length > 0 && (
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('swap.disclaimer')}
              </HudText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  meal: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  idea: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
});
