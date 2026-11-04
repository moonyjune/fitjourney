import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { dayDeficitMark, type DayDeficitMark } from '../../game/deficitView';
import { useGameText } from '../../game/strings';
import { logDayLabel } from '../../game/useLogDate';
import { useDayEvaluator, useNow, useTdeeKcal } from '../../game/useGameState';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSelectedDayStore, workingDayKey } from '../../store/useSelectedDayStore';
import { quest } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { oldestPickableKey } from '../../utils/logDate';
import { DatePickerSheet } from './DatePickerSheet';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

export interface DateChipProps {
  /** The day shown. Leave out to show (and change) the app-wide selected day (`useSelectedDayStore`, the one Camp's week strip sets). */
  value?: string;
  /** Called with the day picked. Leave out to set the app-wide selected day. */
  onChange?: (dateKey: string) => void;
  now?: Date;
  /** Days with something logged (a dot in the calendar when the day has no deficit colour). Default: days with a nutrition log. */
  isMarked?: (dateKey: string) => boolean;
  /** Each day's deficit colour in the calendar. Default: the signed-in user's own days (`useDayEvaluator` + `dayDeficitMark`). */
  markOf?: (dateKey: string) => DayDeficitMark;
  /** The oldest day that can be picked. Default: the plan's start date, a year back at least (`oldestPickableKey`). */
  minKey?: string;
  /** One line under the sheet title. */
  hint?: string;
  /** `small` (36 pt) sits in a sheet header; the default 44 pt sits in a screen header. */
  size?: 'default' | 'small';
}

/** "📅 Hôm nay ▾": the day the logging screens write to. Gold when another day than today is picked. Opens `DatePickerSheet`. */
export function DateChip({ value, onChange, now: nowProp, isMarked, markOf, minKey, hint, size = 'default' }: DateChipProps) {
  const g = useGameText();
  const ticking = useNow();
  const now = nowProp ?? ticking;
  const selectedKey = useSelectedDayStore((s) => s.selectedKey);
  const select = useSelectedDayStore((s) => s.select);
  const logs = useNutritionStore((s) => s.logs);
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const targetKcal = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const tdeeKcal = useTdeeKcal();
  const evaluate = useDayEvaluator(now);
  const [open, setOpen] = useState(false);

  const dateKey = value ?? workingDayKey(selectedKey, now);
  const picked = dateKey !== toDateKey(now);
  const label = logDayLabel(dateKey, now, g);
  const marked = isMarked ?? ((key: string) => logs[key] != null);
  const ownMark = (key: string) => dayDeficitMark(evaluate(key), { targetKcal, tdeeKcal });
  const color = picked ? quest.onGold : quest.text;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g('date.chipA11y', { day: label })}
        onPress={() => setOpen(true)}
        hitSlop={size === 'small' ? 4 : 0}
        style={({ pressed }) => [styles.chip, size === 'small' ? styles.small : styles.normal, picked && styles.picked, pressed && styles.pressed]}
      >
        <QuestIcon name="calendar" size={size === 'small' ? 14 : 16} color={color} strokeWidth={2.2} />
        <HudText size={size === 'small' ? 12 : 13} color={color} numberOfLines={1}>
          {label}
        </HudText>
        <QuestIcon name="chevronDown" size={size === 'small' ? 14 : 16} color={color} strokeWidth={2.4} />
      </Pressable>
      <DatePickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        value={dateKey}
        now={now}
        isMarked={marked}
        markOf={markOf ?? ownMark}
        minKey={minKey ?? oldestPickableKey(now, startDateISO)}
        hint={hint}
        onPick={(key) => (onChange ? onChange(key) : select(key, now))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  normal: { minHeight: 44 },
  small: { minHeight: 44, paddingHorizontal: 10 },
  picked: { backgroundColor: quest.gold, borderColor: quest.gold },
  pressed: { opacity: 0.85 },
});
