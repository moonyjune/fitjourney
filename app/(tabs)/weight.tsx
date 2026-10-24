import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestField } from '../../src/components/quest/QuestField';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { useGameText } from '../../src/game/strings';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { buildWeightChartData, buildWeightLossMilestoneViews, computeTodayLineX } from '../../src/utils/weightChart';
import { useTranslation } from '../../src/i18n/useTranslation';
import type { StringKey } from '../../src/i18n/strings';
import { quest, questRadius } from '../../src/theme/quest';
import { chartWidthFor, screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';

const RANGE_OPTIONS: { key: StringKey; days: number }[] = [
  { key: 'weight.range1w', days: 7 },
  { key: 'weight.range2w', days: 14 },
  { key: 'weight.range1m', days: 30 },
  { key: 'weight.range2m', days: 61 },
  { key: 'weight.range3m', days: 91 },
];

export default function WeightScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const entries = useWeightStore((s) => s.entries);
  const addEntry = useWeightStore((s) => s.addEntry);
  const removeEntry = useWeightStore((s) => s.removeEntry);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const [input, setInput] = useState('');
  const [logDate, setLogDate] = useState(new Date());
  const [rangeDays, setRangeDays] = useState(30);
  const screenWidth = chartWidthFor(useWindowDimensions().width) - 32; // minus the panel's own 16px side padding

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <QuestHeader
        title={t('tab.weight')}
        backLabel={g('planScreen.back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      <View style={styles.panel}>
        <HudText size={16} accessibilityRole="header">
          {t('weight.logTitle')}
        </HudText>
        <DateOffsetPicker selectedDate={logDate} onChange={setLogDate} dark />
        <QuestField
          label={t('weight.logTitle')}
          unit="kg"
          keyboardType="decimal-pad"
          placeholder={t('weight.inputPlaceholder')}
          value={input}
          onChangeText={setInput}
        />
        <QuestButton title={t('common.save')} onPress={handleAdd} />
      </View>

      <View style={styles.panel}>
        <HudText size={16} accessibilityRole="header">
          {t('weight.chartTitle')}
        </HudText>
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((opt) => {
            const active = rangeDays === opt.days;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                accessibilityLabel={t(opt.key)}
                accessibilityState={{ selected: active }}
                style={[styles.rangeButton, active && styles.rangeButtonActive]}
                onPress={() => setRangeDays(opt.days)}
              >
                <HudText size={12} color={active ? quest.onGold : quest.textSecondary}>
                  {t(opt.key)}
                </HudText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          {chartData.hasActual && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: quest.gold }]} />
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {t('weight.actualLegend')}
              </HudText>
            </View>
          )}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: quest.textSecondary }]} />
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {t('weight.predictedLegend')}
            </HudText>
          </View>
        </View>
        <View style={{ position: 'relative' }}>
          <LineChart
            data={chartDataWithPadding}
            width={screenWidth}
            height={chartHeight}
            yAxisSuffix="kg"
            chartConfig={{
              backgroundColor: quest.panel,
              backgroundGradientFrom: quest.panel,
              backgroundGradientTo: quest.panel,
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(255, 200, 61, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(179, 170, 207, ${opacity})`,
              propsForDots: { r: '3' },
            }}
            bezier
            withShadow={false}
            hidePointsAtIndex={chartData.nonEntryIndices}
            style={{ borderRadius: questRadius.row }}
          />
          <View style={[styles.todayLine, { left: todayLineX, height: chartHeight - 34 }]} />
        </View>
        <HudText size={10} weight="medium" color={quest.hpText} style={styles.todayLineCaption}>
          {t('weight.todayMarker')}
        </HudText>
        {entries.length === 0 && (
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.centered}>
            {t('weight.emptyChart')}
          </HudText>
        )}
        <HudText size={14} style={styles.milestonesTitle}>
          {t('weight.lossMilestonesTitle')}
        </HudText>
        {lossMilestones.map((m) => (
          <View key={m.targetWeightKg} style={styles.milestoneRow}>
            <HudText size={13} color={quest.manaText}>
              {m.targetWeightKg.toFixed(1)} kg{m.isGoal ? ` (${t('weight.goalBadge')})` : ''}
            </HudText>
            <HudText size={11} weight="semibold" color={m.daysRemaining <= 0 ? quest.textSecondary : quest.manaText}>
              {formatDateVi(toDateKey(m.date))}
              {m.daysRemaining > 0 ? t('weight.milestoneDaysRemaining', { n: m.daysRemaining }) : t('weight.milestonePast')}
            </HudText>
          </View>
        ))}
        <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.centered}>
          {t('common.goalLabel', { kg: goalWeightKg })}
        </HudText>
      </View>

      <HudText size={16} accessibilityRole="header">
        {t('tab.history')}
      </HudText>
      {historyEntries.length === 0 && (
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.centered}>
          {t('weight.emptyHistory')}
        </HudText>
      )}
      {historyEntries.map((item) => (
        <View key={item.id} style={styles.historyRow}>
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {formatDateVi(toDateKey(new Date(item.dateISO)))}
          </HudText>
          <HudText size={16} color={quest.gold}>
            {item.weightKg.toFixed(1)} kg
          </HudText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete')} ${formatDateVi(toDateKey(new Date(item.dateISO)))}`}
            onPress={() => removeEntry(item.id)}
            style={styles.deleteButton}
          >
            <HudText size={13} color={quest.hpText}>
              {t('common.delete')}
            </HudText>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 16 },
  flex: { flex: 1 },
  centered: { textAlign: 'center' },
  panel: { backgroundColor: quest.panel, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, padding: 16, gap: 12 },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, alignItems: 'center', justifyContent: 'center' },
  rangeButtonActive: { backgroundColor: quest.gold, borderColor: quest.gold },
  legendRow: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  todayLine: { position: 'absolute', top: 16, width: 1.5, backgroundColor: quest.hp, opacity: 0.7, pointerEvents: 'none' },
  todayLineCaption: { textAlign: 'right', marginTop: -8 },
  milestonesTitle: { marginTop: 4 },
  milestoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, backgroundColor: quest.manaPanel, borderWidth: 1, borderColor: quest.manaBorder, borderRadius: questRadius.row, paddingHorizontal: 12, paddingVertical: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: quest.panel, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, paddingLeft: 16, paddingRight: 4, minHeight: 52 },
  deleteButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
