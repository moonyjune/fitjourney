import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '../../src/components/Card';
import { PlanPreview } from '../../src/components/PlanPreview';
import { PlanChatAssistant } from '../../src/components/PlanChatAssistant';
import { supabase } from '../../src/lib/supabase';
import { fetchFeedback, pullPlan, pushCoachFeedback, pushPlan } from '../../src/sync/cloudSync';
import { DEFAULT_PLAN, DEFAULT_WATER_TARGET_ML } from '../../src/constants/plan';
import { computeCurrentStreak, unlockedStreakBadges, badgeLabel } from '../../src/utils/streak';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { weekStartKey } from '../../src/utils/weekKey';
import type { CoachFeedback, DailyNutritionLog, FeedbackPeriodType, PlanData } from '../../src/types';

function defaultPeriodLabel(periodType: FeedbackPeriodType, now: Date): string {
  if (periodType === 'weekly') return `Tuần bắt đầu ${formatDateVi(weekStartKey(now))}`;
  return `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
}

interface RecentProof {
  id: string;
  entryDate: string;
  note: string | null;
  signedUrl: string | null;
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = Array.isArray(id) ? id[0] : id;

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
      Alert.alert('Thiếu nội dung', 'Nhập nhận xét trước khi gửi.');
      return;
    }
    setFeedbackBusy(true);
    const result = await pushCoachFeedback(clientId, feedbackPeriodType, feedbackLabel, feedbackText.trim());
    setFeedbackBusy(false);
    if (!result.ok) {
      Alert.alert('Không gửi được', result.message);
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
    Alert.alert('Đã cập nhật', 'Kế hoạch của học viên đã được cập nhật.');
  }

  if (loading || !plan) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F8EF7" />
      </View>
    );
  }

  const change = weightSummary.latest != null && weightSummary.start != null ? weightSummary.latest - weightSummary.start : null;
  const badges = unlockedStreakBadges(streak);

  return (
    <>
      <Stack.Screen options={{ title: 'Học viên', headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Tiến trình cân nặng</Text>
          <Text style={styles.weightText}>
            {weightSummary.latest != null ? `${weightSummary.latest.toFixed(1)} kg` : 'Chưa có dữ liệu'}
          </Text>
          {change != null && (
            <Text style={[styles.changeText, { color: change <= 0 ? '#2E9E4E' : '#E0563A' }]}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)} kg so với lúc bắt đầu
            </Text>
          )}
        </Card>

        <Card style={styles.streakCard}>
          <Text style={styles.streakValue}>🔥 {streak} ngày liên tiếp</Text>
          {badges.length > 0 && (
            <View style={styles.badgeRow}>
              {badges.map((b) => (
                <View key={b} style={styles.badgeChip}>
                  <Text style={styles.badgeChipText}>{badgeLabel(b)}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Text style={styles.sectionTitle}>Ảnh minh chứng gần đây</Text>
        {recentProofs.length === 0 ? (
          <Text style={styles.emptyText}>Chưa có ảnh minh chứng nào.</Text>
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

        <Text style={styles.sectionTitle}>Nhận xét định kỳ</Text>
        <Card>
          <View style={styles.periodToggleRow}>
            <TouchableOpacity
              style={[styles.periodButton, feedbackPeriodType === 'weekly' && styles.periodButtonActive]}
              onPress={() => handlePeriodTypeChange('weekly')}
            >
              <Text style={[styles.periodButtonText, feedbackPeriodType === 'weekly' && styles.periodButtonTextActive]}>
                Theo tuần
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodButton, feedbackPeriodType === 'monthly' && styles.periodButtonActive]}
              onPress={() => handlePeriodTypeChange('monthly')}
            >
              <Text style={[styles.periodButtonText, feedbackPeriodType === 'monthly' && styles.periodButtonTextActive]}>
                Theo tháng
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput style={styles.input} value={feedbackLabel} onChangeText={setFeedbackLabel} placeholder="Nhãn giai đoạn" />
          <TextInput
            style={styles.aiInput}
            multiline
            placeholder="Nhận xét tiến độ, điều chỉnh kế hoạch, lời khuyên cho học viên..."
            value={feedbackText}
            onChangeText={setFeedbackText}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSendFeedback} disabled={feedbackBusy}>
            {feedbackBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Gửi nhận xét</Text>}
          </TouchableOpacity>
        </Card>

        {feedbackList.map((f) => (
          <Card key={f.id}>
            <Text style={styles.feedbackPeriod}>
              {f.periodLabel} · {f.periodType === 'weekly' ? 'Tuần' : 'Tháng'}
            </Text>
            <Text style={styles.feedbackText}>{f.feedbackText}</Text>
            <Text style={styles.feedbackDate}>{formatDateVi(toDateKey(new Date(f.createdAtISO)))}</Text>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Trợ lý AI chỉnh kế hoạch cho học viên này</Text>
        {clientId && <PlanChatAssistant livePlan={plan} targetUserId={clientId} onApply={handleApplyPlan} />}

        <Text style={styles.sectionTitle}>Kế hoạch hiện tại</Text>
        <PlanPreview plan={plan} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8, color: '#222' },
  weightText: { fontSize: 24, fontWeight: '800', color: '#222' },
  changeText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 12, marginBottom: 8, color: '#222' },
  streakCard: { backgroundColor: '#FFF7E6' },
  streakValue: { fontSize: 18, fontWeight: '800', color: '#8A5A00' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badgeChip: { backgroundColor: '#FFE8B3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeChipText: { fontSize: 11, fontWeight: '700', color: '#8A5A00' },
  emptyText: { color: '#999', fontSize: 12, marginBottom: 8 },
  proofGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  proofItem: { width: 88 },
  proofThumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: '#eee' },
  proofThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  proofDate: { fontSize: 10, color: '#888', marginTop: 4, textAlign: 'center' },
  aiInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  saveButton: { backgroundColor: '#4F8EF7', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '700' },
  periodToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  periodButton: { flex: 1, backgroundColor: '#F0F0F0', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  periodButtonActive: { backgroundColor: '#4F8EF7' },
  periodButtonText: { fontSize: 12, fontWeight: '700', color: '#666' },
  periodButtonTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  feedbackPeriod: { fontSize: 12, fontWeight: '700', color: '#4F8EF7' },
  feedbackText: { fontSize: 13, color: '#333', marginTop: 6, lineHeight: 18 },
  feedbackDate: { fontSize: 11, color: '#999', marginTop: 8 },
});
