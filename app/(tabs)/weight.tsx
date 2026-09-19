import { useMemo, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

const RANGE_OPTIONS: { key: StringKey; days: number }[] = [
  { key: 'weight.range1w', days: 7 },
  { key: 'weight.range2w', days: 14 },
  { key: 'weight.range1m', days: 30 },
  { key: 'weight.range2m', days: 61 },
  { key: 'weight.range3m', days: 91 },
];

// Chart labels get unreadable with many points — only show every Nth label.
function thinLabels(labels: string[], maxVisible = 7): string[] {
  if (labels.length <= maxVisible) return labels;
  const step = Math.ceil(labels.length / maxVisible);
  return labels.map((label, i) => (i % step === 0 || i === labels.length - 1 ? label : ''));
}

export default function WeightScreen() {
  const { t } = useTranslation();
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
            <Text style={styles.cardTitle}>{t('weight.logTitle')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder={t('weight.inputPlaceholder')}
                value={input}
                onChangeText={setInput}
              />
              <Button title={t('common.save')} onPress={handleAdd} />
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>{t('weight.chartTitle')}</Text>
            <View style={styles.rangeRow}>
              {RANGE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.rangeButton, rangeDays === opt.days && styles.rangeButtonActive]}
                  onPress={() => setRangeDays(opt.days)}
                >
                  <Text style={[styles.rangeButtonText, rangeDays === opt.days && styles.rangeButtonTextActive]}>
                    {t(opt.key)}
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
                  backgroundColor: colors.surface,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 1,
                  color: (opacity = 1) => `rgba(79, 142, 247, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(60, 60, 60, ${opacity})`,
                  propsForDots: { r: '3' },
                }}
                bezier
                style={{ borderRadius: radius.lg }}
              />
            ) : (
              <Text style={styles.emptyChartText}>{t('weight.emptyChart')}</Text>
            )}
            <Text style={styles.goalNote}>{t('common.goalLabel', { kg: goalWeightKg })}</Text>
          </Card>

          <Text style={styles.historyTitle}>{t('tab.history')}</Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.historyRow}>
          <Text style={styles.historyDate}>{formatDateVi(toDateKey(new Date(item.dateISO)))}</Text>
          <Text style={styles.historyWeight}>{item.weightKg.toFixed(1)} kg</Text>
          <TouchableOpacity onPress={() => removeEntry(item.id)}>
            <Text style={styles.deleteText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>{t('weight.emptyHistory')}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  cardTitle: { ...typography.title, marginBottom: spacing.md, color: colors.textPrimary },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2, marginBottom: spacing.md },
  rangeButton: { backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2 },
  rangeButtonActive: { backgroundColor: colors.primary },
  rangeButtonText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  rangeButtonTextActive: { color: colors.white },
  emptyChartText: { textAlign: 'center', color: colors.textMuted, paddingVertical: 24 },
  goalNote: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  historyTitle: { ...typography.title, marginBottom: spacing.sm, marginTop: spacing.xs, color: colors.textPrimary },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  historyDate: { color: colors.textSecondary, fontSize: 13 },
  historyWeight: { fontWeight: '700', fontSize: 15, color: colors.textPrimary },
  deleteText: { color: colors.danger, fontSize: 13 },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
});
