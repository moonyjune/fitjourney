import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { ClientSnapshot } from '../../coach/clientSnapshot';
import { DateChip } from '../../components/quest/DateChip';
import { QuestSegment } from '../../components/quest/QuestSegment';
import { ScreenTemplate } from '../../components/quest/ScreenTemplate';
import { MISSION_ORDER, type MissionId } from '../../game/constants';
import { dayDeficitMark } from '../../game/deficitView';
import { useGameText } from '../../game/strings';
import { useNow } from '../../game/useGameState';
import { useTranslation } from '../../i18n/useTranslation';
import { selectedDayKey, useSelectedDayStore } from '../../store/useSelectedDayStore';
import { screenMaxWidthStyle } from '../../theme/responsive';
import { useLightStatusBar } from '../../theme/useLightStatusBar';
import { toDateKey } from '../../utils/date';
import { isoWeekNumber } from '../../utils/isoWeek';
import { oldestPickableKey } from '../../utils/logDate';
import { addDays } from '../../utils/milestones';
import { isSidewaysDrag, swipedDayKey } from '../../utils/swipe';
import { weekStartKey } from '../../utils/weekKey';
import { JournalView } from '../JournalView';
import { JournalMonth } from './JournalMonth';
import { JournalWeek } from './JournalWeek';
import { useDaySummaries } from './useDaySummaries';
import { useJournalSubject } from './useJournalSubject';

export type JournalTab = 'day' | 'week' | 'month';
const TABS: JournalTab[] = ['day', 'week', 'month'];

