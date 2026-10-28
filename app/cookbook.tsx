import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptDinner, type DinnerIdea } from '../src/ai/dinner';
import { buildMealPlan, mealBrief } from '../src/ai/mealSplit';
import { ideaFromRecipe } from '../src/cookbook/recipes';
import { FlashNotice, useFlash } from '../src/components/quest/FlashNotice';
import { HudText } from '../src/components/quest/HudText';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { RecipeDialog } from '../src/components/quest/RecipeDialog';
import { useGameText } from '../src/game/strings';
import { pick as pickPrefs, useMealPrefStore } from '../src/store/useMealPrefStore';
import { useCookbookStore } from '../src/store/useCookbookStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** Profile / Camp > Cook book: every dish the AI suggested (and every dish the user saved), to look up and use again. */
export default function CookbookScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const book = useCookbookStore((s) => s.recipes);
  const prefKcal = useMealPrefStore((s) => s.kcal);
  const prefProtein = useMealPrefStore((s) => s.proteinG);
  const prefStrict = useMealPrefStore((s) => s.strictKcal);
  const [onlyFitting, setOnlyFitting] = useState(false);
  const [open, setOpen] = useState<DinnerIdea | null>(null);
  const [flash, showFlash] = useFlash();
  // The share of the next meal still to come today, to tell which dishes fit it.
  const brief = useMemo(() => {
    const plan = buildMealPlan(new Date(), pickPrefs({ kcal: prefKcal, proteinG: prefProtein, strictKcal: prefStrict }));
    return plan && plan.split.meals[0] ? mealBrief(plan.totals, plan.split.meals[0], pickPrefs({ kcal: prefKcal, proteinG: prefProtein, strictKcal: prefStrict })) : null;
  }, [prefKcal, prefProtein, prefStrict, book.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(
    () => [...book].filter((r) => !onlyFitting || (brief && acceptDinner(brief, r))).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (a.createdAtISO < b.createdAtISO ? 1 : -1)),
    [book, onlyFitting, brief]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={g('cookbook.title')} onBack={goBack} backLabel={g('common.back')} />
        <View style={styles.gap}>
          <FlashNotice text={flash} />
        </View>
        {brief && book.length > 0 && (
          <View style={styles.chips}>
            {[false, true].map((fit) => (
              <Pressable key={String(fit)} accessibilityRole="button" accessibilityState={{ selected: onlyFitting === fit }} onPress={() => setOnlyFitting(fit)} style={[styles.chip, onlyFitting === fit && styles.chipOn]}>
                <HudText size={12} color={onlyFitting === fit ? quest.onGold : quest.text}>
                  {fit ? g('cookbook.fitting') : g('cookbook.all')}
                </HudText>
              </Pressable>
            ))}
          </View>
        )}
        {book.length === 0 && (
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.gap}>
            {g('cookbook.empty')}
          </HudText>
        )}
        {book.length > 0 && shown.length === 0 && (
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.gap}>
            {g('cookbook.noMatch')}
          </HudText>
        )}
        {shown.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.name} onPress={() => setOpen(ideaFromRecipe(r))} style={styles.row}>
            <HudText size={14}>{`${r.emoji ?? '🍽️'} ${r.name}`}</HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('cookbook.line', { kcal: r.calories, protein: r.proteinG })}
              {r.rating ? ` · ${'★'.repeat(r.rating)}` : ''}
              {r.cookedCount ? ` · ${g('cookbook.cooked', { n: r.cookedCount })}` : ''}
            </HudText>
          </Pressable>
        ))}
      </ScrollView>
      <RecipeDialog idea={open} brief={brief ?? undefined} mealLabel="" onClose={() => setOpen(null)} onRemoved={(name) => showFlash(g('recipe.removed', { name }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  gap: { marginTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  row: { gap: 2, padding: 12, marginTop: 8, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
});
