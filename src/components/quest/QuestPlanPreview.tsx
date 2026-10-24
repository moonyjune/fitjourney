import { StyleSheet, View } from 'react-native';
import type { MealFoodItem, PlanData, WorkoutStep } from '../../types';
import { shoppingListTotalVnd } from '../../constants/plan';
import { useTranslation } from '../../i18n/useTranslation';
import { quest, questRadius } from '../../theme/quest';
import { formatVnd, stepsOrImplicit } from '../PlanPreview';
import { HudText } from './HudText';

function MealItems({ items }: { items: MealFoodItem[] }) {
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={`${item.name}-${i}`} style={styles.itemRow}>
          <HudText size={13} weight="medium" color={quest.textTertiary} style={styles.flex}>
            {item.name}
          </HudText>
          <HudText size={13} weight="semibold" color={quest.textSecondary}>
            {item.calories} kcal
          </HudText>
        </View>
      ))}
    </View>
  );
}

function Steps({ steps }: { steps: WorkoutStep[] }) {
  return (
    <View style={styles.list}>
      {steps.map((step, i) => (
        <View key={`${step.label}-${i}`} style={styles.stepRow}>
          <View style={styles.stepNum}>
            <HudText size={11} color={quest.gold}>
              {i + 1}
            </HudText>
          </View>
          <View style={styles.flex}>
            <View style={styles.stepHead}>
              <HudText size={13} style={styles.flex}>
                {step.label}
              </HudText>
              <HudText size={11} weight="semibold" color={quest.textSecondary}>
                {step.durationMin}p · {step.caloriesBurned} kcal
              </HudText>
            </View>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {step.instruction}
            </HudText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Dark FitQuest twin of PlanPreview: meal menus, water schedule, workouts and (optionally) the shopping list. */
export function QuestPlanPreview({ plan, hideShoppingList }: { plan: PlanData; hideShoppingList?: boolean }) {
  const { t } = useTranslation();
  const meals = (list: PlanData['mealTemplates']['training']) =>
    list.map((m) => (
      <View key={m.slot} style={styles.panel}>
        <HudText size={14}>
          {m.label} ({m.timeRange})
        </HudText>
        <MealItems items={m.items} />
        <HudText size={13} color={quest.gold} style={styles.macro}>
          {t('nutrition.mealTotal', { kcal: m.calories, protein: m.proteinG })}
        </HudText>
      </View>
    ));
  const title = (text: string) => (
    <HudText size={16} accessibilityRole="header" style={styles.title}>
      {text}
    </HudText>
  );
  return (
    <View>
      {title(t('planPreview.trainingMenuTitle'))}
      {meals(plan.mealTemplates.training)}
      {title(t('planPreview.restMenuTitle'))}
      {meals(plan.mealTemplates.rest)}

      {title(t('planPreview.waterScheduleTitle'))}
      <View style={styles.panel}>
        {plan.waterSchedule.map((cp, i) => (
          <View key={`${cp.hour}-${cp.minute}-${i}`} style={styles.waterRow}>
            <HudText size={12} color={quest.mana} style={styles.time}>
              {String(cp.hour).padStart(2, '0')}:{String(cp.minute).padStart(2, '0')}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textTertiary} style={styles.flex}>
              {cp.label}
            </HudText>
            <HudText size={12}>{cp.cumulativeTargetMl}ml</HudText>
          </View>
        ))}
      </View>

      {title(t('planPreview.cardioTitle'))}
      {plan.workoutTemplates.map((wt) => (
        <View key={wt.id} style={styles.panel}>
          <HudText size={14}>{wt.label}</HudText>
          <Steps steps={stepsOrImplicit(wt)} />
          <HudText size={13} color={quest.gold} style={styles.macro}>
            {t('workout.templateMacro', { min: wt.durationMin, kcal: wt.caloriesBurned })}
          </HudText>
        </View>
      ))}

      {!hideShoppingList && (
        <>
          {title(t('planPreview.shoppingTitle', { price: formatVnd(shoppingListTotalVnd(plan.shoppingList)) }))}
          <View style={styles.panel}>
            {plan.shoppingList.map((item, i) => (
              <View key={`${item.name}-${i}`} style={styles.waterRow}>
                <View style={styles.flex}>
                  <HudText size={13}>{item.name}</HudText>
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {item.category} · {t('planPreview.buyPrefix')}
                    {item.quantityToBuy}
                  </HudText>
                </View>
                <HudText size={13}>{formatVnd(item.estimatedPriceVnd)}</HudText>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  title: { marginTop: 12, marginBottom: 8 },
  panel: { backgroundColor: quest.panel, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, padding: 14, marginBottom: 8 },
  list: { marginTop: 8, gap: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  macro: { marginTop: 8 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  stepHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: quest.border },
  time: { width: 44 },
});
