import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { useTranslation } from '../i18n/useTranslation';
import type { StringKey } from '../i18n/strings';
import { ACTIVITY_MULTIPLIER, actualDailyDeficitKcal, resolveTdeeKcal, type TdeeSource } from '../utils/tdee';
import { colors, spacing, typography } from '../theme/tokens';
import { quest, questFonts, questRadius } from '../theme/quest';
import type { ActivityLevel, Gender } from '../types';

interface TdeeCardProps {
  calorieTargetKcal: number;
  targetDailyDeficitKcal: number;
  heightCm: number | null;
  age: number | null;
  gender: Gender | null;
  activityLevel: ActivityLevel | null;
  weightKg: number;
  caloriesConsumedToday: number;
  /** Calories burned through logged exercise today — on top of TDEE, not part of it. */
  caloriesBurnedExerciseToday: number;
  /** Dark FitQuest look (default off = classic light). */
  dark?: boolean;
}

const ACTIVITY_LABEL_KEY: Record<ActivityLevel, StringKey> = {
  sedentary: 'activityLevel.sedentary',
  light: 'activityLevel.light',
  moderate: 'activityLevel.moderate',
  active: 'activityLevel.active',
  very_active: 'activityLevel.very_active',
};

const SOURCE_HINT_KEY: Record<TdeeSource, StringKey> = {
  profile: 'tdee.sourceProfile',
  planTargetWithActivity: 'tdee.sourcePlanTargetWithActivity',
  planTarget: 'tdee.sourcePlanTarget',
};

/** Estimated TDEE + today's real calorie balance — shown on Today and Nutrition, the two screens
 *  that already track a day's intake/burn. Prefers a real Mifflin-St Jeor calculation once
 *  age/gender/height/activity level are known; falls back to a plan-target-derived estimate
 *  (using the user's own target deficit, editable in Plan) otherwise. Read-only: the activity
 *  level and every other input are edited on the Plan tab, this only displays the result. */
export function TdeeCard({
  calorieTargetKcal,
  targetDailyDeficitKcal,
  heightCm,
  age,
  gender,
  activityLevel,
  weightKg,
  caloriesConsumedToday,
  caloriesBurnedExerciseToday,
  dark,
}: TdeeCardProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(!!dark), [dark]);
  const { tdeeKcal, bmrKcal, source } = resolveTdeeKcal({
    gender,
    age,
    heightCm,
    activityLevel,
    weightKg,
    calorieTargetKcal,
    targetDailyDeficitKcal,
  });
  const balance = actualDailyDeficitKcal(tdeeKcal, caloriesBurnedExerciseToday, caloriesConsumedToday);
  const isDeficit = balance >= 0;

  const Wrapper = dark ? View : Card;
  return (
    <Wrapper style={dark ? styles.panel : undefined}>
      <Text style={styles.title}>{t('tdee.title')}</Text>
      <View style={styles.row}>
        <View style={styles.column}>
          <Text style={styles.label}>{t('tdee.tdeeLabel')}</Text>
          <Text style={styles.value}>{Math.round(tdeeKcal)} kcal</Text>
        </View>
        <View style={styles.column}>
          <Text style={styles.label}>{isDeficit ? t('tdee.deficitLabel') : t('tdee.surplusLabel')}</Text>
          <Text style={[styles.value, { color: isDeficit ? (dark ? quest.xp : colors.success) : dark ? quest.gold : colors.warning }]}>{Math.round(Math.abs(balance))} kcal</Text>
        </View>
      </View>
      <Text style={styles.hint}>{t('tdee.targetHint', { kcal: targetDailyDeficitKcal })}</Text>
      {bmrKcal != null && <Text style={styles.hint}>{t('tdee.bmrLabel', { kcal: Math.round(bmrKcal) })}</Text>}
      {activityLevel && (
        <Text style={styles.hint}>
          {t('tdee.activityLevelLabel')} {t(ACTIVITY_LABEL_KEY[activityLevel])} ×{ACTIVITY_MULTIPLIER[activityLevel]}
        </Text>
      )}
      <Text style={styles.estimateHint}>{t(SOURCE_HINT_KEY[source])}</Text>
    </Wrapper>
  );
}

const makeStyles = (dark: boolean) =>
  StyleSheet.create({
    panel: { backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.panel, padding: spacing.base, marginBottom: spacing.md },
    title: { ...typography.title, marginBottom: spacing.md, color: dark ? quest.text : colors.textPrimary, ...(dark ? { fontFamily: questFonts.bold, fontWeight: undefined } : {}) },
    row: { flexDirection: 'row', gap: spacing.xl },
    column: { flex: 1 },
    label: { ...typography.label, color: dark ? quest.textSecondary : colors.textSecondary, marginBottom: 2, ...(dark ? { fontFamily: questFonts.medium, fontWeight: undefined } : {}) },
    value: { ...typography.h3, color: dark ? quest.text : colors.textPrimary, ...(dark ? { fontFamily: questFonts.bold, fontWeight: undefined } : {}) },
    hint: { ...typography.caption, fontWeight: '400', color: dark ? quest.textSecondary : colors.textMuted, marginTop: spacing.sm },
    estimateHint: { ...typography.small, fontWeight: '400', color: dark ? quest.textSecondary : colors.textMuted, marginTop: 2, lineHeight: 15 },
  });
