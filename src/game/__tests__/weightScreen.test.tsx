import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back(), canGoBack: () => mockRouter.canGoBack() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushWeightEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  deleteWorkoutEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
}));

import WeightScreen from '../../../app/weight';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useToastStore } from '../../store/useToastStore';
import { useWeightStore } from '../../store/useWeightStore';

describe('Weight screen (FitJourney)', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<WeightScreen />);
    });
    renderer = r;
    return r;
  };
  const byLabel = (r: ReactTestRenderer, label: string, prop: string) =>
    r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props[prop] === 'function')[0];
  const press = async (r: ReactTestRenderer, label: string) => {
    await act(async () => {
      byLabel(r, label, 'onPress').props.onPress();
    });
  };
  const allText = (r: ReactTestRenderer) => {
    const parts: string[] = [];
    const walk = (n: unknown) => {
      if (n == null) return;
      if (typeof n === 'string') parts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (typeof n === 'object') walk((n as { children?: unknown }).children);
    };
    walk(r.toJSON());
    return parts.join(' ').replace(/\s+/g, ' ');
  };

  beforeEach(() => {
    Object.values(mockRouter).forEach((m) => m.mockClear());
    useWeightStore.setState({ entries: [] });
    useSettingsStore.setState({ language: 'en', startWeightKg: 100, goalWeightKg: 90, startDateISO: new Date().toISOString() });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the empty states with no entries', async () => {
    const r = await render();
    expect(allText(r)).toContain('No weigh-ins yet — the dashed line is the goal-based prediction.');
    expect(allText(r)).toContain('No weigh-ins yet. Tap + to log one.');
  });

  it('draws one chart with the actual line, the prediction and the boss lines, and switches its range', async () => {
    useWeightStore.setState({ entries: [{ id: 'a', dateISO: new Date().toISOString(), weightKg: 98 }] });
    const r = await render();
    const chart = r.root.findAll((n) => n.props.accessibilityRole === 'image' && String(n.props.accessibilityLabel).startsWith('Weight chart from'))[0];
    expect(chart).toBeDefined();
    const text = allText(r);
    expect(text).toContain('Actual');
    expect(text).toContain('Predicted');
    expect(text).toContain('−2.0 lost');
    expect(text).toContain('8.0 to go');
    expect(text).toContain('20% journey');
    const selected = (label: string) => byLabel(r, label, 'onPress').props.accessibilityState.selected;
    expect(selected('1 month')).toBe(true);
    await press(r, 'All');
    expect(selected('All')).toBe(true);
    expect(selected('1 month')).toBe(false);
  });

  it('logs a weighing from the + sheet (the stepper starts at the last weight)', async () => {
    useWeightStore.setState({ entries: [{ id: 'a', dateISO: new Date(Date.now() - 864e5).toISOString(), weightKg: 99 }] });
    const r = await render();
    await press(r, 'Log weight');
    expect(r.root.findAll((n) => n.props.testID === 'weight-sheet').length).toBeGreaterThan(0);
    await press(r, 'Save 99.0 kg');
    expect(useWeightStore.getState().entries.map((e) => e.weightKg)).toEqual([99, 99]);
    expect(useToastStore.getState().toast?.text).toBe('Saved 99.0 kg');
  });

  it('deletes a weighing with undo', async () => {
    const dateISO = new Date().toISOString();
    useWeightStore.setState({ entries: [{ id: 'a', dateISO, weightKg: 99, note: 'sáng' }] });
    const r = await render();
    expect(allText(r)).toContain('99.0 kg');
    const del = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Delete ') && typeof n.props.onPress === 'function')[0];
    await act(async () => {
      del.props.onPress();
    });
    expect(useWeightStore.getState().entries).toEqual([]);
    expect(useToastStore.getState().toast?.text).toMatch(/^Deleted the weigh-in of \d\d\/\d\d$/);
    await act(async () => {
      useToastStore.getState().undo();
    });
    const back = useWeightStore.getState().entries;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ dateISO, weightKg: 99, note: 'sáng' });
  });

  it('lists the newest entry first', async () => {
    useWeightStore.setState({
      entries: [
        { id: 'a', dateISO: new Date(Date.now() - 2 * 864e5).toISOString(), weightKg: 101 },
        { id: 'b', dateISO: new Date().toISOString(), weightKg: 99 },
      ],
    });
    const r = await render();
    const text = allText(r);
    expect(text.indexOf('99.0 kg')).toBeLessThan(text.indexOf('101.0 kg'));
  });

  it('goes back from the header', async () => {
    const r = await render();
    await press(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
