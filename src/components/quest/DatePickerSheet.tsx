import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DayDeficitMark } from '../../game/deficitView';
import { useGameText, type GameKey } from '../../game/strings';
import { logDayLabel } from '../../game/useLogDate';
import { quest, questRadius } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { monthGrid, monthKeyOf, parseMonthKey, shiftMonth, type YearMonth } from '../../utils/historyCalendar';
import { dateOfKey, oldestPickableKey, shiftDateKey } from '../../utils/logDate';
import { BottomSheet } from './BottomSheet';
import { deficitCellLook, DeficitLegend } from './DeficitLegend';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestChip } from './QuestChip';
import { QuestIcon } from './QuestIcon';

/** "16/10"-style day and month of a date key. */
function dayMonth(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/** The month a calendar can show, kept between the oldest pickable day's month and today's. */
export function clampMonth(month: YearMonth, oldestKey: string, todayKey: string): YearMonth {
  const key = monthKeyOf(month);
  if (key < monthKeyOf(oldestKey)) return parseMonthKey(monthKeyOf(oldestKey));
  if (key > monthKeyOf(todayKey)) return parseMonthKey(monthKeyOf(todayKey));
  return month;
}

export interface DatePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The day picked now. */
  value: string;
  now: Date;
  /** Called with the day chosen (never in the future, never before `minKey`); the sheet then closes. */
  onPick: (dateKey: string) => void;
  /** The oldest day that can be picked (default: a year back, see `oldestPickableKey`). */
  minKey?: string;
  /** Days that already have something logged (a dot when the day has no deficit colour). */
  isMarked?: (dateKey: string) => boolean;
  /** Each day's deficit colour (`dayDeficitMark`), as Journal › Tháng draws it. Leave out for a plain calendar. */
  markOf?: (dateKey: string) => DayDeficitMark;
  /** One line under the title (default: what the day applies to). */
  hint?: string;
}

/** "Ghi cho ngày": quick chips (today, yesterday, 2 days ago) and a month calendar with ‹ › to earlier months, each day in its
 *  deficit colour; the gold button confirms (Design/uiux-proposal/html/dialogs/01-date-sheet.html). Days in the future or before
 *  `minKey` cannot be picked. */
