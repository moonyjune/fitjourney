import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExerciseFigure } from '../../src/components/quest/ExerciseFigure';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { MISSION_XP } from '../../src/game/constants';
import { useGameText, type GameKey } from '../../src/game/strings';
import {
  ALWAYS_EXERCISE,
  estimateMinutes,
  EXERCISE_BY_ID,
  EXERCISES,
  GROUP_EXERCISES,
  GROUP_ORDER,
  prescriptionFor,
  suggestedGroup,
  type ExerciseId,
  type GroupId,
} from '../../src/game/training/exercises';
import { exerciseName, formatAmount } from '../../src/game/training/format';
import { progressFor } from '../../src/game/training/progress';
import { useTrainingStore } from '../../src/store/useTrainingStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { toDateKey } from '../../src/utils/date';
import { useNow } from '../../src/game/useGameState';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

const MAX_PICKS = 3;
const MIN_PICKS = 2;

export default function TrainScreen() {
  const g = useGameText();
  const language = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const now = useNow(60_000);
  const progress = useTrainingStore((s) => s.progress);
  const entries = useWorkoutStore((s) => s.entries);

  const suggested = suggestedGroup(now);
  const [group, setGroup] = useState<GroupId>(suggested ?? 'A');
  const [picked, setPicked] = useState<ExerciseId[]>(GROUP_EXERCISES[suggested ?? 'A']);
  const [limitHint, setLimitHint] = useState(false);

  const todayKey = toDateKey(now);
  const todayEntries = useMemo(() => entries.filter((e) => toDateKey(new Date(e.dateISO)) === todayKey), [entries, todayKey]);

  function chooseGroup(next: GroupId) {
    setGroup(next);
    setPicked(GROUP_EXERCISES[next]);
    setLimitHint(false);
  }

  function toggle(id: ExerciseId) {
    if (picked.includes(id)) {
      setPicked(picked.filter((p) => p !== id));
      setLimitHint(false);
    } else if (picked.length >= MAX_PICKS) {
      setLimitHint(true);
    } else {
      setPicked([...picked, id]);
    }
  }

  const levelOf = (id: ExerciseId) => progressFor(progress, id).level;
  const sessionIds = [...picked, ALWAYS_EXERCISE];
  const minutes = estimateMinutes(sessionIds.map((id) => ({ id, level: levelOf(id) })));
  const canStart = picked.length >= MIN_PICKS;

  const dayName = g(`weekday.${now.getDay()}` as GameKey);
  const hint = suggested === null
    ? g('train.suggestedRest', { g: group })
    : suggested === group
      ? g('train.suggested', { g: suggested })
      : g('train.swapped', { s: suggested, g: group });

  function start() {
    router.push({ pathname: '/train/session', params: { ids: sessionIds.join(','), group } });
  }

  const tileIds = EXERCISES.filter((e) => e.id !== ALWAYS_EXERCISE).map((e) => e.id);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}>
        <View style={styles.titleRow}>
          <View style={styles.iconBox}>
            <QuestIcon name="dumbbell" size={26} color={quest.gold} />
          </View>
          <View style={styles.flex}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('train.eyebrow', { day: dayName, group }).toUpperCase()}
            </HudText>
            <HudText size={22} accessibilityRole="header" numberOfLines={1}>
              {g('train.title')}
            </HudText>
          </View>
          <View style={styles.xpPill}>
            <HudText size={14} color={quest.xp}>
              {g('train.d.xp', { n: MISSION_XP.workout })}
            </HudText>
          </View>
        </View>

        <View style={styles.block}>
          <QuestSegment<GroupId>
            accessibilityLabel={g('train.groupsLabel')}
            value={group}
            onChange={chooseGroup}
            options={GROUP_ORDER.map((id) => ({ value: id, label: g(`train.group.${id}` as GameKey) }))}
          />
          <View style={styles.hintRow}>
            <QuestIcon name="swap" size={14} color={quest.manaText} />
            <HudText size={13} weight="medium" color={quest.manaText} style={styles.flex}>
              {hint}
            </HudText>
          </View>
        </View>

        {todayEntries.length > 0 && (
          <View style={styles.doneCard}>
            <QuestIcon name="check" size={18} color={quest.xp} strokeWidth={2.6} />
            <View style={styles.flex}>
              <HudText size={14}>{g('train.todayDone')}</HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('train.todayDoneMeta', {
                  min: todayEntries.reduce((s, e) => s + e.durationMin, 0),
                  kcal: Math.round(todayEntries.reduce((s, e) => s + e.caloriesBurned, 0)),
                })}
              </HudText>
            </View>
          </View>
        )}

        <View style={styles.pickHeader}>
          <HudText size={18}>{g('train.pickTitle')}</HudText>
          <HudText size={13} color={limitHint ? quest.hpText : quest.gold}>
            {g('train.picked', { n: picked.length })}
          </HudText>
        </View>
        {limitHint && (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityLiveRegion="polite">
            {g('train.pickMax')}
          </HudText>
        )}

        <View style={styles.grid}>
          {tileIds.map((id) => {
            const ex = EXERCISE_BY_ID[id];
            const level = levelOf(id);
            const on = picked.includes(id);
            const name = exerciseName(ex, language);
            return (
              <View key={id} style={styles.tileWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={g('train.select', { name })}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(id)}
                  style={[styles.tile, on && styles.tileOn]}
                >
                  <View style={styles.figure}>
                    <ExerciseFigure id={id} pose={0} width={84} />
                  </View>
                  <HudText size={14} numberOfLines={2} style={styles.tileName}>
                    {name}
                  </HudText>
                  <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1} style={styles.rx}>
                    {formatAmount(prescriptionFor(id, level), language, false)} · {g('train.level', { n: level })}
                  </HudText>
                  {on && (
                    <View style={styles.check}>
                      <QuestIcon name="check" size={14} color={quest.onGold} strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={g('train.openDetail', { name })}
                  hitSlop={6}
                  onPress={() => router.push({ pathname: '/train/detail', params: { id, group } })}
                  style={styles.info}
                >
                  <QuestIcon name="chevron" size={14} color={quest.textSecondary} strokeWidth={2.4} />
                </Pressable>
              </View>
            );
          })}
          <View style={styles.tileWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g('train.openDetail', { name: exerciseName(EXERCISE_BY_ID[ALWAYS_EXERCISE], language) })}
              onPress={() => router.push({ pathname: '/train/detail', params: { id: ALWAYS_EXERCISE, group } })}
              style={[styles.tile, styles.tileAlways]}
            >
              <View style={styles.figure}>
                <ExerciseFigure id={ALWAYS_EXERCISE} pose={1} width={84} />
              </View>
              <HudText size={14} numberOfLines={2} style={styles.tileName}>
                {exerciseName(EXERCISE_BY_ID[ALWAYS_EXERCISE], language)}
              </HudText>
              <HudText size={12} weight="medium" color={quest.manaText} numberOfLines={1}>
                {formatAmount(prescriptionFor(ALWAYS_EXERCISE, levelOf(ALWAYS_EXERCISE)), language, false)} · {g('train.always')}
              </HudText>
            </Pressable>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/workout-classic')} style={styles.classicLink}>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('train.classicLink')}
          </HudText>
          <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
        </Pressable>
      </ScrollView>

      <View style={[styles.bar, screenMaxWidthStyle]}>
        <View style={styles.barText}>
          <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
            {canStart ? g('train.summary', { n: picked.length }) : g('train.pickMin')}
          </HudText>
          <HudText size={20}>{g('train.estimate', { m: minutes })}</HudText>
        </View>
        <View style={styles.barButton}>
          <QuestButton title={g('train.start')} icon="chevron" disabled={!canStart} onPress={start} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.gold,
    backgroundColor: quest.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { letterSpacing: 1.6 },
  xpPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  block: { gap: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: questRadius.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  pickHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { width: '48.5%', flexGrow: 1 },
  tile: {
    minHeight: 150,
    padding: 10,
    gap: 4,
    borderRadius: questRadius.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  tileOn: { borderColor: quest.gold, backgroundColor: quest.raised },
  tileAlways: { borderStyle: 'dashed', borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  figure: { alignItems: 'center', justifyContent: 'center', height: 58, borderRadius: 10, backgroundColor: quest.bg },
  tileName: { marginTop: 4 },
  rx: { paddingRight: 28 },
  check: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: quest.gold, alignItems: 'center', justifyContent: 'center' },
  info: { position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
  classicLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: questRadius.panel + 4,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  barText: { flex: 1, minWidth: 0 },
  barButton: { width: 150 },
});
