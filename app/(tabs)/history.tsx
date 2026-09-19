import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useProofStore } from '../../src/store/useProofStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { getDayType } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { fetchFeedback } from '../../src/sync/cloudSync';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { weekStartKey } from '../../src/utils/weekKey';
import { computeMilestones } from '../../src/utils/milestones';
import { computeCurrentStreak, unlockedStreakBadges } from '../../src/utils/streak';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import type { CoachFeedback } from '../../src/types';

interface DaySummary {
  dateKey: string;
  calories: number;
  proteinG: number;
  waterMl: number;
  mealsEatenCount: number;
  workoutsCount: number;
  caloriesBurned: number;
  proofsCount: number;
  weightKg: number | null;
}

const MILESTONE_STATUS_KEY: Record<string, StringKey> = {
  upcoming: 'history.milestoneUpcoming',
  achieved: 'history.milestoneAchieved',
  missed: 'history.milestoneMissed',
};

const MILESTONE_STATUS_COLOR: Record<string, string> = {
  upcoming: colors.textMuted,
  achieved: colors.success,
  missed: colors.danger,
};

export default function HistoryScreen() {
  const { t } = useTranslation();
  const nutritionLogs = useNutritionStore((s) => s.logs);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const weightEntries = useWeightStore((s) => s.entries);
  const proofs = useProofStore((s) => s.photos);
  const settings = useSettingsStore();
  const latestWeight = useWeightStore((s) => s.latest());
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const session = useAuthStore((s) => s.session);

  const [feedbackList, setFeedbackList] = useState<CoachFeedback[]>([]);
  useEffect(() => {
    if (!session) return;
    fetchFeedback(session.user.id).then(setFeedbackList);
  }, [session]);

  const daySummaries = useMemo<DaySummary[]>(() => {
    const dateKeys = new Set<string>();
    Object.keys(nutritionLogs).forEach((k) => dateKeys.add(k));
    workoutEntries.forEach((e) => dateKeys.add(toDateKey(new Date(e.dateISO))));
    weightEntries.forEach((e) => dateKeys.add(toDateKey(new Date(e.dateISO))));
    proofs.forEach((p) => dateKeys.add(toDateKey(new Date(p.dateISO))));

    return [...dateKeys]
      .sort()
      .reverse()
      .map((dateKey) => {
        const dayType = getDayType(new Date(dateKey));
        const meals = mealTemplates[dayType];
        const log = nutritionLogs[dateKey];
        const eatenMeals = meals.filter((m) => log?.mealsEaten[m.slot]);
        const calories = eatenMeals.reduce((s, m) => s + m.calories, 0) + (log?.extraCalories ?? 0);
        const proteinG = eatenMeals.reduce((s, m) => s + m.proteinG, 0) + (log?.extraProteinG ?? 0);
        const dayWorkouts = workoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey);
        const dayWeight = weightEntries.find((e) => toDateKey(new Date(e.dateISO)) === dateKey);
        const dayProofs = proofs.filter((p) => toDateKey(new Date(p.dateISO)) === dateKey);

        return {
          dateKey,
          calories,
          proteinG,
          waterMl: log?.waterMl ?? 0,
          mealsEatenCount: eatenMeals.length,
          workoutsCount: dayWorkouts.length,
          caloriesBurned: dayWorkouts.reduce((s, w) => s + w.caloriesBurned, 0),
          proofsCount: dayProofs.length,
          weightKg: dayWeight?.weightKg ?? null,
        };
      });
  }, [nutritionLogs, workoutEntries, weightEntries, proofs, mealTemplates]);

  const weeklySummaries = useMemo(() => {
    const groups = new Map<string, DaySummary[]>();
    for (const day of daySummaries) {
      const week = weekStartKey(new Date(day.dateKey));
      if (!groups.has(week)) groups.set(week, []);
      groups.get(week)!.push(day);
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([weekKey, days]) => {
        const avgCalories = days.reduce((s, d) => s + d.calories, 0) / days.length;
        const totalWorkouts = days.reduce((s, d) => s + d.workoutsCount, 0);
        const weightsLogged = days.map((d) => d.weightKg).filter((w): w is number => w !== null);
        const weightChange =
          weightsLogged.length >= 2 ? weightsLogged[weightsLogged.length - 1] - weightsLogged[0] : null;
        return { weekKey, days, avgCalories, totalWorkouts, weightChange };
      });
  }, [daySummaries]);

  const milestones = useMemo(
    () =>
      computeMilestones(
        settings.startDateISO,
        settings.startWeightKg,
        settings.goalWeightKg,
        latestWeight?.weightKg ?? settings.startWeightKg
      ),
    [settings.startDateISO, settings.startWeightKg, settings.goalWeightKg, latestWeight]
  );

  const streak = useMemo(
    () => computeCurrentStreak(nutritionLogs, 3, settings.waterTargetMl),
    [nutritionLogs, settings.waterTargetMl]
  );
  const badges = unlockedStreakBadges(streak);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('history.achievementsTitle')}</Text>
      <Card>
        <Text style={styles.streakValue}>{t('today.streakDays', { n: streak })}</Text>
        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <Badge key={b} label={t('today.streakDays', { n: b })} tone="gold" />
            ))}
          </View>
        ) : (
          <Text style={styles.dayMeta}>{t('history.emptyBadges')}</Text>
        )}
      </Card>

      {feedbackList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('history.coachFeedbackTitle')}</Text>
          {feedbackList.map((f) => (
            <Card key={f.id}>
              <Text style={styles.feedbackPeriod}>
                {f.periodLabel} · {f.periodType === 'weekly' ? t('history.periodWeek') : t('history.periodMonth')}
              </Text>
              <Text style={styles.dayMeta}>{f.feedbackText}</Text>
              <Text style={styles.feedbackDate}>{formatDateVi(toDateKey(new Date(f.createdAtISO)))}</Text>
            </Card>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>{t('history.milestonesTitle')}</Text>
      {milestones.map((m) => (
        <Card key={m.key}>
          <View style={styles.milestoneRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.milestoneLabel}>{t(`milestone.${m.key}` as StringKey)}</Text>
              <Text style={styles.milestoneMeta}>
                {t('history.milestoneDue', { date: formatDateVi(toDateKey(m.targetDate)), kg: m.targetWeightKg.toFixed(1) })}
              </Text>
            </View>
            <Text style={[styles.milestoneStatus, { color: MILESTONE_STATUS_COLOR[m.status] }]}>
              {t(MILESTONE_STATUS_KEY[m.status])}
            </Text>
          </View>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>{t('history.weeklyTitle')}</Text>
      {weeklySummaries.length === 0 && <Text style={styles.emptyText}>{t('history.emptyData')}</Text>}
      {weeklySummaries.map((w) => (
        <Card key={w.weekKey}>
          <Text style={styles.weekLabel}>{t('history.weekLabel', { date: formatDateVi(w.weekKey) })}</Text>
          <Text style={styles.weekMeta}>
            {t('history.weekMeta', { kcal: Math.round(w.avgCalories), n: w.totalWorkouts })}
            {w.weightChange !== null
              ? t('history.weekWeightChange', { sign: w.weightChange > 0 ? '+' : '', kg: w.weightChange.toFixed(1) })
              : ''}
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>{t('history.dailyTitle')}</Text>
      {daySummaries.length === 0 && <Text style={styles.emptyText}>{t('history.emptyData')}</Text>}
      {daySummaries.map((d) => (
        <Card key={d.dateKey}>
          <Text style={styles.dayLabel}>{formatDateVi(d.dateKey)}</Text>
          <Text style={styles.dayMeta}>{t('history.dayMeta1', { kcal: d.calories, protein: d.proteinG, water: d.waterMl })}</Text>
          <Text style={styles.dayMeta}>
            {t('history.dayMeta2', { meals: d.mealsEatenCount, n: d.workoutsCount, kcal: d.caloriesBurned })}{' '}
            {d.weightKg !== null ? `· ${d.weightKg.toFixed(1)} kg` : ''}
          </Text>
          {d.proofsCount > 0 && <Text style={styles.proofBadge}>{t('history.proofBadge', { n: d.proofsCount })}</Text>}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  milestoneRow: { flexDirection: 'row', alignItems: 'center' },
  milestoneLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  milestoneMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  milestoneStatus: { fontSize: 12, fontWeight: '700' },
  weekLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  weekMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  dayMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  proofBadge: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: spacing.sm - 2 },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginBottom: spacing.md },
  streakValue: { fontSize: 20, fontWeight: '800', color: colors.gold },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2, marginTop: spacing.md },
  feedbackPeriod: { fontSize: 12, fontWeight: '700', color: colors.primary },
  feedbackDate: { fontSize: 11, color: colors.textMuted, marginTop: spacing.md - 4 },
});
