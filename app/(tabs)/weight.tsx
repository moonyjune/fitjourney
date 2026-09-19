import { useMemo, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Card } from '../../src/components/Card';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';

const RANGE_OPTIONS = [
  { key: '1w', label: '1 tuần', days: 7 },
  { key: '2w', label: '2 tuần', days: 14 },
  { key: '1m', label: '1 tháng', days: 30 },
  { key: '2m', label: '2 tháng', days: 61 },
  { key: '3m', label: '3 tháng', days: 91 },
];

// Chart labels get unreadable with many points — only show every Nth label.
function thinLabels(labels: string[], maxVisible = 7): string[] {
  if (labels.length <= maxVisible) return labels;
  const step = Math.ceil(labels.length / maxVisible);
  return labels.map((label, i) => (i % step === 0 || i === labels.length - 1 ? label : ''));
}

export default function WeightScreen() {
  const entries = useWeightStore((s) => s.entries);
  const addEntry = useWeightStore((s) => s.addEntry);
  const removeEntry = useWeightStore((s) => s.removeEntry);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const [input, setInput] = useState('');
  const [rangeDays, setRangeDays] = useState(30);

  const chartData = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const inRange = entries.filter((e) => new Date(e.dateISO).getTime() >= cutoff);
    if (inRange.length === 0) return null;
    const labels = inRange.map((e) => formatDateVi(toDateKey(new Date(e.dateISO))).slice(0, 5));
    return {
      labels: thinLabels(labels),
      datasets: [{ data: inRange.map((e) => e.weightKg) }],
    };
  }, [entries, rangeDays]);

  function handleAdd() {
    const value = parseFloat(input.replace(',', '.'));
    if (!value || value <= 0) return;
    addEntry(value);
    setInput('');
  }

  const screenWidth = Dimensions.get('window').width - 32;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={[...entries].reverse()}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          <Card>
            <Text style={styles.cardTitle}>Ghi nhận cân nặng mới</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="VD: 108.5"
                value={input}
                onChangeText={setInput}
              />
              <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
                <Text style={styles.addButtonText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Biểu đồ cân nặng</Text>
            <View style={styles.rangeRow}>
              {RANGE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.rangeButton, rangeDays === opt.days && styles.rangeButtonActive]}
                  onPress={() => setRangeDays(opt.days)}
                >
                  <Text style={[styles.rangeButtonText, rangeDays === opt.days && styles.rangeButtonTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {chartData && chartData.datasets[0].data.length > 1 ? (
              <LineChart
                data={chartData}
                width={screenWidth}
                height={200}
                yAxisSuffix="kg"
                chartConfig={{
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 1,
                  color: (opacity = 1) => `rgba(79, 142, 247, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(60, 60, 60, ${opacity})`,
                  propsForDots: { r: '3' },
                }}
                bezier
                style={{ borderRadius: 12 }}
              />
            ) : (
              <Text style={styles.emptyChartText}>Chưa đủ dữ liệu trong khoảng này.</Text>
            )}
            <Text style={styles.goalNote}>Mục tiêu: {goalWeightKg} kg</Text>
          </Card>

          <Text style={styles.historyTitle}>Lịch sử</Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.historyRow}>
          <Text style={styles.historyDate}>{formatDateVi(toDateKey(new Date(item.dateISO)))}</Text>
          <Text style={styles.historyWeight}>{item.weightKg.toFixed(1)} kg</Text>
          <TouchableOpacity onPress={() => removeEntry(item.id)}>
            <Text style={styles.deleteText}>Xóa</Text>
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>Chưa có dữ liệu cân nặng.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, color: '#222' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#4F8EF7',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  rangeButton: { backgroundColor: '#F0F0F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  rangeButtonActive: { backgroundColor: '#4F8EF7' },
  rangeButtonText: { fontSize: 12, color: '#666', fontWeight: '600' },
  rangeButtonTextActive: { color: '#fff' },
  emptyChartText: { textAlign: 'center', color: '#999', paddingVertical: 24 },
  goalNote: { textAlign: 'center', color: '#888', fontSize: 12, marginTop: 6 },
  historyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8, marginTop: 4, color: '#222' },
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
  historyDate: { color: '#666', fontSize: 13 },
  historyWeight: { fontWeight: '700', fontSize: 15, color: '#222' },
  deleteText: { color: '#E0563A', fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
});
