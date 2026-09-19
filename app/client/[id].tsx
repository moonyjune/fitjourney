import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { PlanPreview } from '../../src/components/PlanPreview';
import { PlanChatAssistant } from '../../src/components/PlanChatAssistant';
import { supabase } from '../../src/lib/supabase';
import { fetchFeedback, pullPlan, pushCoachFeedback, pushPlan } from '../../src/sync/cloudSync';
import { DEFAULT_PLAN, DEFAULT_WATER_TARGET_ML } from '../../src/constants/plan';
import { computeCurrentStreak, unlockedStreakBadges } from '../../src/utils/streak';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { weekStartKey } from '../../src/utils/weekKey';
import { useTranslation } from '../../src/i18n/useTranslation';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import type { CoachFeedback, DailyNutritionLog, FeedbackPeriodType, PlanData } from '../../src/types';

interface RecentProof {
  id: string;
  entryDate: string;
  note: string | null;
  signedUrl: string | null;
}

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
      const [remotePlan, profileRes, latestWeightRes, nutritionLogsRes, proofsRes, feedbackRes] = await Promise.all([
        pullPlan(clientId),
        supabase.from('profiles').select('start_weight_kg, water_target_ml').eq('id', clientId).maybeSingle(),
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
          .select('id, entry_date, note, photo_path')
          .eq('user_id', clientId)
          .order('created_at', { ascending: false })
          .limit(6),
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
          waterMl: row.water_ml ?? 0,
        };
      }
      const waterTarget = profileRes.data?.water_target_ml ?? DEFAULT_WATER_TARGET_ML;
      setStreak(computeCurrentStreak(logsMap, 3, waterTarget));

      const proofRows = proofsRes.data ?? [];
      const proofsWithUrls = await Promise.all(
        proofRows.map(async (row) => {
          const { data: signed } = await supabase.storage.from('proofs').createSignedUrl(row.photo_path, 3600);
          return {
            id: row.id,
            entryDate: row.entry_date,
            note: row.note,
            signedUrl: signed?.signedUrl ?? null,
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

  if (loading || !plan) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const change = weightSummary.latest != null && weightSummary.start != null ? weightSummary.latest - weightSummary.start : null;
  const badges = unlockedStreakBadges(streak);

  return (
    <>
      <Stack.Screen options={{ title: t('clientDetail.headerTitle'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
          <View style={styles.proofGrid}>
            {recentProofs.map((p) => (
              <View key={p.id} style={styles.proofItem}>
                {p.signedUrl ? (
                  <Image source={{ uri: p.signedUrl }} style={styles.proofThumb} />
                ) : (
                  <View style={[styles.proofThumb, styles.proofThumbFallback]} />
                )}
                <Text style={styles.proofDate}>{formatDateVi(toDateKey(new Date(p.entryDate)))}</Text>
              </View>
            ))}
          </View>
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
  proofGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  proofItem: { width: 88 },
  proofThumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: '#eee' },
  proofThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  proofDate: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
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
