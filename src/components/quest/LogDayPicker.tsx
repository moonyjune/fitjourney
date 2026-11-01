import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { logDayLabel } from '../../game/useLogDate';
import { quest, questRadius } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { oldestLogDateKey } from '../../utils/logDate';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

interface LogDayPickerProps {
  /** The day being logged on (today back to MAX_LOG_DAYS_BACK days). */
  dateKey: string;
  now: Date;
  /** Moves the day by ±1. */
  onShift: (days: number) => void;
  onToday: () => void;
  /** Shown under the row when another day than today is picked. */
  hint?: string;
}

/** "Ghi cho ngày ‹ Hôm qua ›": the day a logging sheet writes to, never in the future. */
export function LogDayPicker({ dateKey, now, onShift, onToday, hint }: LogDayPickerProps) {
  const g = useGameText();
  const isToday = dateKey === toDateKey(now);
  const oldest = dateKey <= oldestLogDateKey(now);
  const dayLabel = logDayLabel(dateKey, now, g);
  return (
    <View style={styles.dateBox}>
      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
        {g('quick.date').toUpperCase()}
      </HudText>
      <View style={styles.dateRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('quick.datePrev')}
          accessibilityState={{ disabled: oldest }}
          disabled={oldest}
          onPress={() => onShift(-1)}
          style={[styles.dateStep, oldest && styles.off]}
        >
          <QuestIcon name="chevronLeft" size={20} color={quest.text} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isToday ? `${g('quick.date')}: ${dayLabel}` : `${g('quick.date')}: ${dayLabel}. ${g('quick.dateToday')}`}
          disabled={isToday}
          onPress={onToday}
          style={[styles.dateValue, !isToday && styles.datePicked]}
        >
          <HudText size={16} color={isToday ? quest.text : quest.goldLight}>
            {dayLabel}
          </HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {isToday ? dateKey.split('-').reverse().slice(0, 2).join('/') : g('quick.dateToday')}
          </HudText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('quick.dateNext')}
          accessibilityState={{ disabled: isToday }}
          disabled={isToday}
          onPress={() => onShift(1)}
          style={[styles.dateStep, isToday && styles.off]}
        >
          <QuestIcon name="chevron" size={20} color={quest.text} strokeWidth={2.4} />
        </Pressable>
      </View>
      {!isToday && hint ? (
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {hint}
        </HudText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateBox: { gap: 6, marginTop: 16 },
  eyebrow: { letterSpacing: 1.6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateStep: {
    width: 48,
    height: 48,
    borderRadius: 99,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateValue: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: questRadius.row,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  datePicked: { borderColor: quest.gold },
  off: { opacity: 0.4 },
});
