import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import { DailyMealBreakdownTable } from '../../components/DailyMealBreakdownTable';
import { HudText } from '../../components/quest/HudText';
import { InfoButton } from '../../components/quest/InfoButton';
import { PhotoViewer } from '../../components/quest/PhotoViewer';
import { QuestIcon } from '../../components/quest/QuestIcon';
import { WorkoutEntries, workoutRange } from '../../components/quest/WorkoutDetailDialog';
import { getDayType } from '../../constants/plan';
import { DEFICIT_LEVEL_COLOR, deficitColor, type DeficitLevel } from '../../game/deficitLevel';
import { mealNames } from '../../game/deficitView';
import { useGameText, type GameKey } from '../../game/strings';
import type { StringKey } from '../../i18n/strings';
import { useTranslation } from '../../i18n/useTranslation';
import { useNutritionStore } from '../../store/useNutritionStore';
import { fetchFeedback } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { chartWidthFor } from '../../theme/responsive';
import { EXTRA_PROOF_PREFIX, type CoachFeedback, type ProofPhoto } from '../../types';
import { thinLabels } from '../../utils/chartLabels';
import { formatDateVi, toDateKey } from '../../utils/date';
import { dayHasFood } from '../../utils/dayIntake';
import { buildDeficitChartData } from '../../utils/deficitChart';
import { formatDeficitShort, monthGrid, monthKeyOf, monthLabel, parseMonthKey, shiftMonth, shortMonthLabel, type YearMonth } from '../../utils/historyCalendar';
import { mealCaption } from '../../utils/mealCaption';
import { computeMilestones } from '../../utils/milestones';
import { unlockedStreakBadges, STREAK_BADGE_THRESHOLDS } from '../../utils/streak';
import { actualDailyDeficitKcal } from '../../utils/tdee';
import type { DaySummary } from './useDaySummaries';
import type { JournalSubject } from './useJournalSubject';

