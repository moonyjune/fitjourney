import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { ProgressBar } from '../../src/components/ProgressBar';
import { FeelingRecordCard } from '../../src/components/FeelingRecordCard';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useNutritionStore, todayKey } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { getDayType } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { getIfStatus } from '../../src/utils/intermittentFasting';
import { computeMilestones } from '../../src/utils/milestones';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { computeCurrentStreak, unlockedStreakBadges } from '../../src/utils/streak';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';

export default function TodayScreen() {
  const { t, language } = useTranslation();
  const [now, setNow] = useState(new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, [])
  );

  const settings = useSettingsStore();
  const latestWeight = useWeightStore((s) => s.latest());
  const nutritionLog = useNutritionStore((s) => s.getLog(todayKey()));
  const allNutritionLogs = useNutritionStore((s) => s.logs);
  const allWorkoutEntries = useWorkoutStore((s) => s.entries);
  const workoutEntries = useMemo(
    () => allWorkoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === todayKey()),
    [allWorkoutEntries]
  );

  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const dayType = useMemo(() => getDayType(now), [now]);
  const ifStatus = useMemo(() => getIfStatus(now), [now]);
  const meals = mealTemplates[dayType];

  const eatenCalories = meals
    .filter((m) => nutritionLog.mealsEaten[m.slot])
    .reduce((sum, m) => sum + m.calories, 0);
  const eatenProtein = meals
    .filter((m) => nutritionLog.mealsEaten[m.slot])
    .reduce((sum, m) => sum + m.proteinG, 0);
  const totalCalories = eatenCalories + nutritionLog.extraCalories;
  const totalProtein = eatenProtein + nutritionLog.extraProteinG;

  const caloriesBurnedToday = workoutEntries.reduce((sum, w) => sum + w.caloriesBurned, 0);

  const currentWeight = latestWeight?.weightKg ?? settings.startWeightKg;
  const weightChange = currentWeight - settings.startWeightKg;

  const nextMilestone = useMemo(() => {
    const milestones = computeMilestones(
      settings.startDateISO,
      settings.startWeightKg,
      settings.goalWeightKg,
      currentWeight,
      now
    );
    return milestones.find((m) => m.status === 'upcoming') ?? milestones[milestones.length - 1];
  }, [settings.startDateISO, settings.startWeightKg, settings.goalWeightKg, currentWeight, now]);

  const streak = useMemo(
    () => computeCurrentStreak(allNutritionLogs, 3, settings.waterTargetMl, now),
    [allNutritionLogs, settings.waterTargetMl, now]
  );
  const badges = unlockedStreakBadges(streak);

  const dateLocale = language === 'en' ? 'en-US' : 'vi-VN';

  // Ambient mood background for the Fatty/Client dashboard: green while eating is allowed,
  // red during the fasting window. Coach mode never renders this screen, but guard anyway.
  const ambientBg =
    settings.role === 'client' ? (ifStatus.isEatingWindow ? colors.ifEatingBackground : colors.ifFastingBackground) : colors.background;

  return (
    <ScrollView style={[styles.container, { backgroundColor: ambientBg }]} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Text style={styles.dateLabel}>
        {now.toLocaleDateString(dateLocale, { weekday: 'long', day: '2-digit', month: '2-digit' })} ·{' '}
        {dayType === 'training' ? t('today.dayTraining') : t('today.dayRest')}
      </Text>

      <Card style={ifStatus.isEatingWindow ? styles.eatingCard : styles.fastingCard}>
        <Text style={styles.ifSubLabel}>
          {t('today.ifRemaining', {
            hours: ifStatus.hoursUntilTransition.toFixed(1),
            target: ifStatus.isEatingWindow ? t('today.untilFasting') : t('today.untilEating'),
          })}
        </Text>
      </Card>

      <Card style={styles.streakCard}>
        <Text style={styles.streakValue}>{t('today.streakDays', { n: streak })}</Text>
        <Text style={styles.streakHint}>{t('today.streakHint')}</Text>
        {badges.length > 0 && (
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <Badge key={b} label={t('today.streakDays', { n: b })} tone="gold" />
            ))}
          </View>
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{t('today.weightTitle')}</Text>
        <View style={styles.weightRow}>
          <Text style={styles.weightValue}>{currentWeight.toFixed(1)} kg</Text>
          <Text style={[styles.weightChange, { color: weightChange <= 0 ? colors.success : colors.danger }]}>
            {weightChange > 0 ? '+' : ''}
            {weightChange.toFixed(1)} {t('today.weightChangeSuffix')}
          </Text>
        </View>
        <Text style={styles.goalLabel}>{t('common.goalLabel', { kg: settings.goalWeightKg })}</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{t(`milestone.${nextMilestone.key}` as StringKey)}</Text>
        <Text style={styles.milestoneMeta}>
          {t('today.milestoneMeta', {
            date: formatDateVi(toDateKey(nextMilestone.targetDate)),
            kg: nextMilestone.targetWeightKg.toFixed(1),
          })}
          {nextMilestone.status === 'upcoming' ? t('today.milestoneDaysRemaining', { n: nextMilestone.daysRemaining }) : ''}
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{t('today.nutritionTitle')}</Text>
        <ProgressBar label={t('common.calories')} current={totalCalories} target={settings.calorieTargetKcal} unit="kcal" />
        <ProgressBar label={t('common.protein')} current={totalProtein} target={settings.proteinTargetG} unit="g" />
        <ProgressBar label={t('common.water')} current={nutritionLog.waterMl} target={settings.waterTargetMl} unit="ml" />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{t('today.workoutTitle')}</Text>
        <Text style={styles.workoutSummary}>
          {t('today.workoutSummary', { count: workoutEntries.length, kcal: caloriesBurnedToday })}
        </Text>
        {dayType === 'rest' && <Text style={styles.restNote}>{t('today.restNote')}</Text>}
      </Card>

      <FeelingRecordCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  dateLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md, textTransform: 'capitalize' },
  eatingCard: { backgroundColor: colors.successLight },
  fastingCard: { backgroundColor: colors.warningLight },
  ifSubLabel: { ...typography.label, color: colors.textPrimary },
  cardTitle: { ...typography.title, marginBottom: spacing.md, color: colors.textPrimary },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' },
  weightValue: { ...typography.h1, color: colors.textPrimary },
  weightChange: { ...typography.caption },
  goalLabel: { ...typography.caption, fontWeight: '400', color: colors.textMuted, marginTop: spacing.xs },
  milestoneMeta: { ...typography.caption, fontWeight: '400', color: colors.textSecondary },
  streakCard: { backgroundColor: colors.goldLight },
  streakValue: { fontSize: 20, fontWeight: '800', color: colors.gold },
  streakHint: { ...typography.small, color: colors.gold, marginTop: spacing.xs, opacity: 0.8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  workoutSummary: { ...typography.body, color: colors.textPrimary },
  restNote: { ...typography.caption, fontWeight: '400', color: colors.textMuted, marginTop: spacing.sm },
});
