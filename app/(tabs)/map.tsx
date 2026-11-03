import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../../src/components/quest/HudText';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { TrailMap } from '../../src/components/quest/TrailMap';
import { XpBar } from '../../src/components/quest/XpBar';
import { buildStageJourney, stageAsRegion, type StageBoss, type Zone } from '../../src/game/stageBosses';
import { BossDamageLog, BossDamagePanel } from '../../src/components/quest/BossDamageLog';
import { StageBossArt } from '../../src/components/quest/StageBossArt';
import { BanterSection, BossBanterPanel, latestBanterFor, useAutoBanter } from '../../src/components/quest/BattleBanter';
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
import { toDateKey } from '../../src/utils/date';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

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

/** One boss on the trail: a round node (✓ defeated, gold ring while fighting, 🔒 locked), name, band and status. Tap = its sheet. */
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
      style={[styles.node, locked && styles.nodeLocked]}
    >
      <View style={[styles.dot, defeated && styles.dotDone, current && styles.dotCurrent]}>
        <StageBossArt archetype={boss.archetype} tier={boss.tier} size={40} defeated={defeated} />
        {defeated && (
          <View style={styles.dotBadge}>
            <QuestIcon name="check" size={12} color={quest.onGold} />
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
        {current && (
          <View style={styles.youChip}>
            <HudText size={11} color={quest.onGold}>
              {g('stage.you', { kg: currentKg.toFixed(1) })}
            </HudText>
          </View>
        )}
      </View>
      <QuestIcon name={locked ? 'lock' : 'chevron'} size={14} color={current ? quest.gold : quest.textSecondary} />
    </PressScale>
  );
}

/** A zone of the trail: its name and band, then its bosses in the order they are met, on a dashed path. */
function ZoneSection({ zone, currentKg, onOpen, g }: { zone: Zone; currentKg: number; onOpen: (b: StageBoss) => void; g: Translate }) {
  const pct = Math.round(zone.progress * 100);
  const locked = zone.status === 'locked';
  const progress = locked ? g('stage.zoneLocked', { kg: zone.fromKg }) : g('stage.zoneProgress', { done: zone.defeatedCount, total: zone.bosses.length, pct });
  return (
    <View style={styles.zone}>
      <View accessible accessibilityRole="header" accessibilityLabel={`${zoneTitle(zone, g)}. ${g('stage.tier', { n: zone.tier })}. ${g('region.range', { from: zone.fromKg, to: zone.toKg })}. ${progress}`} style={styles.zoneHead}>
        <View style={styles.flex}>
          <HudText size={13} color={zone.status === 'current' ? quest.gold : quest.textSecondary} numberOfLines={1}>
            {zoneTitle(zone, g)}
          </HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {progress}
          </HudText>
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('region.range', { from: zone.fromKg, to: zone.toKg })}
        </HudText>
      </View>
      <View style={styles.zoneNodes}>
        <View style={styles.pathLine} />
        {zone.bosses.map((b) => (
          <BossNode key={b.index} boss={b} zone={zone} currentKg={currentKg} onOpen={onOpen} g={g} />
        ))}
      </View>
    </View>
  );
}

