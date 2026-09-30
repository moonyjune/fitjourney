import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { PlanPreview } from '../../src/components/PlanPreview';
import { PlanChatAssistant } from '../../src/components/PlanChatAssistant';
import { supabase } from '../../src/lib/supabase';
import { fetchFeedback, pullPlan, pushCoachFeedback, pushPlan } from '../../src/sync/cloudSync';
import { DEFAULT_CALORIE_TARGET, DEFAULT_PLAN, DEFAULT_START_WEIGHT_KG, getDayType } from '../../src/constants/plan';
import { computeCurrentStreak, unlockedStreakBadges } from '../../src/utils/streak';
import { DEFAULT_TARGET_DAILY_DEFICIT_KCAL, resolveTdeeKcal } from '../../src/utils/tdee';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { weekStartKey } from '../../src/utils/weekKey';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import type {
  ActivityLevel,
  CoachFeedback,
  DailyNutritionLog,
  FeedbackPeriodType,
  Gender,
  MealSlot,
  PlanData,
  ProofTaskType,
  WorkoutLogEntry,
} from '../../src/types';

interface RecentProof {
  id: string;
  entryDate: string;
  note: string | null;
  signedUrl: string | null;
  taskType: ProofTaskType;
  taskRefId: string;
}

interface WorkoutEntryRow {
  id: string;
  entryDate: string;
  templateId: string | null;
  label: string;
  caloriesBurned: number;
}

type ProofStatus = 'met' | 'partial' | 'missing';

const STATUS_ICON: Record<ProofStatus, string> = { met: '✅', partial: '⚠️', missing: '❌' };
const STATUS_KEY: Record<ProofStatus, StringKey> = {
  met: 'clientDetail.proofStatusMet',
  partial: 'clientDetail.proofStatusPartial',
  missing: 'clientDetail.proofStatusMissing',
};

