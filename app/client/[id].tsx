import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { QuestPlanPreview } from '../../src/components/quest/QuestPlanPreview';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { useGameText } from '../../src/game/strings';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
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
import { quest, questFonts, questRadius } from '../../src/theme/quest';
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
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
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
        // `numeric` columns arrive as strings from PostgREST; .toFixed() below needs real numbers.
        start: profileRes.data?.start_weight_kg != null ? Number(profileRes.data.start_weight_kg) : null,
        latest: latestWeightRes.data?.weight_kg != null ? Number(latestWeightRes.data.weight_kg) : null,
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
          removedMealSlots: row.removed_meal_slots ?? [],
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
      setStreak(computeCurrentStreak(logsMap, plan.mealTemplates, streakWorkoutEntries, tdeeKcal));

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
        accessibilityRole="button"
        accessibilityLabel={`${proofLabel(p)}. ${formatDateVi(toDateKey(new Date(p.entryDate)))}`}
        accessibilityState={{ selected: isActive }}
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
              <HudText size={12}>{STATUS_ICON[status]}</HudText>
            </View>
          </View>
          <HudText size={11} style={styles.proofLabel} numberOfLines={1}>
            {proofLabel(p)}
          </HudText>
          <HudText size={10} weight="medium" color={quest.textSecondary} style={styles.proofDate}>
            {formatDateVi(toDateKey(new Date(p.entryDate)))}
          </HudText>
        </View>
      </Pressable>
    );
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/clients'));

  if (loading || !plan) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={quest.mana} />
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
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={t('clientDetail.headerTitle')} eyebrow={g('coach.eyebrow')} onBack={back} backLabel={g('planScreen.back')} />

        <View style={styles.panel}>
          <HudText size={16}>{t('clientDetail.weightProgressTitle')}</HudText>
          <HudText size={28} color={quest.manaText} style={{ marginTop: 6 }}>
            {weightSummary.latest != null ? `${weightSummary.latest.toFixed(1)} kg` : t('clientDetail.noData')}
          </HudText>
          {change != null && (
            <HudText size={13} color={change <= 0 ? quest.xp : quest.hpText} style={{ marginTop: 4 }}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)} {t('today.weightChangeSuffix')}
            </HudText>
          )}
        </View>

        <View style={styles.panel}>
          <HudText size={20} color={quest.gold}>
            {t('today.streakDays', { n: streak })}
          </HudText>
          {badges.length > 0 && (
            <View style={styles.badgeRow}>
              {badges.map((b) => (
                <View key={b} style={styles.badge}>
                  <HudText size={12} color={quest.gold}>
                    {t('today.streakDays', { n: b })}
                  </HudText>
                </View>
              ))}
            </View>
          )}
        </View>

        <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
          {t('clientDetail.proofsTitle')}
        </HudText>
        {recentProofs.length === 0 ? (
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {t('clientDetail.emptyProofs')}
          </HudText>
        ) : (
          <>
            <HudText size={12} weight="medium" color={quest.textSecondary} style={{ marginBottom: 10 }}>
              {t('clientDetail.proofsHint')}
            </HudText>
            {mealProofs.length > 0 && (
              <View style={styles.proofSection}>
                <HudText size={13} color={quest.textSecondary} style={{ marginBottom: 8 }}>
                  {t('clientDetail.proofsMealSection')}
                </HudText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proofRow}>
                  {mealProofs.map((p) => renderProofItem(p))}
                </ScrollView>
              </View>
            )}
            {workoutProofs.length > 0 && (
              <View style={styles.proofSection}>
                <HudText size={13} color={quest.textSecondary} style={{ marginBottom: 8 }}>
                  {t('clientDetail.proofsWorkoutSection')}
                </HudText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proofRow}>
                  {workoutProofs.map((p) => renderProofItem(p))}
                </ScrollView>
              </View>
            )}
            {activeProof && (
              <View style={[styles.panel, styles.manaPanel]}>
                <HudText size={13} weight="medium" color={quest.manaText} style={{ lineHeight: 19 }}>
                  {proofTooltip(activeProof)}
                </HudText>
              </View>
            )}
          </>
        )}

        <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
          {t('clientDetail.feedbackTitle')}
        </HudText>
        <View style={styles.panel}>
          <QuestSegment
            accessibilityLabel={t('clientDetail.feedbackTitle')}
            value={feedbackPeriodType}
            onChange={handlePeriodTypeChange}
            options={[
              { value: 'weekly', label: t('clientDetail.periodWeekly') },
              { value: 'monthly', label: t('clientDetail.periodMonthly') },
            ]}
          />
          <TextInput
            accessibilityLabel={t('clientDetail.periodLabelPlaceholder')}
            style={[styles.input, { marginTop: 10 }]}
            value={feedbackLabel}
            onChangeText={setFeedbackLabel}
            placeholder={t('clientDetail.periodLabelPlaceholder')}
            placeholderTextColor={quest.textSecondary}
          />
          <TextInput
            accessibilityLabel={t('clientDetail.feedbackPlaceholder')}
            style={[styles.input, styles.multiline]}
            multiline
            placeholder={t('clientDetail.feedbackPlaceholder')}
            placeholderTextColor={quest.textSecondary}
            value={feedbackText}
            onChangeText={setFeedbackText}
          />
          <QuestButton variant="mana" title={t('clientDetail.sendFeedbackButton')} onPress={handleSendFeedback} loading={feedbackBusy} />
        </View>

        {feedbackList.map((f) => (
          <View key={f.id} style={styles.panel}>
            <HudText size={13} color={quest.manaText}>
              {f.periodLabel} · {f.periodType === 'weekly' ? t('history.periodWeek') : t('history.periodMonth')}
            </HudText>
            <HudText size={14} weight="medium" style={{ marginTop: 6, lineHeight: 20 }}>
              {f.feedbackText}
            </HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary} style={{ marginTop: 8 }}>
              {formatDateVi(toDateKey(new Date(f.createdAtISO)))}
            </HudText>
          </View>
        ))}

        <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
          {t('clientDetail.aiTitle')}
        </HudText>
        {clientId && <PlanChatAssistant dark livePlan={plan} targetUserId={clientId} onApply={handleApplyPlan} />}

        <HudText size={18} accessibilityRole="header" style={styles.sectionTitle}>
          {t('plan.currentPlanTitle')}
        </HudText>
        <QuestPlanPreview plan={plan} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
  panel: { backgroundColor: quest.panel, borderColor: quest.border, borderWidth: 1.5, borderRadius: questRadius.panel, padding: 14, marginTop: 12 },
  manaPanel: { backgroundColor: quest.manaPanel, borderColor: quest.manaBorder },
  sectionTitle: { marginTop: 22, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { borderWidth: 1.5, borderColor: quest.gold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  proofSection: { marginBottom: 12 },
  proofRow: { flexDirection: 'row', gap: 10, paddingRight: 10, paddingTop: 8 },
  proofItem: { width: 92, borderRadius: questRadius.row, padding: 2, borderWidth: 1.5, borderColor: 'transparent' },
  proofItemActive: { backgroundColor: quest.manaPanel, borderColor: quest.manaBorder },
  proofThumb: { width: 84, height: 84, borderRadius: questRadius.row, backgroundColor: quest.raised },
  proofThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  proofStatusBadge: {
    position: 'absolute',
    top: -6,
    right: -2,
    backgroundColor: quest.bg,
    borderRadius: 999,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofLabel: { marginTop: 4, textAlign: 'center' },
  proofDate: { marginTop: 2, textAlign: 'center' },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.bg,
    borderRadius: questRadius.row,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    color: quest.text,
    fontSize: 15,
    fontFamily: questFonts.semibold,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
});
