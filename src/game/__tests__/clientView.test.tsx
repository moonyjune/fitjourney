import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('react-native-chart-kit', () => {
  const { View } = require('react-native');
  const make = (name: string) => (props: Record<string, unknown>) => <View testID={name} {...props} />;
  return { LineChart: make('LineChart'), BarChart: make('BarChart'), PieChart: make('PieChart') };
});
jest.mock('../../sync/cloudSync', () => ({
  fetchFeedback: jest.fn(async () => []),
  fetchWeeklySuggestion: jest.fn(async () => null),
  pushWeeklySuggestion: jest.fn(),
  requestWeeklySuggestion: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
}));

import type { ClientSnapshot } from '../../coach/clientSnapshot';
import { DEFAULT_PLAN } from '../../constants/plan';
import { HistoryView } from '../../screens/HistoryView';
import { JournalView } from '../../screens/JournalView';
import { useNutritionStore } from '../../store/useNutritionStore';
import { toDateKey } from '../../utils/date';

const today = toDateKey(new Date());

function snapshot(): ClientSnapshot {
  return {
    clientId: 'c1',
    displayName: 'Học viên An',
    logs: {
      [today]: {
        dateISO: today,
        mealsEaten: {},
        extraCalories: 0,
        extraProteinG: 0,
        extraItems: [{ id: 'e1', name: 'Phở bò của học viên', calories: 640, proteinG: 33, loggedAtISO: `${today}T05:00:00.000Z`, mealTime: 'lunch' }],
        waterMl: 1500,
      },
    },
    workouts: [],
    weights: [{ id: 'w1', dateISO: `${today}T05:00:00.000Z`, weightKg: 81.2 }],
    feelings: [],
    photos: [],
    plan: DEFAULT_PLAN,
    settings: { startWeightKg: 85, goalWeightKg: 75, heightCm: 175, age: 30, gender: 'male', activityLevel: 'moderate', calorieTargetKcal: 1900, targetDailyDeficitKcal: 1000, proteinTargetG: 150, waterTargetMl: 3000, startDateISO: `${today}T00:00:00.000Z` },
    limits: { purineMg: 1200, saltG: 7, sugarG: 25 },
    tdeeKcal: 2900,
  };
}

const text = (r: ReactTestRenderer) =>
  r.root
    .findAll((n) => (n.type as unknown) === 'Text')
    .map((n) => [n.props.children].flat(Infinity).join(''))
    .join(' | ');

describe('coach view of a client', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it("Daily log shows the client's meal and numbers, not the coach's own", async () => {
    useNutritionStore.setState({ logs: { [today]: { dateISO: today, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [{ id: 'mine', name: 'Món của huấn luyện viên', calories: 111, proteinG: 1, loggedAtISO: `${today}T05:00:00.000Z`, mealTime: 'lunch' }], waterMl: 0 } } });
    await act(async () => {
      renderer = create(<JournalView client={snapshot()} />);
    });
    const t = text(renderer!);
    expect(t).toContain('Học viên An');
    expect(t).toContain('Phở bò của học viên');
    expect(t).not.toContain('Món của huấn luyện viên');
    expect(t).toContain('640'); // eaten
    expect(t).toContain('2,260'); // deficit: 2900 - 640
  });

  it('Diary & charts shows the client\'s day, read-only (no save/edit controls)', async () => {
    useNutritionStore.setState({ logs: {} });
    await act(async () => {
      renderer = create(<HistoryView client={snapshot()} />);
    });
    const t = text(renderer!);
    expect(t).toContain('Học viên An');
    expect(t).toMatch(/640/);
    const editable = renderer!.root.findAll((n) => n.props?.accessibilityLabel === 'Kcal' && n.props?.keyboardType === 'decimal-pad');
    expect(editable).toHaveLength(0);
  });
});
