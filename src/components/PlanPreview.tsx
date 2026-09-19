import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import type { MealFoodItem, PlanData } from '../types';
import { shoppingListTotalVnd } from '../constants/plan';
import { useTranslation } from '../i18n/useTranslation';
import { colors, spacing, typography } from '../theme/tokens';

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ';
}

/** One food line per row (name + kcal) — shared by the plan reference view and the daily meal cards. */
export function MealItemRows({ items }: { items: MealFoodItem[] }) {
  return (
    <View style={styles.itemsList}>
      {items.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.itemRow}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemCalories}>{item.calories} kcal</Text>
        </View>
      ))}
    </View>
  );
}

/** Renders a PlanData (meal menus, water schedule, workouts, shopping list) — reused for both the live plan and an AI proposal preview. */
export function PlanPreview({ plan }: { plan: PlanData }) {
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
          <Text style={styles.mealDescription}>{wt.description}</Text>
          <Text style={styles.mealMacro}>{t('workout.templateMacro', { min: wt.durationMin, kcal: wt.caloriesBurned })}</Text>
        </Card>
      ))}

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
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  mealLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  mealDescription: { fontSize: 13, color: '#444', marginTop: spacing.sm - 2, lineHeight: 18 },
  mealMacro: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  itemsList: { marginTop: spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemName: { fontSize: 13, color: '#444', flex: 1, paddingRight: spacing.sm },
  itemCalories: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
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
