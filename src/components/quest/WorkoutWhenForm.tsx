import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { movedWorkoutStart, type WorkoutWhen } from '../../game/workoutWhen';
import { quest } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { clockText, parseClock, timeTextInvalid } from '../../utils/mealClock';
import { DateChip } from './DateChip';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestField } from './QuestField';

interface Props {
  /** The workout's start as logged. */
  dateISO: string;
  now?: Date;
  onSave: (next: WorkoutWhen) => void;
  onCancel: () => void;
}

/** "Sửa ngày & giờ" of a logged workout (like the food's "Sửa ngày, bữa & giờ"): the day it was done on (today or before) and its start
 *  time. Nothing is saved before "Lưu"; a start later than now is refused with a red line. */
export function WorkoutWhenForm({ dateISO, now: nowProp, onSave, onCancel }: Props) {
  const g = useGameText();
  const now = nowProp ?? new Date();
  const start = new Date(dateISO);
  const [day, setDay] = useState(() => toDateKey(start));
  const [timeText, setTimeText] = useState(() => clockText([start.getHours(), start.getMinutes()]));
  const timeInvalid = timeTextInvalid(timeText);
  const clock = parseClock(timeText);
  // The time box shows the logged time, so an unchanged box keeps the exact start (seconds included).
  const typed = clock && timeText.trim() !== clockText([start.getHours(), start.getMinutes()]) ? clock : null;
  const future = !timeInvalid && movedWorkoutStart(dateISO, { dateKey: day, clock: typed }, now) === null;
  const blocked = timeInvalid || future;

  return (
    <View style={styles.wrap} testID="workout-when-form">
      <View style={styles.dayRow}>
        <HudText size={13} color={quest.textSecondary}>
          {g('wkWhen.day')}
        </HudText>
        <DateChip size="small" value={day} now={now} onChange={setDay} />
      </View>
      <QuestField label={g('wkWhen.time')} keyboardType="numbers-and-punctuation" placeholder="17:30" value={timeText} onChangeText={setTimeText} maxLength={5} testID="workout-when-time" />
      <HudText size={11} weight="medium" color={blocked ? quest.hpText : quest.textSecondary} accessibilityRole={blocked ? 'alert' : undefined}>
        {timeInvalid ? g('wkWhen.timeError') : future ? g('wkWhen.future') : g('wkWhen.hint')}
      </HudText>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <QuestButton variant="ghost" title={g('journal.partCancel')} onPress={onCancel} />
        </View>
        <View style={styles.flex}>
          <QuestButton icon="check" title={g('journal.whenSave')} onPress={() => !blocked && onSave({ dateKey: day, clock: typed })} disabled={blocked} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
});