export default function ClientDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = Array.isArray(id) ? id[0] : id;

  function defaultPeriodLabel(periodType: FeedbackPeriodType, now: Date): string {
    if (periodType === 'weekly') return t('history.weekLabel', { date: formatDateVi(weekStartKey(now)) });
    return t('clientDetail.monthLabel', { m: now.getMonth() + 1, y: now.getFullYear() });
  }

  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weightSummary, setWeightSummary] = useState<{ latest: number | null; start: number | null }>({
    latest: null,
    start: null,
  });
  const [streak, setStreak] = useState(0);
  const [recentProofs, setRecentProofs] = useState<RecentProof[]>([]);
  const [workoutEntriesById, setWorkoutEntriesById] = useState<Record<string, WorkoutEntryRow>>({});
  const [nutritionLogsByDate, setNutritionLogsByDate] = useState<Record<string, DailyNutritionLog>>({});
  const [activeProofId, setActiveProofId] = useState<string | null>(null);

  const [feedbackList, setFeedbackList] = useState<CoachFeedback[]>([]);
  const [feedbackPeriodType, setFeedbackPeriodType] = useState<FeedbackPeriodType>('weekly');
  const [feedbackLabel, setFeedbackLabel] = useState(() => defaultPeriodLabel('weekly', new Date()));
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  function handlePeriodTypeChange(type: FeedbackPeriodType) {
    setFeedbackPeriodType(type);
    setFeedbackLabel(defaultPeriodLabel(type, new Date()));
  }

  async function handleSendFeedback() {
    if (!clientId || !feedbackText.trim()) {
      Alert.alert(t('clientDetail.missingContentTitle'), t('clientDetail.missingContentMessage'));
      return;
    }
    setFeedbackBusy(true);
    const result = await pushCoachFeedback(clientId, feedbackPeriodType, feedbackLabel, feedbackText.trim());
    setFeedbackBusy(false);
    if (!result.ok) {
      Alert.alert(t('clientDetail.sendFailedTitle'), result.message);
      return;
    }
    setFeedbackText('');
    const refreshed = await fetchFeedback(clientId);
    setFeedbackList(refreshed);
  }

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const [remotePlan, profileRes, latestWeightRes, nutritionLogsRes, proofsRes, workoutEntriesRes, feedbackRes] = await Promise.all([
        pullPlan(clientId),
        supabase
          .from('profiles')
          .select('start_weight_kg, water_target_ml, age, gender, height_cm, activity_level, calorie_target_kcal, target_daily_deficit_kcal')
          .eq('id', clientId)
          .maybeSingle(),
        supabase
          .from('weight_entries')
          .select('weight_kg')
          .eq('user_id', clientId)
          .order('entry_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('nutrition_logs').select('*').eq('user_id', clientId),
        supabase
          .from('proof_photos')
          .select('id, entry_date, note, photo_path, task_type, task_ref_id')
          .eq('user_id', clientId)
          .order('created_at', { ascending: false })
          .limit(16),
        supabase
          .from('workout_entries')
          .select('id, entry_date, template_id, label, calories_burned')
          .eq('user_id', clientId),
        fetchFeedback(clientId),
      ]);
      setFeedbackList(feedbackRes);

      setPlan(remotePlan?.plan ?? DEFAULT_PLAN);
      setWeightSummary({
        start: profileRes.data?.start_weight_kg ?? null,
        latest: latestWeightRes.data?.weight_kg ?? null,
      });

      const logsMap: Record<string, DailyNutritionLog> = {};
      for (const row of nutritionLogsRes.data ?? []) {
        logsMap[toDateKey(new Date(row.entry_date))] = {
          dateISO: row.entry_date,
          mealsEaten: row.meals_eaten ?? {},
          extraCalories: row.extra_calories ?? 0,
          extraProteinG: row.extra_protein_g ?? 0,
          extraItems: row.extra_items ?? [],
          waterMl: row.water_ml ?? 0,
        };
      }
      setNutritionLogsByDate(logsMap);

      const streakWorkoutEntries: WorkoutLogEntry[] = (workoutEntriesRes.data ?? []).map((row) => ({
        id: row.id,
        dateISO: row.entry_date,
        templateId: row.template_id,
        label: row.label,
        durationMin: 0,
        caloriesBurned: row.calories_burned ?? 0,
      }));
      const plan = remotePlan?.plan ?? DEFAULT_PLAN;
      // PostgREST returns `numeric` columns as strings (avoids float precision loss) — must coerce
      // explicitly, or e.g. calorieTargetKcal + targetDailyDeficitKcal silently string-concatenates
      // instead of adding once both are strings, producing a wildly-wrong TDEE.
      const currentWeightKg = Number(latestWeightRes.data?.weight_kg ?? profileRes.data?.start_weight_kg ?? DEFAULT_START_WEIGHT_KG);
      const targetDailyDeficitKcal = Number(profileRes.data?.target_daily_deficit_kcal ?? DEFAULT_TARGET_DAILY_DEFICIT_KCAL);
      const { tdeeKcal } = resolveTdeeKcal({
        gender: (profileRes.data?.gender as Gender) ?? null,
        age: profileRes.data?.age != null ? Number(profileRes.data.age) : null,
        heightCm: profileRes.data?.height_cm != null ? Number(profileRes.data.height_cm) : null,
        activityLevel: (profileRes.data?.activity_level as ActivityLevel) ?? null,
        weightKg: currentWeightKg,
        calorieTargetKcal: Number(profileRes.data?.calorie_target_kcal ?? DEFAULT_CALORIE_TARGET),
        targetDailyDeficitKcal,
      });
      setStreak(computeCurrentStreak(logsMap, plan.mealTemplates, streakWorkoutEntries, tdeeKcal, targetDailyDeficitKcal));

      const workoutById: Record<string, WorkoutEntryRow> = {};
      for (const row of workoutEntriesRes.data ?? []) {
        workoutById[row.id] = {
          id: row.id,
          entryDate: row.entry_date,
          templateId: row.template_id,
          label: row.label,
          caloriesBurned: row.calories_burned ?? 0,
        };
      }
      setWorkoutEntriesById(workoutById);

      const proofRows = proofsRes.data ?? [];
      const proofsWithUrls = await Promise.all(
        proofRows.map(async (row) => {
          const { data: signed } = await supabase.storage.from('proofs').createSignedUrl(row.photo_path, 3600);
          return {
            id: row.id,
            entryDate: row.entry_date,
            note: row.note,
            signedUrl: signed?.signedUrl ?? null,
            taskType: row.task_type as ProofTaskType,
            taskRefId: row.task_ref_id as string,
          };
        })
      );
      setRecentProofs(proofsWithUrls);

      setLoading(false);
    })();
  }, [clientId]);

  async function handleApplyPlan(newPlan: PlanData) {
    if (!clientId) return;
    await pushPlan(newPlan, new Date().toISOString(), clientId);
    setPlan(newPlan);
    Alert.alert(t('clientDetail.updatedTitle'), t('clientDetail.updatedMessage'));
  }

  function proofMealLabel(slot: MealSlot, dateKey: string): string {
    const dayType = getDayType(new Date(dateKey));
    const template = plan?.mealTemplates[dayType]?.find((m) => m.slot === slot);
    return template?.label ?? slot;
  }

  function proofMealStatus(slot: MealSlot, dateKey: string): ProofStatus {
    const log = nutritionLogsByDate[dateKey];
    if (!log) return 'missing';
    return log.mealsEaten[slot] ? 'met' : 'partial';
  }

  function proofWorkoutInfo(taskRefId: string): { label: string; actual: number; target: number; status: ProofStatus } {
    const entry = workoutEntriesById[taskRefId];
    if (!entry) return { label: t('tab.workout'), actual: 0, target: 0, status: 'missing' };
    const template = plan?.workoutTemplates.find((w) => w.id === entry.templateId);
    const target = template?.caloriesBurned ?? 0;
    const status: ProofStatus = target === 0 || entry.caloriesBurned >= target * 0.9 ? 'met' : 'partial';
    return { label: entry.label, actual: entry.caloriesBurned, target, status };
  }

  function proofStatus(p: RecentProof): ProofStatus {
    const dateKey = toDateKey(new Date(p.entryDate));
    return p.taskType === 'meal' ? proofMealStatus(p.taskRefId as MealSlot, dateKey) : proofWorkoutInfo(p.taskRefId).status;
  }

  function proofLabel(p: RecentProof): string {
    const dateKey = toDateKey(new Date(p.entryDate));
    return p.taskType === 'meal' ? proofMealLabel(p.taskRefId as MealSlot, dateKey) : proofWorkoutInfo(p.taskRefId).label;
  }

  function proofTooltip(p: RecentProof): string {
    const dateKey = toDateKey(new Date(p.entryDate));
    const dateLabel = formatDateVi(dateKey);
    const noteLine = p.note ? t('clientDetail.proofTooltipNoteLine', { note: p.note }) : '';
    if (p.taskType === 'meal') {
      const slot = p.taskRefId as MealSlot;
      return t('clientDetail.proofTooltipMeal', {
        label: proofMealLabel(slot, dateKey),
        date: dateLabel,
        status: t(STATUS_KEY[proofMealStatus(slot, dateKey)]),
        note: noteLine,
      });
    }
    const info = proofWorkoutInfo(p.taskRefId);
    return t('clientDetail.proofTooltipWorkout', {
      label: info.label,
      date: dateLabel,
      actual: info.actual,
      target: info.target,
      status: t(STATUS_KEY[info.status]),
      note: noteLine,
    });
  }

  function renderProofItem(p: RecentProof) {
    const status = proofStatus(p);
    const isActive = activeProofId === p.id;
    const isWeb = Platform.OS === 'web';
    return (
      <Pressable
        key={p.id}
        onHoverIn={isWeb ? () => setActiveProofId(p.id) : undefined}
        onHoverOut={isWeb ? () => setActiveProofId((prev) => (prev === p.id ? null : prev)) : undefined}
        onPress={() => setActiveProofId((prev) => (prev === p.id ? null : p.id))}
      >
        <View style={[styles.proofItem, isActive && styles.proofItemActive]}>
          <View>
            {p.signedUrl ? (
              <Image source={{ uri: p.signedUrl }} style={styles.proofThumb} />
            ) : (
              <View style={[styles.proofThumb, styles.proofThumbFallback]} />
            )}
            <View style={styles.proofStatusBadge}>
              <Text style={styles.proofStatusIcon}>{STATUS_ICON[status]}</Text>
            </View>
          </View>
          <Text style={styles.proofLabel} numberOfLines={1}>
            {proofLabel(p)}
          </Text>
          <Text style={styles.proofDate}>{formatDateVi(toDateKey(new Date(p.entryDate)))}</Text>
        </View>
      </Pressable>
    );
  }

  if (loading || !plan) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const change = weightSummary.latest != null && weightSummary.start != null ? weightSummary.latest - weightSummary.start : null;
  const badges = unlockedStreakBadges(streak);
  const mealProofs = recentProofs.filter((p) => p.taskType === 'meal');
  const workoutProofs = recentProofs.filter((p) => p.taskType === 'workout');
  const activeProof = recentProofs.find((p) => p.id === activeProofId) ?? null;

  return (
    <>
      <Stack.Screen options={{ title: t('clientDetail.headerTitle'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
        <Card>
          <Text style={styles.cardTitle}>{t('clientDetail.weightProgressTitle')}</Text>
          <Text style={styles.weightText}>
            {weightSummary.latest != null ? `${weightSummary.latest.toFixed(1)} kg` : t('clientDetail.noData')}
          </Text>
          {change != null && (
            <Text style={[styles.changeText, { color: change <= 0 ? colors.success : colors.danger }]}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)} {t('today.weightChangeSuffix')}
            </Text>
          )}
        </Card>

        <Card style={styles.streakCard}>
          <Text style={styles.streakValue}>{t('today.streakDays', { n: streak })}</Text>
          {badges.length > 0 && (
            <View style={styles.badgeRow}>
              {badges.map((b) => (
                <Badge key={b} label={t('today.streakDays', { n: b })} tone="gold" />
              ))}
            </View>
          )}
        </Card>

        <Text style={styles.sectionTitle}>{t('clientDetail.proofsTitle')}</Text>
        {recentProofs.length === 0 ? (
          <Text style={styles.emptyText}>{t('clientDetail.emptyProofs')}</Text>
        ) : (
          <>
            <Text style={styles.proofsHint}>{t('clientDetail.proofsHint')}</Text>
            {mealProofs.length > 0 && (
              <View style={styles.proofSection}>
                <Text style={styles.proofSectionTitle}>{t('clientDetail.proofsMealSection')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proofRow}>
                  {mealProofs.map((p) => renderProofItem(p))}
                </ScrollView>
              </View>
            )}
            {workoutProofs.length > 0 && (
              <View style={styles.proofSection}>
                <Text style={styles.proofSectionTitle}>{t('clientDetail.proofsWorkoutSection')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proofRow}>
                  {workoutProofs.map((p) => renderProofItem(p))}
                </ScrollView>
              </View>
            )}
            {activeProof && (
              <Card style={styles.proofDetailCard}>
                <Text style={styles.proofDetailText}>{proofTooltip(activeProof)}</Text>
              </Card>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>{t('clientDetail.feedbackTitle')}</Text>
        <Card>
          <View style={styles.periodToggleRow}>
            <TouchableOpacity
              style={[styles.periodButton, feedbackPeriodType === 'weekly' && styles.periodButtonActive]}
              onPress={() => handlePeriodTypeChange('weekly')}
            >
              <Text style={[styles.periodButtonText, feedbackPeriodType === 'weekly' && styles.periodButtonTextActive]}>
                {t('clientDetail.periodWeekly')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodButton, feedbackPeriodType === 'monthly' && styles.periodButtonActive]}
              onPress={() => handlePeriodTypeChange('monthly')}
            >
              <Text style={[styles.periodButtonText, feedbackPeriodType === 'monthly' && styles.periodButtonTextActive]}>
                {t('clientDetail.periodMonthly')}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={feedbackLabel}
            onChangeText={setFeedbackLabel}
            placeholder={t('clientDetail.periodLabelPlaceholder')}
          />
          <TextInput
            style={styles.aiInput}
            multiline
            placeholder={t('clientDetail.feedbackPlaceholder')}
            value={feedbackText}
            onChangeText={setFeedbackText}
          />
          <Button title={t('clientDetail.sendFeedbackButton')} onPress={handleSendFeedback} loading={feedbackBusy} />
        </Card>

        {feedbackList.map((f) => (
          <Card key={f.id}>
            <Text style={styles.feedbackPeriod}>
              {f.periodLabel} · {f.periodType === 'weekly' ? t('history.periodWeek') : t('history.periodMonth')}
            </Text>
            <Text style={styles.feedbackText}>{f.feedbackText}</Text>
            <Text style={styles.feedbackDate}>{formatDateVi(toDateKey(new Date(f.createdAtISO)))}</Text>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>{t('clientDetail.aiTitle')}</Text>
        {clientId && <PlanChatAssistant livePlan={plan} targetUserId={clientId} onApply={handleApplyPlan} />}

        <Text style={styles.sectionTitle}>{t('plan.currentPlanTitle')}</Text>
        <PlanPreview plan={plan} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  cardTitle: { ...typography.title, marginBottom: spacing.sm, color: colors.textPrimary },
  weightText: { ...typography.h2, color: colors.textPrimary },
  changeText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  sectionTitle: { ...typography.title, marginTop: spacing.md, marginBottom: spacing.sm, color: colors.textPrimary },
  streakCard: { backgroundColor: colors.goldLight },
  streakValue: { fontSize: 18, fontWeight: '800', color: colors.gold },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2, marginTop: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  proofsHint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  proofSection: { marginBottom: spacing.md },
  proofSectionTitle: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm },
  proofRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.sm },
  proofItem: { width: 88, borderRadius: radius.md, padding: 2 },
  proofItemActive: { backgroundColor: colors.primaryLight },
  proofThumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: '#eee' },
  proofThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  proofStatusBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  proofStatusIcon: { fontSize: 12 },
  proofLabel: { fontSize: 11, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xs, textAlign: 'center' },
  proofDate: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  proofDetailCard: { backgroundColor: colors.primaryLight },
  proofDetailText: { fontSize: 12, color: colors.textPrimary, lineHeight: 18 },
  aiInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  periodToggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  periodButton: { flex: 1, backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  periodButtonActive: { backgroundColor: colors.primary },
  periodButtonText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  periodButtonTextActive: { color: colors.white },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  feedbackPeriod: { fontSize: 12, fontWeight: '700', color: colors.primary },
  feedbackText: { fontSize: 13, color: '#333', marginTop: spacing.sm - 2, lineHeight: 18 },
  feedbackDate: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
});
