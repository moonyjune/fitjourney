import { useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { buildWeightChartData, buildWeightLossMilestoneViews, computeTodayLineX } from '../../src/utils/weightChart';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useAmbientBackground } from '../../src/theme/useAmbientBackground';

const RANGE_OPTIONS: { key: StringKey; days: number }[] = [
  { key: 'weight.range1w', days: 7 },
  { key: 'weight.range2w', days: 14 },
  { key: 'weight.range1m', days: 30 },
  { key: 'weight.range2m', days: 61 },
  { key: 'weight.range3m', days: 91 },
];

export default function WeightScreen() {
  const { t } = useTranslation();
  const ambientBg = useAmbientBackground();
  const entries = useWeightStore((s) => s.entries);
  const addEntry = useWeightStore((s) => s.addEntry);
  const removeEntry = useWeightStore((s) => s.removeEntry);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const [input, setInput] = useState('');
  const [logDate, setLogDate] = useState(new Date());
  const [rangeDays, setRangeDays] = useState(30);
  const screenWidth = Dimensions.get('window').width - 32;

  // Chart data, milestone prediction, and the today-marker pixel offset are pure functions in
  // src/utils/weightChart.ts (unit tested there) — kept out of this component so the
  // reverse-engineered chart-kit interop doesn't need RN rendering to verify.
  const chartData = useMemo(
    () => buildWeightChartData(entries, rangeDays, startDateISO, startWeightKg, goalWeightKg),
    [entries, rangeDays, startDateISO, startWeightKg, goalWeightKg]
  );

  const lossMilestones = useMemo(
    () => buildWeightLossMilestoneViews(startWeightKg, goalWeightKg, startDateISO),
    [startWeightKg, goalWeightKg, startDateISO]
  );

  const chartHeight = 200;
  const todayLineX = useMemo(
    () => computeTodayLineX(chartData.todayIndex, chartData.labels.length, screenWidth),
    [chartData, screenWidth]
  );

  // react-native-chart-kit scales its y-axis to the exact min/max across all datasets, with zero
  // headroom — the lowest/highest point sits flush against the chart edge. Add an invisible
  // dataset spanning [min - pad, max + pad] so the current-weight dot and the trend line's
  // extremes always have breathing room instead of clipping at the border.
  const chartDataWithPadding = useMemo(() => {
    const allValues = chartData.datasets.flatMap((ds) => ds.data);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const pad = Math.max(0.5, (dataMax - dataMin) * 0.12);
    const paddingData = chartData.labels.map((_, i) =>
      i === 0 ? dataMin - pad : i === chartData.labels.length - 1 ? dataMax + pad : (dataMin + dataMax) / 2
    );
    return {
      labels: chartData.labels,
      datasets: [...chartData.datasets, { data: paddingData, color: () => 'rgba(0,0,0,0)', strokeWidth: 0, withDots: false }],
    };
  }, [chartData]);

  function handleAdd() {
    const value = parseFloat(input.replace(',', '.'));
    if (!value || value <= 0) return;
    addEntry(value, undefined, logDate.toISOString());
    setInput('');
    setLogDate(new Date());
  }

  const historyEntries = [...entries].reverse();

  return (
    <ScrollView style={[styles.container, { backgroundColor: ambientBg }]} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
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
        <View style={{ position: 'relative' }}>
          <LineChart
            data={chartDataWithPadding}
            width={screenWidth}
            height={chartHeight}
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
            hidePointsAtIndex={chartData.nonEntryIndices}
            style={{ borderRadius: radius.lg }}
          />
          <View pointerEvents="none" style={[styles.todayLine, { left: todayLineX, height: chartHeight - 34 }]} />
        </View>
        <Text style={styles.todayLineCaption}>{t('weight.todayMarker')}</Text>
        {entries.length === 0 && <Text style={styles.emptyChartText}>{t('weight.emptyChart')}</Text>}
        <Text style={styles.milestonesTitle}>{t('weight.lossMilestonesTitle')}</Text>
        {lossMilestones.map((m) => (
          <View key={m.targetWeightKg} style={styles.milestoneRow}>
            <Text style={styles.milestoneWeight}>
              {m.targetWeightKg.toFixed(1)} kg{m.isGoal ? ` (${t('weight.goalBadge')})` : ''}
            </Text>
            <Text style={[styles.milestoneDate, m.daysRemaining <= 0 && styles.milestoneDatePast]}>
              {formatDateVi(toDateKey(m.date))}
              {m.daysRemaining > 0 ? t('weight.milestoneDaysRemaining', { n: m.daysRemaining }) : t('weight.milestonePast')}
            </Text>
          </View>
        ))}
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
  todayLine: { position: 'absolute', top: 16, width: 1.5, backgroundColor: colors.danger, opacity: 0.7 },
  todayLineCaption: { textAlign: 'right', color: colors.danger, fontSize: 10, marginTop: -spacing.sm, opacity: 0.8 },
  milestonesTitle: { ...typography.label, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs + 2,
  },
  milestoneWeight: { fontSize: 13, fontWeight: '800', color: colors.primaryDark },
  milestoneDate: { fontSize: 11, color: colors.primaryDark, fontWeight: '600' },
  milestoneDatePast: { color: colors.textMuted },
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
