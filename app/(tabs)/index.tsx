import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CampHero } from '../../src/components/quest/CampHero';
import { DateChip } from '../../src/components/quest/DateChip';
import { HudText } from '../../src/components/quest/HudText';
import { MissionRings, MissionsSheet } from '../../src/components/quest/MissionsSheet';
import { NextMealCard } from '../../src/components/quest/NextMealCard';
import { QuestIcon, type QuestIconName } from '../../src/components/quest/QuestIcon';
import { FadeInUp } from '../../src/components/quest/motion/FadeInUp';
import { PressScale } from '../../src/components/quest/motion/PressScale';
import { PlayerHeader } from '../../src/components/quest/PlayerHeader';
import { DefaultBossArt } from '../../src/components/quest/StageBossArt';
import { WeeklyBossSheet } from '../../src/components/quest/WeeklyBossSheet';
import { WindowCard } from '../../src/components/quest/WindowCard';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';
import { JournalView } from '../../src/screens/JournalView';
import { MISSION_XP } from '../../src/game/constants';
import { titleKeyForLevel } from '../../src/game/level';
import { useGameText, type GameKey } from '../../src/game/strings';
import { ALWAYS_EXERCISE, estimateMinutes, GROUP_EXERCISES, suggestedGroup } from '../../src/game/training/exercises';
import { progressFor } from '../../src/game/training/progress';
import { useDayEvaluator, useGameState, useNow, useTdeeKcal } from '../../src/game/useGameState';
import { useCelebrationStore } from '../../src/store/useCelebrationStore';
import { useFeelingStore } from '../../src/store/useFeelingStore';
import { useMealModeStore } from '../../src/store/useMealModeStore';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useSelectedDayStore, workingDayKey } from '../../src/store/useSelectedDayStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { showToast } from '../../src/store/useToastStore';
import { useTrainingStore } from '../../src/store/useTrainingStore';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { toDateKey } from '../../src/utils/date';
import { isoWeekNumber } from '../../src/utils/isoWeek';
import { getIfStatus } from '../../src/utils/intermittentFasting';
import { useWaterPlan } from '../../src/water/useWaterPlan';
import { setPendingMealPhoto } from '../../src/food/pendingPhoto';
import { pickPhoto } from '../../src/utils/pickPhoto';

/** Water added by Camp's tile, like the quick-add chip. */
const WATER_STEP_ML = 250;
/** From this hour, a day without a check-in gets the evening check-in card (the user's decision 2, 2026-11-02). */
const EVENING_CHECKIN_HOUR = 19;

function Tile({
  icon,
  title,
  hint,
  tone,
  onPress,
  label,
  corner,
}: {
  icon: QuestIconName;
  title: string;
  hint: string;
  tone: 'gold' | 'mana' | 'plain';
  onPress: () => void;
  label: string;
  corner?: ReactNode;
}) {
  const palette = {
    gold: { bg: quest.panel, border: quest.gold, icon: quest.gold, hint: quest.textSecondary },
    mana: { bg: quest.manaPanel, border: quest.manaBorder, icon: quest.mana, hint: quest.manaText },
    plain: { bg: quest.panel, border: quest.border, icon: quest.xp, hint: quest.textSecondary },
  }[tone];
  return (
    <View style={styles.tileWrap}>
      <PressScale
        wrapperStyle={styles.tileFill}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, { backgroundColor: palette.bg, borderColor: palette.border }, pressed && { opacity: 0.85 }]}
      >
        <QuestIcon name={icon} size={22} color={palette.icon} strokeWidth={2.2} />
        <View style={styles.tileText}>
          <HudText size={15} numberOfLines={1}>
            {title}
          </HudText>
          <HudText size={12} weight="medium" color={palette.hint} numberOfLines={2}>
            {hint}
          </HudText>
        </View>
      </PressScale>
      {corner}
    </View>
  );
}

