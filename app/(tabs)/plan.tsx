import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '../../src/components/Card';
import { PlanPreview } from '../../src/components/PlanPreview';
import { PlanChatAssistant } from '../../src/components/PlanChatAssistant';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { supabase } from '../../src/lib/supabase';
import { cancelAllReminders, requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { CARB_SWAP_OPTIONS, PROTEIN_SWAP_OPTIONS } from '../../src/constants/plan';
import type { PlanData } from '../../src/types';

export default function PlanScreen() {
  const settings = useSettingsStore();
  const session = useAuthStore((s) => s.session);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const plan = usePlanStore((s) => s.plan);
  const applyPlan = usePlanStore((s) => s.applyPlan);

  const [calorieTarget, setCalorieTarget] = useState(String(settings.calorieTargetKcal));
  const [proteinTarget, setProteinTarget] = useState(String(settings.proteinTargetG));
  const [waterTarget, setWaterTarget] = useState(String(settings.waterTargetMl));
  const [goalWeight, setGoalWeight] = useState(String(settings.goalWeightKg));

  const submitCoachCode = useSettingsStore((s) => s.submitCoachCode);
  const switchToCoachMode = useSettingsStore((s) => s.switchToCoachMode);
  const [coachCodeInput, setCoachCodeInput] = useState('');
  const [linkingCoach, setLinkingCoach] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  async function handleSwitchToCoach() {
    setSwitchingMode(true);
    await switchToCoachMode();
    setSwitchingMode(false);
    router.replace('/(tabs)/clients');
  }

  async function handleLinkCoach() {
    if (!coachCodeInput.trim()) return;
    setLinkingCoach(true);
    const result = await submitCoachCode(coachCodeInput);
    setLinkingCoach(false);
    if (result.ok) {
      setCoachCodeInput('');
      Alert.alert('Đã liên kết', 'Bạn đã liên kết với Coach thành công.');
    } else {
      Alert.alert('Không liên kết được', result.message);
    }
  }

  function saveTargets() {
    const cal = parseFloat(calorieTarget);
    const protein = parseFloat(proteinTarget);
    const water = parseFloat(waterTarget);
    const goal = parseFloat(goalWeight);
    if (!cal || !protein || !water || !goal) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ các giá trị hợp lệ.');
      return;
    }
    updateSettings({ calorieTargetKcal: cal, proteinTargetG: protein, waterTargetMl: water, goalWeightKg: goal });
    Alert.alert('Đã lưu', 'Mục tiêu đã được cập nhật.');
  }

  async function handleToggleReminders(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert('Chưa cấp quyền', 'Bạn cần cho phép thông báo để bật nhắc nhở.');
        return;
      }
      await scheduleAllReminders(plan);
    } else {
      await cancelAllReminders();
    }
    updateSettings({ remindersEnabled: value });
  }

  async function handleApplyPlan(newPlan: PlanData) {
    applyPlan(newPlan);
    if (settings.remindersEnabled) {
      await scheduleAllReminders(newPlan);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Chế độ</Text>
      <Card>
        <Text style={styles.fieldLabel}>
          {settings.coachEnabled ? 'Bạn cũng có vai trò Coach.' : 'Bạn cũng có thể quản lý học viên với vai trò Coach.'}
        </Text>
        <TouchableOpacity style={styles.saveButton} onPress={handleSwitchToCoach} disabled={switchingMode}>
          {switchingMode ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>{settings.coachEnabled ? 'Chuyển sang chế độ Coach' : 'Kích hoạt vai trò Coach'}</Text>
          )}
        </TouchableOpacity>
      </Card>

      <Text style={styles.sectionTitle}>Trợ lý AI cập nhật kế hoạch</Text>
      <Text style={styles.aiHint}>
        Trò chuyện để chỉnh thực đơn, bài tập, lịch uống nước hoặc danh sách đi chợ. AI sẽ đề xuất bản cập
        nhật — bạn xem trước và bấm Xác nhận thì mới áp dụng.
      </Text>
      <PlanChatAssistant livePlan={plan} onApply={handleApplyPlan} />

      <Text style={styles.sectionTitle}>Nhắc nhở</Text>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Nhắc giờ ăn, giờ tập, uống nước</Text>
            <Text style={styles.switchHint}>Thông báo local trên thiết bị (không hoạt động trên web).</Text>
          </View>
          <Switch value={settings.remindersEnabled} onValueChange={handleToggleReminders} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Mục tiêu cá nhân</Text>
      <Card>
        <Text style={styles.fieldLabel}>Cân nặng mục tiêu (kg)</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={goalWeight} onChangeText={setGoalWeight} />
        <Text style={styles.fieldLabel}>Calo mục tiêu / ngày</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={calorieTarget} onChangeText={setCalorieTarget} />
        <Text style={styles.fieldLabel}>Protein mục tiêu (g) / ngày</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={proteinTarget} onChangeText={setProteinTarget} />
        <Text style={styles.fieldLabel}>Nước mục tiêu (ml) / ngày</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={waterTarget} onChangeText={setWaterTarget} />
        <TouchableOpacity style={styles.saveButton} onPress={saveTargets}>
          <Text style={styles.saveButtonText}>Lưu mục tiêu</Text>
        </TouchableOpacity>
      </Card>

      <Text style={styles.sectionTitle}>Kế hoạch hiện tại</Text>
      <PlanPreview plan={plan} />

      <Text style={styles.sectionTitle}>Tùy biến món ăn (giữ nguyên calo & protein)</Text>
      <Card>
        <Text style={styles.swapGroupTitle}>Nhóm tinh bột (~120-140 kcal/phần)</Text>
        {CARB_SWAP_OPTIONS.map((item) => (
          <Text key={item} style={styles.swapItem}>
            • {item}
          </Text>
        ))}
        <Text style={[styles.swapGroupTitle, { marginTop: 12 }]}>Nhóm đạm (~30-35g protein/phần)</Text>
        {PROTEIN_SWAP_OPTIONS.map((item) => (
          <Text key={item} style={styles.swapItem}>
            • {item}
          </Text>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>Coach</Text>
      <Card>
        {settings.coachId ? (
          <Text style={styles.fieldLabel}>Bạn đã liên kết với 1 Coach.</Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Nhập mã Coach để liên kết tài khoản</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="characters"
              placeholder="VD: AB12CD"
              value={coachCodeInput}
              onChangeText={setCoachCodeInput}
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleLinkCoach} disabled={linkingCoach}>
              {linkingCoach ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Liên kết</Text>}
            </TouchableOpacity>
          </>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Tài khoản</Text>
      <Card>
        <Text style={styles.fieldLabel}>{session?.user.email ?? 'Chưa đăng nhập'}</Text>
        <TouchableOpacity style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchHint: { fontSize: 11, color: '#999', marginTop: 2 },
  signOutButton: { backgroundColor: '#FDEDEA', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  signOutText: { color: '#E0563A', fontWeight: '700' },
  aiHint: { fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  saveButton: { backgroundColor: '#4F8EF7', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '700' },
  swapGroupTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  swapItem: { fontSize: 13, color: '#444', marginTop: 4, lineHeight: 18 },
});
