import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BossCard } from '../../src/components/quest/BossCard';
import { HudText } from '../../src/components/quest/HudText';
import { MissionRow } from '../../src/components/quest/MissionRow';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { FadeInUp } from '../../src/components/quest/motion/FadeInUp';
import { PressScale } from '../../src/components/quest/motion/PressScale';
import { PlayerHeader } from '../../src/components/quest/PlayerHeader';
import { WindowCard } from '../../src/components/quest/WindowCard';
import { MISSION_XP, PERFECT_DAY_BONUS_XP, WORKOUT_MIN_MINUTES, type MissionId } from '../../src/game/constants';
import { titleKeyForLevel } from '../../src/game/level';
import type { DayEvaluation, MissionResult } from '../../src/game/missions';
import { useGameText, type GameKey } from '../../src/game/strings';
import { useGameState, useNow } from '../../src/game/useGameState';
import { useCelebrationStore } from '../../src/store/useCelebrationStore';
import { getIfStatus } from '../../src/utils/intermittentFasting';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { quest } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { DinnerCard } from '../../src/components/quest/DinnerCard';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

interface MissionCopy {
  title: string;
  subtitle: string;
  statusLabel: string;
  progress?: number;
}

function describeMission(m: MissionResult, day: DayEvaluation, g: Translate): MissionCopy {
  const exceeded = m.status === 'missed' && m.value > m.target && m.id !== 'workout';
  const statusKey: GameKey = exceeded ? 'status.exceeded' : (`status.${m.status}` as GameKey);
  let title: string;
  let sub: string;
  let progress: number | undefined;

  switch (m.id) {
    case 'workout':
      title = g('mission.workout');
      sub =
        m.value >= m.target
          ? g('sub.workoutDone', { min: Math.round(m.value), kcal: Math.round(day.burnedKcal) })
          : g('sub.workoutOpen', { n: WORKOUT_MIN_MINUTES });
      progress = m.target > 0 ? m.value / m.target : 0;
      break;
    case 'deficit':
      title = g('mission.deficit', { n: m.target });
      sub = day.deficitKcal == null ? g('sub.deficitNone') : g('sub.deficit', { kcal: Math.round(day.deficitKcal).toLocaleString('en-US') });
      progress = m.target > 0 ? Math.max(0, m.value) / m.target : 0;
      break;
    case 'protein':
      title = g('mission.protein', { n: Math.round(m.target) });
      sub = g('sub.protein', { cur: Math.round(m.value), target: Math.round(m.target) });
      progress = m.target > 0 ? m.value / m.target : 0;
      break;
    case 'purine':
      title = g('mission.purine', { n: m.target });
      sub = g('sub.purine', { n: Math.round(m.value) });
      break;
    case 'salt':
      title = g('mission.salt', { n: m.target });
      sub = g('sub.salt', { n: m.value.toFixed(1) });
      break;
    case 'sugar':
      title = g('mission.sugar', { n: m.target });
      sub = g('sub.sugar', { n: Math.round(m.value) });
      break;
    case 'junk':
      title = g('mission.junk');
      sub = g('sub.junk', { n: m.value });
      break;
  }

  const suffix = m.status === 'holding' ? g('status.holding') : m.status === 'missed' ? g(statusKey) : '';
  return { title, subtitle: suffix ? `${sub} · ${suffix}` : sub, statusLabel: g(statusKey), progress };
}

/** Which tab logs the data behind each mission, so tapping a row jumps to where you can act on it. */
const MISSION_TARGET: Partial<Record<MissionId, '/(tabs)/workout' | '/(tabs)/nutrition'>> = {
  workout: '/(tabs)/workout',
  protein: '/(tabs)/nutrition',
  purine: '/(tabs)/nutrition',
  salt: '/(tabs)/nutrition',
  sugar: '/(tabs)/nutrition',
  junk: '/(tabs)/nutrition',
};

function CampLink({ icon, label, onPress }: { icon: 'list' | 'smile'; label: string; onPress: () => void }) {
  return (
    <PressScale
      wrapperStyle={styles.linkWrap}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.85 }]}
    >
      <QuestIcon name={icon} size={18} color={quest.gold} />
      <HudText size={13} numberOfLines={1} style={styles.linkText}>
        {label}
      </HudText>
    </PressScale>
  );
}

