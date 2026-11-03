import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { logDayLabel } from '../../game/useLogDate';
import { quest } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { dateOfKey, oldestLogDateKey, shiftDateKey } from '../../utils/logDate';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestChip } from './QuestChip';

/** The calendar's days: whole weeks from the Monday on or before the oldest day that can be picked to the Sunday on or after today. */
export function calendarDays(now: Date): string[] {
  const today = toDateKey(now);
  const oldest = oldestLogDateKey(now);
  const startShift = (dateOfKey(oldest).getDay() + 6) % 7; // days back to Monday
  const endShift = (7 - dateOfKey(today).getDay()) % 7; // days on to Sunday
  const first = shiftDateKey(oldest, -startShift);
  const last = shiftDateKey(today, endShift);
  const days: string[] = [];
  for (let key = first; key <= last; key = shiftDateKey(key, 1)) days.push(key);
  return days;
}

/** "16/10"-style day and month of a date key. */
function dayMonth(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${Number(d)}/${Number(m)}`;
}

export interface DatePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The day picked now. */
  value: string;
  now: Date;
  /** Called with the day chosen (never in the future, at most MAX_LOG_DAYS_BACK days back); the sheet then closes. */
  onPick: (dateKey: string) => void;
  /** Days that already have something logged get a green dot. */
  isMarked?: (dateKey: string) => boolean;
  /** One line under the title (default: what the day applies to). */
  hint?: string;
}

/** "Ghi cho ngày": quick chips (today, yesterday, 2 days ago) and a calendar of the last 30 days; the gold button confirms
 *  (Design/uiux-proposal/html/dialogs/01-date-sheet.html). Days in the future or too far back cannot be picked. */
export function DatePickerSheet({ visible, onClose, value, now, onPick, isMarked, hint }: DatePickerSheetProps) {
  const g = useGameText();
  const today = toDateKey(now);
  const oldest = oldestLogDateKey(now);
  const [pending, setPending] = useState(value);
  useEffect(() => {
    if (visible) setPending(value);
  }, [visible, value]);

  const days = useMemo(() => calendarDays(now), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const weekdays = g('logDate.weekdays').split(',');
  // Monday first, as in the mockup.
  const heads = [1, 2, 3, 4, 5, 6, 0].map((d) => weekdays[d] ?? '');

  const fromMonth = Number(oldest.split('-')[1]);
  const toMonth = Number(today.split('-')[1]);
  const year = today.split('-')[0];
  const range = fromMonth === toMonth ? g('date.range', { from: toMonth, year }) : g('date.rangeTwo', { from: fromMonth, to: toMonth, year });

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
          <QuestChip key={q.key} label={q.label} selected={pending === q.key} onPress={() => setPending(q.key)} />
        ))}
      </View>
      <HudText size={15} style={styles.range}>
        {range}
      </HudText>
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
        {weeks.map((week) => (
          <View key={week[0]} style={styles.week}>
            {week.map((key) => {
              const off = key > today || key < oldest;
              const on = key === pending;
              const marked = !off && !!isMarked?.(key);
              const dayName = fullLabel(key, ', ');
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={marked ? g('date.dayLoggedA11y', { day: dayName }) : dayName}
                  accessibilityState={{ disabled: off, selected: on }}
                  disabled={off}
                  onPress={() => setPending(key)}
                  style={[styles.cell, !off && styles.cellOn, on && styles.cellPicked, key === today && styles.cellToday]}
                >
                  <HudText size={14} color={on ? quest.onGold : off ? '#5D5480' : quest.text}>
                    {Number(key.split('-')[2])}
                  </HudText>
                  {marked && !on ? <View style={styles.dot} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.dot} />
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {`${g('date.logged')} · ${g('date.offNote')}`}
        </HudText>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  range: { marginTop: 16, marginBottom: 8, textAlign: 'center' },
  grid: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  headCell: { flex: 1, height: 22, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  cellOn: { backgroundColor: quest.raised },
  cellPicked: { backgroundColor: quest.gold, borderColor: quest.gold },
  cellToday: { borderColor: quest.gold },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: quest.xp },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
});
