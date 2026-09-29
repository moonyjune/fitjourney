import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from './Card';
import { useTranslation } from '../i18n/useTranslation';
import type { StringKey } from '../i18n/strings';
import { useSettingsStore } from '../store/useSettingsStore';
import { ACTIVITY_MULTIPLIER, actualDailyDeficitKcal, resolveTdeeKcal, TARGET_DAILY_DEFICIT_KCAL } from '../utils/tdee';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { ActivityLevel, Gender } from '../types';

interface TdeeCardProps {
  calorieTargetKcal: number;
  heightCm: number | null;
  age: number | null;
  gender: Gender | null;
  activityLevel: ActivityLevel | null;
  weightKg: number;
  caloriesConsumedToday: number;
  /** Calories burned through logged exercise today — on top of TDEE, not part of it. */
  caloriesBurnedExerciseToday: number;
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; labelKey: StringKey }[] = [
  { value: 'sedentary', labelKey: 'activityLevel.sedentary' },
  { value: 'light', labelKey: 'activityLevel.light' },
  { value: 'moderate', labelKey: 'activityLevel.moderate' },
  { value: 'active', labelKey: 'activityLevel.active' },
  { value: 'very_active', labelKey: 'activityLevel.very_active' },
];

/** Estimated TDEE + today's real calorie balance — shown on Today and Nutrition, the two screens
 *  that already track a day's intake/burn. Prefers a real Mifflin-St Jeor calculation once
 *  age/gender/height/activity level are known; falls back to a plan-target-derived estimate
 *  otherwise. The activity-level tier (the multiplier most directly under the user's control, and
 *  the one people most often want to double-check/correct) is adjustable right here, showing its
 *  exact multiplier — updating it writes straight to settings, same as the Plan tab fields. */
export function TdeeCard({
  calorieTargetKcal,
  heightCm,
  age,
  gender,
  activityLevel,
  weightKg,
  caloriesConsumedToday,
  caloriesBurnedExerciseToday,
}: TdeeCardProps) {
  const { t } = useTranslation();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const { tdeeKcal, source } = resolveTdeeKcal({ gender, age, heightCm, activityLevel, weightKg, calorieTargetKcal });
  const balance = actualDailyDeficitKcal(tdeeKcal, caloriesBurnedExerciseToday, caloriesConsumedToday);
  const isDeficit = balance >= 0;

  return (
    <Card>
      <Text style={styles.title}>{t('tdee.title')}</Text>
      <View style={styles.row}>
        <View style={styles.column}>
          <Text style={styles.label}>{t('tdee.tdeeLabel')}</Text>
          <Text style={styles.value}>{Math.round(tdeeKcal)} kcal</Text>
        </View>
        <View style={styles.column}>
          <Text style={styles.label}>{isDeficit ? t('tdee.deficitLabel') : t('tdee.surplusLabel')}</Text>
          <Text style={[styles.value, { color: isDeficit ? colors.success : colors.warning }]}>{Math.round(Math.abs(balance))} kcal</Text>
        </View>
      </View>
      <Text style={styles.hint}>{t('tdee.targetHint', { kcal: TARGET_DAILY_DEFICIT_KCAL })}</Text>
      <Text style={styles.estimateHint}>{t(source === 'profile' ? 'tdee.sourceProfile' : 'tdee.sourcePlanTarget')}</Text>

      <Text style={styles.adjustLabel}>{t('tdee.adjustActivityLabel')}</Text>
      <View style={styles.activityRow}>
        {ACTIVITY_OPTIONS.map((opt) => {
          const active = activityLevel === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.activityChip, active && styles.activityChipActive]}
              onPress={() => updateSettings({ activityLevel: opt.value })}
            >
              <Text style={[styles.activityChipText, active && styles.activityChipTextActive]}>
                {t(opt.labelKey)} ×{ACTIVITY_MULTIPLIER[opt.value]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
  adjustLabel: { ...typography.small, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  activityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  activityChip: { backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2 },
  activityChipActive: { backgroundColor: colors.primary },
  activityChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  activityChipTextActive: { color: colors.white },
});
