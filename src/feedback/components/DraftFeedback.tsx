import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { SODIUM_MG_PER_SALT_G } from '../../insights/thresholds';
import { useThresholds } from '../../insights/useThresholds';
import { quest, questRadius } from '../../theme/quest';
import type { ExtraMealTime } from '../../types';
import { isMainMeal } from '../items';
import { isSkippedMeal } from '../match';
import { commentMeal, mealWarnings } from '../meal';
import { repeatsForDraft } from '../repeats';
import { useFeedbackText } from '../strings';
import { useDiaryItems } from '../useDiaryItems';
import { FeedbackLines } from './FeedbackLines';

interface DraftFeedbackProps {
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
  mealTime: ExtraMealTime | null;
  dateKey: string;
}

/** Live comments on the food being typed in Add food: what is good or worth swapping, a repeat count, and meal-size warnings. */
export function DraftFeedback({ name, calories, proteinG, purineMg, saltG, sugarG, mealTime, dateKey }: DraftFeedbackProps) {
  const f = useFeedbackText();
  const th = useThresholds();
  const history = useDiaryItems();
  const text = name.trim();
  const view = useMemo(() => {
    if (text.length < 2) return null;
    const lines = commentMeal(text);
    const warnings = isSkippedMeal(text)
      ? []
      : mealWarnings({ kcal: calories, proteinG, purineMg, sugarG, sodiumMg: saltG * SODIUM_MG_PER_SALT_G, main: isMainMeal(mealTime) }, th);
    const repeats = repeatsForDraft(text, dateKey, history);
    return { lines, warnings, repeats };
  }, [text, calories, proteinG, purineMg, saltG, sugarG, mealTime, dateKey, history, th]);

  if (!view || (view.lines.length === 0 && view.warnings.length === 0 && view.repeats.length === 0)) return null;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <HudText size={11} color={quest.manaText} style={styles.title}>
        {f('fb.liveTitle').toUpperCase()}
      </HudText>
      <FeedbackLines lines={view.lines} warnings={view.warnings} repeats={view.repeats} live />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  title: { letterSpacing: 1.4 },
});
