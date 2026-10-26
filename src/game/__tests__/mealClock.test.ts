import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { buildTimeline } from '../../game/timeline';
import { DEFAULT_PLAN } from '../../constants/plan';
import { useNutritionStore } from '../../store/useNutritionStore';
import type { ExtraMealTime } from '../../types';
import { clockText, loggedAtFor, MEAL_CLOCK, parseClock, timeTextInvalid } from '../../utils/mealClock';

const hm = (iso: string) => {
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};
const NIGHT = new Date(2026, 9, 23, 23, 5, 30); // 23:05 on Friday 23/10

describe('loggedAtFor', () => {
  it('puts a picked meal at its usual time on the day, whatever the moment of entry', () => {
    const expected: [ExtraMealTime, number, number][] = [
      ['breakfast', 8, 0], ['morning_snack', 10, 0], ['lunch', 12, 0], ['afternoon_snack', 14, 0], ['late_afternoon_snack', 16, 0], ['dinner', 19, 0], ['evening_snack', 23, 0],
    ];
    for (const [meal, h, m] of expected) expect(hm(loggedAtFor('2026-10-23', meal, NIGHT))).toEqual([2026, 10, 23, h, m]);
    expect(Object.keys(MEAL_CLOCK)).toHaveLength(7);
  });

  it('uses the chosen day, not the day of entry (a breakfast entered the next morning for yesterday)', () => {
    expect(hm(loggedAtFor('2026-10-22', 'breakfast', new Date(2026, 9, 23, 6, 0)))).toEqual([2026, 10, 22, 8, 0]);
    expect(hm(loggedAtFor('2026-12-31', 'dinner', NIGHT))).toEqual([2026, 12, 31, 19, 0]);
  });

  it('with no meal picked: now for today, midday for another day', () => {
    expect(loggedAtFor('2026-10-23', null, NIGHT)).toBe(NIGHT.toISOString());
    expect(loggedAtFor('2026-10-23', undefined, NIGHT)).toBe(NIGHT.toISOString());
    expect(hm(loggedAtFor('2026-10-20', null, NIGHT))).toEqual([2026, 10, 20, 12, 0]);
  });
});

describe('parseClock', () => {
  it('reads the usual ways of typing a time', () => {
    for (const [text, expected] of [['19:30', [19, 30]], ['7:05', [7, 5]], ['07:05', [7, 5]], ['19h30', [19, 30]], ['19.30', [19, 30]], ['19 : 30', [19, 30]], ['1930', [19, 30]], [' 0:00 ', [0, 0]], ['23:59', [23, 59]]] as [string, [number, number]][]) {
      expect(parseClock(text)).toEqual(expected);
    }
  });

  it('refuses anything that is not a time of day', () => {
    for (const bad of ['24:00', '12:60', '25:00', '7', '730', '7:5', 'abc', '12:30pm', '12:3x', '-1:30', '1230 ', '123456', '']) {
      if (bad.trim() === '1230') continue; // surrounding spaces are trimmed: valid
      expect(parseClock(bad)).toBeNull();
    }
    expect(parseClock(undefined)).toBeNull();
    expect(parseClock(null)).toBeNull();
  });

  it('timeTextInvalid is true only for something typed that is not a time (empty is fine)', () => {
    expect(timeTextInvalid('')).toBe(false);
    expect(timeTextInvalid('   ')).toBe(false);
    expect(timeTextInvalid(undefined)).toBe(false);
    expect(timeTextInvalid('19:30')).toBe(false);
    expect(timeTextInvalid('25:00')).toBe(true);
    expect(timeTextInvalid('abc')).toBe(true);
  });

  it('clockText pads to HH:MM', () => {
    expect(clockText([7, 5])).toBe('07:05');
    expect(clockText([19, 30])).toBe('19:30');
  });
});

describe('an exact time wins over the meal\'s usual time', () => {
  it('is used on the chosen day, with or without a meal picked', () => {
    expect(hm(loggedAtFor('2026-10-22', 'dinner', NIGHT, [20, 30]))).toEqual([2026, 10, 22, 20, 30]);
    expect(hm(loggedAtFor('2026-10-22', null, NIGHT, [6, 5]))).toEqual([2026, 10, 22, 6, 5]);
    expect(hm(loggedAtFor('2026-10-23', 'dinner', NIGHT, null))).toEqual([2026, 10, 23, 19, 0]); // no exact time: the meal's
  });
});

describe('addExtra files the food at its meal', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NIGHT });
    useNutritionStore.setState({ logs: {} });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  const items = (day = '2026-10-23') => useNutritionStore.getState().logs[day]?.extraItems ?? [];

  it('a lunch entered at 23:05 sits at 12:00, a breakfast at 08:00, an unpicked one at the moment of entry', () => {
    const { addExtra } = useNutritionStore.getState();
    addExtra('2026-10-23', 'Cơm trưa', 600, 30, 'lunch');
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Bánh mì', 300, 10, 'breakfast');
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Khác', 100, 1, null);
    expect(items().map((i) => [i.name, hm(i.loggedAtISO).slice(3)])).toEqual([['Cơm trưa', [12, 0]], ['Bánh mì', [8, 0]], ['Khác', [23, 5]]]);
  });

  it('a food logged to a past day with a meal picked is filed on that day at that meal\'s time', () => {
    useNutritionStore.getState().addExtra('2026-10-21', 'Bữa tối qua', 700, 40, 'dinner');
    expect(hm(items('2026-10-21')[0].loggedAtISO)).toEqual([2026, 10, 21, 19, 0]);
  });

  it('an exact time given with the food is kept (a dinner at 20:30 stays 20:30), a blank one falls back to the meal', () => {
    const { addExtra } = useNutritionStore.getState();
    addExtra('2026-10-23', 'Tối muộn', 700, 40, 'dinner', { clock: [20, 30] });
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Tối thường', 700, 40, 'dinner', { clock: null });
    expect(items().map((i) => hm(i.loggedAtISO).slice(3))).toEqual([[20, 30], [19, 0]]);
  });

  it('the journal timeline lists them in the order of the day, not in the order they were typed', () => {
    const { addExtra } = useNutritionStore.getState();
    addExtra('2026-10-23', 'Tối', 700, 40, 'dinner');
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Sáng', 300, 10, 'breakfast');
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Phụ trưa', 150, 5, 'afternoon_snack');
    const timeline = buildTimeline({
      dateKey: '2026-10-23', now: NIGHT, log: useNutritionStore.getState().logs['2026-10-23'], meals: DEFAULT_PLAN.mealTemplates.training,
      waterSchedule: [], workouts: [], feelings: [], photoSlots: new Set(),
    });
    const extras = timeline.filter((i) => i.kind === 'extra').map((i) => (i as { name: string }).name);
    expect(extras).toEqual(['Sáng', 'Phụ trưa', 'Tối']);
  });
});