const MILESTONE_STATUS_KEY: Record<string, StringKey> = {
  upcoming: 'history.milestoneUpcoming',
  achieved: 'history.milestoneAchieved',
  missed: 'history.milestoneMissed',
};
const MILESTONE_STATUS_COLOR: Record<string, string> = {
  upcoming: quest.textSecondary,
  achieved: quest.xp,
  missed: quest.hpText,
};
const chartConfig = {
  backgroundColor: quest.panel,
  backgroundGradientFrom: quest.panel,
  backgroundGradientTo: quest.panel,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 200, 61, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(179, 170, 207, ${opacity})`,
  propsForDots: { r: '3' },
};
/** The colour key under the calendar (the full rules are behind ⓘ). */
const LEGEND: { level: DeficitLevel; key: GameKey }[] = [
  { level: 'met', key: 'journal2.month.legend.met' },
  { level: 'ok', key: 'journal2.month.legend.ok' },
  { level: 'low', key: 'journal2.month.legend.low' },
  { level: 'over', key: 'journal2.month.legend.over' },
  { level: 'cheat', key: 'journal2.month.legend.cheat' },
  { level: 'excess', key: 'journal2.month.legend.warn' },
];

function Section({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <HudText size={17} accessibilityRole="header" style={styles.flex}>
        {children}
      </HudText>
      {right}
    </View>
  );
}
function Meta({ children, color = quest.textSecondary, style, accessibilityLabel }: { children: ReactNode; color?: string; style?: object; accessibilityLabel?: string }) {
  return (
    <HudText size={12} weight="medium" color={color} style={[styles.meta, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </HudText>
  );
}

interface JournalMonthProps {
  subject: JournalSubject;
  days: DaySummary[];
  byKey: Map<string, DaySummary>;
  /** The month shown first: the selected day's. */
  selectedKey: string;
  /** A calendar day was tapped: open it in the Day tab. */
  onOpenDay: (dateKey: string) => void;
}

/** Journal › Tháng (Design/uiux-proposal 07, 28, 29): the month calendar coloured by deficit (⚠ for a day with a meal not logged), a short
 *  summary with "Phân tích sâu ▸", weight, the campfire milestones, the coach's notes, the progress milestones, the charts by day and
 *  the month's days one by one (totals, deficit, workouts, photos, the editable meal table). */
export function JournalMonth({ subject, days, byKey, selectedKey, onOpenDay }: JournalMonthProps) {
  const g = useGameText();
  const { t, language } = useTranslation();
  const chartWidth = chartWidthFor(useWindowDimensions().width);
  const lineChartWidth = chartWidth - 16;
  const { todayKey, levelOf, readOnly, settings, weights, workouts, logs, mealTemplates, tdeeKcal, cheatDays, deficitTarget, subjectId, streak } = subject;
  const saveDayLog = useNutritionStore((s) => s.saveDayLog);

  const [calMonth, setCalMonth] = useState<YearMonth>(() => parseMonthKey(monthKeyOf(selectedKey)));
  const [pickerYear, setPickerYear] = useState<number | null>(null);
  const monthKey = monthKeyOf(calMonth);
  const weekdays = t('history.weekdaysShort').split(',');

  const [feedbackList, setFeedbackList] = useState<CoachFeedback[]>([]);
  useEffect(() => {
    if (!subjectId) return;
    fetchFeedback(subjectId).then(setFeedbackList);
  }, [subjectId]);

  // The month's days that have a settled figure: how many met the target, and the average deficit.
  const monthStats = useMemo(() => {
    const counted = monthGrid(calMonth)
      .flat()
      .filter((k): k is string => !!k && k <= todayKey)
      .map((k) => byKey.get(k))
      .filter((d): d is DaySummary => !!d && !d.cheat && d.shown.kcal != null && !d.shown.projected && !d.shown.incomplete);
    const met = counted.filter((d) => levelOf(d.dateKey, d.shown.kcal) === 'met').length;
    const avg = counted.length > 0 ? counted.reduce((s, d) => s + (d.shown.kcal ?? 0), 0) / counted.length : null;
    return { met, n: counted.length, avg };
    // levelOf is rebuilt on each render; byKey, the month and the target cover what it reads.
  }, [calMonth, todayKey, byKey, deficitTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weight: the whole way (start → latest) and the change within the month.
  const sortedWeights = useMemo(() => [...weights].sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO)), [weights]);
  const latest = sortedWeights[sortedWeights.length - 1];
  const inMonth = sortedWeights.filter((w) => monthKeyOf(toDateKey(new Date(w.dateISO))) === monthKey);
  const beforeMonth = sortedWeights.filter((w) => monthKeyOf(toDateKey(new Date(w.dateISO))) < monthKey).pop();
  const monthBase = beforeMonth ?? (inMonth.length >= 2 ? inMonth[0] : undefined);
  const monthWeightChange = inMonth.length > 0 && monthBase ? inMonth[inMonth.length - 1].weightKg - monthBase.weightKg : null;

  const milestones = useMemo(
    () => computeMilestones(settings.startDateISO, settings.startWeightKg, settings.goalWeightKg, latest?.weightKg ?? settings.startWeightKg),
    [settings.startDateISO, settings.startWeightKg, settings.goalWeightKg, latest]
  );
  const badges = unlockedStreakBadges(streak);
  const nextBadge = STREAK_BADGE_THRESHOLDS.find((n) => n > streak);

  // Daily deficit from the plan's start through today; a day with no food or a cheat day is a gap in the line.
  const deficitTrendChart = useMemo(
    () =>
      buildDeficitChartData(
        settings.startDateISO,
        (dateKey) => {
          if (!dayHasFood(logs[dateKey]) || cheatDays.includes(dateKey)) return null;
          const d = byKey.get(dateKey);
          return d ? actualDailyDeficitKcal(tdeeKcal, d.caloriesBurned, d.calories) : null;
        },
        new Date(),
        quest.gold
      ),
    [settings.startDateISO, logs, cheatDays, byKey, tdeeKcal]
  );
  // Kcal in and out per day, last 14 logged days (separate charts: burned kcal are far smaller than eaten).
  const dailyCharts = useMemo(() => {
    const chronological = [...days].reverse().slice(-14);
    if (chronological.length < 2) return null;
    const labels = thinLabels(chronological.map((d) => formatDateVi(d.dateKey).slice(0, 5)));
    return {
      caloriesIn: { labels, datasets: [{ data: chronological.map((d) => d.calories), color: () => quest.gold, strokeWidth: 3 }] },
      caloriesOut: { labels, datasets: [{ data: chronological.map((d) => d.caloriesBurned), color: () => quest.xp, strokeWidth: 3 }] },
    };
  }, [days]);

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [workoutsOpen, setWorkoutsOpen] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<{ dateKey: string; photos: ProofPhoto[] } | null>(null);

  /** Which meal (or workout) a day's photo belongs to and when it was logged, e.g. "Tối · 19:30". */
  function proofCaption(p: ProofPhoto, dateKey: string): string {
    if (p.taskType === 'workout') {
      const entry = workouts.find((w) => w.id === p.taskRefId);
      return mealCaption(entry?.label ?? t('history.workoutPhoto'), entry?.dateISO ?? p.createdAtISO);
    }
    if (p.taskRefId.startsWith(EXTRA_PROOF_PREFIX)) {
      const item = logs[dateKey]?.extraItems?.find((i) => i.id === p.taskRefId.slice(EXTRA_PROOF_PREFIX.length));
      if (item) return mealCaption(item.mealTime ? t(`extraMealTime.${item.mealTime}` as StringKey) : null, item.loggedAtISO);
      return mealCaption(null, p.createdAtISO);
    }
    const meal = mealTemplates[getDayType(new Date(`${dateKey}T12:00:00`))].find((x) => x.slot === p.taskRefId);
    return mealCaption(meal?.label ?? null, p.createdAtISO);
  }

  /** A day's deficit line: today's estimate "~X", a settled day with a meal not logged without the level colour, with ⚠. */
  function renderDeficit(d: DaySummary, kcal: number) {
    const { projected, incomplete } = d.shown;
    const level = incomplete ? null : levelOf(d.dateKey, kcal);
    const text =
      `${t(kcal >= 0 ? 'tdee.deficitLabel' : 'tdee.surplusLabel')}: ${projected ? '~' : ''}${Math.round(Math.abs(kcal))} kcal` +
      (projected ? ` · ${g('deficit.projectedShort')}` : level ? ` · ${g(`deficit.level.${level}` as GameKey)}` : '');
    const missing = incomplete ? g('deficit.missingLine', { meals: mealNames(d.missingMeals, g) }) : '';
    return (
      <Meta color={incomplete ? quest.textSecondary : deficitColor(level, kcal >= 0 ? quest.xp : quest.gold)} accessibilityLabel={incomplete ? `${text}. ${missing}` : undefined}>
        {incomplete ? `${text} ⚠` : text}
      </Meta>
    );
  }

  function renderDay(d: DaySummary) {
    const expanded = !!expandedDays[d.dateKey];
    const toggleLabel = t(expanded ? 'history.collapseButton' : 'history.expandButton');
    return (
      <View key={d.dateKey} style={styles.panel}>
        <HudText size={14}>{formatDateVi(d.dateKey)}</HudText>
        <Meta>{t('history.dayMeta1', { kcal: d.calories, protein: d.proteinG, water: d.waterMl, target: d.waterTargetMl })}</Meta>
        <Meta>
          {t('history.dayMeta2', { meals: d.mealsEatenCount, n: d.workoutsCount, kcal: d.caloriesBurned })} {d.weightKg !== null ? `· ${d.weightKg.toFixed(1)} kg` : ''}
        </Meta>
        {d.cheat ? (
          <Meta color={DEFICIT_LEVEL_COLOR.cheat}>
            {t('tdee.deficitLabel')}: {g('deficit.level.cheat')}
          </Meta>
        ) : d.shown.kcal == null ? (
          <Meta>
            {t('tdee.deficitLabel')}: {t('common.notAvailable')}
          </Meta>
        ) : (
          renderDeficit(d, d.shown.kcal)
        )}
        {d.workouts.length > 0 && (
          <View style={styles.workouts}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${formatDateVi(d.dateKey)}. ${g(workoutsOpen[d.dateKey] ? 'journal.wo.hide' : 'journal.wo.show')}`}
              accessibilityState={{ expanded: !!workoutsOpen[d.dateKey] }}
              onPress={() => setWorkoutsOpen((o) => ({ ...o, [d.dateKey]: !o[d.dateKey] }))}
              style={styles.workoutsHead}
            >
              <HudText size={12} color={quest.hpText}>
                {workoutsOpen[d.dateKey] ? '▾' : '▸'}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
                {`${g('journal.wo.summary', { n: d.workouts.length, min: Math.round(d.workouts.reduce((sum, w) => sum + w.durationMin, 0)), kcal: Math.round(d.caloriesBurned) })} · ${d.workouts
                  .map((w) => workoutRange(w))
                  .join(', ')}`}
              </HudText>
            </Pressable>
            {workoutsOpen[d.dateKey] && <WorkoutEntries entries={d.workouts} lang={language === 'en' ? 'en' : 'vi'} />}
          </View>
        )}
        {d.proofsCount > 0 && (
          <Pressable accessibilityRole="link" accessibilityLabel={t('history.proofBadge', { n: d.proofsCount })} onPress={() => setViewing({ dateKey: d.dateKey, photos: d.proofs })} style={styles.proofLink}>
            <HudText size={12} color={quest.manaText} style={{ textDecorationLine: 'underline' }}>
              {t('history.proofBadge', { n: d.proofsCount })}
            </HudText>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${formatDateVi(d.dateKey)}. ${toggleLabel}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpandedDays((prev) => ({ ...prev, [d.dateKey]: !prev[d.dateKey] }))}
          style={styles.toggle}
        >
          <HudText size={13} color={quest.gold}>
            {toggleLabel}
          </HudText>
        </Pressable>
        {expanded && (
          <DailyMealBreakdownTable
            dark
            meals={d.meals}
            mealsEaten={d.mealsEaten}
            extraItems={d.extraItems}
            legacyTotals={d.legacyTotals}
            dateKey={d.dateKey}
            removedMealSlots={d.removedMealSlots}
            editable={!readOnly}
            onSave={(draft) => saveDayLog(d.dateKey, draft)}
          />
        )}
      </View>
    );
  }

  const monthDays = days.filter((d) => monthKeyOf(d.dateKey) === monthKey);

  return (
    <View>
      {/* The month calendar: each day's deficit in its colour, ⚠ for a meal not logged; a tap opens the day. */}
      <View style={styles.panel}>
        <View style={styles.calNav}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('history.prevMonth')} onPress={() => setCalMonth((c) => shiftMonth(c, -1))} style={styles.calNavButton}>
            <QuestIcon name="back" size={18} color={quest.gold} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('history.pickMonth')}: ${monthLabel(calMonth, language)}`}
            accessibilityState={{ expanded: pickerYear !== null }}
            onPress={() => setPickerYear(pickerYear === null ? calMonth.year : null)}
            style={styles.calTitle}
          >
            <HudText size={15}>
              {monthLabel(calMonth, language)} {pickerYear === null ? '▾' : '▴'}
            </HudText>
            {monthStats.n > 0 && (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('journal2.month.met', { met: monthStats.met, n: monthStats.n })}
              </HudText>
            )}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('history.nextMonth')} onPress={() => setCalMonth((c) => shiftMonth(c, 1))} style={styles.calNavButton}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <QuestIcon name="back" size={18} color={quest.gold} strokeWidth={2.4} />
            </View>
          </Pressable>
        </View>
        {pickerYear !== null && (
          <View style={styles.picker}>
            <View style={styles.calNav}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('history.prevYear')} onPress={() => setPickerYear(pickerYear - 1)} style={styles.calNavButton}>
                <HudText size={16} color={quest.gold}>
                  ‹
                </HudText>
              </Pressable>
              <HudText size={15} style={styles.calTitleText}>
                {pickerYear}
              </HudText>
              <Pressable accessibilityRole="button" accessibilityLabel={t('history.nextYear')} onPress={() => setPickerYear(pickerYear + 1)} style={styles.calNavButton}>
                <HudText size={16} color={quest.gold}>
                  ›
                </HudText>
              </Pressable>
            </View>
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const on = calMonth.year === pickerYear && calMonth.month === month;
                const label = monthLabel({ year: pickerYear, month }, language);
                return (
                  <Pressable
                    key={month}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setCalMonth({ year: pickerYear, month });
                      setPickerYear(null);
                    }}
                    style={[styles.monthCell, on && { backgroundColor: quest.gold }]}
                  >
                    <HudText size={13} color={on ? quest.onGold : quest.text}>
                      {shortMonthLabel(month, language)}
                    </HudText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <View style={styles.calRow}>
          {weekdays.map((w) => (
            <View key={w} style={styles.calCell}>
              <HudText size={12} color={quest.textSecondary}>
                {w}
              </HudText>
            </View>
          ))}
        </View>
        {monthGrid(calMonth).map((week, i) => (
          <View key={i} style={styles.calRow}>
            {week.map((dateKey, j) => {
              if (!dateKey) return <View key={j} style={styles.calCell} />;
              const day = byKey.get(dateKey);
              const deficit = day?.shown.kcal ?? null;
              const projected = !!day?.shown.projected;
              const incomplete = !!day?.shown.incomplete;
              const cheat = !!day?.cheat;
              const future = dateKey > todayKey;
              const level = incomplete || deficit == null ? (cheat ? 'cheat' : null) : levelOf(dateKey, deficit);
              const deficitText = cheat ? g('deficit.cheatShort') : deficit == null ? '' : `${projected ? '~' : ''}${formatDeficitShort(deficit)}${incomplete ? '⚠' : ''}`;
              const deficitLabel = cheat
                ? `. ${g('deficit.level.cheat')}`
                : deficit == null
                  ? ''
                  : `. ${t(deficit >= 0 ? 'history.deficitShort' : 'history.surplusShort')}: ${projected ? '~' : ''}${Math.round(Math.abs(deficit))} kcal` +
                    (projected ? ` (${g('deficit.projectedShort')})` : '') +
                    (incomplete && day ? `. ${g('deficit.missingLine', { meals: mealNames(day.missingMeals, g) })}` : '');
              const fill = level && !projected ? deficitColor(level, 'transparent') : 'transparent';
              return (
                <Pressable
                  key={dateKey}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDateVi(dateKey)}${deficitLabel}`}
                  accessibilityState={{ selected: dateKey === selectedKey, disabled: future }}
                  disabled={future}
                  onPress={() => onOpenDay(dateKey)}
                  style={[
                    styles.calCell,
                    styles.calDay,
                    { backgroundColor: fill === 'transparent' ? (day ? quest.raised : 'transparent') : fill },
                    dateKey === todayKey && { borderColor: quest.gold },
                    incomplete && styles.calIncomplete,
                    future && { opacity: 0.45 },
                  ]}
                >
                  <HudText size={13} color={fill !== 'transparent' ? quest.onGold : day ? quest.text : quest.textSecondary}>
                    {Number(dateKey.slice(8))}
                  </HudText>
                  <HudText size={10} weight="medium" color={fill !== 'transparent' ? quest.onGold : quest.textSecondary} numberOfLines={1}>
                    {deficitText || ' '}
                  </HudText>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={styles.legend}>
          {LEGEND.map((l) => (
            <View key={l.level} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: DEFICIT_LEVEL_COLOR[l.level] }]} />
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g(l.key)}
              </HudText>
            </View>
          ))}
          <InfoButton label={g('journal2.legendInfo')} title={g('journal2.legendTitle')} text={g('journal2.legendFull', { target: deficitTarget })} />
        </View>
        <Meta>{g('journal2.month.legend.missing')}</Meta>
        <Meta>{g('journal2.month.tapHint')}</Meta>
      </View>

      {/* A short summary; the full analysis stays its own screen (dialogs.md decision 8). */}
      <View style={[styles.panel, styles.summary]}>
        <HudText size={15} accessibilityRole="header">
          {g('journal2.month.summary')}
        </HudText>
        <Meta>
          {monthStats.n > 0 && monthStats.avg != null
            ? g('journal2.month.summaryLine', { met: monthStats.met, n: monthStats.n, avg: Math.round(monthStats.avg).toLocaleString('en-US') })
            : g('journal2.month.summaryNone')}
        </Meta>
        {monthWeightChange != null && <Meta>{g('journal2.month.summaryWeight', { change: `${monthWeightChange > 0 ? '+' : ''}${monthWeightChange.toFixed(1)}` })}</Meta>}
        {!readOnly && (
          <Pressable accessibilityRole="link" accessibilityLabel={g('journal2.month.deep')} onPress={() => router.push('/insights')} style={styles.linkRow}>
            <HudText size={14} color={quest.gold}>
              {g('journal2.month.deep')}
            </HudText>
            <QuestIcon name="chevron" size={14} color={quest.gold} />
          </Pressable>
        )}
      </View>

      <Pressable
        accessibilityRole={readOnly ? undefined : 'link'}
        accessibilityLabel={`${g('journal2.month.weight')}. ${g('journal2.month.weightLine', { from: settings.startWeightKg.toFixed(1), to: (latest?.weightKg ?? settings.startWeightKg).toFixed(1) })}`}
        accessibilityHint={readOnly ? undefined : g('journey.weightChipA11y')}
        disabled={readOnly}
        onPress={() => router.push('/weight')}
        style={({ pressed }) => [styles.panel, styles.weightCard, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.flex}>
          <HudText size={15}>{g('journal2.month.weight')}</HudText>
          <HudText size={18} color={quest.gold}>
            {g('journal2.month.weightLine', { from: settings.startWeightKg.toFixed(1), to: (latest?.weightKg ?? settings.startWeightKg).toFixed(1) })}
          </HudText>
          <Meta>{g('journal2.month.weightGoal', { kg: settings.goalWeightKg.toFixed(1) })}</Meta>
        </View>
        {!readOnly && <QuestIcon name="chevron" size={16} color={quest.textSecondary} />}
      </Pressable>

      <Section right={<HudText size={13} color={quest.gold}>🔥 {g('journal2.month.streakNow', { n: streak })}</HudText>}>{g('journal2.month.streak')}</Section>
      <View style={styles.badgeRow}>
        {STREAK_BADGE_THRESHOLDS.slice(0, Math.max(4, badges.length + 1)).map((b) => {
          const got = badges.includes(b);
          return (
            <View key={b} style={[styles.pill, got ? { borderColor: quest.gold, backgroundColor: quest.raised } : { borderColor: quest.border }]}>
              <HudText size={12} color={got ? quest.gold : quest.textSecondary}>
                {t('today.streakDays', { n: b })}
                {b === nextBadge ? ` · ${b - streak}` : ''}
              </HudText>
            </View>
          );
        })}
      </View>
      {badges.length === 0 && <Meta>{t('history.emptyBadges')}</Meta>}

      {feedbackList.length > 0 && (
        <>
          <Section>{t('history.coachFeedbackTitle')}</Section>
          {feedbackList.map((f) => (
            <View key={f.id} style={styles.panel}>
              <HudText size={12} color={quest.manaText}>
                {f.periodLabel} · {f.periodType === 'weekly' ? t('history.periodWeek') : t('history.periodMonth')}
              </HudText>
              <Meta>{f.feedbackText}</Meta>
              <Meta>{formatDateVi(toDateKey(new Date(f.createdAtISO)))}</Meta>
            </View>
          ))}
        </>
      )}

      <Section>{t('history.milestonesTitle')}</Section>
      {milestones.map((m) => (
        <View key={m.key} style={[styles.panel, styles.milestoneRow]}>
          <View style={styles.flex}>
            <HudText size={14}>{t(`milestone.${m.key}` as StringKey)}</HudText>
            <Meta>{t('history.milestoneDue', { date: formatDateVi(toDateKey(m.targetDate)), kg: m.targetWeightKg.toFixed(1) })}</Meta>
          </View>
          <HudText size={12} color={MILESTONE_STATUS_COLOR[m.status]}>
            {t(MILESTONE_STATUS_KEY[m.status])}
          </HudText>
        </View>
      ))}

      <Section>{t('history.deficitChartTitle')}</Section>
      {deficitTrendChart ? (
        <View style={styles.panel}>
          <LineChart
            // chart-kit's types don't admit `null`, but its patched runtime (patches/react-native-chart-kit+7.0.4.patch) draws it as a gap.
            data={deficitTrendChart as any}
            width={lineChartWidth}
            height={180}
            chartConfig={chartConfig}
            bezier
            fromZero={false}
            withShadow={false}
            hidePointsAtIndex={deficitTrendChart.datasets[0].data.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0)}
            style={styles.chart}
          />
          <Meta>{t('history.deficitChartHint')}</Meta>
        </View>
      ) : (
        <Meta style={styles.empty}>{t('history.emptyChart')}</Meta>
      )}

      <Section>{t('history.dailyChartTitle')}</Section>
      {dailyCharts ? (
        <View style={styles.panel}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: quest.gold }]} />
            <Meta style={styles.noTop}>{t('history.legendCaloriesIn')}</Meta>
          </View>
          <LineChart data={dailyCharts.caloriesIn} width={lineChartWidth} height={160} chartConfig={chartConfig} bezier style={styles.chart} />
          <View style={[styles.legendItem, { marginTop: 8 }]}>
            <View style={[styles.swatch, { backgroundColor: quest.xp }]} />
            <Meta style={styles.noTop}>{t('history.legendCaloriesOut')}</Meta>
          </View>
          <LineChart data={dailyCharts.caloriesOut} width={lineChartWidth} height={160} chartConfig={chartConfig} bezier style={styles.chart} />
        </View>
      ) : (
        <Meta style={styles.empty}>{t('history.emptyChart')}</Meta>
      )}

      <Section>{g('journal2.month.days')}</Section>
      {monthDays.length === 0 ? <Meta style={styles.empty}>{t('history.emptyData')}</Meta> : monthDays.map(renderDay)}

      <PhotoViewer
        photos={viewing ? viewing.photos.map((p) => ({ uri: p.photoUri, label: p.note || undefined, caption: proofCaption(p, viewing.dateKey) })) : null}
        title={viewing ? g('photo.dayTitle', { date: formatDateVi(viewing.dateKey) }) : undefined}
        onClose={() => setViewing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8 },
  panel: { backgroundColor: quest.panel, borderColor: quest.border, borderWidth: 1.5, borderRadius: questRadius.panel, padding: 14, marginBottom: 10, overflow: 'hidden' },
  meta: { marginTop: 4, lineHeight: 17 },
  noTop: { marginTop: 0 },
  empty: { textAlign: 'center', marginBottom: 12 },
  summary: { borderColor: quest.gold, gap: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  weightCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, minHeight: 32, justifyContent: 'center' },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chart: { borderRadius: questRadius.row },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  proofLink: { marginTop: 6, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  workouts: { marginTop: 6, gap: 6 },
  workoutsHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, minHeight: 32, paddingVertical: 4 },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calNavButton: { width: 44, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  calTitle: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  calTitleText: { flex: 1, textAlign: 'center' },
  picker: { borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, padding: 8, marginBottom: 10 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthCell: { width: '23%', minHeight: 44, borderRadius: 8, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 4 },
  calDay: { minHeight: 44, borderRadius: 8, borderWidth: 1.5, borderColor: 'transparent', margin: 1.5, justifyContent: 'center' },
  calIncomplete: { borderStyle: 'dashed', borderColor: quest.textSecondary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
