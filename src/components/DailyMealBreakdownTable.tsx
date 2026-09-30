import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import type { StringKey } from '../i18n/strings';
import type { ExtraFoodItem, ExtraMealTime, MealSlot, MealTemplate } from '../types';

const EXTRA_MEAL_TIME_LABEL_KEY: Record<ExtraMealTime, StringKey> = {
  breakfast: 'extraMealTime.breakfast',
  morning_snack: 'extraMealTime.morning_snack',
  lunch: 'extraMealTime.lunch',
  afternoon_snack: 'extraMealTime.afternoon_snack',
  late_afternoon_snack: 'extraMealTime.late_afternoon_snack',
  dinner: 'extraMealTime.dinner',
  evening_snack: 'extraMealTime.evening_snack',
};

interface DailyMealBreakdownTableProps {
  meals: MealTemplate[];
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraItems: ExtraFoodItem[];
  /** Only passed for an editable log — omit to render a read-only view. */
  onRemoveExtra?: (itemId: string) => void;
  /** Only passed for an editable log — makes each meal row tappable to flip eaten/not-eaten,
   *  same as Nutrition's own meal cards. Totals below recompute immediately either way, since
   *  they're derived from the (now-updated) mealsEaten/extraItems props on every render. */
  onToggleMeal?: (slot: MealSlot) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One consolidated table of everything logged for a day — the 3 plan meals (eaten or not) plus
 *  any off-plan food, regardless of which of the two the calories came from. Shared by Nutrition
 *  (today, editable) and History (any past day, read-only per-day expansion). */
export function DailyMealBreakdownTable({ meals, mealsEaten, extraItems, onRemoveExtra, onToggleMeal }: DailyMealBreakdownTableProps) {
  const { t } = useTranslation();
  const totalCalories =
    meals.filter((m) => mealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0) + extraItems.reduce((s, i) => s + i.calories, 0);
  const totalProtein =
    meals.filter((m) => mealsEaten[m.slot]).reduce((s, m) => s + m.proteinG, 0) + extraItems.reduce((s, i) => s + i.proteinG, 0);

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.nameCol]}>{t('mealLog.tableHeaderItem')}</Text>
        <Text style={[styles.headerCell, styles.statusCol]}>{t('mealLog.tableHeaderStatus')}</Text>
        <Text style={[styles.headerCell, styles.numCol]}>{t('mealLog.tableHeaderKcal')}</Text>
        <Text style={[styles.headerCell, styles.numCol]}>{t('mealLog.tableHeaderProtein')}</Text>
      </View>

      {meals.map((m) => {
        const eaten = !!mealsEaten[m.slot];
        const RowWrapper = onToggleMeal ? TouchableOpacity : View;
        return (
          <RowWrapper key={m.slot} style={styles.row} {...(onToggleMeal ? { onPress: () => onToggleMeal(m.slot) } : {})}>
            <Text style={[styles.cell, styles.nameCol]} numberOfLines={1}>
              {m.label}
            </Text>
            <Text style={[styles.cell, styles.statusCol, { color: eaten ? colors.success : colors.textMuted }]}>
              {eaten ? t('mealLog.statusEaten') : t('mealLog.statusNotEaten')}
            </Text>
            <Text style={[styles.cell, styles.numCol]}>{eaten ? m.calories : '–'}</Text>
            <Text style={[styles.cell, styles.numCol]}>{eaten ? m.proteinG : '–'}</Text>
          </RowWrapper>
        );
      })}

      {extraItems.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text style={[styles.cell, styles.nameCol]} numberOfLines={1}>
            {item.name || t('mealLog.extraSectionLabel')} <Text style={styles.extraTime}>({formatTime(item.loggedAtISO)})</Text>
          </Text>
          <Text style={[styles.cell, styles.statusCol, { color: colors.primary }]}>
            {item.mealTime ? t(EXTRA_MEAL_TIME_LABEL_KEY[item.mealTime]) : t('mealLog.extraSectionLabel')}
          </Text>
          <Text style={[styles.cell, styles.numCol]}>{item.calories}</Text>
          <Text style={[styles.cell, styles.numCol]}>{item.proteinG}</Text>
          {onRemoveExtra && (
            <TouchableOpacity onPress={() => onRemoveExtra(item.id)} style={styles.deleteCol}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.cell, styles.nameCol, styles.totalText]}>{t('mealLog.totalRow')}</Text>
        <View style={styles.statusCol} />
        <Text style={[styles.cell, styles.numCol, styles.totalText]}>{totalCalories}</Text>
        <Text style={[styles.cell, styles.numCol, styles.totalText]}>{totalProtein}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  table: { marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: '#EEE' },
  headerRow: { flexDirection: 'row', backgroundColor: colors.neutralLight, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm },
  headerCell: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F3F3F3',
  },
  cell: { fontSize: 12, color: colors.textPrimary },
  nameCol: { flex: 2.4, paddingRight: spacing.xs },
  statusCol: { flex: 1.1 },
  numCol: { flex: 0.7, textAlign: 'right' },
  extraTime: { fontSize: 10, color: colors.textMuted },
  deleteCol: { paddingLeft: spacing.xs },
  deleteText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  totalRow: { backgroundColor: colors.primaryLight, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  totalText: { fontWeight: '800', color: colors.primaryDark },
});
