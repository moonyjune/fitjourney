import { useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { WeightChart } from '../src/components/quest/WeightChart';
import { WeightSheet } from '../src/components/quest/WeightSheet';
import { buildStageJourney } from '../src/game/stageBosses';
import { useGameText } from '../src/game/strings';
import { useNow } from '../src/game/useGameState';
import { useTranslation } from '../src/i18n/useTranslation';
import type { StringKey } from '../src/i18n/strings';
import { useSelectedDayStore, workingDayKey } from '../src/store/useSelectedDayStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { showToast } from '../src/store/useToastStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { quest, questRadius } from '../src/theme/quest';
import { CONTENT_MAX_WIDTH } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { formatDateVi, toDateKey } from '../src/utils/date';
import { buildWeightLossMilestoneViews } from '../src/utils/weightChart';

/** The chart's time ranges; `null` = since the plan started. */
const RANGES: { days: number | null; key?: StringKey }[] = [
  { days: 14, key: 'weight.range2w' },
  { days: 30, key: 'weight.range1m' },
  { days: 91, key: 'weight.range3m' },
  { days: null },
];

/** "Cân nặng" (Design/uiux-proposal/html/dialogs/31-weight-log.html): the app's one weight chart (actual line, the plan's predicted
 *  dashed line, "today", each stage boss's 5 kg line and where it fell), lost / left / journey %, the 5 kg milestones, and every
 *  weighing, deleted with "Hoàn tác". + opens the weight sheet (stepper, for the day picked with the date chip). */
export default function WeightScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  useLightStatusBar();
  const now = useNow(60_000);
  const entries = useWeightStore((s) => s.entries);
  const removeEntry = useWeightStore((s) => s.removeEntry);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const selectedKey = useSelectedDayStore((s) => s.selectedKey);
  const [rangeDays, setRangeDays] = useState<number | null>(30);
  const [sheetOpen, setSheetOpen] = useState(false);
  const chartWidth = Math.min(useWindowDimensions().width, CONTENT_MAX_WIDTH) - 32 - 24;

  const currentKg = entries.length > 0 ? entries[entries.length - 1].weightKg : startWeightKg;
  const journey = useMemo(
    () => buildStageJourney({ startKg: startWeightKg, goalKg: goalWeightKg, currentKg, entries, startDateISO }),
    [startWeightKg, goalWeightKg, currentKg, entries, startDateISO]
  );
  // Where each stage boss fell, marked on its 5 kg line.
  const fallMarks = useMemo(
    () => journey.bosses.flatMap((b) => (b.defeatedDateKey ? [{ kg: b.toKg, dateKey: b.defeatedDateKey }] : [])),
    [journey.bosses]
  );
  const milestones = useMemo(() => buildWeightLossMilestoneViews(startWeightKg, goalWeightKg, startDateISO, now), [startWeightKg, goalWeightKg, startDateISO, now]);

  const lost = startWeightKg - currentKg;
  const totalToLose = Math.max(0, startWeightKg - goalWeightKg);
  const journeyPct = totalToLose > 0 ? Math.max(0, Math.min(1, lost / totalToLose)) : 1;
  const left = Math.max(0, currentKg - goalWeightKg);

  const history = [...entries].reverse();
  const dateOf = (iso: string) => formatDateVi(toDateKey(new Date(iso)));

  function remove(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    removeEntry(id);
    const text = g('weightPage.deleted', { date: dateOf(entry.dateISO).slice(0, 5) });
    AccessibilityInfo.announceForAccessibility(text);
    // Undo logs the same weighing again (same day, time and note).
    showToast({ text, undo: () => useWeightStore.getState().addEntry(entry.weightKg, entry.note, entry.dateISO) });
  }

  return (
    <ScreenTemplate
      title={t('tab.weight')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/map'))}
      backLabel={g('planScreen.back')}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={g('weightPage.add')} onPress={() => setSheetOpen(true)} style={styles.addBtn}>
          <QuestIcon name="plus" size={22} color={quest.gold} strokeWidth={2.6} />
        </Pressable>
      }
      contentStyle={styles.content}
    >
      <View style={styles.ranges}>
        {RANGES.map((r) => {
          const on = rangeDays === r.days;
          const label = r.key ? t(r.key) : g('weightPage.rangeAll');
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              onPress={() => setRangeDays(r.days)}
              style={[styles.range, on && styles.rangeOn]}
            >
              <HudText size={12} color={on ? quest.onGold : quest.textSecondary}>
                {label}
              </HudText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.panel}>
        <WeightChart
          entries={entries}
          startDateISO={startDateISO}
          startWeightKg={startWeightKg}
          goalWeightKg={goalWeightKg}
          now={now}
          width={chartWidth}
          height={200}
          marks={fallMarks}
          windowDays={rangeDays ?? undefined}
          predicted
          forecastDays={rangeDays ? Math.round(rangeDays / 3) : 21}
          todayLabel={t('weight.todayMarker').replace('│', '').trim()}
        />
        <View style={styles.legend}>
          <HudText size={11} weight="medium" color={quest.gold}>
            {`━ ${t('weight.actualLegend')}`}
          </HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`┅ ${t('weight.predictedLegend')}`}
          </HudText>
          {fallMarks.length > 0 || journey.bosses.length > 0 ? (
            <HudText size={11} weight="medium" color={quest.hpText}>
              {g('weightPage.legendBoss')}
            </HudText>
          ) : null}
        </View>
        {entries.length === 0 && (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {t('weight.emptyChart')}
          </HudText>
        )}
      </View>

      <View style={styles.stats}>
        <Stat value={`${lost >= 0 ? '−' : '+'}${Math.abs(lost).toFixed(1)}`} label={lost >= 0 ? g('chart.stats.lost') : g('chart.stats.up')} color={lost >= 0 ? quest.xp : quest.hpText} />
        <Stat value={left.toFixed(1)} label={g('chart.stats.left')} color={quest.text} />
        <Stat value={`${Math.round(journeyPct * 100)}%`} label={g('chart.stats.journey')} color={quest.gold} />
      </View>

      <View style={styles.head}>
        <HudText size={15} accessibilityRole="header" style={styles.flex}>
          {t('weight.lossMilestonesTitle')}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('weightPage.goal', { kg: goalWeightKg })}
        </HudText>
      </View>
      <View style={styles.milestones}>
        {milestones.map((m) => (
          <View key={m.targetWeightKg} style={styles.milestone}>
            <HudText size={13} color={quest.manaText}>
              {`${m.targetWeightKg.toFixed(1)} kg${m.isGoal ? ` (${t('weight.goalBadge')})` : ''}`}
            </HudText>
            <HudText size={12} weight="medium" color={m.daysRemaining <= 0 ? quest.textSecondary : quest.manaText}>
              {formatDateVi(toDateKey(m.date))}
              {m.daysRemaining > 0 ? t('weight.milestoneDaysRemaining', { n: m.daysRemaining }) : t('weight.milestonePast')}
            </HudText>
          </View>
        ))}
      </View>

      <HudText size={15} accessibilityRole="header" style={styles.listTitle}>
        {g('weightPage.list')}
      </HudText>
      {history.length === 0 ? (
        <View style={styles.empty}>
          <HudText size={22}>⚖️</HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {g('weightPage.empty')}
          </HudText>
        </View>
      ) : (
        <View style={styles.list}>
          {history.map((item, i) => (
            <View key={item.id} style={[styles.row, i < history.length - 1 && styles.rowBorder]}>
              <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.flex}>
                {dateOf(item.dateISO)}
              </HudText>
              <HudText size={16} color={quest.gold}>
                {`${item.weightKg.toFixed(1)} kg`}
              </HudText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('common.delete')} ${dateOf(item.dateISO)}`}
                onPress={() => remove(item.id)}
                style={styles.delete}
              >
                <QuestIcon name="trash" size={18} color={quest.hpText} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <WeightSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        dateKey={workingDayKey(selectedKey, now)}
        now={now}
        onOpenHistory={() => setSheetOpen(false)}
      />
    </ScreenTemplate>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={styles.stat}>
      <HudText size={18} color={color}>
        {value}
      </HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {label}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  addBtn: { width: 44, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  range: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  rangeOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  panel: { padding: 12, gap: 8, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'stretch' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', padding: 8, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  milestones: { gap: 6 },
  milestone: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: questRadius.row, borderWidth: 1, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  listTitle: { marginTop: 4 },
  list: { paddingHorizontal: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: quest.border },
  delete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
});
