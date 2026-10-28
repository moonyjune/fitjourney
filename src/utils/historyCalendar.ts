// Pure helpers for the History diary's two layouts: the day list grouped by month, and the month calendar.
// Dates are local `YYYY-MM-DD` keys (see utils/date.ts toDateKey).

export interface YearMonth {
  year: number;
  /** 1-12. */
  month: number;
}

/** "2026-10" for a date key or a year/month. */
export function monthKeyOf(value: string | YearMonth): string {
  if (typeof value === 'string') return value.slice(0, 7);
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

export function parseMonthKey(monthKey: string): YearMonth {
  const [y, m] = monthKey.split('-').map(Number);
  return { year: y, month: m };
}

/** Groups days (any order) by month, newest month first, keeping the days' order inside each month. */
export function groupByMonth<T extends { dateKey: string }>(days: readonly T[]): { monthKey: string; days: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const d of days) {
    const key = monthKeyOf(d.dateKey);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([monthKey, list]) => ({ monthKey, days: list }));
}

/** The month `delta` months away (negative = earlier), across year boundaries. */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The month grid, Monday first: whole weeks of 7 cells, each a date key of that month or null for padding. */
export function monthGrid({ year, month }: YearMonth): (string | null)[][] {
  const daysInMonth = new Date(year, month, 0).getDate();
  // getDay(): 0 = Sunday. Shift so Monday is column 0.
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthKeyOf({ year, month })}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Tháng 10/2026" / "October 2026". */
export function monthLabel({ year, month }: YearMonth, language: 'vi' | 'en'): string {
  return language === 'en' ? `${EN_MONTHS[month - 1]} ${year}` : `Tháng ${month}/${year}`;
}

/** Short month name for the month picker: "Th 10" / "Oct". */
export function shortMonthLabel(month: number, language: 'vi' | 'en'): string {
  return language === 'en' ? EN_MONTHS[month - 1].slice(0, 3) : `Th ${month}`;
}

/** A day's deficit in a calendar cell: "350" for a 350 kcal deficit, "+120" for a 120 kcal surplus (ate more than
 *  was burned). */
export function formatDeficitShort(deficitKcal: number): string {
  const n = Math.round(Math.abs(deficitKcal));
  return deficitKcal >= 0 ? String(n) : `+${n}`;
}
