import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { supabase } from '../../src/lib/supabase';
import { cancelAllReminders, requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import {
  CARB_SWAP_OPTIONS,
  MEAL_TEMPLATES,
  PROTEIN_SWAP_OPTIONS,
  SHOPPING_LIST,
  SHOPPING_LIST_TOTAL_VND,
  WORKOUT_TEMPLATES,
} from '../../src/constants/plan';

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ';
}

export default function PlanScreen() {
  const settings = useSettingsStore();
  const session = useAuthStore((s) => s.session);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [calorieTarget, setCalorieTarget] = useState(String(settings.calorieTargetKcal));
  const [proteinTarget, setProteinTarget] = useState(String(settings.proteinTargetG));
  const [waterTarget, setWaterTarget] = useState(String(settings.waterTargetMl));
  const [goalWeight, setGoalWeight] = useState(String(settings.goalWeightKg));

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
      await scheduleAllReminders();
    } else {
      await cancelAllReminders();
    }
    updateSettings({ remindersEnabled: value });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      <Text style={styles.sectionTitle}>Thực đơn tuần - Ngày tập luyện (T2,3,5,6)</Text>
      {MEAL_TEMPLATES.training.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <Text style={styles.mealDescription}>{m.description}</Text>
          <Text style={styles.mealMacro}>
            {m.calories} kcal · {m.proteinG}g protein
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Thực đơn tuần - Ngày nghỉ (T4,7,CN)</Text>
      {MEAL_TEMPLATES.rest.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <Text style={styles.mealDescription}>{m.description}</Text>
          <Text style={styles.mealMacro}>
            {m.calories} kcal · {m.proteinG}g protein
          </Text>
        </Card>
      ))}

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

      <Text style={styles.sectionTitle}>Chi tiết bài tập Cardio</Text>
      {WORKOUT_TEMPLATES.map((t) => (
        <Card key={t.id}>
          <Text style={styles.mealLabel}>{t.label}</Text>
          <Text style={styles.mealDescription}>{t.description}</Text>
          <Text style={styles.mealMacro}>
            {t.durationMin} phút · {t.caloriesBurned} kcal
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Danh sách đi chợ 1 tuần (~{formatVnd(SHOPPING_LIST_TOTAL_VND)})</Text>
      <Card>
        {SHOPPING_LIST.map((item) => (
          <View key={item.name} style={styles.shoppingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shoppingName}>{item.name}</Text>
              <Text style={styles.shoppingMeta}>
                {item.category} · Mua: {item.quantityToBuy}
              </Text>
            </View>
            <Text style={styles.shoppingPrice}>{formatVnd(item.estimatedPriceVnd)}</Text>
          </View>
        ))}
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
  mealLabel: { fontSize: 14, fontWeight: '700', color: '#222' },
  mealDescription: { fontSize: 13, color: '#444', marginTop: 6, lineHeight: 18 },
  mealMacro: { fontSize: 13, color: '#4F8EF7', fontWeight: '700', marginTop: 8 },
  swapGroupTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  swapItem: { fontSize: 13, color: '#444', marginTop: 4, lineHeight: 18 },
  shoppingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  shoppingName: { fontSize: 13, fontWeight: '600', color: '#222' },
  shoppingMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  shoppingPrice: { fontSize: 13, fontWeight: '700', color: '#333' },
});
