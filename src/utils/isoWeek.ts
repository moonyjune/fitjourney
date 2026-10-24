/** ISO-8601 week number (weeks start on Monday; week 1 contains the year's first Thursday). */
export function isoWeekNumber(date: Date): number {
  // Work in UTC on the calendar date so a DST change can never shift the result by a day.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to the Thursday of this week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}
