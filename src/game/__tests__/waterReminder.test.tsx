import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../sync/cloudSync', () => ({ pushNutritionLog: jest.fn(), pushUserData: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { WaterReminderDialog, waterPopupAlternatives } from '../../components/quest/WaterReminderDialog';
import { useWaterReminderStore, WATER_SNOOZE_MS } from '../../store/useWaterReminderStore';
import { waterPopupOn } from '../../water/WaterReminderHost';
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

  it('says how much to drink now, the day in litres and the drink times as dots; the button sets the running total', () => {
    const onDrink = jest.fn();
    const onSnooze = jest.fn();
    const due = dueWaterReminder(schedule, 1000, 3500, at(11, 2), DAY, [])!;
    act(() => {
      r = create(<WaterReminderDialog reminder={due.reminder} onDrink={onDrink} onSnooze={onSnooze} onClose={() => {}} />);
    });
    const text = allText(r!);
    expect(text).toContain('11:00');
    expect(text).toContain('Uống 500 ml');
    expect(text).toContain('1.0 / 3.5 L · đúng lịch');
    expect(text).not.toContain('Bạn đang'); // the cheer moved to the toast
    const press = (label: string) =>
      act(() => {
        r!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0].props.onPress();
      });
    press('Đã uống 500 ml, tổng hôm nay thành 1500 ml');
    expect(onDrink).toHaveBeenLastCalledWith(1500);
    // The chips are the real amounts drunk: 250 and 750 ml.
    press('Đã uống 250 ml, tổng hôm nay thành 1250 ml');
    expect(onDrink).toHaveBeenLastCalledWith(1250);
    press('Đã uống 750 ml, tổng hôm nay thành 1750 ml');
    expect(onDrink).toHaveBeenLastCalledWith(1750);
    press('Nhắc sau 30′');
    expect(onSnooze).toHaveBeenCalled();
  });

  it('behind schedule: how far behind, the missed times and the catch-up plan', () => {
    const due = dueWaterReminder(schedule, 0, 3500, at(11, 20), DAY, [])!;
    act(() => {
      r = create(<WaterReminderDialog reminder={due.reminder} onDrink={() => {}} onSnooze={() => {}} onClose={() => {}} />);
    });
    const text = allText(r!);
    expect(text).toContain('Uống 750 ml');
    expect(text).toContain('0.0 / 3.5 L · đang chậm 1000 ml');
    expect(text).toContain('Lỡ lúc 06:00, 08:30');
    expect(text).toContain('Bù dần: 13:30 +150 ml · 16:00 +150 ml · 18:30 +150 ml · 21:00 +300 ml');
    expect(waterPopupAlternatives(750)).toEqual([500, 1000]);
    expect(waterPopupAlternatives(200)).toEqual([450]);
  });
});

describe('water reminder: the button sets the day to the milestone, never adds it', () => {
  it('with 3,000 ml already logged, "reached 3,500 ml" makes the day 3,500 ml, not 6,500; the toast cheers and can undo', () => {
    const { WaterReminderHost } = require('../../water/WaterReminderHost');
    const { useNutritionStore } = require('../../store/useNutritionStore');
    const { useToastStore } = require('../../store/useToastStore');
    const DAY_KEY = '2026-11-01';
    useNutritionStore.getState().addWater(DAY_KEY, 3000);
    const due = dueWaterReminder(schedule, 0, 3500, at(21, 5), DAY_KEY, [])!; // a stale pop-up that thought nothing was drunk
    expect(due.reminder.reachMl).toBe(3500);
    useWaterReminderStore.setState({ open: due.reminder, shown: [] });
    let host: ReactTestRenderer | undefined;
    act(() => {
      host = create(<WaterReminderHost enabled />);
    });
    const button = host!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Đã uống 3500 ml, tổng hôm nay thành 3500 ml')[0];
    act(() => {
      button.props.onPress();
    });
    expect(useNutritionStore.getState().logs[DAY_KEY]?.waterMl).toBe(3500);
    expect(useWaterReminderStore.getState().open).toBeNull();
    const toast = useToastStore.getState().toast;
    expect(toast.text).toMatch(/^\+500 ml · 3,500 ml\. /);
    expect(toast.tone).toBe('mana');
    act(() => useToastStore.getState().undo());
    expect(useNutritionStore.getState().logs[DAY_KEY]?.waterMl).toBe(3000);
    act(() => host?.unmount());
  });
});

describe('water reminder: snooze and its own switch', () => {
  it('"Nhắc sau 30′" closes the pop-up and lets the same drink time come back after 30 minutes', () => {
    const due = dueWaterReminder(schedule, 1000, 3500, at(11, 2), DAY, [])!;
    useWaterReminderStore.setState({ shown: [], open: null, snoozedUntil: null });
    useWaterReminderStore.getState().show(due.reminder, due.dueKeys);
    const t0 = at(11, 2).getTime();
    useWaterReminderStore.getState().snooze(t0);
    const state = useWaterReminderStore.getState();
    expect(state.open).toBeNull();
    expect(state.snoozedUntil).toBe(t0 + WATER_SNOOZE_MS);
    expect(state.shown).not.toContain(`${DAY}@11:00`);
    expect(dueWaterReminder(schedule, 1000, 3500, at(11, 32), DAY, state.shown)?.reminder.key).toBe(`${DAY}@11:00`);
  });

  it('the pop-up follows its own switch; never set, it follows the reminders switch as before', () => {
    expect(waterPopupOn({ remindersEnabled: true })).toBe(true);
    expect(waterPopupOn({ remindersEnabled: false })).toBe(false);
    expect(waterPopupOn({ remindersEnabled: true, waterPopupEnabled: false })).toBe(false);
    expect(waterPopupOn({ remindersEnabled: false, waterPopupEnabled: true })).toBe(true);
  });
});
