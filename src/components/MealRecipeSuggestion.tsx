import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchMealRecipe, pushMealRecipe, requestMealRecipe } from '../sync/cloudSync';
import { useTranslation } from '../i18n/useTranslation';
import { useAccentColors } from '../theme/useAccentColors';
import { radius, spacing } from '../theme/tokens';
import type { DayType, MealRecipeSuggestion as Recipe } from '../types';

interface Props {
  dayType: DayType;
  mealSlot: string;
  mealLabel: string;
  targetCalories: number;
  targetProtein: number;
}

function difficultyStars(level: number): string {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

/** "Tuỳ biến món ăn" — an AI-suggested alternative dish for this meal slot, matching its
 *  calorie/protein target but a different dish than the plan's default. Purely additive to the
 *  Nutrition screen: doesn't touch meal-completion state, calorie tallying, or proof capture. */
export function MealRecipeSuggestion({ dayType, mealSlot, mealLabel, targetCalories, targetProtein }: Props) {
  const { t } = useTranslation();
  const accent = useAccentColors();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingInitial(true);
    fetchMealRecipe(dayType, mealSlot).then((cached) => {
      if (!cancelled) {
        setRecipe(cached);
        setLoadingInitial(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dayType, mealSlot]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const avoidDishNames = recipe ? [recipe.dishName] : undefined;
    const result = await requestMealRecipe(mealLabel, dayType, targetCalories, targetProtein, avoidDishNames);
    setGenerating(false);
    if (!result.ok) {
      setError(result.message || t('mealRecipe.errorGeneric'));
      return;
    }
    setRecipe(result.recipe);
    await pushMealRecipe(dayType, mealSlot, result.recipe);
  }

  if (loadingInitial) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={accent.primary} />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.promptWrap}>
        <Text style={styles.promptText}>{t('mealRecipe.suggestPrompt')}</Text>
        <TouchableOpacity
          style={[styles.generateButton, { backgroundColor: accent.primaryLight }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <>
              <ActivityIndicator size="small" color={accent.primary} />
              <Text style={[styles.generateButtonText, { color: accent.primary }]}>{t('mealRecipe.generatingText')}</Text>
            </>
          ) : (
            <Text style={[styles.generateButtonText, { color: accent.primary }]}>{t('mealRecipe.generateButton')}</Text>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.illustration, { backgroundColor: accent.primaryLight }]}>
          <Text style={styles.illustrationEmoji}>{recipe.emoji}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.dishName} numberOfLines={2}>
            {recipe.dishName}
          </Text>
          <Text style={styles.meta}>
            ⏱ {t('mealRecipe.durationMinutes', { n: recipe.durationMinutes })} · {difficultyStars(recipe.difficulty)}
          </Text>
          <Text style={styles.macro}>{t('mealRecipe.macroSummary', { kcal: Math.round(recipe.caloriesKcal), protein: Math.round(recipe.proteinG) })}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleGenerate}
          disabled={generating}
          accessibilityLabel={t('mealRecipe.refreshHint')}
        >
          {generating ? <ActivityIndicator size="small" color={accent.textSecondary} /> : <Text style={styles.refreshIcon}>🔄</Text>}
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity style={[styles.cookButton, { backgroundColor: accent.primary }]} onPress={() => setModalVisible(true)}>
        <Text style={styles.cookButtonText}>{t('mealRecipe.howToCookButton')}</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalEmoji}>{recipe.emoji}</Text>
              <Text style={styles.modalDishName}>{recipe.dishName}</Text>
              <Text style={styles.modalMeta}>
                ⏱ {t('mealRecipe.durationMinutes', { n: recipe.durationMinutes })} · {t('mealRecipe.modalDifficultyLabel')}:{' '}
                {difficultyStars(recipe.difficulty)}
              </Text>
              <Text style={styles.modalMacro}>
                {t('mealRecipe.macroSummary', { kcal: Math.round(recipe.caloriesKcal), protein: Math.round(recipe.proteinG) })}
              </Text>

              <Text style={styles.modalSectionTitle}>{t('mealRecipe.modalIngredientsTitle')}</Text>
              {recipe.ingredients.map((ing, i) => (
                <Text key={i} style={styles.modalListItem}>
                  •  {ing.name} — {ing.quantity}
                </Text>
              ))}

              <Text style={styles.modalSectionTitle}>{t('mealRecipe.modalStepsTitle')}</Text>
              {recipe.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepBadge, { backgroundColor: accent.primary }]}>
                    <Text style={styles.stepBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCloseText}>{t('mealRecipe.modalCloseButton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { paddingVertical: spacing.sm, alignItems: 'flex-start' },
  promptWrap: { marginTop: spacing.sm, gap: spacing.sm - 4 },
  promptText: { fontSize: 12, color: '#888' },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
  },
  generateButtonText: { fontSize: 12, fontWeight: '700' },
  errorText: { fontSize: 11, color: '#E0563A', marginTop: spacing.xs },
  card: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  illustration: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  illustrationEmoji: { fontSize: 24 },
  info: { flex: 1 },
  dishName: { fontSize: 13, fontWeight: '700', color: '#222' },
  meta: { fontSize: 11, color: '#888', marginTop: 2 },
  macro: { fontSize: 11, color: '#888', marginTop: 1 },
  refreshButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F0F0' },
  refreshIcon: { fontSize: 15 },
  cookButton: { marginTop: spacing.sm, borderRadius: radius.sm, paddingVertical: spacing.sm - 1, alignItems: 'center' },
  cookButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '85%' },
  modalContent: { padding: spacing.xl, paddingBottom: spacing.md, alignItems: 'center' },
  modalEmoji: { fontSize: 40 },
  modalDishName: { fontSize: 18, fontWeight: '800', color: '#222', marginTop: spacing.xs, textAlign: 'center' },
  modalMeta: { fontSize: 12, color: '#888', marginTop: spacing.xs },
  modalMacro: { fontSize: 12, color: '#888', marginTop: 2, marginBottom: spacing.md },
  modalSectionTitle: { alignSelf: 'flex-start', fontSize: 14, fontWeight: '700', color: '#222', marginTop: spacing.sm, marginBottom: spacing.xs },
  modalListItem: { alignSelf: 'flex-start', fontSize: 13, color: '#444', marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignSelf: 'stretch', gap: spacing.sm, marginBottom: spacing.sm },
  stepBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 19 },
  modalCloseButton: { paddingVertical: spacing.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  modalCloseText: { color: '#666', fontWeight: '700', fontSize: 13 },
});
