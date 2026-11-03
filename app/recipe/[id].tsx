import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useNextMealBrief } from '../../src/cookbook/useNextMealBrief';
import { ideaFromRecipe, recipeFromIdea } from '../../src/cookbook/recipes';
import { HudText } from '../../src/components/quest/HudText';
import { openInAddFood } from '../../src/components/quest/MealSuggestionsCard';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { RecipeView } from '../../src/components/quest/RecipeView';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { useGameText, type GameKey } from '../../src/game/strings';
import { useCookbookStore } from '../../src/store/useCookbookStore';
import { useRecipeViewStore } from '../../src/store/useRecipeViewStore';
import { quest } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/cookbook');
}

/** Cook book / cheat day > a dish: its recipe as a scroll page (redesign decision 5) with the large photo, and "Ghi món này · kcal ·
 *  bữa" kept at the bottom, which opens Ghi bữa filled in. A dish of the cook book is read from it; another one (AI, shared cook book)
 *  was handed over by `openRecipe`. */
export default function RecipeScreen() {
  const g = useGameText();
  useLightStatusBar();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = typeof rawId === 'string' ? rawId : '';
  const saved = useCookbookStore((s) => s.recipes.find((r) => r.id === id));
  const handed = useRecipeViewStore((s) => s.open[id]);
  const next = useNextMealBrief();
  const idea = handed?.idea ?? (saved ? ideaFromRecipe(saved) : null);

  if (!idea) {
    return (
      <ScreenTemplate title={g('cookbook.title')} onBack={goBack}>
        <View style={styles.empty}>
          <HudText size={40}>📖</HudText>
          <HudText size={14} weight="medium" color={quest.textSecondary}>
            {g('rd4.recipe.missing')}
          </HudText>
          <QuestButton variant="ghost" title={g('common.back')} onPress={goBack} />
        </View>
      </ScreenTemplate>
    );
  }
  const cheat = !!(idea.cheat || saved?.cheat);
  const brief = cheat ? undefined : (handed?.brief ?? next ?? undefined);
  const kind = brief?.meal ?? 'meal';
  const mealName = g(`meals.kind.${kind}` as GameKey);
  const shown = saved ? ideaFromRecipe(saved) : idea;

  return (
    <ScreenTemplate
      title={shown.name}
      eyebrow={cheat ? g('rd4.cheat.eyebrow') : g('cookbook.title')}
      onBack={goBack}
      primary={{
        label: g('rd4.recipe.log', { kcal: shown.calories, meal: mealName }),
        accessibilityLabel: g('dinner.logLabel', { name: shown.name }),
        onPress: () => {
          const store = useCookbookStore.getState();
          store.save(recipeFromIdea(idea));
          store.markCooked(id);
          openInAddFood(shown, kind);
        },
      }}
    >
      <RecipeView idea={idea} brief={brief} mealLabel={mealName} hero onRemoved={goBack} />
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40 },
});
