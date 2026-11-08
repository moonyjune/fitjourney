import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { BossWeekLog } from '../../components/quest/BossWeekLog';
import { HudText } from '../../components/quest/HudText';
import { InfoButton } from '../../components/quest/InfoButton';
import { MoodFace } from '../../components/quest/MoodFace';
import { QuestButton } from '../../components/quest/QuestButton';
import { QuestIcon } from '../../components/quest/QuestIcon';
import { DefaultBossArt } from '../../components/quest/StageBossArt';
import { WeeklyBossHistory } from '../../components/quest/WeeklyBossHistory';
import { BossHpBar } from '../../components/quest/WeeklyBossSheet';
import { BOSS_DEFEAT_XP } from '../../game/constants';
import { bossNum } from '../../game/bossView';
import { deficitColor } from '../../game/deficitLevel';
import { mealNames, shownDeficit } from '../../game/deficitView';
import { useGameText, type GameKey } from '../../game/strings';
import type { StringKey } from '../../i18n/strings';
import { useTranslation } from '../../i18n/useTranslation';
import { fetchWeeklySuggestion, pushWeeklySuggestion, requestWeeklySuggestion } from '../../sync/cloudSync';
import { quest, questFonts, questRadius } from '../../theme/quest';
import { chartWidthFor } from '../../theme/responsive';
import type { Mood } from '../../types';
import { thinLabels } from '../../utils/chartLabels';
import { formatDateVi, toDateKey } from '../../utils/date';
import { addDays } from '../../utils/milestones';
import { weekShiftFor } from '../../utils/swipe';
import { weekStartKey } from '../../utils/weekKey';
import { dayWaterTargetMl } from '../../water/schedule';
import type { WeekSummary } from './useDaySummaries';
import type { JournalSubject } from './useJournalSubject';
import { dayWaterMl } from '../../water/drinks';

