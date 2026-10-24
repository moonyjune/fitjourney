import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import type { MealFoodItem, PlanData, WorkoutStep, WorkoutTemplate } from '../types';
import { shoppingListTotalVnd } from '../constants/plan';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { quest, questFonts } from '../theme/quest';

const darkItemName = { color: quest.textTertiary, fontFamily: questFonts.medium } as const;
const darkItemCalories = { color: quest.textSecondary, fontFamily: questFonts.semibold, fontWeight: undefined } as const;

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ';
}

/** One food line per row (name + kcal) — shared by the plan reference view and the daily meal cards. */
export function MealItemRows({ items, dark }: { items: MealFoodItem[]; dark?: boolean }) {
  return (
    <View style={styles.itemsList}>
      {items.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.itemRow}>
          <Text style={[styles.itemName, dark && darkItemName]}>{item.name}</Text>
          <Text style={[styles.itemCalories, dark && darkItemCalories]}>{item.calories} kcal</Text>
        </View>
      ))}
    </View>
  );
}

/** `template.steps` when present, else a single implicit step built from the template's own
 *  label/description/duration/calories — so a template saved before `steps` existed (or a custom
 *  one from the AI assistant that only produced a description) still renders as a numbered
 *  step list instead of a flat, unnumbered paragraph. Matches WorkoutTemplate.steps' own doc
 *  comment ("plans saved before this field existed still render as a single implicit step"). */
export function stepsOrImplicit(template: Pick<WorkoutTemplate, 'label' | 'description' | 'durationMin' | 'caloriesBurned' | 'steps'>): WorkoutStep[] {
  if (template.steps && template.steps.length > 0) return template.steps;
  return [{ label: template.label, instruction: template.description, durationMin: template.durationMin, caloriesBurned: template.caloriesBurned }];
}

/** Numbered step-by-step breakdown of a workout template — shared by the plan reference view and the daily workout tab. */
export function WorkoutStepsList({ steps }: { steps: WorkoutStep[] }) {
  return (
    <View style={styles.stepsList}>
      {steps.map((step, index) => (
        <View key={`${step.label}-${index}`} style={styles.stepRow}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.stepHeaderRow}>
              <Text style={styles.stepLabel}>{step.label}</Text>
              <Text style={styles.stepMacro}>
                {step.durationMin}p · {step.caloriesBurned} kcal
              </Text>
            </View>
            <Text style={styles.stepInstruction}>{step.instruction}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Renders a PlanData (meal menus, water schedule, workouts, shopping list) — reused for both the live plan and an AI proposal preview.
 *  Pass `hideShoppingList` when the caller renders its own interactive shopping list instead (see ShoppingListEditor). */
export function PlanPreview({ plan, hideShoppingList }: { plan: PlanData; hideShoppingList?: boolean }) {
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.sectionTitle}>{t('planPreview.trainingMenuTitle')}</Text>
      {plan.mealTemplates.training.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <MealItemRows items={m.items} />
          <Text style={styles.mealMacro}>{t('nutrition.mealTotal', { kcal: m.calories, protein: m.proteinG })}</Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>{t('planPreview.restMenuTitle')}</Text>
      {plan.mealTemplates.rest.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <MealItemRows items={m.items} />
          <Text style={styles.mealMacro}>{t('nutrition.mealTotal', { kcal: m.calories, protein: m.proteinG })}</Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>{t('planPreview.waterScheduleTitle')}</Text>
      <Card>
        {plan.waterSchedule.map((cp, index) => (
          <View key={`${cp.hour}-${cp.minute}-${index}`} style={styles.waterRow}>
            <Text style={styles.waterTime}>
              {String(cp.hour).padStart(2, '0')}:{String(cp.minute).padStart(2, '0')}
            </Text>
            <Text style={styles.waterLabel}>{cp.label}</Text>
            <Text style={styles.waterTarget}>{cp.cumulativeTargetMl}ml</Text>
          </View>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>{t('planPreview.cardioTitle')}</Text>
      {plan.workoutTemplates.map((wt) => (
        <Card key={wt.id}>
          <Text style={styles.mealLabel}>{wt.label}</Text>
          <WorkoutStepsList steps={stepsOrImplicit(wt)} />
          <Text style={styles.mealMacro}>{t('workout.templateMacro', { min: wt.durationMin, kcal: wt.caloriesBurned })}</Text>
        </Card>
      ))}

      {!hideShoppingList && (
        <>
          <Text style={styles.sectionTitle}>
            {t('planPreview.shoppingTitle', { price: formatVnd(shoppingListTotalVnd(plan.shoppingList)) })}
          </Text>
          <Card>
            {plan.shoppingList.map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.shoppingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shoppingName}>{item.name}</Text>
                  <Text style={styles.shoppingMeta}>
                    {item.category} · {t('planPreview.buyPrefix')}{item.quantityToBuy}
                  </Text>
                </View>
                <Text style={styles.shoppingPrice}>{formatVnd(item.estimatedPriceVnd)}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

export { formatVnd };

const styles = StyleSheet.create({
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  mealLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  mealMacro: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  itemsList: { marginTop: spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemName: { fontSize: 13, color: '#444', flex: 1, paddingRight: spacing.sm },
  itemCalories: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  stepsList: { marginTop: spacing.sm, gap: spacing.sm },
  stepRow: { flexDirection: 'row', gap: spacing.sm },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  stepHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' },
  stepLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  stepMacro: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  stepInstruction: { fontSize: 12, color: '#555', marginTop: 2, lineHeight: 17 },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: spacing.md - 2,
  },
  waterTime: { fontSize: 12, fontWeight: '700', color: '#0288D1', width: 44 },
  waterLabel: { fontSize: 12, color: '#444', flex: 1 },
  waterTarget: { fontSize: 12, fontWeight: '700', color: '#333' },
  shoppingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  shoppingName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  shoppingMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  shoppingPrice: { fontSize: 13, fontWeight: '700', color: '#333' },
});
