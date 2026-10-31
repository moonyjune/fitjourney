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
import { buildStageJourney, stageAsRegion, type StageBoss, type Zone } from '../../src/game/stageBosses';
import { BossDamageLog, BossDamagePanel } from '../../src/components/quest/BossDamageLog';
import { DefaultBossArt, StageBossArt } from '../../src/components/quest/StageBossArt';
import { BanterSection, BossBanterPanel, latestBanterFor } from '../../src/components/quest/BattleBanter';
import { StageBossDetail, bossName, rankName, shortDate, stars, zoneTitle } from '../../src/components/quest/StageBossDetail';
import { PressScale } from '../../src/components/quest/motion/PressScale';
import { PulseRing } from '../../src/components/quest/motion/PulseRing';
import { buildDamageLog, buildWeightLog } from '../../src/game/bossDamage';
import { buildBanterShown } from '../../src/banter/days';
import { formatGameText, useGameText, type GameKey } from '../../src/game/strings';
import { useGameState, useNow } from '../../src/game/useGameState';
import { useBossTalkStore } from '../../src/store/useBossTalkStore';
import { useCheatDayStore } from '../../src/store/useCheatDayStore';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { quest, questRadius } from '../../src/theme/quest';
import { CONTENT_MAX_WIDTH, screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { isoWeekNumber } from '../../src/utils/isoWeek';
import { toDateKey } from '../../src/utils/date';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

type View_ = 'map' | 'chart';
type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

function nodeStatus(b: StageBoss, currentKg: number, g: Translate): string {
  if (b.status === 'defeated') {
    if (!b.defeatedDateKey) return g('stage.defeatedNoDate');
    const on = g('stage.defeatedOn', { date: shortDate(b.defeatedDateKey) });
    return b.daysTaken != null ? `${on} · ${g('stage.daysTaken', { n: b.daysTaken })}` : on;
  }
  if (b.status === 'current') return g('stage.fighting', { kg: Math.max(0, currentKg - b.toKg).toFixed(1) });
  return g('stage.locked', { kg: b.toKg });
}

/** One boss on the journey: portrait on the path, name and rank, its band and when it fell / how far it is. */
function BossNode({ boss, zone, currentKg, onOpen, g }: { boss: StageBoss; zone: Zone; currentKg: number; onOpen: (b: StageBoss) => void; g: Translate }) {
  const name = bossName(boss, g);
  const status = nodeStatus(boss, currentKg, g);
  const range = g('region.range', { from: boss.fromKg, to: boss.toKg });
  const current = boss.status === 'current';
  const locked = boss.status === 'locked';
  const defeated = boss.status === 'defeated';
  const skills = boss.skills.map((s) => g(`stage.skill.${s}` as GameKey)).join(' · ');
  return (
    <PressScale
      scaleTo={0.98}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${zoneTitle(zone, g)}. ${range}. ${status}${locked ? `. ${skills}` : ''}`}
      accessibilityHint={g('stage.open')}
      onPress={() => onOpen(boss)}
      style={[styles.node, current && styles.nodeCurrent, locked && styles.nodeLocked]}
    >
      <View style={[styles.nodeArt, defeated && styles.nodeArtDone, current && styles.nodeArtCurrent]}>
        <StageBossArt archetype={boss.archetype} tier={boss.tier} size={48} defeated={defeated} />
        {defeated && (
          <View style={styles.nodeCheck}>
            <QuestIcon name="check" size={12} color={quest.onGold} />
          </View>
        )}
        {locked && (
          <View style={styles.nodeLock}>
            <QuestIcon name="lock" size={11} color={quest.textSecondary} />
          </View>
        )}
      </View>
      <View style={styles.flex}>
        <View style={styles.nodeHead}>
          <HudText size={15} color={locked ? quest.textTertiary : quest.text} style={styles.flex} numberOfLines={1}>
            {name}
          </HudText>
          <HudText size={11} color={locked ? quest.textSecondary : quest.gold}>
            {stars(boss.tier)}
          </HudText>
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {`${range} · ${rankName(boss.tier, g)}${boss.isFinal ? ` · ${g('stage.final')}` : ''}`}
        </HudText>
        <HudText size={12} color={defeated ? quest.xp : current ? quest.hpText : quest.textSecondary}>
          {status}
        </HudText>
        {locked && (
          <HudText size={11} weight="medium" color={quest.textTertiary} numberOfLines={2}>
            {skills}
          </HudText>
        )}
        {current && (
          <View style={styles.youChip}>
            <HudText size={11} color={quest.onGold}>
              {g('stage.you', { kg: currentKg.toFixed(1) })}
            </HudText>
          </View>
        )}
      </View>
    </PressScale>
  );
}

/** A zone: banner with its name, difficulty, range and progress, then its bosses from the far one down. */
function ZoneSection({ zone, currentKg, onOpen, g }: { zone: Zone; currentKg: number; onOpen: (b: StageBoss) => void; g: Translate }) {
  const pct = Math.round(zone.progress * 100);
  const locked = zone.status === 'locked';
  const borderColor = zone.status === 'current' ? quest.gold : zone.status === 'defeated' ? quest.xp : quest.border;
  return (
    <View style={styles.zone}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${zoneTitle(zone, g)}. ${g('stage.tier', { n: zone.tier })}. ${g('region.range', { from: zone.fromKg, to: zone.toKg })}. ${locked ? g('stage.zoneLocked', { kg: zone.fromKg }) : g('stage.zoneProgress', { done: zone.defeatedCount, total: zone.bosses.length, pct })}`}
        style={[styles.zoneBanner, { borderColor }, locked && styles.zoneBannerLocked]}
      >
        <View style={styles.zoneHead}>
          {locked ? <QuestIcon name="lock" size={16} color={quest.textSecondary} /> : <QuestIcon name="map" size={16} color={borderColor} />}
          <HudText size={16} color={locked ? quest.textSecondary : quest.text} style={styles.flex} numberOfLines={1}>
            {zoneTitle(zone, g)}
          </HudText>
          <HudText size={12} color={locked ? quest.textSecondary : quest.gold}>
            {stars(zone.tier)}
          </HudText>
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {`${g('region.range', { from: zone.fromKg, to: zone.toKg })} · ${
            locked ? g('stage.zoneLocked', { kg: zone.fromKg }) : g('stage.zoneProgress', { done: zone.defeatedCount, total: zone.bosses.length, pct })
          }`}
        </HudText>
        <View style={styles.zoneBar}>
          <XpBar ratio={zone.progress} color={zone.status === 'defeated' ? quest.xp : quest.gold} trackColor={quest.bg} height={6} />
        </View>
      </View>
      <View style={styles.zoneNodes}>
        <View style={styles.pathLine} />
        {[...zone.bosses].reverse().map((b) => (
          <BossNode key={b.index} boss={b} zone={zone} currentKg={currentKg} onOpen={onOpen} g={g} />
        ))}
      </View>
    </View>
  );
}

