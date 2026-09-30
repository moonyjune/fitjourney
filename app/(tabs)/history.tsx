import { useEffect, useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useProofStore } from '../../src/store/useProofStore';
import { useFeelingStore } from '../../src/store/useFeelingStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { getDayType } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { fetchFeedback, fetchWeeklySuggestion, pushWeeklySuggestion, requestWeeklySuggestion } from '../../src/sync/cloudSync';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { weekStartKey } from '../../src/utils/weekKey';
import { computeMilestones } from '../../src/utils/milestones';
import { thinLabels } from '../../src/utils/chartLabels';
import { computeCurrentStreak, unlockedStreakBadges } from '../../src/utils/streak';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useAmbientBackground } from '../../src/theme/useAmbientBackground';
import { DailyMealBreakdownTable } from '../../src/components/DailyMealBreakdownTable';
import { actualDailyDeficitKcal, resolveTdeeKcal } from '../../src/utils/tdee';
import type { CoachFeedback, ExtraFoodItem, MealSlot, MealTemplate, Mood } from '../../src/types';

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
  meals: MealTemplate[];
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraItems: ExtraFoodItem[];
  /** Deficit for that day using TODAY's TDEE (current weight/profile) — not a historical
   *  reconstruction, since weight/profile aren't necessarily known as of each past day. */
  deficitKcal: number;
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

