import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '../../src/components/Card';
import { PlanPreview } from '../../src/components/PlanPreview';
import { supabase } from '../../src/lib/supabase';
import { pullPlan, pushPlan } from '../../src/sync/cloudSync';
import { DEFAULT_PLAN } from '../../src/constants/plan';
import type { PlanData } from '../../src/types';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = Array.isArray(id) ? id[0] : id;

  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weightSummary, setWeightSummary] = useState<{ latest: number | null; start: number | null }>({
    latest: null,
    start: null,
  });

  const [instruction, setInstruction] = useState('');
  const [proposedPlan, setProposedPlan] = useState<PlanData | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const [remotePlan, profileRes, latestWeightRes] = await Promise.all([
        pullPlan(clientId),
        supabase.from('profiles').select('start_weight_kg').eq('id', clientId).maybeSingle(),
        supabase
          .from('weight_entries')
          .select('weight_kg')
          .eq('user_id', clientId)
          .order('entry_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setPlan(remotePlan?.plan ?? DEFAULT_PLAN);
      setWeightSummary({
        start: profileRes.data?.start_weight_kg ?? null,
        latest: latestWeightRes.data?.weight_kg ?? null,
      });
      setLoading(false);
    })();
  }, [clientId]);

  async function handleAskAi() {
    if (!plan || !clientId) return;
    if (!instruction.trim()) {
      Alert.alert('Thiếu yêu cầu', 'Nhập yêu cầu chỉnh sửa kế hoạch cho học viên này.');
      return;
    }
    setAiBusy(true);
    setAiError(null);
    setProposedPlan(null);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-plan-update', {
        body: { currentPlan: plan, instruction, targetUserId: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.plan) throw new Error('AI không trả về kế hoạch hợp lệ.');
      setProposedPlan(data.plan as PlanData);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gọi AI.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleConfirm() {
    if (!proposedPlan || !clientId) return;
    await pushPlan(proposedPlan, new Date().toISOString(), clientId);
    setPlan(proposedPlan);
    setProposedPlan(null);
    setInstruction('');
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

        <Text style={styles.sectionTitle}>Trợ lý AI chỉnh kế hoạch cho học viên này</Text>
        <Card>
          <TextInput
            style={styles.aiInput}
            multiline
            placeholder='VD: "Giảm calo bữa tối 100kcal" hoặc "Thêm ngày tập thứ 7"'
            value={instruction}
            onChangeText={setInstruction}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAskAi} disabled={aiBusy}>
            {aiBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Xem đề xuất</Text>}
          </TouchableOpacity>
          {aiError && <Text style={styles.aiError}>{aiError}</Text>}
        </Card>

        {proposedPlan && (
          <>
            <Card style={styles.proposalBanner}>
              <Text style={styles.proposalBannerText}>Đề xuất từ AI — chưa áp dụng cho học viên.</Text>
            </Card>
            <PlanPreview plan={proposedPlan} />
            <View style={styles.proposalActions}>
              <TouchableOpacity style={styles.discardButton} onPress={() => setProposedPlan(null)}>
                <Text style={styles.discardButtonText}>Hủy đề xuất</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>Xác nhận cập nhật</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!proposedPlan && (
          <>
            <Text style={styles.sectionTitle}>Kế hoạch hiện tại</Text>
            <PlanPreview plan={plan} />
          </>
        )}
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
  aiError: { color: '#E0563A', fontSize: 12, marginTop: 8 },
  proposalBanner: { backgroundColor: '#FFF3E0' },
  proposalBannerText: { fontSize: 12, color: '#8A5A00', fontWeight: '600' },
  proposalActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  discardButton: { flex: 1, backgroundColor: '#F0F0F0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  discardButtonText: { color: '#666', fontWeight: '700' },
  confirmButton: { flex: 1, backgroundColor: '#2E9E4E', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirmButtonText: { color: '#fff', fontWeight: '700' },
});