/** Journey (Design/uiux-proposal/html/04-map-after.html): the boss blocking the road, big, with its HP in kg and how much is left to
 *  defeat it; lost / bosses / left; the current stage's trail; every boss as a node by zone down to the goal; the latest line of
 *  banter. A boss's sheet (dialogs/20) holds its skills, the banter (AI) and the damage log; the weight chart is on the weight page. */
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
  useAutoBanter(banter, todayKey);
  const banterByDay = useMemo(() => new Map(banter.map((d) => [d.date, d])), [banter]);
  const weightRows = useMemo(() => buildWeightLog(entries, bosses, startWeightKg, journeyData.startDateKey), [entries, bosses, startWeightKg, journeyData.startDateKey]);
  const currentZone = current ? zones[current.zone] : zones[zones.length - 1];
  const finalBoss = bosses[bosses.length - 1];
  /** The boss "Chi tiết boss" opens: the one being fought, or the last one once every boss is down. */
  const featured = current ?? finalBoss;
  const latestLine = banter[0]?.text.lines.find((l) => l.speaker === 'boss') ?? banter[0]?.text.lines[0];

  // Content column = window width (capped) minus the 16 px gutters and the card padding.
  const columnWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32;
  const lost = startWeightKg - currentKg;

  const header = currentZone
    ? g(currentZone.isSummit ? 'map.headerSummit' : 'map.header', { kg: currentKg.toFixed(1), n: currentZone.index + 1 })
    : `${currentKg.toFixed(1)} kg`;
  const openIsFeatured = openBoss != null && featured != null && openBoss.index === featured.index;
  const openBanter = openBoss ? latestBanterFor(banter, openBoss.index) : undefined;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[screenMaxWidthStyle, { paddingBottom: tabClearance }]}>
      {/* Hero: the boss blocking the road. */}
      <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
        <View style={styles.heroHead}>
          <View style={styles.flex}>
            <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
              {header}
            </HudText>
            <HudText size={22} accessibilityRole="header">
              {g('map.title')}
            </HudText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={g('journey.weightChipA11y')} onPress={() => router.push('/weight')} style={styles.chip}>
            <QuestIcon name="chart" size={16} color={quest.gold} />
            <HudText size={13}>{g('journey.weightChip')}</HudText>
          </Pressable>
        </View>

        {bosses.length === 0 ? (
          <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.noJourney}>
            {g('stage.noJourney')}
          </HudText>
        ) : current ? (
          <PressScale
            scaleTo={0.98}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${g('stage.current')}. ${bossName(current, g)}. ${g('stage.tier', { n: current.tier })}. ${g('stage.hp', { left: current.hpLeftKg.toFixed(1), max: current.hpKg })}`}
            accessibilityHint={g('stage.open')}
            onPress={() => setOpenBoss(current)}
            style={styles.heroBody}
          >
            <View style={styles.heroArt}>
              <PulseRing color={quest.hp} borderRadius={90} />
              <StageBossArt archetype={current.archetype} tier={current.tier} size={170} idle />
            </View>
            <View style={styles.heroNameRow}>
              <HudText size={18} style={styles.flex} numberOfLines={1}>
                {bossName(current, g)}
              </HudText>
              <View style={styles.hpBadge}>
                <HudText size={11} color={quest.hpText}>
                  {g('stage.tier', { n: current.tier })}
                </HudText>
              </View>
            </View>
            <XpBar ratio={current.hpKg > 0 ? current.hpLeftKg / current.hpKg : 0} color={quest.hp} trackColor={quest.bg} height={12} from={1} delay={300} />
            <View style={styles.heroNameRow}>
              <HudText size={13} color={quest.hpText} style={styles.flex}>
                {g('journey.toDefeat', { kg: Math.max(0, currentKg - current.toKg).toFixed(1) })}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {`${currentKg.toFixed(1)} → ${current.toKg} kg · ${g('stage.hp', { left: current.hpLeftKg.toFixed(1), max: current.hpKg })}`}
              </HudText>
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
      </View>

      {bosses.length > 0 && (
        <View style={styles.body}>
          <View style={styles.badges}>
            <View style={[styles.badge, { borderColor: lost >= 0 ? quest.xp : quest.hp }]}>
              <HudText size={12} color={lost >= 0 ? quest.xp : quest.hpText}>
                {lost >= 0 ? g('journey.lost', { kg: lost.toFixed(1) }) : g('journey.up', { kg: Math.abs(lost).toFixed(1) })}
              </HudText>
            </View>
            <View accessible accessibilityLabel={`${journeyData.defeatedCount}/${bosses.length} ${g('stage.bossesDown')}`} style={[styles.badge, { borderColor: quest.gold }]}>
              <HudText size={12} color={quest.gold}>
                {g('journey.bosses', { done: journeyData.defeatedCount, total: bosses.length })}
              </HudText>
            </View>
            <View style={styles.badge}>
              <HudText size={12} color={quest.text}>
                {g('journey.left', { kg: journeyData.leftKg.toFixed(1) })}
              </HudText>
            </View>
          </View>

          {current && (
            <View style={styles.trailPanel}>
              <TrailMap region={stageAsRegion(current)} currentKg={currentKg} width={Math.min(columnWidth - 24, 362)} />
            </View>
          )}

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

          {zones.map((z) => (
            <ZoneSection key={z.index} zone={z} currentKg={currentKg} onOpen={setOpenBoss} g={g} />
          ))}

          <View style={[styles.endpoint, finalBoss?.status === 'defeated' && styles.endpointDone]}>
            <QuestIcon name="flame" size={16} color={quest.gold} />
            <View style={styles.flex}>
              <HudText size={14} color={quest.gold}>
                {g('stage.goal', { kg: goalWeightKg })}
              </HudText>
              {finalBoss?.status !== 'defeated' && (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('journey.goalMeta', { kg: journeyData.leftKg.toFixed(1) })}
                </HudText>
              )}
            </View>
            {finalBoss?.defeatedDateKey && (
              <HudText size={12} color={quest.xp}>
                {shortDate(finalBoss.defeatedDateKey)}
              </HudText>
            )}
          </View>

          {/* The latest line of banter; the rest is in the boss's sheet. */}
          <View style={styles.sectionHead}>
            <HudText size={17} accessibilityRole="header" style={styles.flex}>
              {g('journey.banterTitle')}
            </HudText>
            {featured && (
              <Pressable accessibilityRole="button" accessibilityLabel={g('stage.open')} onPress={() => setOpenBoss(featured)} hitSlop={8} style={styles.headLink}>
                <HudText size={12} color={quest.gold}>
                  {g('journey.bossDetail')}
                </HudText>
              </Pressable>
            )}
          </View>
          {banter[0] && latestLine ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${bossName(banter[0].boss, g)}: ${latestLine.text}`} onPress={() => setOpenBoss(featured ?? banter[0].boss)} style={styles.banter}>
              <StageBossArt archetype={banter[0].boss.archetype} tier={banter[0].boss.tier} size={32} />
              <HudText size={13} weight="medium" color={quest.text} style={styles.flex}>
                {`“${latestLine.text}”`}
              </HudText>
            </Pressable>
          ) : (
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('banter.empty')}
            </HudText>
          )}
          {featured && (
            <Pressable accessibilityRole="link" accessibilityLabel={g('journey.fullLog')} onPress={() => setOpenBoss(featured)} style={styles.link}>
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('journey.fullLog')}
              </HudText>
              <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
            </Pressable>
          )}
        </View>
      )}

      <StageBossDetail boss={openBoss} zone={openBoss ? zones[openBoss.zone] : undefined} currentKg={currentKg} onClose={() => setOpenBoss(null)}>
        {openBoss && !openIsFeatured && openBanter && <BossBanterPanel shown={openBanter} />}
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
        {/* The boss being fought carries the whole banter (AI writes, 14 days) and the whole damage log. */}
        {openIsFeatured && <BanterSection shown={banter} todayKey={todayKey} />}
        {openIsFeatured && (
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
        )}
      </StageBossDetail>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  flex: { flex: 1, minWidth: 0 },
  hero: { paddingHorizontal: 16, paddingBottom: 14, gap: 8, backgroundColor: quest.bossPanel, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderWidth: 1.5, borderTopWidth: 0, borderColor: quest.bossBorder },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  noJourney: { marginVertical: 16 },
  heroBody: { gap: 6 },
  heroArt: { alignSelf: 'center', width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center' },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hpBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: quest.hp, backgroundColor: quest.bg },
  victory: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.xp, backgroundColor: quest.panel },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  trailPanel: { padding: 12, borderRadius: 20, backgroundColor: '#16122C', borderWidth: 1.5, borderColor: quest.gold, alignItems: 'center' },
  endpoint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderStyle: 'dashed', borderColor: quest.border, backgroundColor: quest.panel },
  endpointDone: { borderStyle: 'solid' },
  zone: { gap: 8 },
  zoneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneNodes: { gap: 8 },
  pathLine: { position: 'absolute', left: 37, top: 20, bottom: 20, width: 3, borderRadius: 2, backgroundColor: quest.border },
  node: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 8, borderRadius: questRadius.row },
  nodeLocked: { opacity: 0.8 },
  dot: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.panel, borderWidth: 2, borderColor: quest.border },
  dotDone: { borderColor: quest.xp },
  dotCurrent: { borderColor: quest.gold, borderWidth: 3 },
  dotBadge: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.xp },
  nodeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  youChip: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: quest.xp },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  headLink: { minHeight: 44, justifyContent: 'center' },
  banter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
});
