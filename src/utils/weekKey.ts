import { toDateKey } from './date';

/** Returns the date key (YYYY-MM-DD) of the Monday that starts the week containing `date`. */
export function weekStartKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return toDateKey(d);
}

/** The Monday key of the week before the one containing `date`. */
export function previousWeekStartKey(date: Date): string {
  const monday = new Date(`${weekStartKey(date)}T12:00:00`);
  monday.setDate(monday.getDate() - 7);
  return toDateKey(monday);
}
