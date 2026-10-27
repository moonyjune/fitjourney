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
jest.mock('react-native-chart-kit', () => ({ LineChart: () => null }));
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

import WeightScreen from '../../../app/(tabs)/weight';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';

describe('Weight screen (FitQuest)', () => {
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
  const type = async (r: ReactTestRenderer, text: string) => {
    await act(async () => {
      byLabel(r, 'Log new weight', 'onChangeText').props.onChangeText(text);
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
    expect(allText(r)).toContain('No weigh-ins yet');
    expect(allText(r)).toContain('No weight data yet');
  });

  it('adds an entry with a comma decimal and clears the field', async () => {
    const r = await render();
    await type(r, '98,4');
    await press(r, 'Save');
    expect(useWeightStore.getState().entries.map((e) => e.weightKg)).toEqual([98.4]);
    expect(allText(r)).toContain('98.4 kg');
    expect(byLabel(r, 'Log new weight', 'onChangeText').props.value).toBe('');
  });

  it.each(['', 'abc', '0', '-5'])('ignores invalid input %p', async (bad) => {
    const r = await render();
    await type(r, bad);
    await press(r, 'Save');
    expect(useWeightStore.getState().entries).toEqual([]);
  });

  it('deletes an entry from the history', async () => {
    useWeightStore.setState({ entries: [{ id: 'a', dateISO: new Date().toISOString(), weightKg: 99 }] });
    const r = await render();
    expect(allText(r)).toContain('99.0 kg');
    const del = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Delete ') && typeof n.props.onPress === 'function')[0];
    await act(async () => {
      del.props.onPress();
    });
    expect(useWeightStore.getState().entries).toEqual([]);
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