export default function CampScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const now = useNow();
  const game = useGameState(now);
  const ifStatus = getIfStatus(now);

  useLightStatusBar();

  const { today, boss, level } = game;

  // A level-up is celebrated once. The first time we ever see the player, their current level is simply
  // recorded (no celebration for progress made before this existed); a lower level (a log was deleted)
  // quietly lowers the mark so earning it again does celebrate.
  const seenLevel = useCelebrationStore((s) => s.seenLevel);
  const markSeen = useCelebrationStore((s) => s.markSeen);
  const celebrating = useRef<number | null>(null);
  useEffect(() => {
    if (seenLevel === null || level.level < seenLevel) markSeen(level.level);
    else if (level.level > seenLevel && celebrating.current !== level.level) {
      celebrating.current = level.level;
      router.push({ pathname: '/level-up', params: { from: seenLevel, to: level.level } });
    }
  }, [level.level, seenLevel, markSeen]);
  const todayDamage = boss.days.length > 0 ? boss.days[boss.days.length - 1].damage : 0;
  const counts = {
    done: today.missions.filter((m) => m.status === 'done').length,
    holding: today.missions.filter((m) => m.status === 'holding').length,
    open: today.missions.filter((m) => m.status === 'open').length,
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}
      >
        <FadeInUp index={0}>
          <PlayerHeader level={level} titleKey={titleKeyForLevel(level.level)} streak={game.streak} />
        </FadeInUp>

        <FadeInUp index={1} style={styles.gap}>
          <WindowCard isEatingWindow={ifStatus.isEatingWindow} hoursUntilTransition={ifStatus.hoursUntilTransition} />
        </FadeInUp>
        <FadeInUp index={2} style={styles.gap}>
          <BossCard boss={boss} todayDamage={todayDamage} onPress={() => router.push('/boss')} />
        </FadeInUp>

        <FadeInUp index={3} style={styles.gap}>
          <DinnerCard now={now} />
        </FadeInUp>

        <FadeInUp index={3} style={[styles.links, styles.gap]}>
          <CampLink icon="list" label={g('journal.title')} onPress={() => router.push('/journal')} />
          <CampLink icon="smile" label={g('checkin.title')} onPress={() => router.push('/checkin')} />
        </FadeInUp>

        <FadeInUp index={4} style={[styles.sectionHead, styles.gap]}>
          <HudText size={17} accessibilityRole="header">
            {g('missions.title')}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('missions.summary', counts)}
          </HudText>
        </FadeInUp>

        <View style={styles.list}>
          {today.missions.map((m, i) => {
            const copy = describeMission(m, today, g);
            const target = MISSION_TARGET[m.id];
            return (
              <FadeInUp key={m.id} index={5 + i}>
                <MissionRow
                  title={copy.title}
                  subtitle={copy.subtitle}
                  statusLabel={copy.statusLabel}
                  status={m.status}
                  xp={MISSION_XP[m.id]} // the reward on offer; the row styles itself as earned once done
                  progress={copy.progress}
                  onPress={target ? () => router.push(target) : undefined}
                />
              </FadeInUp>
            );
          })}
        </View>

        <HudText size={12} weight="medium" color={today.perfect ? quest.gold : quest.textSecondary} style={styles.centerNote}>
          {today.perfect ? g('missions.perfectDone', { n: PERFECT_DAY_BONUS_XP }) : g('missions.perfect', { n: PERFECT_DAY_BONUS_XP })}
        </HudText>
        <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.centerNote}>
          {g('missions.estimateNote')}
        </HudText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  scroll: { flex: 1 },
  // Extra bottom padding keeps the last row clear of the floating tab bar.
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  gap: { marginTop: 12 },
  links: { flexDirection: 'row', gap: 10 },
  linkWrap: { flex: 1 },
  link: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  linkText: { flexShrink: 1 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20 },
  list: { gap: 8, marginTop: 8 },
  centerNote: { textAlign: 'center', marginTop: 12 },
});
