import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ViewProps } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { HudText } from '../components/quest/HudText';
import { QuestButton } from '../components/quest/QuestButton';
import { QuestHeader } from '../components/quest/QuestHeader';
import { useGameText } from '../game/strings';
import { useLightStatusBar } from '../theme/useLightStatusBar';
import { quest, questRadius } from '../theme/quest';
import { useNutritionStore } from '../store/useNutritionStore';
import { dayHasFood, extraIntake } from '../utils/dayIntake';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useWeightStore } from '../store/useWeightStore';
import { useProofStore } from '../store/useProofStore';
import { useFeelingStore } from '../store/useFeelingStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { getDayType } from '../constants/plan';
import { usePlanStore } from '../store/usePlanStore';
import { fetchFeedback, fetchWeeklySuggestion, pushWeeklySuggestion, requestWeeklySuggestion } from '../sync/cloudSync';
import { formatDateVi, toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { computeMilestones } from '../utils/milestones';
import { buildDeficitChartData } from '../utils/deficitChart';
import { thinLabels } from '../utils/chartLabels';
import { computeCurrentStreak, unlockedStreakBadges } from '../utils/streak';
import { useTranslation } from '../i18n/useTranslation';
import type { StringKey } from '../i18n/strings';
import { chartWidthFor, screenMaxWidthStyle } from '../theme/responsive';
import { DailyMealBreakdownTable } from '../components/DailyMealBreakdownTable';
import { actualDailyDeficitKcal, resolveTdeeKcal } from '../utils/tdee';
import type { CoachFeedback, ExtraFoodItem, MealSlot, MealTemplate, Mood } from '../types';
import { useTabBarClearance } from '../components/quest/QuestTabBar';
import type { ClientSnapshot } from '../coach/clientSnapshot';

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
  removedMealSlots: MealSlot[];
  /** Deficit for that day using TODAY's TDEE (current weight/profile) — not a historical
   *  reconstruction, since weight/profile aren't necessarily known as of each past day. Null when
   *  no nutrition log was ever entered for that day (a workout/weight/proof entry alone isn't
   *  enough to say anything about that day's calorie balance). */
  deficitKcal: number | null;
}

const MILESTONE_STATUS_KEY: Record<string, StringKey> = {
  upcoming: 'history.milestoneUpcoming',
  achieved: 'history.milestoneAchieved',
  missed: 'history.milestoneMissed',
};

const MILESTONE_STATUS_COLOR: Record<string, string> = {
  upcoming: quest.textSecondary,
  achieved: quest.xp,
  missed: quest.hpText,
};

