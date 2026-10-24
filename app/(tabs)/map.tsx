import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../../src/components/quest/HudText';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { TrailMap } from '../../src/components/quest/TrailMap';
import { WeightChart } from '../../src/components/quest/WeightChart';
import { XpBar } from '../../src/components/quest/XpBar';
import { buildRegions, currentRegion, type Region } from '../../src/game/map';
import { useGameText, type GameKey } from '../../src/game/strings';
import { useGameState, useNow } from '../../src/game/useGameState';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { quest, questRadius } from '../../src/theme/quest';
import { CONTENT_MAX_WIDTH, screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { isoWeekNumber } from '../../src/utils/isoWeek';

type View_ = 'map' | 'chart';
type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

function regionTitle(r: Region, g: Translate): string {
  const name = g(`region.${r.nameKey}` as GameKey);
  return g(r.isSummit ? 'region.nameSummit' : 'region.name', { n: r.index + 1, name });
}

function LockedRegion({ region, g }: { region: Region; g: Translate }) {
  return (
    <View
      accessible
      accessibilityLabel={`${regionTitle(region, g)}. ${g('region.range', { from: region.fromKg, to: region.toKg })}. ${g('region.locked', { kg: region.fromKg })}`}
      style={styles.locked}
    >
      <QuestIcon name="lock" size={22} color={quest.textSecondary} />
      <View style={styles.flex}>
        <HudText size={16} color={quest.textSecondary}>
          {regionTitle(region, g)}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('region.range', { from: region.fromKg, to: region.toKg })} · {g('region.locked', { kg: region.fromKg })}
        </HudText>
      </View>
    </View>
  );
}