export default function CampScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const now = useNow();
  const game = useGameState(now);
  const evaluate = useDayEvaluator(now);
  const ifStatus = getIfStatus(now);
  const fasting = useMealModeStore((s) => s.fasting);
  const tdeeKcal = useTdeeKcal();
  const targetDeficitKcal = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [bossOpen, setBossOpen] = useState(false);

  // The day picked with the date chip (today unless changed): the hero card, missions and timeline show it, and the tiles log to it.
  const todayKey = toDateKey(now);
  const dayKey = workingDayKey(useSelectedDayStore((s) => s.selectedKey), now);
  const isToday = dayKey === todayKey;
  const day = isToday ? game.today : evaluate(dayKey);
  const dayDate = new Date(`${dayKey}T12:00:00`);
  const dayLabel = `${g(`weekday.${dayDate.getDay()}` as GameKey)} ${dayKey.slice(8)}/${dayKey.slice(5, 7)}`;
  const dateParams: Record<string, string> = isToday ? {} : { date: dayKey };

  // "Chụp món": the camera opens straight from the tap (on web the file input only opens from a user gesture, Expo SDK 57 docs),
  // then the photo goes to Ghi bữa and is analysed at once. Cancelled: nothing happens; no camera: Ghi bữa opens to pick a photo.
  async function snapMeal() {
    const picked = await pickPhoto('camera');
    if (!picked) return;
    if ('error' in picked) {
      router.push({ pathname: '/add-food', params: dateParams });
      return;
    }
    setPendingMealPhoto(picked.uri);
    router.push({ pathname: '/add-food', params: { ...dateParams, photo: '1' } });
  }

  useLightStatusBar();

  const { boss, level } = game;

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

  // +250 ml tile: logged at once on the picked day, undone from the toast.
  const waterMl = useNutritionStore((s) => s.logs[dayKey]?.waterMl ?? 0);
  const { targetMl: waterTargetMl } = useWaterPlan(dayKey);
  function addWater() {
    const store = useNutritionStore.getState();
    store.addWater(dayKey, WATER_STEP_ML);
    const total = store.logs[dayKey]?.waterMl ?? waterMl + WATER_STEP_ML;
    showToast({
      text: g('quick.waterAdded', { ml: WATER_STEP_ML, total: total.toLocaleString('en-US') }),
      tone: 'mana',
      undo: () => useNutritionStore.getState().addWater(dayKey, -WATER_STEP_ML),
    });
  }

  // "Tập 18′": today's suggested group (A on a rest day, as the Train screen does), started in one tap.
  const progress = useTrainingStore((s) => s.progress);
  const custom = useTrainingStore((s) => s.custom);
  const train = useMemo(() => {
    const group = suggestedGroup(now) ?? 'A';
    const ids = [...GROUP_EXERCISES[group], ALWAYS_EXERCISE];
    const minutes = estimateMinutes(ids.map((id) => ({ id, level: progressFor(progress, id).level })), custom);
    return { group, ids, minutes };
  }, [now, progress, custom]);
  const workoutDone = game.today.missions.find((m) => m.id === 'workout')?.status === 'done';

  // Evening check-in: after 19:00, while today has none.
  const checkedInToday = useFeelingStore((s) => s.records.some((r) => toDateKey(new Date(r.loggedAtISO)) === todayKey));
  const showEvening = isToday && now.getHours() >= EVENING_CHECKIN_HOUR && !checkedInToday;

  // Monday: last week's boss, once, as the "Tổng kết tuần" card.
  const lastWeek = now.getDay() === 1 ? game.bossHistory[1] : undefined;
  const lastWeekDeficit = lastWeek ? lastWeek.days.reduce((sum, d) => sum + (d.cheat || d.deficitKcal == null ? 0 : d.deficitKcal), 0) : 0;
  const lastWeekLogged = lastWeek ? lastWeek.days.filter((d) => d.deficitKcal != null || d.cheat).length : 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 8, paddingBottom: tabClearance }]}
      >
        <FadeInUp index={0}>
          <PlayerHeader level={level} titleKey={titleKeyForLevel(level.level)} streak={game.streak} right={<DateChip now={now} />} />
        </FadeInUp>

        {fasting && (
          <FadeInUp index={1} style={styles.gap}>
            <WindowCard isEatingWindow={ifStatus.isEatingWindow} hoursUntilTransition={ifStatus.hoursUntilTransition} />
          </FadeInUp>
        )}

        <FadeInUp index={2} style={styles.gap}>
          <CampHero
            day={day}
            dateKey={dayKey}
            dayLabel={dayLabel}
            boss={boss}
            tdeeKcal={tdeeKcal}
            targetDeficitKcal={targetDeficitKcal}
            proteinTargetG={proteinTargetG}
            onOpenBoss={() => setBossOpen(true)}
          />
        </FadeInUp>

        <FadeInUp index={3} style={[styles.tiles, styles.gap]}>
          <Tile
            icon="camera"
            tone="gold"
            title={g('camp.tilePhoto')}
            hint={g('camp.tilePhotoHint')}
            label={`${g('camp.tilePhoto')}. ${g('camp.tilePhotoHint')}`}
            onPress={() => {
              void snapMeal();
            }}
          />
          <Tile
            icon="drop"
            tone="mana"
            title={g('camp.tileWater', { ml: WATER_STEP_ML })}
            hint={g('camp.tileWaterHint', { cur: (waterMl / 1000).toFixed(1), target: (waterTargetMl / 1000).toFixed(1) })}
            label={g('camp.tileWaterA11y', { ml: WATER_STEP_ML, cur: (waterMl / 1000).toFixed(1), target: (waterTargetMl / 1000).toFixed(1) })}
            onPress={addWater}
          />
          <Tile
            icon="dumbbell"
            tone="plain"
            title={g('camp.tileTrain', { m: train.minutes })}
            hint={workoutDone ? g('camp.tileTrainDone', { g: train.group }) : g('camp.tileTrainHint', { g: train.group, xp: MISSION_XP.workout })}
            label={g('camp.tileTrainA11y', { g: train.group, m: train.minutes })}
            onPress={() => router.push({ pathname: '/train/session', params: { ids: train.ids.join(','), group: train.group } })}
            corner={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={g('camp.tileTrainMore')}
                onPress={() => router.push('/(tabs)/workout')}
                hitSlop={4}
                style={styles.corner}
              >
                <QuestIcon name="chevron" size={16} color={quest.textSecondary} />
              </Pressable>
            }
          />
        </FadeInUp>

        {showEvening && (
          <FadeInUp index={4} style={styles.gap}>
            <View style={styles.evening}>
              <QuestIcon name="smile" size={22} color={quest.xp} />
              <View style={styles.flex}>
                <HudText size={15}>{g('camp.eveningTitle')}</HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                  {g('camp.eveningHint')}
                </HudText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${g('camp.eveningButton')}: ${g('checkin.title')}`}
                onPress={() => router.push('/checkin')}
                style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}
              >
                <HudText size={13} color={quest.onGold}>
                  {g('camp.eveningButton')}
                </HudText>
              </Pressable>
            </View>
          </FadeInUp>
        )}

        <FadeInUp index={4}>
          <MissionRings day={day} onOpen={() => setMissionsOpen(true)} />
        </FadeInUp>

        {isToday && (
          <FadeInUp index={5}>
            <NextMealCard now={now} />
          </FadeInUp>
        )}

        {lastWeek && (
          <View style={[styles.weekly, styles.gap]}>
            <DefaultBossArt size={40} defeated={lastWeek.defeated} />
            <View style={styles.flex}>
              <View style={styles.weeklyHead}>
                <HudText size={15} numberOfLines={1}>
                  {g('camp.weekly', { n: isoWeekNumber(new Date(`${lastWeek.weekKey}T12:00:00`)) })}
                </HudText>
                <View style={[styles.weeklyBadge, lastWeek.defeated && { backgroundColor: 'rgba(139,255,107,0.14)' }]}>
                  <HudText size={11} color={lastWeek.defeated ? quest.xp : quest.textTertiary}>
                    {g(lastWeek.defeated ? 'camp.weeklyBeaten' : 'camp.weeklyUp')}
                  </HudText>
                </View>
              </View>
              <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                {g('camp.weeklyLine', { kcal: Math.round(lastWeekDeficit).toLocaleString('en-US'), days: lastWeekLogged })}
              </HudText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${g('camp.weeklyView')}: ${g('week.title')}`}
              onPress={() => router.push('/weekly-report')}
              style={({ pressed }) => [styles.ghostPill, pressed && { opacity: 0.85 }]}
            >
              <HudText size={13} color={quest.manaText}>
                {g('camp.weeklyView')}
              </HudText>
            </Pressable>
          </View>
        )}

        {/* The day's timeline stays on Camp; the week strip, figures and cheat-day mark are one tap away in the Journal. */}
        <FadeInUp index={6}>
          <JournalView embedded />
        </FadeInUp>
      </ScrollView>

      <MissionsSheet visible={missionsOpen} onClose={() => setMissionsOpen(false)} day={day} />
      <WeeklyBossSheet visible={bossOpen} onClose={() => setBossOpen(false)} boss={boss} today={game.today} now={now} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  gap: { marginTop: 12 },
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', gap: 8 },
  tileWrap: { flex: 1, minWidth: 0 },
  tileFill: { flex: 1 },
  tile: { flex: 1, minHeight: 96, padding: 12, gap: 10, borderRadius: questRadius.panel, borderWidth: 1.5, justifyContent: 'space-between' },
  tileText: { gap: 2 },
  corner: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  evening: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.xp, backgroundColor: quest.panel },
  pill: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: quest.gold, alignItems: 'center', justifyContent: 'center' },
  weekly: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  weeklyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weeklyBadge: { paddingHorizontal: 8, minHeight: 20, borderRadius: 10, backgroundColor: quest.raised2, justifyContent: 'center' },
  ghostPill: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.manaBorder, alignItems: 'center', justifyContent: 'center' },
});
