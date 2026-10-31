import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockSchedule = jest.fn(async () => undefined);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../notifications/schedule', () => ({ scheduleAllReminders: () => mockSchedule() }));
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
}));

import { WaterSettings } from '../../components/quest/WaterSettings';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWaterWindowStore } from '../../store/useWaterWindowStore';
import { pushUserData } from '../../sync/cloudSync';

describe('Water settings', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<WaterSettings />);
    });
    renderer = r;
    return r;
  };
  const text = (r: ReactTestRenderer) =>
    r.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .map((n) => [n.props.children].flat(Infinity).join(''))
      .join(' | ');
  const press = async (r: ReactTestRenderer, label: string) => {
    const node = r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
    if (!node) throw new Error(`no pressable "${label}"`);
    await act(async () => {
      node.props.onPress();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', waterTargetMl: 4500, remindersEnabled: true });
    useWaterWindowStore.setState({ startMinutes: 360, endMinutes: 1260 });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('picks a preset or steps 250 ml, showing how many drinks the plan makes, and re-schedules the reminders', async () => {
    const r = await render();
    expect(text(r)).toContain('4.5 L · 9 lần uống');
    await press(r, 'Đặt 3.5 L mỗi ngày');
    expect(useSettingsStore.getState().waterTargetMl).toBe(3500);
    expect(text(r)).toContain('3.5 L · 7 lần uống');
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    await press(r, 'Tăng 250 ml nước mỗi ngày');
    expect(useSettingsStore.getState().waterTargetMl).toBe(3750);
    expect(text(r)).toContain('3.75 L · 8 lần uống');
    await press(r, 'Giảm 250 ml nước mỗi ngày');
    await press(r, 'Giảm 250 ml nước mỗi ngày');
    expect(useSettingsStore.getState().waterTargetMl).toBe(3250);
  });

  it('moves the drinking window by 30 minutes and saves it to the cloud', async () => {
    const r = await render();
    expect(text(r)).toContain('06:00');
    expect(text(r)).toContain('21:00');
    await press(r, 'Giờ bắt đầu uống nước muộn hơn 30 phút');
    await press(r, 'Giờ kết thúc uống nước sớm hơn 30 phút');
    expect(useWaterWindowStore.getState()).toMatchObject({ startMinutes: 390, endMinutes: 1230 });
    expect(pushUserData).toHaveBeenLastCalledWith('waterWindow', { startMinutes: 390, endMinutes: 1230 });
    expect(text(r)).toContain('06:30');
    expect(text(r)).toContain('20:30');
  });
});