const MOOD_COLORS: Record<Mood, string> = {
  great: quest.xp,
  good: '#B5E86B',
  neutral: quest.gold,
  stressed: quest.hp,
  tired: quest.textSecondary,
};
const MOOD_LABEL_KEY: Record<Mood, StringKey> = {
  great: 'feeling.moodGreat',
  good: 'feeling.moodGood',
  neutral: 'feeling.moodNeutral',
  stressed: 'feeling.moodStressed',
  tired: 'feeling.moodTired',
};
const chartConfig = {
  backgroundColor: quest.panel,
  backgroundGradientFrom: quest.panel,
  backgroundGradientTo: quest.panel,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 200, 61, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(179, 170, 207, ${opacity})`,
  // The app font on the axes (the SVG text otherwise falls back to the browser's serif).
  propsForLabels: { fontFamily: questFonts.medium },
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (key: string) => new Date(`${key}T12:00:00`);
const dayMonth = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

interface JournalWeekProps {
  subject: JournalSubject;
  weeks: WeekSummary[];
  /** The selected day: the week shown is its week. */
  selectedKey: string;
  /** Moves the selected day (the arrows and a swipe keep the weekday). */
  onSelect: (dateKey: string) => void;
  /** A day of the strip was tapped: open it in the Day tab. */
  onOpenDay: (dateKey: string) => void;
}

/** Journal › Tuần (Design/uiux-proposal 07, 18, 19, 28): the week strip with each day's deficit, the weekly boss and its full 7-day log,
 *  the deficit per day against the target, weight / water / mood of the week, the AI weekly review, then the week's check-ins, the
 *  mood chart, the AI note on feelings, the weekly averages and the bosses week by week. */
export function JournalWeek({ subject, weeks, selectedKey, onSelect, onOpenDay }: JournalWeekProps) {
  const g = useGameText();
  const { t } = useTranslation();
  // Inside a panel (14 padding + 1.5 border each side), so the last bar's label is not cut off.
  const chartWidth = chartWidthFor(useWindowDimensions().width) - 31;
  const { now, todayKey, evaluate, levelOf, cheatDays, deficitTarget, readOnly, logs, settings, weights, feelings, subjectId } = subject;

  const weekKey = weekStartKey(dateOf(selectedKey));
  const monday = useMemo(() => dateOf(weekKey), [weekKey]);
  const isThisWeek = weekKey === weekStartKey(now);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const key = toDateKey(date);
        const future = key > todayKey;
        // Today with meals still to come shows its end-of-day estimate; a day with a meal not logged loses its level colour.
        const shown = future ? null : shownDeficit(evaluate(key));
        const cheat = !future && cheatDays.includes(key);
        return { key, date, future, deficit: shown?.kcal ?? null, cheat, projected: !!shown?.projected, incomplete: !!shown?.incomplete };
      }),
    [monday, todayKey, evaluate, cheatDays]
  );

  function shiftWeek(delta: number) {
    const next = toDateKey(addDays(dateOf(selectedKey), delta * 7));
    if (delta > 0 && weekStartKey(dateOf(next)) > weekStartKey(now)) return;
    onSelect(next > todayKey ? todayKey : next);
  }
  // Dragging the strip sideways moves a week, like the arrows: right for the week before, left for the one after.
  const shiftRef = useRef(shiftWeek);
  shiftRef.current = shiftWeek;
  const drag = useRef(new Animated.Value(0)).current;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, s) => Math.abs(s.dx) > 12 && Math.abs(s.dx) > Math.abs(s.dy) * 1.5,
      onPanResponderMove: (_, s) => drag.setValue(Math.max(-80, Math.min(80, s.dx * 0.5))),
      onPanResponderRelease: (_, s) => {
        const step = weekShiftFor(s.dx, s.vx);
        if (step !== 0) shiftRef.current(step);
        Animated.spring(drag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start(),
    })
  ).current;

  const weekdayLabel = (d: Date) => g(`weekday.${d.getDay()}` as GameKey);

  // The weekly boss of this week (the live one, or the one that week had).
  const boss = isThisWeek ? subject.boss : subject.bossHistory.find((b) => b.weekKey === weekKey);
  const counted = days.filter((d) => !d.future && !d.cheat && d.deficit != null && !d.projected && !d.incomplete);
  const metDays = counted.filter((d) => levelOf(d.key, d.deficit) === 'met').length;
  const deficitSum = counted.reduce((s, d) => s + (d.deficit ?? 0), 0);
  const todayBossDay = boss?.days.find((d) => d.dateKey === todayKey);
  const todayEval = evaluate(todayKey);

  // Bars: the deficit of each day against a dashed target line.
  const maxBar = Math.max(deficitTarget * 1.5, ...days.map((d) => Math.abs(d.deficit ?? 0)));
  const BAR_H = 96;

  // Weight: the week's last weigh-in against the one before the week (or the week's first).
  const weekEnd = toDateKey(addDays(monday, 6));
  const sortedWeights = [...weights].sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO));
  const inWeek = sortedWeights.filter((w) => {
    const k = toDateKey(new Date(w.dateISO));
    return k >= weekKey && k <= weekEnd;
  });
  const before = sortedWeights.filter((w) => toDateKey(new Date(w.dateISO)) < weekKey).pop();
  const base = before ?? (inWeek.length >= 2 ? inWeek[0] : undefined);
  const weightChange = inWeek.length > 0 && base ? inWeek[inWeek.length - 1].weightKg - base.weightKg : null;

  // Water: average of the days so far, and the days the day's own target was reached.
  const pastDays = days.filter((d) => !d.future);
  const waterDays = pastDays.filter((d) => logs[d.key] != null);
  const waterAvg = waterDays.length > 0 ? waterDays.reduce((s, d) => s + dayWaterMl(logs[d.key]), 0) / waterDays.length : null;
  const waterMet = waterDays.filter((d) => dayWaterMl(logs[d.key]) >= dayWaterTargetMl(logs[d.key], settings.waterTargetMl)).length;

  // Mood: the week's check-ins, the most frequent mood and the average craving.
  const weekFeelings = useMemo(() => [...feelings].filter((r) => weekStartKey(new Date(r.loggedAtISO)) === weekKey).reverse(), [feelings, weekKey]);
  const moodCounts = new Map<Mood, number>();
  weekFeelings.forEach((r) => moodCounts.set(r.mood, (moodCounts.get(r.mood) ?? 0) + 1));
  const topMood = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const avgCraving = weekFeelings.length > 0 ? Math.round(weekFeelings.reduce((s, r) => s + r.cravingLevel, 0) / weekFeelings.length) : null;

  // All-time mood distribution (a single week rarely has enough check-ins for a chart).
  const moodPieData = useMemo(() => {
    const counts: Record<Mood, number> = { great: 0, good: 0, neutral: 0, stressed: 0, tired: 0 };
    feelings.forEach((r) => {
      counts[r.mood] += 1;
    });
    return (Object.keys(counts) as Mood[])
      .filter((mood) => counts[mood] > 0)
      .map((mood) => ({ name: t(MOOD_LABEL_KEY[mood]), population: counts[mood], color: MOOD_COLORS[mood], legendFontColor: quest.textSecondary, legendFontSize: 12, legendFontFamily: questFonts.medium }));
  }, [feelings, t]);

  // The AI's note on the week's feelings (kept per week in the cloud); asked for this week only.
  const thisWeekSummary = weeks.find((w) => w.weekKey === weekKey) ?? null;
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState(false);
  useEffect(() => {
    setSuggestion(null);
    if (!subjectId) return;
    let live = true;
    fetchWeeklySuggestion(subjectId, weekKey).then((s) => live && setSuggestion(s));
    return () => {
      live = false;
    };
  }, [subjectId, weekKey]);
  async function getSuggestion() {
    setSuggestionLoading(true);
    setSuggestionError(false);
    const result = await requestWeeklySuggestion(weekFeelings, {
      avgCaloriesPerDay: thisWeekSummary?.avgCalories ?? 0,
      totalWorkouts: thisWeekSummary?.totalWorkouts ?? 0,
      weightChangeKg: thisWeekSummary?.weightChange ?? null,
    });
    setSuggestionLoading(false);
    if (result.ok) {
      setSuggestion(result.suggestion);
      pushWeeklySuggestion(weekKey, result.suggestion);
    } else setSuggestionError(true);
  }

  // Average kcal per day, week by week (oldest → newest, last 8 weeks).
  const weeklyChart = useMemo(() => {
    const chronological = [...weeks].reverse().slice(-8);
    if (chronological.length < 2) return null;
    return { labels: thinLabels(chronological.map((w) => formatDateVi(w.weekKey).slice(0, 5)), 6), datasets: [{ data: chronological.map((w) => Math.round(w.avgCalories)) }] };
  }, [weeks]);

  return (
    <View style={styles.wrap}>
      <View style={styles.stripHead}>
        <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex} numberOfLines={1}>
          {g('deficit.legend', { target: deficitTarget })}
        </HudText>
        <InfoButton label={g('journal2.legendInfo')} title={g('journal2.legendTitle')} text={g('journal2.legendFull', { target: deficitTarget })} />
      </View>
      <View style={styles.stripWrap} {...swipe.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.prevWeek')} onPress={() => shiftWeek(-1)} style={styles.arrow}>
          <QuestIcon name="back" size={18} color={quest.text} strokeWidth={2.4} />
        </Pressable>
        <Animated.View style={[styles.strip, { transform: [{ translateX: drag }] }]}>
          {days.map((d) => {
            const selected = d.key === selectedKey;
            const wd = weekdayLabel(d.date);
            const dl = dayMonth(d.date);
            const a11y = d.future
              ? `${wd} ${dl}`
              : d.cheat
                ? g('journal.dayCheat', { weekday: wd, date: dl })
                : d.deficit == null
                  ? g('journal.dayNoData', { weekday: wd, date: dl })
                  : g(d.projected ? 'journal.dayPending' : 'journal.day', { weekday: wd, date: dl, deficit: Math.round(d.deficit) });
            const level = d.incomplete ? null : levelOf(d.key, d.deficit);
            return (
              <Pressable
                key={d.key}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                accessibilityHint={g('journal2.dayOpen', { day: `${wd} ${dl}` })}
                accessibilityState={{ selected, disabled: d.future }}
                disabled={d.future}
                onPress={() => onOpenDay(d.key)}
                style={[
                  styles.dayCell,
                  selected ? { backgroundColor: quest.gold, borderColor: quest.gold } : { backgroundColor: quest.panel, borderColor: quest.border },
                  d.future && { borderStyle: 'dashed', opacity: 0.55 },
                ]}
              >
                <HudText size={12} weight="medium" color={selected ? quest.onGold : quest.textSecondary}>
                  {wd}
                </HudText>
                <HudText size={18} color={selected ? quest.onGold : quest.text}>
                  {d.date.getDate()}
                </HudText>
                <HudText size={10} weight="medium" color={selected ? quest.onGold : deficitColor(level, d.incomplete ? quest.textSecondary : quest.hpText)} numberOfLines={1}>
                  {d.future
                    ? '·'
                    : d.cheat
                      ? g('deficit.cheatShort')
                      : d.deficit == null
                        ? '–'
                        : `${d.incomplete ? '⚠' : ''}${d.projected ? '~' : ''}${Math.round(d.deficit).toLocaleString('en-US')}`}
                </HudText>
                {/* The deficit level as a bar, still readable on the selected (gold) day. */}
                <View style={[styles.levelBar, { backgroundColor: d.future ? 'transparent' : deficitColor(level, 'transparent') }]} />
              </Pressable>
            );
          })}
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('journal.nextWeek')}
          accessibilityState={{ disabled: isThisWeek }}
          disabled={isThisWeek}
          onPress={() => shiftWeek(1)}
          style={[styles.arrow, isThisWeek && { opacity: 0.35 }]}
        >
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <QuestIcon name="back" size={18} color={quest.text} strokeWidth={2.4} />
          </View>
        </Pressable>
      </View>

      {boss ? (
        <Pressable
          accessibilityRole={!readOnly && isThisWeek ? 'button' : undefined}
          accessibilityLabel={`${g('journal2.week.boss')}. ${bossNum(boss.hpLeft)} / ${bossNum(boss.maxHp)} HP. ${g(boss.defeated ? 'chart.bossDown' : isThisWeek ? 'chart.bossLive' : 'chart.bossAlive')}`}
          accessibilityHint={!readOnly && isThisWeek ? g('journal2.week.bossOpen') : undefined}
          disabled={readOnly || !isThisWeek}
          onPress={() => router.push('/boss')}
          style={({ pressed }) => [styles.bossCard, pressed && { opacity: 0.85 }]}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <DefaultBossArt size={52} defeated={boss.defeated} />
          </View>
          <View style={styles.flex}>
            <View style={styles.bossHead}>
              <HudText size={16} style={styles.flex}>
                {g('journal2.week.boss')}
              </HudText>
              <HudText size={13} color={quest.hpText}>
                {bossNum(boss.hpLeft)} / {bossNum(boss.maxHp)} HP
              </HudText>
            </View>
            <View style={styles.bossBar}>
              <BossHpBar boss={boss} height={6} trackColor={quest.bg} />
            </View>
            <View style={styles.bossHead}>
              <View style={[styles.pill, { borderColor: boss.defeated ? quest.xp : quest.border }]}>
                <HudText size={12} color={boss.defeated ? quest.xp : isThisWeek ? quest.gold : quest.textSecondary}>
                  {g(boss.defeated ? 'chart.bossDown' : isThisWeek ? 'chart.bossLive' : 'chart.bossAlive')}
                </HudText>
              </View>
              <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex} numberOfLines={2}>
                {g('journal2.week.bossMeta', { met: metDays, n: counted.length, sum: bossNum(deficitSum) })}
                {boss.defeated ? ` · ${g('journal2.week.bossXp', { xp: BOSS_DEFEAT_XP })}` : ''}
              </HudText>
            </View>
          </View>
          {!readOnly && isThisWeek && <QuestIcon name="chevron" size={16} color={quest.textSecondary} />}
        </Pressable>
      ) : (
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.gap}>
          {g('journal2.week.bossNone')}
        </HudText>
      )}

      {boss && (
        <View style={styles.gap}>
          <BossWeekLog
            boss={boss}
            todayKey={todayKey}
            footer={
              todayBossDay?.pending && todayEval.pendingMeals.length > 0 ? (
                <View style={styles.pendingRow}>
                  <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
                    {g('boss.detail.hitPendingNote', { meals: mealNames(todayEval.pendingMeals, g) })}
                  </HudText>
                  <InfoButton label={g('journal2.pendingInfo')} title={g('journal2.pendingTitle')} text={g('journal2.pendingFull', { meals: mealNames(todayEval.pendingMeals, g) })} />
                </View>
              ) : null
            }
          />
        </View>
      )}

      <View style={styles.sectionHead}>
        <HudText size={17} accessibilityRole="header" style={styles.flex}>
          {g('journal2.week.chart')}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('journal2.week.chartTarget', { n: deficitTarget })}
        </HudText>
      </View>
      <View
        accessible
        accessibilityLabel={g('journal2.week.chartA11y', {
          n: deficitTarget,
          list: days
            .filter((d) => !d.future)
            .map((d) => `${weekdayLabel(d.date)} ${d.cheat ? g('deficit.cheatShort') : d.deficit == null ? '–' : Math.round(d.deficit)}`)
            .join(', '),
        })}
        style={styles.chartCard}
      >
        <View style={[styles.bars, { height: BAR_H }]}>
          <View style={[styles.targetLine, { bottom: (deficitTarget / maxBar) * BAR_H }]} />
          {days.map((d) => {
            const level = d.incomplete ? null : levelOf(d.key, d.deficit);
            const h = d.deficit == null || d.cheat ? 0 : Math.max(4, (Math.abs(d.deficit) / maxBar) * BAR_H);
            const color = d.deficit != null && d.deficit < 0 ? quest.hp : d.incomplete || d.projected ? quest.textSecondary : deficitColor(level, quest.gold);
            return (
              <View key={d.key} style={styles.barCol}>
                <View style={[styles.bar, { height: h, backgroundColor: color }, d.projected && styles.barPending]} />
              </View>
            );
          })}
        </View>
        <View style={styles.barLabels}>
          {days.map((d) => (
            <HudText key={d.key} size={12} weight="medium" color={d.key === selectedKey ? quest.gold : quest.textSecondary} style={styles.barLabel}>
              {weekdayLabel(d.date)}
            </HudText>
          ))}
        </View>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile} accessible accessibilityLabel={`${g('journal2.week.weight')} ${weightChange == null ? g('journal2.week.none') : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg`}`}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('journal2.week.weight')}
          </HudText>
          <HudText size={18} color={weightChange == null ? quest.textSecondary : weightChange <= 0 ? quest.xp : quest.hpText}>
            {weightChange == null ? '—' : `${weightChange > 0 ? '+' : weightChange < 0 ? '−' : ''}${Math.abs(weightChange).toFixed(1)} kg`}
          </HudText>
        </View>
        <View style={styles.tile} accessible accessibilityLabel={`${g('journal2.week.water')} ${waterAvg == null ? g('journal2.week.none') : `${(waterAvg / 1000).toFixed(1)} L`}`}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('journal2.week.water')}
          </HudText>
          <HudText size={18} color={quest.manaText}>
            {waterAvg == null ? '—' : `${(waterAvg / 1000).toFixed(1)} L`}
          </HudText>
          {waterAvg != null && (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('journal2.week.waterDays', { n: waterMet, of: pastDays.length })}
            </HudText>
          )}
        </View>
        <View style={styles.tile} accessible accessibilityLabel={`${g('journal2.week.mood')} ${topMood ? t(MOOD_LABEL_KEY[topMood]) : g('journal2.week.none')}`}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('journal2.week.mood')}
          </HudText>
          {topMood ? <MoodFace mood={topMood} size={24} color={MOOD_COLORS[topMood]} /> : <HudText size={18} color={quest.textSecondary}>—</HudText>}
          {avgCraving != null && (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('journal2.week.moodMeta', { n: avgCraving })}
            </HudText>
          )}
        </View>
      </View>

      {!readOnly && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('week.profileRow')}
          accessibilityHint={g('journal2.week.reportHint')}
          onPress={() => router.push('/weekly-report')}
          style={({ pressed }) => [styles.reportCard, pressed && { opacity: 0.85 }]}
        >
          <QuestIcon name="chart" size={20} color={quest.gold} />
          <View style={styles.flex}>
            <HudText size={15}>{g('week.profileRow')}</HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('journal2.week.reportHint')}
            </HudText>
          </View>
          <QuestIcon name="chevron" size={16} color={quest.textSecondary} />
        </Pressable>
      )}

      {weekFeelings.length > 0 && (
        <>
          <HudText size={17} accessibilityRole="header" style={styles.section}>
            {t('feeling.weeklyTitle')}
          </HudText>
          <View style={styles.panel}>
            {weekFeelings.map((r) => (
              <View key={r.id} style={styles.feelingRow}>
                <MoodFace mood={r.mood} size={20} color={MOOD_COLORS[r.mood]} />
                <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
                  {formatDateVi(toDateKey(new Date(r.loggedAtISO)))} · {t('feeling.cravingShort', { n: r.cravingLevel })} · {t('feeling.hungerShort', { n: r.hungerLevel })} · {t(MOOD_LABEL_KEY[r.mood])}
                  {r.note ? ` · “${r.note}”` : ''}
                </HudText>
              </View>
            ))}
          </View>
        </>
      )}

      {moodPieData.length > 0 && (
        <>
          <HudText size={17} accessibilityRole="header" style={styles.section}>
            {t('feeling.chartTitle')}
          </HudText>
          <View style={styles.panel}>
            <PieChart data={moodPieData} width={chartWidth} height={160} chartConfig={chartConfig} accessor="population" backgroundColor="transparent" paddingLeft="8" absolute />
          </View>
        </>
      )}

      {(isThisWeek || suggestion) && (
        <>
          <HudText size={17} accessibilityRole="header" style={styles.section}>
            {t('feeling.suggestionTitle')}
          </HudText>
          <View style={styles.panel}>
            {suggestion ? (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {suggestion}
              </HudText>
            ) : null}
            {readOnly || !isThisWeek ? null : weekFeelings.length < 3 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {t('feeling.suggestionNeedsMore')}
              </HudText>
            ) : (
              <>
                {suggestionError && (
                  <HudText size={13} weight="medium" color={quest.hpText}>
                    {t('feeling.suggestionError')}
                  </HudText>
                )}
                <View style={styles.gap}>
                  <QuestButton title={t('feeling.getSuggestionButton')} onPress={getSuggestion} loading={suggestionLoading} />
                </View>
              </>
            )}
            {readOnly && !suggestion && (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {t('feeling.suggestionNeedsMore')}
              </HudText>
            )}
          </View>
        </>
      )}

      {weeks.length > 0 && (
        <>
          <HudText size={17} accessibilityRole="header" style={styles.section}>
            {t('history.weeklyTitle')}
          </HudText>
          {weeklyChart && (
            <View style={styles.panel}>
              <BarChart data={weeklyChart} width={chartWidth} height={180} yAxisLabel="" yAxisSuffix=" kcal" chartConfig={chartConfig} fromZero style={styles.chart} />
            </View>
          )}
          {weeks.slice(0, 8).map((w) => (
            <View key={w.weekKey} style={styles.panel}>
              <HudText size={14}>{t('history.weekLabel', { date: formatDateVi(w.weekKey) })}</HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t('history.weekMeta', { kcal: Math.round(w.avgCalories), n: w.totalWorkouts })}
                {w.weightChange !== null ? t('history.weekWeightChange', { sign: w.weightChange > 0 ? '+' : '', kg: w.weightChange.toFixed(1) }) : ''}
              </HudText>
            </View>
          ))}
        </>
      )}

      <WeeklyBossHistory history={subject.bossHistory} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  flex: { flex: 1, minWidth: 0 },
  gap: { marginTop: 12 },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -8, marginBottom: -2 },
  stripWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 32, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  strip: { flex: 1, flexDirection: 'row', gap: 4 },
  dayCell: { flex: 1, minHeight: 76, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 4 },
  levelBar: { width: '60%', height: 3, borderRadius: 2, marginTop: 2 },
  bossCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  bossHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bossBar: { marginVertical: 4 },
  pill: { paddingHorizontal: 8, minHeight: 24, justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, marginTop: 4 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: quest.border, paddingTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 20, marginBottom: 8 },
  chartCard: { padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderBottomWidth: 1, borderBottomColor: quest.border },
  barCol: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end', height: '100%' },
  bar: { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barPending: { opacity: 0.55 },
  targetLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderTopColor: quest.gold, borderStyle: 'dashed' },
  barLabels: { flexDirection: 'row', gap: 10, marginTop: 4 },
  barLabel: { flex: 1, textAlign: 'center' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: { flex: 1, minWidth: 0, padding: 10, gap: 2, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  reportCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, minHeight: 56, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.gold, backgroundColor: quest.panel },
  section: { marginTop: 20, marginBottom: 8 },
  panel: { padding: 14, marginBottom: 10, gap: 4, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, overflow: 'hidden' },
  feelingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  chart: { borderRadius: questRadius.row },
});
