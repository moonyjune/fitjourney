import { useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { predictedWeightKgAt } from '../../src/utils/milestones';
import { thinLabels } from '../../src/utils/chartLabels';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';

const RANGE_OPTIONS: { key: StringKey; days: number }[] = [
  { key: 'weight.range1w', days: 7 },
  { key: 'weight.range2w', days: 14 },
  { key: 'weight.range1m', days: 30 },
  { key: 'weight.range2m', days: 61 },
  { key: 'weight.range3m', days: 91 },
];

export default function WeightScreen() {
  const { t } = useTranslation();
  const entries = useWeightStore((s) => s.entries);
  const addEntry = useWeightStore((s) => s.addEntry);
  const removeEntry = useWeightStore((s) => s.removeEntry);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const [input, setInput] = useState('');
  const [logDate, setLogDate] = useState(new Date());
  const [rangeDays, setRangeDays] = useState(30);

  // Always renders something (default chart): with no/one actual entry, only the predicted
  // trend line (from start weight to goal, following the same curve milestones are scored
  // against) spans the selected range; real entries overlay it as soon as they exist.
  const chartData = useMemo(() => {
    const now = new Date();
    const cutoff = now.getTime() - rangeDays * 24 * 60 * 60 * 1000;
    const inRange = entries.filter((e) => new Date(e.dateISO).getTime() >= cutoff);
    const pointDates = inRange.length > 0 ? inRange.map((e) => new Date(e.dateISO)) : [new Date(cutoff), now];

    const labels = thinLabels(pointDates.map((d) => formatDateVi(toDateKey(d)).slice(0, 5)));
    const predictedData = pointDates.map((d) => predictedWeightKgAt(d, startDateISO, startWeightKg, goalWeightKg));

    const datasets =
      inRange.length > 0
        ? [
            { data: inRange.map((e) => e.weightKg), color: () => colors.primary, strokeWidth: 3 },
            { data: predictedData, color: () => 'rgba(150,150,150,0.7)', strokeWidth: 2, withDots: false, strokeDashArray: [6, 4] },
          ]
        : [{ data: predictedData, color: () => 'rgba(150,150,150,0.7)', strokeWidth: 2, withDots: false, strokeDashArray: [6, 4] }];

    return { labels, datasets, hasActual: inRange.length > 0 };
  }, [entries, rangeDays, startDateISO, startWeightKg, goalWeightKg]);

  function handleAdd() {
    const value = parseFloat(input.replace(',', '.'));
    if (!value || value <= 0) return;
    addEntry(value, undefined, logDate.toISOString());
    setInput('');
    setLogDate(new Date());
  }

  const screenWidth = Dimensions.get('window').width - 32;

  const historyEntries = [...entries].reverse();

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Card>
        <Text style={styles.cardTitle}>{t('weight.logTitle')}</Text>
        <DateOffsetPicker selectedDate={logDate} onChange={setLogDate} />
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
        <View style={styles.legendRow}>
          {chartData.hasActual && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>{t('weight.actualLegend')}</Text>
            </View>
          )}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotPredicted]} />
            <Text style={styles.legendText}>{t('weight.predictedLegend')}</Text>
          </View>
        </View>
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
        {entries.length === 0 && <Text style={styles.emptyChartText}>{t('weight.emptyChart')}</Text>}
        <Text style={styles.goalNote}>{t('common.goalLabel', { kg: goalWeightKg })}</Text>
      </Card>

      <Text style={styles.historyTitle}>{t('tab.history')}</Text>
      {historyEntries.length === 0 && <Text style={styles.emptyText}>{t('weight.emptyHistory')}</Text>}
      {historyEntries.map((item) => (
        <View key={item.id} style={styles.historyRow}>
          <Text style={styles.historyDate}>{formatDateVi(toDateKey(new Date(item.dateISO)))}</Text>
          <Text style={styles.historyWeight}>{item.weightKg.toFixed(1)} kg</Text>
          <TouchableOpacity onPress={() => removeEntry(item.id)}>
            <Text style={styles.deleteText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
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
  legendRow: { flexDirection: 'row', gap: spacing.base, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDotPredicted: { backgroundColor: '#969696' },
  legendText: { fontSize: 11, color: colors.textSecondary },
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