const baseChartConfig = {
  backgroundColor: quest.panel,
  backgroundGradientFrom: quest.panel,
  backgroundGradientTo: quest.panel,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 200, 61, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(179, 170, 207, ${opacity})`,
  propsForDots: { r: '3' },
};

const MOOD_COLORS: Record<Mood, string> = {
  great: quest.xp,
  good: '#B5E86B',
  neutral: quest.gold,
  stressed: quest.hp,
  tired: quest.textSecondary,
};

/** Calories eaten/burned for one calendar day, independent of whether that day shows up in
 *  daySummaries (which only lists days with SOME tracked entry) — a day with no log at all is
 *  just 0/0, same as a logged day where nothing was eaten. */
function computeDayCaloriesBurn(
  dateKey: string,
  nutritionLogs: ReturnType<typeof useNutritionStore.getState>['logs'],
  mealTemplates: ReturnType<typeof usePlanStore.getState>['plan']['mealTemplates'],
  workoutEntries: ReturnType<typeof useWorkoutStore.getState>['entries']
): { calories: number; caloriesBurned: number } {
  const meals = mealTemplates[getDayType(new Date(dateKey))];
  const log = nutritionLogs[dateKey];
  const eatenMeals = meals.filter((m) => log?.mealsEaten[m.slot]);
  const calories = Math.round(eatenMeals.reduce((s, m) => s + m.calories, 0) + extraIntake(log).kcal);
  const caloriesBurned = workoutEntries
    .filter((e) => toDateKey(new Date(e.dateISO)) === dateKey)
    .reduce((s, w) => s + w.caloriesBurned, 0);
  return { calories, caloriesBurned };
}

const MOOD_LABEL_KEY: Record<Mood, StringKey> = {
  great: 'feeling.moodGreat',
  good: 'feeling.moodGood',
  neutral: 'feeling.moodNeutral',
  stressed: 'feeling.moodStressed',
  tired: 'feeling.moodTired',
};

function Section({ children }: { children: string }) {
  return (
    <HudText size={17} accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </HudText>
  );
}

function Panel({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.panel, style]} />;
}

function Meta({ children, color = quest.textSecondary, style }: { children: ReactNode; color?: string; style?: object }) {
  return (
    <HudText size={12} weight="medium" color={color} style={[styles.meta, style]}>
      {children}
    </HudText>
  );
}

export function HistoryView({ client }: { client?: ClientSnapshot }) {
  const { t } = useTranslation();
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const chartWidth = chartWidthFor(useWindowDimensions().width);
  // Line charts draw their last x label centred on the right edge; leave room so it isn't cut off.
  const lineChartWidth = chartWidth - 16;
  // A coach looking at a client reads the client's records (read-only); otherwise the signed-in user's own.
  const ownLogs = useNutritionStore((s) => s.logs);
  const saveDayLog = useNutritionStore((s) => s.saveDayLog);
  const ownWorkouts = useWorkoutStore((s) => s.entries);
  const ownWeights = useWeightStore((s) => s.entries);
  const ownProofs = useProofStore((s) => s.photos);
  const ownSettings = useSettingsStore();
  const ownLatestWeight = useWeightStore((s) => s.latest());
  const ownMealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const session = useAuthStore((s) => s.session);
  const ownFeelings = useFeelingStore((s) => s.records);
  const nutritionLogs = client?.logs ?? ownLogs;
  const workoutEntries = client?.workouts ?? ownWorkouts;
  const weightEntries = client?.weights ?? ownWeights;
  const proofs = client?.photos ?? ownProofs;
  const settings = client?.settings ?? ownSettings;
  const latestWeight = client ? (client.weights[client.weights.length - 1] ?? null) : ownLatestWeight;
  const mealTemplates = client?.plan.mealTemplates ?? ownMealTemplates;
  const feelingRecords = client?.feelings ?? ownFeelings;
  const subjectId = client?.clientId ?? session?.user.id;

  const [feedbackList, setFeedbackList] = useState<CoachFeedback[]>([]);
  useEffect(() => {
    if (!subjectId) return;
    fetchFeedback(subjectId).then(setFeedbackList);
  }, [subjectId]);

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
        const extra = extraIntake(log);
        const calories = Math.round(eatenMeals.reduce((s, m) => s + m.calories, 0) + extra.kcal);
        const proteinG = Math.round((eatenMeals.reduce((s, m) => s + m.proteinG, 0) + extra.proteinG) * 10) / 10;
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
          deficitKcal: dayHasFood(log)
            ? actualDailyDeficitKcal(currentTdeeKcal, dayWorkouts.reduce((s, w) => s + w.caloriesBurned, 0), calories)
            : null,
          meals,
          mealsEaten: log?.mealsEaten ?? {},
          extraItems: log?.extraItems ?? [],
          removedMealSlots: log?.removedMealSlots ?? [],
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

  const thisWeekKey = weekStartKey(new Date());
  const thisWeekFeelings = useMemo(
    () => [...feelingRecords].filter((r) => weekStartKey(new Date(r.loggedAtISO)) === thisWeekKey).reverse(),
    [feelingRecords, thisWeekKey]
  );
  const thisWeekSummary = weeklySummaries.find((w) => w.weekKey === thisWeekKey) ?? null;

  // All-time mood distribution, not just this week — a single week rarely has enough check-ins to
  // make a meaningful pie slice breakdown, so this pulls from every recorded feeling ever logged.
  const moodPieData = useMemo(() => {
    const counts: Record<Mood, number> = { great: 0, good: 0, neutral: 0, stressed: 0, tired: 0 };
    feelingRecords.forEach((r) => {
      counts[r.mood] += 1;
    });
    return (Object.keys(counts) as Mood[])
      .filter((mood) => counts[mood] > 0)
      .map((mood) => ({
        name: t(MOOD_LABEL_KEY[mood]),
        population: counts[mood],
        color: MOOD_COLORS[mood],
        legendFontColor: quest.textSecondary,
        legendFontSize: 12,
      }));
  }, [feelingRecords, t]);

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  useEffect(() => {
    if (!subjectId) return;
    fetchWeeklySuggestion(subjectId, thisWeekKey).then(setSuggestion);
  }, [subjectId, thisWeekKey]);

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
    () => computeCurrentStreak(nutritionLogs, mealTemplates, workoutEntries, currentTdeeKcal),
    [nutritionLogs, mealTemplates, workoutEntries, currentTdeeKcal]
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
      caloriesIn: { labels, datasets: [{ data: chronological.map((d) => d.calories), color: () => quest.gold, strokeWidth: 3 }] },
      caloriesOut: { labels, datasets: [{ data: chronological.map((d) => d.caloriesBurned), color: () => quest.xp, strokeWidth: 3 }] },
    };
  }, [daySummaries]);

  // Daily deficit trend, one point per calendar day from the plan's start date through today
  // (not just days with logged data) — a fixed grid like the Weight tab's chart. A day with no
  // nutrition log at all (nobody entered anything) is a genuine gap, not a 0-kcal-eaten deficit —
  // returning null here breaks the line there instead of drawing a fabricated slope through it.
  const deficitTrendChart = useMemo(
    () =>
      buildDeficitChartData(
        settings.startDateISO,
        (dateKey) => {
          if (!nutritionLogs[dateKey]) return null;
          const { calories, caloriesBurned } = computeDayCaloriesBurn(dateKey, nutritionLogs, mealTemplates, workoutEntries);
          return actualDailyDeficitKcal(currentTdeeKcal, caloriesBurned, calories);
        },
        new Date(),
        quest.gold
      ),
    [settings.startDateISO, nutritionLogs, mealTemplates, workoutEntries, currentTdeeKcal]
  );

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}
    >
      <QuestHeader
        title={client ? `${g('historyScreen.title')} · ${client.displayName}` : g('historyScreen.title')}
        eyebrow={g('historyScreen.eyebrow')}
        backLabel={g('historyScreen.back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      <Section>{t('history.achievementsTitle')}</Section>
      <Panel>
        <HudText size={20} color={quest.gold}>
          {t('today.streakDays', { n: streak })}
        </HudText>
        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <View key={b} style={styles.pill}>
                <HudText size={12} color={quest.gold}>
                  {t('today.streakDays', { n: b })}
                </HudText>
              </View>
            ))}
          </View>
        ) : (
          <Meta>{t('history.emptyBadges')}</Meta>
        )}
      </Panel>

      <Section>{t('feeling.weeklyTitle')}</Section>
      <Panel>
        {thisWeekFeelings.length === 0 ? (
          <Meta>{t('feeling.emptyWeek')}</Meta>
        ) : (
          thisWeekFeelings.map((r) => (
            <Meta key={r.id}>
              {formatDateVi(toDateKey(new Date(r.loggedAtISO)))} · {t('feeling.cravingShort', { n: r.cravingLevel })} ·{' '}
              {t('feeling.hungerShort', { n: r.hungerLevel })} ({r.mood})
            </Meta>
          ))
        )}
      </Panel>

      <Section>{t('feeling.chartTitle')}</Section>
      <Panel>
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
          <Meta>{t('feeling.chartEmpty')}</Meta>
        )}
      </Panel>

      <Section>{t('feeling.suggestionTitle')}</Section>
      <Panel>
        {client ? (
          <Meta>{suggestion ?? t('feeling.suggestionNeedsMore')}</Meta>
        ) : thisWeekFeelings.length < 3 ? (
          <Meta>{t('feeling.suggestionNeedsMore')}</Meta>
        ) : (
          <>
            {suggestion && <Meta>{suggestion}</Meta>}
            {suggestionError && <Meta color={quest.hpText}>{t('feeling.suggestionError')}</Meta>}
            <View style={{ marginTop: 12 }}>
              <QuestButton title={t('feeling.getSuggestionButton')} onPress={handleGetSuggestion} loading={suggestionLoading} />
            </View>
          </>
        )}
      </Panel>

      {feedbackList.length > 0 && (
        <>
          <Section>{t('history.coachFeedbackTitle')}</Section>
          {feedbackList.map((f) => (
            <Panel key={f.id}>
              <HudText size={12} color={quest.manaText}>
                {f.periodLabel} · {f.periodType === 'weekly' ? t('history.periodWeek') : t('history.periodMonth')}
              </HudText>
              <Meta>{f.feedbackText}</Meta>
              <Meta color={quest.textSecondary} style={{ fontSize: 11 }}>
                {formatDateVi(toDateKey(new Date(f.createdAtISO)))}
              </Meta>
            </Panel>
          ))}
        </>
      )}

      <Section>{t('history.milestonesTitle')}</Section>
      {milestones.map((m) => (
        <Panel key={m.key}>
          <View style={styles.milestoneRow}>
            <View style={{ flex: 1 }}>
              <HudText size={14}>{t(`milestone.${m.key}` as StringKey)}</HudText>
              <Meta>{t('history.milestoneDue', { date: formatDateVi(toDateKey(m.targetDate)), kg: m.targetWeightKg.toFixed(1) })}</Meta>
            </View>
            <HudText size={12} color={MILESTONE_STATUS_COLOR[m.status]}>
              {t(MILESTONE_STATUS_KEY[m.status])}
            </HudText>
          </View>
        </Panel>
      ))}

      <Section>{t('history.deficitChartTitle')}</Section>
      {deficitTrendChart ? (
        <Panel>
          <LineChart
            // chart-kit's types don't admit `null` in a dataset, but its runtime (patched — see
            // patches/react-native-chart-kit+7.0.4.patch) treats it as a gap in the line, which is
            // exactly what a day with no logged data should render as.
            data={deficitTrendChart as any}
            width={lineChartWidth}
            height={180}
            chartConfig={baseChartConfig}
            bezier
            fromZero={false}
            withShadow={false}
            hidePointsAtIndex={deficitTrendChart.datasets[0].data
              .map((v, i) => (v == null ? i : -1))
              .filter((i) => i >= 0)}
            style={styles.chartStyle}
          />
          <Meta>{t('history.deficitChartHint')}</Meta>
        </Panel>
      ) : (
        <Meta style={styles.emptyText}>{t('history.emptyChart')}</Meta>
      )}

      <Section>{t('history.dailyChartTitle')}</Section>
      {dailyCharts ? (
        <Panel>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: quest.gold }]} />
            <Meta style={styles.legendText}>{t('history.legendCaloriesIn')}</Meta>
          </View>
          <LineChart data={dailyCharts.caloriesIn} width={lineChartWidth} height={160} chartConfig={baseChartConfig} bezier style={styles.chartStyle} />
          <View style={[styles.legendItem, { marginTop: 8 }]}>
            <View style={[styles.legendDot, { backgroundColor: quest.xp }]} />
            <Meta style={styles.legendText}>{t('history.legendCaloriesOut')}</Meta>
          </View>
          <LineChart data={dailyCharts.caloriesOut} width={lineChartWidth} height={160} chartConfig={baseChartConfig} bezier style={styles.chartStyle} />
        </Panel>
      ) : (
        <Meta style={styles.emptyText}>{t('history.emptyChart')}</Meta>
      )}

      <Section>{t('history.weeklyTitle')}</Section>
      {weeklyChart && (
        <Panel>
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
        </Panel>
      )}
      {weeklySummaries.length === 0 && <Meta style={styles.emptyText}>{t('history.emptyData')}</Meta>}
      {weeklySummaries.map((w) => (
        <Panel key={w.weekKey}>
          <HudText size={14}>{t('history.weekLabel', { date: formatDateVi(w.weekKey) })}</HudText>
          <Meta>
            {t('history.weekMeta', { kcal: Math.round(w.avgCalories), n: w.totalWorkouts })}
            {w.weightChange !== null
              ? t('history.weekWeightChange', { sign: w.weightChange > 0 ? '+' : '', kg: w.weightChange.toFixed(1) })
              : ''}
          </Meta>
        </Panel>
      ))}

      <Section>{t('history.dailyTitle')}</Section>
      {daySummaries.length === 0 && <Meta style={styles.emptyText}>{t('history.emptyData')}</Meta>}
      {daySummaries.map((d) => {
        const expanded = !!expandedDays[d.dateKey];
        const toggleLabel = t(expanded ? 'history.collapseButton' : 'history.expandButton');
        return (
          <Panel key={d.dateKey}>
            <HudText size={14}>{formatDateVi(d.dateKey)}</HudText>
            <Meta>{t('history.dayMeta1', { kcal: d.calories, protein: d.proteinG, water: d.waterMl })}</Meta>
            <Meta>
              {t('history.dayMeta2', { meals: d.mealsEatenCount, n: d.workoutsCount, kcal: d.caloriesBurned })}{' '}
              {d.weightKg !== null ? `· ${d.weightKg.toFixed(1)} kg` : ''}
            </Meta>
            {d.deficitKcal == null ? (
              <Meta>
                {t('tdee.deficitLabel')}: {t('common.notAvailable')}
              </Meta>
            ) : (
              <Meta color={d.deficitKcal >= 0 ? quest.xp : quest.gold}>
                {t(d.deficitKcal >= 0 ? 'tdee.deficitLabel' : 'tdee.surplusLabel')}: {Math.round(Math.abs(d.deficitKcal))} kcal
              </Meta>
            )}
            {d.proofsCount > 0 && (
              <HudText size={12} color={quest.manaText} style={{ marginTop: 6 }}>
                {t('history.proofBadge', { n: d.proofsCount })}
              </HudText>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${formatDateVi(d.dateKey)}. ${toggleLabel}`}
              accessibilityState={{ expanded }}
              onPress={() => toggleDayExpanded(d.dateKey)}
              style={styles.toggle}
            >
              <HudText size={13} color={quest.gold}>
                {toggleLabel}
              </HudText>
            </Pressable>
            {expanded && (
              <View>
                <DailyMealBreakdownTable
                  dark
                  meals={d.meals}
                  mealsEaten={d.mealsEaten}
                  extraItems={d.extraItems}
                  removedMealSlots={d.removedMealSlots}
                  editable={!client}
                  onSave={(draft) => saveDayLog(d.dateKey, draft)}
                />
              </View>
            )}
          </Panel>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  sectionTitle: { marginTop: 20, marginBottom: 8 },
  panel: { backgroundColor: quest.panel, borderColor: quest.border, borderWidth: 1.5, borderRadius: questRadius.panel, padding: 14, marginBottom: 10, overflow: 'hidden' },
  meta: { marginTop: 4, lineHeight: 17 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  pill: { borderRadius: 999, borderWidth: 1.5, borderColor: quest.gold, paddingHorizontal: 10, paddingVertical: 4 },
  emptyText: { textAlign: 'center', marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { marginTop: 0, fontSize: 11 },
  chartStyle: { borderRadius: questRadius.row },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
