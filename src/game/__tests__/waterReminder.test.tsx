import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../sync/cloudSync', () => ({ pushNutritionLog: jest.fn(), pushUserData: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { WaterReminderDialog } from '../../components/quest/WaterReminderDialog';
import { useWaterReminderStore } from '../../store/useWaterReminderStore';
import { dueWaterReminder, WATER_CHEER_COUNT, waterCheerIndex } from '../../water/reminder';
import { buildWaterSchedule } from '../../water/schedule';

const DAY = '2026-11-01';
const at = (h: number, m = 0) => new Date(2026, 10, 1, h, m);
// 3.5 L from 06:00 to 21:00: 06:00, 08:30, 11:00, 13:30, 16:00, 18:30, 21:00.
const schedule = buildWaterSchedule(3500, { startMinutes: 6 * 60, endMinutes: 21 * 60 });

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}

describe('water reminder: which drink time pops up', () => {
  it('pops up at a drink time with what is left to drink up to that time', () => {
    const due = dueWaterReminder(schedule, 500, 3500, at(8, 31), DAY, []);
    expect(due?.reminder).toMatchObject({ key: `${DAY}@08:30`, ml: 500, drunkMl: 500, targetMl: 3500, doneCount: 1, totalCount: 7 });
  });

  it('nothing before the first time, once shown, or when that much was already drunk', () => {
    expect(dueWaterReminder(schedule, 0, 3500, at(5, 59), DAY, [])).toBeNull();
    expect(dueWaterReminder(schedule, 500, 3500, at(8, 40), DAY, [`${DAY}@08:30`])).toBeNull();
    expect(dueWaterReminder(schedule, 1000, 3500, at(8, 40), DAY, [])).toBeNull();
  });

  it('missed times give one pop-up for the latest, with the amount to catch up, and mark them all shown', () => {
    const due = dueWaterReminder(schedule, 0, 3500, at(11, 20), DAY, []);
    expect(due?.reminder.key).toBe(`${DAY}@11:00`);
    expect(due?.reminder.ml).toBe(1500);
    expect(due?.dueKeys).toEqual([`${DAY}@06:00`, `${DAY}@08:30`, `${DAY}@11:00`]);
  });

  it('lists the day\'s drink times, the missed ones and spreads a shortfall over the times ahead', () => {
    // 11:20 with nothing drunk: 06:00 and 08:30 missed, 1,500 ml short. Drink 750 now (500 + 250), the other 750 over 13:30–21:00.
    const r = dueWaterReminder(schedule, 0, 3500, at(11, 20), DAY, [])!.reminder;
    expect(r).toMatchObject({ ml: 1500, nowMl: 750, reachMl: 750, missed: ['06:00', '08:30'] });
    expect(r.steps.map((s) => s.status)).toEqual(['missed', 'missed', 'now', 'later', 'later', 'later', 'later']);
    expect(r.catchUp.map((c) => [c.time, c.extraMl])).toEqual([['13:30', 150], ['16:00', 150], ['18:30', 150], ['21:00', 300]]);
    expect(r.catchUp.reduce((s, c) => s + c.extraMl, 0)).toBe(750);
    // On schedule: no missed time, no plan, drink the portion.
    const onTime = dueWaterReminder(schedule, 1000, 3500, at(11, 2), DAY, [])!.reminder;
    expect(onTime).toMatchObject({ nowMl: 500, reachMl: 1500, missed: [], catchUp: [] });
    // The last drink time takes the whole shortfall.
    expect(dueWaterReminder(schedule, 2000, 3500, at(21, 5), DAY, [])!.reminder).toMatchObject({ nowMl: 1500, reachMl: 3500, catchUp: [] });
  });

  it('a time more than 2 hours old is skipped', () => {
    expect(dueWaterReminder(schedule, 0, 3500, at(23, 30), DAY, [])).toBeNull();
  });

  it('the cheer line is stable for one time and within range', () => {
    const i = waterCheerIndex(`${DAY}@08:30`);
    expect(i).toBe(waterCheerIndex(`${DAY}@08:30`));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(WATER_CHEER_COUNT);
  });

  it('the store keeps only today\'s shown times', () => {
    useWaterReminderStore.setState({ shown: ['2026-10-31@21:00'], open: null });
    const due = dueWaterReminder(schedule, 0, 3500, at(6, 5), DAY, [])!;
    useWaterReminderStore.getState().show(due.reminder, due.dueKeys);
    expect(useWaterReminderStore.getState().shown).toEqual([`${DAY}@06:00`]);
    expect(useWaterReminderStore.getState().open?.ml).toBe(500);
  });
});

describe('water reminder pop-up', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => r?.unmount());
    r = undefined;
  });

  it('says how much to drink, the day so far and cheers; the button names the running total to reach', () => {
    const onDrink = jest.fn();
    const due = dueWaterReminder(schedule, 1000, 3500, at(11, 2), DAY, [])!;
    act(() => {
      r = create(<WaterReminderDialog reminder={due.reminder} onDrink={onDrink} onClose={() => {}} />);
    });
    const text = allText(r!);
    expect(text).toContain('11:00');
    expect(text).toContain('500 ml');
    expect(text).toContain('1000/3500 ml');
    const drink = r!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Đã uống đủ 1500 ml')[0];
    act(() => {
      drink.props.onPress();
    });
    expect(onDrink).toHaveBeenCalledWith(1500);
  });
});

describe('water reminder: the button sets the day to the milestone, never adds it', () => {
  it('with 3,000 ml already logged, "reached 3,500 ml" makes the day 3,500 ml, not 6,500', () => {
    const { WaterReminderHost } = require('../../water/WaterReminderHost');
    const { useNutritionStore } = require('../../store/useNutritionStore');
    const DAY_KEY = '2026-11-01';
    useNutritionStore.getState().addWater(DAY_KEY, 3000);
    const due = dueWaterReminder(schedule, 0, 3500, at(21, 5), DAY_KEY, [])!; // a stale pop-up that thought nothing was drunk
    expect(due.reminder.reachMl).toBe(3500);
    useWaterReminderStore.setState({ open: due.reminder, shown: [] });
    let host: ReactTestRenderer | undefined;
    act(() => {
      host = create(<WaterReminderHost enabled />);
    });
    const button = host!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Đã uống đủ 3500 ml')[0];
    act(() => {
      button.props.onPress();
    });
    expect(useNutritionStore.getState().logs[DAY_KEY]?.waterMl).toBe(3500);
    act(() => host?.unmount());
  });
});

