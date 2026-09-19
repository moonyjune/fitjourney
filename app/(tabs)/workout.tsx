import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { ProofCapture } from '../../src/components/ProofCapture';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { todayKey } from '../../src/store/useNutritionStore';
import { getDayType, WORKOUT_TEMPLATES } from '../../src/constants/plan';
import { formatDateVi, toDateKey } from '../../src/utils/date';

export default function WorkoutScreen() {
  const dateKey = todayKey();
  const dayType = useMemo(() => getDayType(new Date()), []);
  const entries = useWorkoutStore((s) => s.entries);
  const addEntry = useWorkoutStore((s) => s.addEntry);
  const removeEntry = useWorkoutStore((s) => s.removeEntry);

  const todayEntries = useMemo(
    () => entries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey).reverse(),
    [entries, dateKey]
  );
  const recentEntries = useMemo(
    () => entries.filter((e) => toDateKey(new Date(e.dateISO)) !== dateKey).slice(-10).reverse(),
    [entries, dateKey]
  );

  const [customLabel, setCustomLabel] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [customCalories, setCustomCalories] = useState('');

  function logTemplate(templateId: string, label: string, durationMin: number, caloriesBurned: number) {
    addEntry({ templateId, label, durationMin, caloriesBurned });
  }

  function logCustom() {
    const duration = parseFloat(customDuration.replace(',', '.'));
    const calories = parseFloat(customCalories.replace(',', '.'));
    if (!customLabel || !duration || !calories) {
      Alert.alert('Lỗi', 'Nhập đầy đủ tên buổi tập, thời lượng và calo đốt.');
      return;
    }
    addEntry({ templateId: null, label: customLabel, durationMin: duration, caloriesBurned: calories });
    setCustomLabel('');
    setCustomDuration('');
    setCustomCalories('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dayTypeLabel}>
        {dayType === 'training' ? 'Ngày tập luyện - 2 buổi/ngày theo kế hoạch' : 'Ngày nghỉ - tập nhẹ hoặc nghỉ ngơi'}
      </Text>

      <Text style={styles.sectionTitle}>Bài tập gợi ý</Text>
      {WORKOUT_TEMPLATES.map((t) => (
        <Card key={t.id}>
          <Text style={styles.templateLabel}>{t.label}</Text>
          <Text style={styles.templateTime}>{t.timeRange}</Text>
          <Text style={styles.templateDescription}>{t.description}</Text>
          <View style={styles.templateFooter}>
            <Text style={styles.templateMacro}>
              {t.durationMin} phút · {t.caloriesBurned} kcal
            </Text>
            <TouchableOpacity
              style={styles.logButton}
              onPress={() => logTemplate(t.id, t.label, t.durationMin, t.caloriesBurned)}
            >
              <Text style={styles.logButtonText}>+ Ghi nhận</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Ghi buổi tập tùy chỉnh</Text>
      <Card>
        <TextInput
          style={styles.input}
          placeholder="Tên buổi tập"
          value={customLabel}
          onChangeText={setCustomLabel}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder="Thời lượng (phút)"
            keyboardType="decimal-pad"
            value={customDuration}
            onChangeText={setCustomDuration}
          />
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder="Calo đốt"
            keyboardType="decimal-pad"
            value={customCalories}
            onChangeText={setCustomCalories}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={logCustom}>
          <Text style={styles.addButtonText}>Ghi nhận</Text>
        </TouchableOpacity>
      </Card>

      <Text style={styles.sectionTitle}>Đã tập hôm nay ({todayEntries.length})</Text>
      {todayEntries.length === 0 && <Text style={styles.emptyText}>Chưa có buổi tập nào hôm nay.</Text>}
      {todayEntries.map((e) => (
        <Card key={e.id}>
          <View style={styles.historyTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyLabel}>{e.label}</Text>
              <Text style={styles.historyMeta}>
                {e.durationMin} phút · {e.caloriesBurned} kcal
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeEntry(e.id)}>
              <Text style={styles.deleteText}>Xóa</Text>
            </TouchableOpacity>
          </View>
          <ProofCapture dateKey={dateKey} taskType="workout" taskRefId={e.id} />
        </Card>
      ))}

      {recentEntries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Lịch sử gần đây</Text>
          {recentEntries.map((e) => (
            <View key={e.id} style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyLabel}>{e.label}</Text>
                <Text style={styles.historyMeta}>
                  {formatDateVi(toDateKey(new Date(e.dateISO)))} · {e.durationMin} phút · {e.caloriesBurned} kcal
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeEntry(e.id)}>
                <Text style={styles.deleteText}>Xóa</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  dayTypeLabel: { fontSize: 14, color: '#666', marginBottom: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  templateLabel: { fontSize: 14, fontWeight: '700', color: '#222' },
  templateTime: { fontSize: 12, color: '#888', marginTop: 2 },
  templateDescription: { fontSize: 13, color: '#444', marginTop: 8, lineHeight: 18 },
  templateFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  templateMacro: { fontSize: 13, color: '#4F8EF7', fontWeight: '700' },
  logButton: { backgroundColor: '#4F8EF7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  logButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  rowInput: { flex: 1 },
  addButton: { backgroundColor: '#4F8EF7', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700' },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  historyLabel: { fontWeight: '700', fontSize: 14, color: '#222' },
  historyMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  deleteText: { color: '#E0563A', fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#999', marginBottom: 12 },
});
