import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back(), canGoBack: () => mockRouter.canGoBack() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
  fetchMealRecipe: jest.fn(async () => null),
  pushMealRecipe: jest.fn(),
  requestMealRecipe: jest.fn(),
  requestPhotoAnalysis: jest.fn(),
}));

import NutritionScreen from '../../../app/(tabs)/nutrition';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useWeightStore } from '../../store/useWeightStore';
import { usePlanStore } from '../../store/usePlanStore';
import { toDateKey } from '../../utils/date';
import { getDayType } from '../../constants/plan';

describe('Nutrition screen (FitQuest)', () => {
  let renderer: ReactTestRenderer | undefined;
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  const key = toDateKey(new Date());
  const render = async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<NutritionScreen />);
    });
    renderer = r;
    return r;
  };
  const byLabel = (r: ReactTestRenderer, label: string, fn: string) =>
    r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props[fn] === 'function')[0];
  const press = async (r: ReactTestRenderer, label: string) => {
    const node = byLabel(r, label, 'onPress');
    if (!node) throw new Error(`no pressable "${label}"`);
    await act(async () => {
      node.props.onPress();
    });
  };
  const type = async (r: ReactTestRenderer, label: string, text: string) => {
    await act(async () => {
      byLabel(r, label, 'onChangeText').props.onChangeText(text);
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
  const meals = () => usePlanStore.getState().plan.mealTemplates[getDayType(new Date())];

  beforeEach(() => {
    Object.values(mockRouter).forEach((m) => m.mockClear());
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useNutritionStore.setState({ logs: {} });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
    useSettingsStore.setState({
      language: 'en',
      calorieTargetKcal: 1800,
      targetDailyDeficitKcal: 500,
      proteinTargetG: 120,
      waterTargetMl: 2500,
      startWeightKg: 95,
      heightCm: null,
      age: null,
      gender: null,
      activityLevel: null,
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    alertSpy.mockRestore();
  });

  it('shows the totals, the TDEE card and the day type', async () => {
    const r = await render();
    const text = allText(r);
    expect(text).toContain('0 / 1800 kcal');
    expect(text).toContain('0 / 120 g');
    expect(text).toContain('0 / 2500 ml');
    expect(text).toMatch(/\d+ kcal/);
    expect(text).toContain(meals()[0].label);
  });

  it('ticks a meal on and off and counts its calories in the total', async () => {
    const r = await render();
    const meal = meals()[0];
    const label = new RegExp(`^${meal.label.replace(/[()]/g, '\\$&')}\\.`);
    const toggle = () => r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && label.test(n.props.accessibilityLabel) && n.props.accessibilityRole === 'checkbox')[0];
    expect(toggle().props.accessibilityState.checked).toBe(false);
    await act(async () => toggle().props.onPress());
    expect(useNutritionStore.getState().getLog(key).mealsEaten[meal.slot]).toBe(true);
    expect(toggle().props.accessibilityState.checked).toBe(true);
    expect(allText(r)).toContain(`${meal.calories} / 1800 kcal`);
    await act(async () => toggle().props.onPress());
    expect(useNutritionStore.getState().getLog(key).mealsEaten[meal.slot]).toBe(false);
  });

  it('adds water with the quick buttons, a custom amount, and resets it', async () => {
    const r = await render();
    await press(r, '+250ml');
    await press(r, '+500ml');
    expect(useNutritionStore.getState().getLog(key).waterMl).toBe(750);
    await type(r, 'Custom ml amount', '300');
    await press(r, 'Add');
    expect(useNutritionStore.getState().getLog(key).waterMl).toBe(1050);
    expect(allText(r)).toContain('1050 / 2500 ml');
    await press(r, 'Reset');
    expect(useNutritionStore.getState().getLog(key).waterMl).toBe(0);
  });

  it('adds an off-plan food and clears the form', async () => {
    const r = await render();
    await type(r, 'Food name (optional)', 'Banana');
    await type(r, 'Calories', '90');
    await type(r, 'Protein (g)', '1');
    await press(r, 'Lunch');
    await press(r, "Add to today's total");
    const log = useNutritionStore.getState().getLog(key);
    expect(log.extraCalories).toBe(90);
    expect(log.extraItems[0]).toMatchObject({ name: 'Banana', calories: 90, proteinG: 1, mealTime: 'lunch' });
    expect(byLabel(r, 'Calories', 'onChangeText').props.value).toBe('');
  });

  it('refuses an extra food with no calories or protein', async () => {
    const r = await render();
    await press(r, "Add to today's total");
    expect(alertSpy).toHaveBeenCalled();
    expect(useNutritionStore.getState().getLog(key).extraItems).toHaveLength(0);
  });

  it('goes back via the header', async () => {
    const r = await render();
    await press(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