export default function MapScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const { width: windowWidth } = useWindowDimensions();
  useLightStatusBar();
  const now = useNow();
  const game = useGameState(now);

  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const targetDeficitKcal = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const logs = useNutritionStore((s) => s.logs);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const talks = useBossTalkStore((s) => s.talks);
  const cheatDays = useCheatDayStore((s) => s.days);
  const entries = useWeightStore((s) => s.entries);
  const latest = useWeightStore((s) => s.latest());
  const currentKg = latest?.weightKg ?? startWeightKg;

  const [view, setView] = useState<View_>('map');
  const [openBoss, setOpenBoss] = useState<StageBoss | null>(null);
  const journeyData = useMemo(
    () => buildStageJourney({ startKg: startWeightKg, goalKg: goalWeightKg, currentKg, entries, startDateISO }),
    [startWeightKg, goalWeightKg, currentKg, entries, startDateISO]
  );
  const { bosses, zones, current } = journeyData;
  // Damage log: each day's deficit (from the game replay) as estimated damage against the weigh-ins.
  const damageLog = useMemo(
    () => buildDamageLog({ days: game.days, entries, startKg: startWeightKg, startDateKey: journeyData.startDateKey, bosses }),
    [game.days, entries, startWeightKg, journeyData.startDateKey, bosses]
  );
  // Battle banter: one boss/player exchange per day of the last two weeks (the AI's when written, else the template).
  const todayKey = toDateKey(now);
  const banter = useMemo(
    () =>
      buildBanterShown({
        days: damageLog.days,
        bosses,
        evaluations: new Map(game.days.map((d) => [d.dateKey, d])),
        logs,
        workoutEntries,
        targetKcal: targetDeficitKcal,
        proteinTargetG,
        cheatDays,
        talks,
        todayKey,
        // The exchange is written in Vietnamese, so the bosses keep their Vietnamese names whatever the app language.
        bossName: (b) => formatGameText('vi', `stage.boss.${b.archetype}` as GameKey),
        skillName: (sk) => formatGameText('vi', `stage.skill.${sk}` as GameKey),
      }),
    [damageLog.days, bosses, game.days, logs, workoutEntries, targetDeficitKcal, proteinTargetG, cheatDays, talks, todayKey]
  );
  const banterByDay = useMemo(() => new Map(banter.map((d) => [d.date, d])), [banter]);
  const openBanter = openBoss ? latestBanterFor(banter, openBoss.index) : undefined;
  const weightRows = useMemo(() => buildWeightLog(entries, bosses, startWeightKg, journeyData.startDateKey), [entries, bosses, startWeightKg, journeyData.startDateKey]);
  // Where each boss fell, marked on the weight chart.
  const fallMarks = useMemo(
    () => bosses.flatMap((b) => (b.defeatedDateKey ? [{ kg: b.toKg, dateKey: b.defeatedDateKey }] : [])),
    [bosses]
  );
  const currentZone = current ? zones[current.zone] : zones[zones.length - 1];
  const finalBoss = bosses[bosses.length - 1];

  // Content column = window width (capped) minus the 16 px gutters and the card padding.
  const columnWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32;
  const lost = startWeightKg - currentKg;
  const totalToLose = Math.max(0, startWeightKg - goalWeightKg);
  const journey = totalToLose > 0 ? Math.max(0, Math.min(1, lost / totalToLose)) : 1;

  const header = currentZone
    ? g(currentZone.isSummit ? 'map.headerSummit' : 'map.header', { kg: currentKg.toFixed(1), n: currentZone.index + 1 })
    : `${currentKg.toFixed(1)} kg`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}>
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

      {view === 'map' && bosses.length === 0 && (
        <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.noJourney}>
          {g('stage.noJourney')}
        </HudText>
      )}

      {view === 'map' && bosses.length > 0 && (
        <>
          <View style={styles.stats}>
            <View accessible accessibilityLabel={`${lost >= 0 ? g('chart.stats.lost') : g('chart.stats.up')} ${Math.abs(lost).toFixed(1)} kg`} style={styles.stat}>
              <HudText size={22} color={lost >= 0 ? quest.xp : quest.hpText}>
                {`${lost >= 0 ? '−' : '+'}${Math.abs(lost).toFixed(1)}`}
              </HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {lost >= 0 ? g('chart.stats.lost') : g('chart.stats.up')} (kg)
              </HudText>
            </View>
            <View accessible accessibilityLabel={`${journeyData.defeatedCount}/${bosses.length} ${g('stage.bossesDown')}`} style={styles.stat}>
              <HudText size={22} color={quest.gold}>{`${journeyData.defeatedCount}/${bosses.length}`}</HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('stage.bossesDown')}
              </HudText>
            </View>
            <View accessible accessibilityLabel={`${g('chart.stats.left')} ${journeyData.leftKg.toFixed(1)} kg`} style={styles.stat}>
              <HudText size={22}>{journeyData.leftKg.toFixed(1)}</HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {g('chart.stats.left')} (kg)
              </HudText>
            </View>
          </View>

          {current ? (
            <PressScale
              scaleTo={0.98}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${g('stage.current')}. ${bossName(current, g)}. ${g('stage.tier', { n: current.tier })}. ${g('stage.hp', { left: current.hpLeftKg.toFixed(1), max: current.hpKg })}`}
              accessibilityHint={g('stage.open')}
              onPress={() => setOpenBoss(current)}
              style={styles.hero}
            >
              <PulseRing color={quest.hp} borderRadius={20} />
              <View style={styles.heroArt}>
                <StageBossArt archetype={current.archetype} tier={current.tier} size={96} idle />
              </View>
              <View style={styles.flex}>
                <HudText size={11} color={quest.hpText} style={styles.eyebrow}>
                  {g('stage.current').toUpperCase()}
                </HudText>
                <HudText size={19} numberOfLines={1}>
                  {bossName(current, g)}
                </HudText>
                <HudText size={12} color={quest.gold}>
                  {`${stars(current.tier)} · ${rankName(current.tier, g)}`}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                  {zoneTitle(zones[current.zone], g)}
                </HudText>
                <View style={styles.heroBar}>
                  <XpBar ratio={current.hpKg > 0 ? current.hpLeftKg / current.hpKg : 0} color={quest.hp} trackColor={quest.bg} height={8} from={1} delay={300} />
                </View>
                <HudText size={12} color={quest.hpText}>
                  {g('stage.hp', { left: current.hpLeftKg.toFixed(1), max: current.hpKg })}
                </HudText>
                <View style={styles.chips}>
                  {current.skills.map((sk) => (
                    <View key={sk} style={styles.chip}>
                      <HudText size={11} color={quest.textTertiary}>
                        {g(`stage.skill.${sk}` as GameKey)}
                      </HudText>
                    </View>
                  ))}
                </View>
              </View>
            </PressScale>
          ) : (
            <View accessible style={styles.victory}>
              <QuestIcon name="check" size={22} color={quest.xp} />
              <HudText size={16} color={quest.xp} style={styles.flex}>
                {g('stage.victory')}
              </HudText>
            </View>
          )}

          {current && (
            <View style={styles.activePanel}>
              <View style={styles.activeHead}>
                <HudText size={17} color={quest.gold} style={styles.flex}>
                  {zoneTitle(zones[current.zone], g)}
                </HudText>
                <HudText size={13} weight="medium" color={quest.textSecondary}>
                  {g('region.range', { from: current.fromKg, to: current.toKg })}
                </HudText>
              </View>
              <TrailMap region={stageAsRegion(current)} currentKg={currentKg} width={Math.min(columnWidth - 24, 362)} />
            </View>
          )}

          {current && (
            <View style={styles.next}>
              <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
                {g('chart.next').toUpperCase()}
              </HudText>
              <HudText size={16}>{g('chart.nextValue', { kg: current.toKg, left: Math.max(0, currentKg - current.toKg).toFixed(1) })}</HudText>
              <View style={styles.nextBar}>
                <XpBar ratio={current.progress} color={quest.gold} trackColor={quest.bg} height={8} />
              </View>
            </View>
          )}

          <View style={styles.journeyHead}>
            <HudText size={18} accessibilityRole="header">
              {g('stage.journey')}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('stage.journeyHint')}
            </HudText>
          </View>

          <View style={[styles.endpoint, finalBoss?.status === 'defeated' && styles.endpointDone]}>
            <QuestIcon name="flame" size={16} color={quest.gold} />
            <HudText size={13} color={quest.gold} style={styles.flex}>
              {g('stage.goal', { kg: goalWeightKg })}
            </HudText>
            {finalBoss?.defeatedDateKey && (
              <HudText size={12} color={quest.xp}>
                {shortDate(finalBoss.defeatedDateKey)}
              </HudText>
            )}
          </View>

          {[...zones].reverse().map((z) => (
            <ZoneSection key={z.index} zone={z} currentKg={currentKg} onOpen={setOpenBoss} g={g} />
          ))}

          <View style={[styles.endpoint, styles.endpointDone]}>
            <QuestIcon name="camp" size={16} color={quest.xp} />
            <HudText size={13} style={styles.flex}>
              {g('stage.start', { kg: startWeightKg })}
            </HudText>
            {journeyData.startDateKey && (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {shortDate(journeyData.startDateKey)}
              </HudText>
            )}
          </View>

          <BossDamageLog
            log={damageLog}
            weightRows={weightRows}
            bosses={bosses}
            currentKg={currentKg}
            targetKcal={targetDeficitKcal}
            cheatDays={cheatDays}
            onOpenBoss={setOpenBoss}
            talks={banterByDay}
          />

          <BanterSection shown={banter} todayKey={todayKey} />

          <StageBossDetail boss={openBoss} zone={openBoss ? zones[openBoss.zone] : undefined} currentKg={currentKg} onClose={() => setOpenBoss(null)}>
            {openBanter && <BossBanterPanel shown={openBanter} />}
            {openBoss && (
              <BossDamagePanel
                boss={openBoss}
                damage={damageLog.perBoss.find((d) => d.index === openBoss.index)}
                log={damageLog}
                bosses={bosses}
                targetKcal={targetDeficitKcal}
                cheatDays={cheatDays}
                talks={banterByDay}
              />
            )}
          </StageBossDetail>
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
              marks={fallMarks}
            />
            {fallMarks.length > 0 && (
              <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.noLogs}>
                {g('dmg.chartMarks')}
              </HudText>
            )}
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
                    <DefaultBossArt size={36} defeated={b.defeated} />
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
  noJourney: { marginTop: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  heroArt: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
  heroBar: { marginTop: 6, marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: quest.raised2, borderWidth: 1, borderColor: quest.border },
  victory: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.xp, backgroundColor: quest.panel },
  journeyHead: { marginTop: 24, gap: 2 },
  endpoint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderStyle: 'dashed', borderColor: quest.border, backgroundColor: quest.panel },
  endpointDone: { borderStyle: 'solid' },
  zone: { marginTop: 12 },
  zoneBanner: { gap: 4, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, backgroundColor: quest.raised },
  zoneBannerLocked: { backgroundColor: quest.panel, borderStyle: 'dashed' },
  zoneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneBar: { marginTop: 4 },
  zoneNodes: { gap: 8, marginTop: 8, paddingLeft: 12 },
  pathLine: { position: 'absolute', left: 50, top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: quest.border },
  node: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  nodeCurrent: { borderColor: quest.hp, backgroundColor: quest.bossPanel },
  nodeLocked: { borderStyle: 'dashed', opacity: 0.85 },
  nodeArt: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg, borderWidth: 2, borderColor: quest.border },
  nodeArtDone: { borderColor: quest.xp },
  nodeArtCurrent: { borderColor: quest.hp },
  nodeCheck: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.xp },
  nodeLock: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.raised2 },
  nodeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  youChip: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: quest.xp },
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
