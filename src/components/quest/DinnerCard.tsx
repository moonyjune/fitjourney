import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { buildDinnerBrief, cleanAiDinner, dinnerCardVisible, dinnerIdeasFromFoods, dinnerVerdict, type DinnerIdea } from '../../ai/dinner';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { useGameText } from '../../game/strings';
import { useAllFoods } from '../../store/useFoodDbStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { requestDinner, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

/** Opens Add food with a dinner idea filled in (nothing is saved: the user checks and confirms there). */
function openInAddFood(idea: DinnerIdea) {
  router.push({
    pathname: '/add-food',
    params: {
      name: idea.name,
      calories: String(idea.calories),
      protein: String(idea.proteinG),
      purine: String(idea.purineMg),
      salt: String(idea.saltG),
      sugar: String(idea.sugarG),
      mealTime: 'dinner',
      ...(idea.source === 'db' ? { from: 'db' } : {}),
    },
  });
}

const room = (n: number) => Math.max(0, Math.round(n * 10) / 10);

/** Camp: "what for dinner". From the afternoon until the eating window closes, while the plan's dinner is still to come, it shows
 *  what is left of today (calories, protein, room in the limits: all worked out on the device), whether the plan's dinner fits,
 *  and dinner ideas from the user's own foods; the AI is asked only on request, and each of its ideas is re-checked first. */
export function DinnerCard({ now }: { now: Date }) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const foods = useAllFoods();
  const logs = useNutritionStore((s) => s.logs);
  const workouts = useWorkoutStore((s) => s.entries);
  const settings = useSettingsStore((s) => s.targetDailyDeficitKcal + s.proteinTargetG + s.calorieTargetKcal);
  const minute = Math.floor(now.getTime() / 60_000);
  const brief = useMemo(() => buildDinnerBrief(new Date(minute * 60_000)), [minute, logs, workouts, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const signature = brief ? `${brief.budgetKcal}|${brief.proteinLeftG}|${Object.values(brief.headroom).join()}` : '';
  const dbIdeas = useMemo(() => (brief ? dinnerIdeasFromFoods(brief, foods) : []), [signature, foods]); // eslint-disable-line react-hooks/exhaustive-deps
  const [aiIdeas, setAiIdeas] = useState<DinnerIdea[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AiErrorKind | null>(null);

  // What is left changes when something is logged: earlier AI answers no longer fit.
  useEffect(() => {
    setAiIdeas([]);
    setAsked(false);
    setFailure(null);
  }, [signature]);

  if (!brief || !dinnerCardVisible(now, brief)) return null;

  async function askAi() {
    if (busy || !brief) return;
    setBusy(true);
    setFailure(null);
    const outcome = await requestDinner(brief, buildTasteProfile().favorites);
    setBusy(false);
    if (!outcome.ok) {
      setFailure(outcome.kind);
      return;
    }
    const have = new Set(dbIdeas.map((i) => i.name));
    setAiIdeas(cleanAiDinner(outcome.result, brief).filter((i) => !have.has(i.name)));
    setAsked(true);
  }

  const verdict = dinnerVerdict(brief);
  const ideas = [...dbIdeas, ...aiIdeas];

  return (
    <View style={styles.card} accessibilityLabel={g('dinner.title')}>
      <HudText size={15}>{g('dinner.title')}</HudText>
      <HudText size={13} weight="medium" color={quest.textSecondary}>
        {g('dinner.left', { kcal: brief.budgetKcal, protein: brief.proteinLeftG })}
      </HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('dinner.room', { purine: room(brief.headroom.purine), salt: room(brief.headroom.salt), sugar: room(brief.headroom.sugar) })}
      </HudText>
      <HudText size={13} color={verdict.kind === 'over' ? quest.goldLight : quest.manaText}>
        {verdict.kind === 'light'
          ? g('dinner.light')
          : verdict.kind === 'over'
            ? g('dinner.planOver', { label: brief.planMeal?.label ?? '', kcal: brief.planMeal?.kcal ?? 0, over: verdict.overKcal })
            : g('dinner.planFits', { label: brief.planMeal?.label ?? '', kcal: brief.planMeal?.kcal ?? 0 })}
      </HudText>

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
          <QuestButton variant="mana" title={g('dinner.log')} accessibilityLabel={g('dinner.logLabel', { name: idea.name })} onPress={() => openInAddFood(idea)} />
        </View>
      ))}

      {!asked && <QuestButton variant="ghost" icon="chart" title={busy ? g('dinner.asking') : g('dinner.askAi')} onPress={() => { void askAi(); }} loading={busy} />}
      {asked && aiIdeas.length === 0 && ideas.length === 0 && (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('dinner.none')}
        </HudText>
      )}
      {failure && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
          {aiErrorText(failure)}
        </HudText>
      )}
      {aiIdeas.length > 0 && (
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('swap.disclaimer')}
        </HudText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  idea: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
});
