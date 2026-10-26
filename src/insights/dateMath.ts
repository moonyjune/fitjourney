/** Whole-day arithmetic on `YYYY-MM-DD` keys, independent of the device time zone. */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function keyFromDayNumber(n: number): string {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysToKey(dateKey: string, days: number): string {
  return keyFromDayNumber(dayNumber(dateKey) + days);
}

/** Monday of the week containing the key (weeks run Monday to Sunday). */
export function mondayOf(dateKey: string): string {
  const n = dayNumber(dateKey);
  const weekday = (n + 3) % 7; // 1970-01-01 was a Thursday: Monday = 0
  return keyFromDayNumber(n - weekday);
}

export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export const avg = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length);