const chartWidth = Dimensions.get('window').width - 32;
const baseChartConfig = {
  backgroundColor: colors.surface,
  backgroundGradientFrom: colors.surface,
  backgroundGradientTo: colors.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(79, 142, 247, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(60, 60, 60, ${opacity})`,
  propsForDots: { r: '3' },
};

const MOOD_COLORS: Record<Mood, string> = {
  great: colors.success,
  good: '#8BC34A',
  neutral: colors.warning,
  stressed: colors.danger,
  tired: colors.textMuted,
};

const MOOD_LABEL_KEY: Record<Mood, StringKey> = {
  great: 'feeling.moodGreat',
  good: 'feeling.moodGood',
  neutral: 'feeling.moodNeutral',
  stressed: 'feeling.moodStressed',
  tired: 'feeling.moodTired',
};

export default function HistoryScreen() {
  const { t } = useTranslation();
  const ambientBg = useAmbientBackground();
  const nutritionLogs = useNutritionStore((s) => s.logs);
  const toggleMeal = useNutritionStore((s) => s.toggleMeal);
  const removeExtraItem = useNutritionStore((s) => s.removeExtraItem);
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

  const currentWeightKg = latestWeight?.weightKg ?? settings.startWeightKg;
  const currentTdeeKcal = useMemo(
    () =>
      resolveTdeeKcal({
        gender: settings.gender,
        age: settings.age,
        heightCm: settings.heightCm,
        activityLevel: settings.activityLevel,
        weightKg: currentWeightKg,
        calorieTargetKcal: settings.calorieTargetKcal,
        targetDailyDeficitKcal: settings.targetDailyDeficitKcal,
      }).tdeeKcal,
    [
      settings.gender,
      settings.age,
      settings.heightCm,
      settings.activityLevel,
      currentWeightKg,
      settings.calorieTargetKcal,
      settings.targetDailyDeficitKcal,
    ]
  );

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
          deficitKcal: actualDailyDeficitKcal(currentTdeeKcal, dayWorkouts.reduce((s, w) => s + w.caloriesBurned, 0), calories),
          meals,
          mealsEaten: log?.mealsEaten ?? {},
          extraItems: log?.extraItems ?? [],
        };
      });
  }, [nutritionLogs, workoutEntries, weightEntries, proofs, mealTemplates, currentTdeeKcal]);

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

  const feelingRecords = useFeelingStore((s) => s.records);
  const thisWeekKey = weekStartKey(new Date());
  const thisWeekFeelings = useMemo(
    () => [...feelingRecords].filter((r) => weekStartKey(new Date(r.loggedAtISO)) === thisWeekKey).reverse(),
    [feelingRecords, thisWeekKey]
  );
  const thisWeekSummary = weeklySummaries.find((w) => w.weekKey === thisWeekKey) ?? null;

  const moodPieData = useMemo(() => {
    const counts: Record<Mood, number> = { great: 0, good: 0, neutral: 0, stressed: 0, tired: 0 };
    thisWeekFeelings.forEach((r) => {
      counts[r.mood] += 1;
    });
    return (Object.keys(counts) as Mood[])
      .filter((mood) => counts[mood] > 0)
      .map((mood) => ({
        name: t(MOOD_LABEL_KEY[mood]),
        population: counts[mood],
        color: MOOD_COLORS[mood],
        legendFontColor: colors.textSecondary,
        legendFontSize: 12,
      }));
  }, [thisWeekFeelings, t]);

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchWeeklySuggestion(session.user.id, thisWeekKey).then(setSuggestion);
  }, [session, thisWeekKey]);

  async function handleGetSuggestion() {
    setSuggestionLoading(true);
    setSuggestionError(null);
    const result = await requestWeeklySuggestion(thisWeekFeelings, {
      avgCaloriesPerDay: thisWeekSummary?.avgCalories ?? 0,
      totalWorkouts: thisWeekSummary?.totalWorkouts ?? 0,
      weightChangeKg: thisWeekSummary?.weightChange ?? null,
    });
    setSuggestionLoading(false);
    if (result.ok) {
      setSuggestion(result.suggestion);
      pushWeeklySuggestion(thisWeekKey, result.suggestion);
    } else {
      setSuggestionError(result.message);
    }
  }

  const streak = useMemo(
    () => computeCurrentStreak(nutritionLogs, mealTemplates, workoutEntries, currentTdeeKcal, settings.targetDailyDeficitKcal),
    [nutritionLogs, mealTemplates, workoutEntries, currentTdeeKcal, settings.targetDailyDeficitKcal]
  );
  const badges = unlockedStreakBadges(streak);

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  function toggleDayExpanded(dateKey: string) {
    setExpandedDays((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  }

  // Daily timelines, oldest -> newest, last 14 logged days. Calories in/out get separate charts
  // (not a shared y-axis) since exercise calories burned are naturally an order of magnitude
  // smaller than calories eaten — sharing one axis would flatten the burned-calories line.
  const dailyCharts = useMemo(() => {
    const chronological = [...daySummaries].reverse().slice(-14);
    if (chronological.length < 2) return null;
    const labels = thinLabels(chronological.map((d) => formatDateVi(d.dateKey).slice(0, 5)));
    return {
      caloriesIn: { labels, datasets: [{ data: chronological.map((d) => d.calories), color: () => colors.warning, strokeWidth: 3 }] },
      caloriesOut: { labels, datasets: [{ data: chronological.map((d) => d.caloriesBurned), color: () => colors.success, strokeWidth: 3 }] },
    };
  }, [daySummaries]);

  // Weekly summary bar chart (avg daily calories), oldest -> newest, last 8 weeks.
  const weeklyChart = useMemo(() => {
    const chronological = [...weeklySummaries].reverse().slice(-8);
    if (chronological.length < 2) return null;
    return {
      labels: thinLabels(chronological.map((w) => formatDateVi(w.weekKey).slice(0, 5)), 6),
      datasets: [{ data: chronological.map((w) => Math.round(w.avgCalories)) }],
    };
  }, [weeklySummaries]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: ambientBg }]} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
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

      <Text style={styles.sectionTitle}>{t('feeling.weeklyTitle')}</Text>
      <Card>
        {thisWeekFeelings.length === 0 ? (
          <Text style={styles.dayMeta}>{t('feeling.emptyWeek')}</Text>
        ) : (
          thisWeekFeelings.map((r) => (
            <Text key={r.id} style={styles.dayMeta}>
              {formatDateVi(toDateKey(new Date(r.loggedAtISO)))} · {t('feeling.cravingShort', { n: r.cravingLevel })} ·{' '}
              {t('feeling.hungerShort', { n: r.hungerLevel })} ({r.mood})
            </Text>
          ))
        )}
      </Card>

      <Text style={styles.sectionTitle}>{t('feeling.chartTitle')}</Text>
      <Card>
        {moodPieData.length > 0 ? (
          <PieChart
            data={moodPieData}
            width={chartWidth}
            height={160}
            chartConfig={baseChartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="8"
            absolute
          />
        ) : (
          <Text style={styles.dayMeta}>{t('feeling.chartEmpty')}</Text>
        )}
      </Card>

      <Text style={styles.sectionTitle}>{t('feeling.suggestionTitle')}</Text>
      <Card>
        {thisWeekFeelings.length < 3 ? (
          <Text style={styles.dayMeta}>{t('feeling.suggestionNeedsMore')}</Text>
        ) : (
          <>
            {suggestion && <Text style={styles.dayMeta}>{suggestion}</Text>}
            {suggestionError && <Text style={[styles.dayMeta, { color: colors.danger }]}>{t('feeling.suggestionError')}</Text>}
            <Button
              title={t('feeling.getSuggestionButton')}
              onPress={handleGetSuggestion}
              loading={suggestionLoading}
              style={{ marginTop: spacing.sm }}
            />
          </>
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

      <Text style={styles.sectionTitle}>{t('history.dailyChartTitle')}</Text>
      {dailyCharts ? (
        <Card>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.legendText}>{t('history.legendCaloriesIn')}</Text>
          </View>
          <LineChart
            data={dailyCharts.caloriesIn}
            width={chartWidth}
            height={160}
            chartConfig={baseChartConfig}
            bezier
            style={styles.chartStyle}
          />
          <View style={[styles.legendItem, { marginTop: spacing.sm }]}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>{t('history.legendCaloriesOut')}</Text>
          </View>
          <LineChart
            data={dailyCharts.caloriesOut}
            width={chartWidth}
            height={160}
            chartConfig={baseChartConfig}
            bezier
            style={styles.chartStyle}
          />
        </Card>
      ) : (
        <Text style={styles.emptyText}>{t('history.emptyChart')}</Text>
      )}

      <Text style={styles.sectionTitle}>{t('history.weeklyTitle')}</Text>
      {weeklyChart && (
        <Card>
          <BarChart
            data={weeklyChart}
            width={chartWidth}
            height={180}
            yAxisLabel=""
            yAxisSuffix=" kcal"
            chartConfig={baseChartConfig}
            fromZero
            style={styles.chartStyle}
          />
        </Card>
      )}
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
      {daySummaries.map((d) => {
        const expanded = !!expandedDays[d.dateKey];
        return (
          <Card key={d.dateKey}>
            <Text style={styles.dayLabel}>{formatDateVi(d.dateKey)}</Text>
            <Text style={styles.dayMeta}>{t('history.dayMeta1', { kcal: d.calories, protein: d.proteinG, water: d.waterMl })}</Text>
            <Text style={styles.dayMeta}>
              {t('history.dayMeta2', { meals: d.mealsEatenCount, n: d.workoutsCount, kcal: d.caloriesBurned })}{' '}
              {d.weightKg !== null ? `· ${d.weightKg.toFixed(1)} kg` : ''}
            </Text>
            <Text style={[styles.dayMeta, { color: d.deficitKcal >= 0 ? colors.success : colors.warning, fontWeight: '700' }]}>
              {t(d.deficitKcal >= 0 ? 'tdee.deficitLabel' : 'tdee.surplusLabel')}: {Math.round(Math.abs(d.deficitKcal))} kcal
            </Text>
            {d.proofsCount > 0 && <Text style={styles.proofBadge}>{t('history.proofBadge', { n: d.proofsCount })}</Text>}
            <TouchableOpacity onPress={() => toggleDayExpanded(d.dateKey)}>
              <Text style={styles.expandToggle}>{t(expanded ? 'history.collapseButton' : 'history.expandButton')}</Text>
            </TouchableOpacity>
            {expanded && (
              <DailyMealBreakdownTable
                meals={d.meals}
                mealsEaten={d.mealsEaten}
                extraItems={d.extraItems}
                onToggleMeal={(slot) => toggleMeal(d.dateKey, slot)}
                onRemoveExtra={(itemId) => removeExtraItem(d.dateKey, itemId)}
              />
            )}
          </Card>
        );
      })}
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
  expandToggle: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginBottom: spacing.md },
  streakValue: { fontSize: 20, fontWeight: '800', color: colors.gold },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2, marginTop: spacing.md },
  feedbackPeriod: { fontSize: 12, fontWeight: '700', color: colors.primary },
  feedbackDate: { fontSize: 11, color: colors.textMuted, marginTop: spacing.md - 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.textSecondary },
  chartStyle: { borderRadius: radius.lg },
});
