import { describe, expect, it } from '@jest/globals';
import { formatDeficitShort, groupByMonth, monthGrid, monthKeyOf, monthLabel, parseMonthKey, shiftMonth } from '../../utils/historyCalendar';

describe('history calendar helpers', () => {
  it('groups days by month, newest month first, keeping the day order', () => {
    const days = ['2026-10-28', '2026-10-02', '2026-09-30', '2025-12-31', '2026-09-01'].map((dateKey) => ({ dateKey }));
    const groups = groupByMonth(days);
    expect(groups.map((g) => g.monthKey)).toEqual(['2026-10', '2026-09', '2025-12']);
    expect(groups[0].days.map((d) => d.dateKey)).toEqual(['2026-10-28', '2026-10-02']);
    expect(groups[1].days.map((d) => d.dateKey)).toEqual(['2026-09-30', '2026-09-01']);
    expect(groupByMonth([])).toEqual([]);
  });

  it('moves between months across year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 10 }, -22)).toEqual({ year: 2024, month: 12 });
    expect(parseMonthKey('2026-03')).toEqual({ year: 2026, month: 3 });
    expect(monthKeyOf({ year: 2026, month: 3 })).toBe('2026-03');
    expect(monthKeyOf('2026-03-15')).toBe('2026-03');
  });

  it('lays a month out in whole Monday-first weeks', () => {
    // 1 October 2026 is a Thursday: three empty cells (Mon-Wed) before it.
    const oct = monthGrid({ year: 2026, month: 10 });
    expect(oct[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(oct.every((w) => w.length === 7)).toBe(true);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
    expect(oct[oct.length - 1]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
    // February 2027 starts on a Monday and has 28 days: exactly four full weeks.
    expect(monthGrid({ year: 2027, month: 2 })).toHaveLength(4);
    // Leap year.
    expect(monthGrid({ year: 2028, month: 2 }).flat().filter(Boolean)).toHaveLength(29);
  });

  it('labels months in both languages and shows deficits / surpluses briefly', () => {
    expect(monthLabel({ year: 2026, month: 10 }, 'vi')).toBe('Tháng 10/2026');
    expect(monthLabel({ year: 2026, month: 10 }, 'en')).toBe('October 2026');
    expect(formatDeficitShort(350.4)).toBe('350');
    expect(formatDeficitShort(-120)).toBe('+120');
    expect(formatDeficitShort(0)).toBe('0');
  });
});