export default function MapScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  useLightStatusBar();
  const now = useNow();
  const game = useGameState(now);

  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const entries = useWeightStore((s) => s.entries);
  const latest = useWeightStore((s) => s.latest());
  const currentKg = latest?.weightKg ?? startWeightKg;

  const [view, setView] = useState<View_>('map');
  const regions = useMemo(() => buildRegions(startWeightKg, goalWeightKg, currentKg), [startWeightKg, goalWeightKg, currentKg]);
  const active = currentRegion(regions);

  // Content column = window width (capped) minus the 16 px gutters and the card padding.
  const columnWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32;
  const lost = startWeightKg - currentKg;
  const totalToLose = Math.max(0, startWeightKg - goalWeightKg);
  const journey = totalToLose > 0 ? Math.max(0, Math.min(1, lost / totalToLose)) : 1;
  const nextRegion = regions.find((r) => r.status === 'current' || r.status === 'locked');

  const header = active
    ? g(active.isSummit ? 'map.headerSummit' : 'map.header', { kg: currentKg.toFixed(1), n: active.index + 1 })
    : `${currentKg.toFixed(1)} kg`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
      <QuestSegment<View_>
        accessibilityLabel={g('map.view')}
        value={view}
        onChange={setView}
        options={[
          { value: 'map', label: g('map.viewMap'), icon: 'map' },
          { value: 'chart', label: g('map.viewChart'), icon: 'chart' },
        ]}
      />

      <View style={styles.titleRow}>
        <HudText size={28} accessibilityRole="header">
          {g(view === 'map' ? 'map.title' : 'chart.title')}
        </HudText>
        <HudText size={14} weight="medium" color={quest.textSecondary}>
          {header}
        </HudText>
      </View>

      {view === 'map' && active && (
        <>
          <View style={styles.stack}>
            {[...regions]
              .reverse()
              .filter((r) => r.status === 'locked')
              .map((r) => (
                <LockedRegion key={r.index} region={r} g={g} />
              ))}
          </View>

          <View style={styles.activePanel}>
            <View style={styles.activeHead}>
              <HudText size={17} color={quest.gold} style={styles.flex}>
                {regionTitle(active, g)}
              </HudText>
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('region.range', { from: active.fromKg, to: active.toKg })}
              </HudText>
            </View>
            <TrailMap region={active} currentKg={currentKg} width={Math.min(columnWidth - 24, 362)} />
          </View>

          {nextRegion && nextRegion.status === 'current' && (
            <View style={styles.next}>
              <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
                {g('chart.next').toUpperCase()}
              </HudText>
              <HudText size={16}>{g('chart.nextValue', { kg: nextRegion.toKg, left: Math.max(0, currentKg - nextRegion.toKg).toFixed(1) })}</HudText>
              <View style={styles.nextBar}>
                <XpBar ratio={nextRegion.progress} color={quest.gold} trackColor={quest.bg} height={8} />
              </View>
            </View>
          )}
        </>
      )}

      {view === 'chart' && (
        <>
          <View style={styles.chartPanel}>
            {entries.length === 0 && (
              <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.noLogs}>
                {g('chart.noLogs')}
              </HudText>
            )}
            <WeightChart
              entries={entries}
              startDateISO={startDateISO}
              startWeightKg={startWeightKg}
              goalWeightKg={goalWeightKg}
              now={now}
              width={Math.min(columnWidth - 24, 362)}
            />
          </View>

          <View style={styles.stats}>
            <View accessible accessibilityLabel={`${lost >= 0 ? g('chart.stats.lost') : g('chart.stats.up')} ${Math.abs(lost).toFixed(1)} kg`} style={styles.stat}>
              <HudText size={22} color={lost >= 0 ? quest.xp : quest.hpText}>
                {`${lost >= 0 ? '−' : '+'}${Math.abs(lost).toFixed(1)}`}
              </HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {lost >= 0 ? g('chart.stats.lost') : g('chart.stats.up')} (kg)
              </HudText>
            </View>
            <View accessible accessibilityLabel={`${g('chart.stats.left')} ${Math.max(0, currentKg - goalWeightKg).toFixed(1)} kg`} style={styles.stat}>
              <HudText size={22}>{Math.max(0, currentKg - goalWeightKg).toFixed(1)}</HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('chart.stats.left')} (kg)
              </HudText>
            </View>
            <View accessible accessibilityLabel={`${g('chart.stats.journey')} ${Math.round(journey * 100)}%`} style={styles.stat}>
              <HudText size={22} color={quest.gold}>{`${Math.round(journey * 100)}%`}</HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('chart.stats.journey')}
              </HudText>
            </View>
          </View>

          <View style={styles.bosses}>
            <HudText size={15}>{g('chart.bosses')}</HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('chart.bossHp', { max: game.boss.maxHp.toLocaleString('en-US') })}
            </HudText>
            <View style={styles.bossList}>
              {game.bossHistory.slice(0, 6).map((b, i) => {
                const live = i === 0;
                const week = isoWeekNumber(new Date(`${b.weekKey}T12:00:00`));
                const status = live ? g('chart.bossLive') : b.defeated ? g('chart.bossDown') : g('chart.bossAlive');
                // A week can deal more than the boss's HP; show what counted toward it and cap the bar at full.
                const dmg = Math.min(b.totalDamage, b.maxHp).toLocaleString('en-US');
                return (
                  <View
                    key={b.weekKey}
                    accessible
                    accessibilityLabel={`${g('chart.bossWeek', { n: week })}. ${g('chart.bossDamage', { dmg })}. ${status}`}
                    style={styles.bossRow}
                  >
                    <View style={styles.flex}>
                      <HudText size={14}>{g('chart.bossWeek', { n: week })}</HudText>
                      <HudText size={12} weight="medium" color={quest.textSecondary}>
                        {g('chart.bossDamage', { dmg })}
                      </HudText>
                      <View style={styles.bossBar}>
                        <XpBar ratio={Math.min(1, b.totalDamage / b.maxHp)} color={quest.hp} trackColor={quest.bg} height={6} />
                      </View>
                    </View>
                    <HudText size={12} color={live ? quest.gold : b.defeated ? quest.xp : quest.textSecondary}>
                      {status}
                    </HudText>
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  flex: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, gap: 8 },
  stack: { gap: 10, marginTop: 12 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: quest.border,
    backgroundColor: quest.panel,
    opacity: 0.85,
  },
  activePanel: { marginTop: 12, padding: 12, borderRadius: 20, backgroundColor: '#16122C', borderWidth: 1.5, borderColor: quest.gold, alignItems: 'center' },
  activeHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, alignSelf: 'stretch', marginBottom: 4 },
  next: { marginTop: 12, padding: 14, gap: 4, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.gold, backgroundColor: quest.raised },
  nextBar: { marginTop: 6 },
  eyebrow: { letterSpacing: 1.6 },
  chartPanel: { marginTop: 12, padding: 12, borderRadius: 20, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center' },
  noLogs: { alignSelf: 'stretch', marginBottom: 6 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: { flex: 1, padding: 12, gap: 2, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center' },
  bosses: { marginTop: 20, gap: 2 },
  bossList: { marginTop: 8, gap: 8 },
  bossRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  bossBar: { marginTop: 6 },
});
