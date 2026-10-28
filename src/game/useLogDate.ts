import { useLocalSearchParams } from 'expo-router';
import { toDateKey } from '../utils/date';
import { dateOfKey, logDateParam, shiftDateKey } from '../utils/logDate';
import { useGameText } from './strings';

type GameText = ReturnType<typeof useGameText>;

/** "Hôm nay", "Hôm qua" or "T3 27/10". */
export function logDayLabel(dateKey: string, now: Date, g: GameText): string {
  const today = toDateKey(now);
  if (dateKey === today) return g('logDate.today');
  if (dateKey === shiftDateKey(today, -1)) return g('logDate.yesterday');
  const date = dateOfKey(dateKey);
  const weekday = g('logDate.weekdays').split(',')[date.getDay()] ?? '';
  const [, m, d] = dateKey.split('-');
  return g('logDate.day', { weekday, date: `${d}/${m}` });
}

/** The day a logging screen writes to: the `date` route param from the quick-add sheet (checked), else today. */
export function useLogDate(now: Date): { dateKey: string; isToday: boolean; label: string } {
  const g = useGameText();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const dateKey = logDateParam(date, now);
  return { dateKey, isToday: dateKey === toDateKey(now), label: logDayLabel(dateKey, now, g) };
}
