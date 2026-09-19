import { useMemo, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Card } from '../../src/components/Card';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';

export default function WeightScreen() {
  const entries = useWeightStore((s) => s.entries);
  const addEntry = useWeightStore((s) => s.addEntry);
  const removeEntry = useWeightStore((s) => s.removeEntry);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const [input, setInput] = useState('');

  const chartData = useMemo(() => {
    const recent = entries.slice(-14);
    if (recent.length === 0) return null;
    return {
      labels: recent.map((e) => formatDateVi(toDateKey(new Date(e.dateISO))).slice(0, 5)),
      datasets: [{ data: recent.map((e) => e.weightKg) }],
    };
  }, [entries]);

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

          {chartData && chartData.datasets[0].data.length > 1 && (
            <Card>
              <Text style={styles.cardTitle}>Biểu đồ cân nặng (gần đây)</Text>
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
              <Text style={styles.goalNote}>Mục tiêu: {goalWeightKg} kg</Text>
            </Card>
          )}

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
