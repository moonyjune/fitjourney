import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { useTranslation } from '../i18n/useTranslation';
import { actualDailyDeficitKcal, estimateTdeeKcal, TARGET_DAILY_DEFICIT_KCAL } from '../utils/tdee';
import { colors, spacing, typography } from '../theme/tokens';

interface TdeeCardProps {
  calorieTargetKcal: number;
  caloriesConsumedToday: number;
  /** Calories burned through logged exercise today — on top of TDEE, not part of it. */
  caloriesBurnedExerciseToday: number;
}

/** Estimated TDEE + today's real calorie balance — shown on Today and Nutrition, the two screens
 *  that already track a day's intake/burn. Purely informational (read-only), doesn't touch any
 *  existing calorie/protein/water tracking. */
export function TdeeCard({ calorieTargetKcal, caloriesConsumedToday, caloriesBurnedExerciseToday }: TdeeCardProps) {
  const { t } = useTranslation();
  const tdee = estimateTdeeKcal(calorieTargetKcal);
  const balance = actualDailyDeficitKcal(tdee, caloriesBurnedExerciseToday, caloriesConsumedToday);
  const isDeficit = balance >= 0;

  return (
    <Card>
      <Text style={styles.title}>{t('tdee.title')}</Text>
      <View style={styles.row}>
        <View style={styles.column}>
          <Text style={styles.label}>{t('tdee.tdeeLabel')}</Text>
          <Text style={styles.value}>{Math.round(tdee)} kcal</Text>
        </View>
        <View style={styles.column}>
          <Text style={styles.label}>{isDeficit ? t('tdee.deficitLabel') : t('tdee.surplusLabel')}</Text>
          <Text style={[styles.value, { color: isDeficit ? colors.success : colors.warning }]}>{Math.round(Math.abs(balance))} kcal</Text>
        </View>
      </View>
      <Text style={styles.hint}>{t('tdee.targetHint', { kcal: TARGET_DAILY_DEFICIT_KCAL })}</Text>
      <Text style={styles.estimateHint}>{t('tdee.estimateHint')}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.md, color: colors.textPrimary },
  row: { flexDirection: 'row', gap: spacing.xl },
  column: { flex: 1 },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: 2 },
  value: { ...typography.h3, color: colors.textPrimary },
  hint: { ...typography.caption, fontWeight: '400', color: colors.textMuted, marginTop: spacing.sm },
  estimateHint: { ...typography.small, fontWeight: '400', color: colors.textMuted, marginTop: 2, lineHeight: 15 },
});