/** Reads the `tab` and `focus` route params (`/journal?tab=day&focus=purine`), ignoring anything else. */
export function journalParams(params: { tab?: string | string[]; focus?: string | string[] }): { tab: JournalTab; focus?: MissionId } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab = one(params.tab);
  const focus = one(params.focus);
  return {
    tab: TABS.includes(tab as JournalTab) ? (tab as JournalTab) : 'day',
    focus: MISSION_ORDER.includes(focus as MissionId) ? (focus as MissionId) : undefined,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (key: string) => new Date(`${key}T12:00:00`);

interface JournalScreenProps {
  /** A coach's read-only view of a client's journal. */
  client?: ClientSnapshot;
  initialTab?: JournalTab;
  /** A mission opened from Camp: Ngày scrolls to the nutrient table with that row lit. */
  focus?: MissionId;
}

/** "Nhật ký" (Design/uiux-proposal README §3.8, mockup 07): one screen with Ngày | Tuần | Tháng, in place of the old History, the
 *  full-page battle log, the boss's weekly log and the entries to the weekly report and the analysis. The day is shared: the Week strip
 *  and the Month calendar open a day in the Day tab, and the user's own day is the app-wide selected day (Camp's day chip). */
export function JournalScreen({ client, initialTab = 'day', focus }: JournalScreenProps) {
  const g = useGameText();
  const { language } = useTranslation();
  useLightStatusBar();
  const now = useNow();
  const todayKey = toDateKey(now);
  const subject = useJournalSubject(client, now);
  const { days, byKey, weeks } = useDaySummaries(subject);

  const [tab, setTab] = useState<JournalTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  // The user's own selected day is app-wide (Camp, the quick-add sheet and the check-in start on it); a coach's view keeps its own.
  const storedKey = useSelectedDayStore((s) => s.selectedKey);
  const selectStored = useSelectedDayStore((s) => s.select);
  const [clientKey, setClientKey] = useState(todayKey);
  const selectedKey = client ? (clientKey > todayKey ? todayKey : clientKey) : selectedDayKey(storedKey, now);
  const select = (key: string) => (client ? setClientKey(key) : selectStored(key, now));

  // Ngày: a swipe to the right shows the day before, to the left the next day (never past today nor before the calendar's oldest day).
  // Only a clearly sideways drag is taken, so vertical scrolling and taps in the day stay as they were.
  const minKey = oldestPickableKey(now, subject.settings.startDateISO);
  const swipeDay = useRef<(dx: number, vx: number) => void>(() => {});
  swipeDay.current = (dx, vx) => {
    const next = swipedDayKey(selectedKey, dx, vx, todayKey, minKey);
    if (next) select(next);
  };
  const dayDrag = useRef(new Animated.Value(0)).current;
  const daySwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, s) => isSidewaysDrag(s.dx, s.dy),
      onPanResponderTerminationRequest: () => true,
      onPanResponderMove: (_, s) => dayDrag.setValue(Math.max(-60, Math.min(60, s.dx * 0.4))),
      onPanResponderRelease: (_, s) => {
        swipeDay.current(s.dx, s.vx);
        Animated.spring(dayDrag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(dayDrag, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start(),
    })
  ).current;

  const scrollRef = useRef<ScrollView>(null);
  function changeTab(next: JournalTab) {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (!client) router.setParams({ tab: next, focus: undefined });
  }
  function openDay(key: string) {
    select(key);
    changeTab('day');
  }

  // A mission opened from Camp: scroll once to the nutrient table (its row is lit for as long as the focus stays).
  const contentY = useRef<number | null>(null);
  const tableY = useRef<number | null>(null);
  const scrolled = useRef(false);
  function scrollToTable() {
    if (!focus || tab !== 'day' || scrolled.current || contentY.current == null || tableY.current == null) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, contentY.current + tableY.current - 12), animated: true });
  }

  const selectedDate = dateOf(selectedKey);
  const monday = dateOf(weekStartKey(selectedDate));
  const dayMonth = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const eyebrow =
    tab === 'day'
      ? g('journal.eyebrow', { date: selectedDate.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }), week: isoWeekNumber(selectedDate) })
      : tab === 'week'
        ? g('journal2.weekRange', { n: isoWeekNumber(monday), from: dayMonth(monday), to: dayMonth(addDays(monday, 6)) })
        : undefined;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <ScreenTemplate
      title={client ? `${g('journal2.title')} · ${client.displayName}` : g('journal2.title')}
      eyebrow={eyebrow}
      onBack={goBack}
      right={
        tab === 'day' ? (
          <DateChip
            value={selectedKey}
            onChange={select}
            now={now}
            size="small"
            isMarked={(k) => subject.logs[k] != null}
            markOf={(k) => dayDeficitMark(subject.evaluate(k), { targetKcal: subject.deficitTarget, tdeeKcal: subject.tdeeKcal, cheat: subject.cheatDays.includes(k) })}
            minKey={minKey}
          />
        ) : undefined
      }
      scroll={false}
      contentStyle={styles.frame}
      testID="journal-screen"
    >
      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={[styles.content, screenMaxWidthStyle]} keyboardShouldPersistTaps="handled">
        <QuestSegment
          accessibilityLabel={g('journal2.tabs')}
          value={tab}
          onChange={changeTab}
          options={TABS.map((v) => ({ value: v, label: g(`journal2.tab.${v}`) }))}
        />
        <View
          style={styles.tabBody}
          onLayout={(e) => {
            contentY.current = e.nativeEvent.layout.y;
            scrollToTable();
          }}
        >
          {tab === 'day' && (
            <Animated.View {...daySwipe.panHandlers} style={{ transform: [{ translateX: dayDrag }] }} testID="journal-day-swipe">
              <JournalView
                client={client}
                dayKey={selectedKey}
                focus={focus}
                onTableLayout={(y) => {
                  tableY.current = y;
                  scrollToTable();
                }}
              />
            </Animated.View>
          )}
          {tab === 'week' && <JournalWeek subject={subject} weeks={weeks} selectedKey={selectedKey} onSelect={select} onOpenDay={openDay} />}
          {tab === 'month' && <JournalMonth subject={subject} days={days} byKey={byKey} selectedKey={selectedKey} onOpenDay={openDay} />}
        </View>
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  frame: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },
  tabBody: { marginTop: 14 },
});