export function DatePickerSheet({ visible, onClose, value, now, onPick, minKey, isMarked, markOf, hint }: DatePickerSheetProps) {
  const g = useGameText();
  const today = toDateKey(now);
  const oldest = minKey && minKey <= today ? minKey : oldestPickableKey(now);
  const [pending, setPending] = useState(value);
  const [month, setMonth] = useState<YearMonth>(() => clampMonth(parseMonthKey(monthKeyOf(value)), oldest, today));
  useEffect(() => {
    if (!visible) return;
    setPending(value);
    setMonth(clampMonth(parseMonthKey(monthKeyOf(value)), oldest, today));
  }, [visible, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekdays = g('logDate.weekdays').split(',');
  // Monday first, as in the mockup.
  const heads = [1, 2, 3, 4, 5, 6, 0].map((d) => weekdays[d] ?? '');
  const canPrev = monthKeyOf(month) > monthKeyOf(oldest);
  const canNext = monthKeyOf(month) < monthKeyOf(today);

  const pick = (key: string) => {
    setPending(key);
    setMonth(parseMonthKey(monthKeyOf(key)));
  };

  const quick = [0, 1, 2].map((n) => {
    const key = shiftDateKey(today, -n);
    return { key, label: n === 0 ? g('logDate.today') : n === 1 ? g('logDate.yesterday') : g('date.daysAgo', { n }) };
  });

  const yesterday = shiftDateKey(today, -1);
  /** "Hôm qua · T5 22/10" for today and yesterday (their names carry no date), else "T4 21/10". */
  const fullLabel = (key: string, sep: string) => {
    const name = logDayLabel(key, now, g);
    return key === today || key === yesterday ? `${name}${sep}${weekdays[dateOfKey(key).getDay()]} ${dayMonth(key)}` : name;
  };
  const full = fullLabel(pending, ' · ');

  /** What a day's colour means, for screen readers. */
  const markText = (mark: DayDeficitMark): string | null => {
    if (mark.kind === 'cheat') return g('deficit.level.cheat');
    if (mark.kind === 'incomplete') return g('deficitLegend.missing');
    if (!mark.level) return null;
    const level = g(`deficit.level.${mark.level}` as GameKey);
    return mark.kind === 'pending' ? `${level} (${g('deficit.projectedShort')})` : level;
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={g('date.sheetTitle')}
      subtitle={hint ?? g('date.sheetHint')}
      testID="date-sheet"
      footer={
        <QuestButton
          title={g('date.confirm', { day: full })}
          onPress={() => {
            onPick(pending);
            onClose();
          }}
        />
      }
    >
      <View style={styles.quick}>
        {quick.map((q) => (
          <QuestChip key={q.key} label={q.label} selected={pending === q.key} onPress={() => pick(q.key)} disabled={q.key < oldest} />
        ))}
      </View>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('date.prevMonth')}
          accessibilityState={{ disabled: !canPrev }}
          disabled={!canPrev}
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          style={[styles.navButton, !canPrev && styles.navOff]}
        >
          <QuestIcon name="back" size={18} color={quest.gold} strokeWidth={2.4} />
        </Pressable>
        <HudText size={15} style={styles.title} accessibilityRole="header">
          {g('date.month', { month: month.month, year: month.year })}
        </HudText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('date.nextMonth')}
          accessibilityState={{ disabled: !canNext }}
          disabled={!canNext}
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          style={[styles.navButton, !canNext && styles.navOff]}
        >
          <View style={styles.flip}>
            <QuestIcon name="back" size={18} color={quest.gold} strokeWidth={2.4} />
          </View>
        </Pressable>
      </View>
      <View style={styles.grid} accessibilityRole="none">
        <View style={styles.week}>
          {heads.map((h) => (
            <View key={h} style={styles.headCell}>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {h}
              </HudText>
            </View>
          ))}
        </View>
        {visible &&
          monthGrid(month).map((week, i) => (
            <View key={i} style={styles.week}>
              {week.map((key, j) => {
                if (!key) return <View key={j} style={styles.blank} />;
                const off = key > today || key < oldest;
                const on = key === pending;
                const logged = !off && !!isMarked?.(key);
                const mark = !off && markOf ? markOf(key) : null;
                const look = mark ? deficitCellLook(mark, logged) : null;
                const meaning = mark ? markText(mark) : null;
                const dayName = fullLabel(key, ', ');
                const label = meaning ? g('date.dayMarkA11y', { day: dayName, mark: meaning }) : logged ? g('date.dayLoggedA11y', { day: dayName }) : dayName;
                const showDot = logged && (!mark || mark.kind === 'none');
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled: off, selected: on }}
                    disabled={off}
                    onPress={() => setPending(key)}
                    style={[
                      styles.cell,
                      !off && styles.cellOn,
                      look && { backgroundColor: look.backgroundColor === 'transparent' ? quest.raised : look.backgroundColor },
                      look?.dashed && styles.cellDashed,
                      key === today && styles.cellToday,
                      on && styles.cellPicked,
                    ]}
                  >
                    <HudText size={14} color={off ? '#5D5480' : look ? look.textColor : quest.text}>
                      {Number(key.split('-')[2])}
                      {mark?.kind === 'incomplete' ? '⚠' : mark?.kind === 'pending' ? '~' : ''}
                    </HudText>
                    {showDot ? <View style={styles.dot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
      </View>
      {markOf ? <DeficitLegend /> : null}
      <View style={styles.legend}>
        <View style={styles.dot} />
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {`${g('date.logged')} · ${g('date.offNoteStart')}`}
        </HudText>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
  navButton: { width: 44, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  navOff: { opacity: 0.35 },
  flip: { transform: [{ rotate: '180deg' }] },
  title: { flex: 1, textAlign: 'center' },
  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  headCell: { flex: 1, height: 22, alignItems: 'center', justifyContent: 'center' },
  blank: { flex: 1, height: 44 },
  cell: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  cellOn: { backgroundColor: quest.raised },
  cellDashed: { borderStyle: 'dashed', borderColor: quest.textSecondary },
  cellToday: { borderColor: quest.gold },
  // The picked day: a white ring (the fill stays the day's deficit colour).
  cellPicked: { borderColor: quest.text, borderWidth: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: quest.textSecondary },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
});
