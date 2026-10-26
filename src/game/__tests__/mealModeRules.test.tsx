import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { buildCoachContext } from '../../ai/coachContext';
import { buildWeeklyReportInput } from '../../ai/weeklyReport';
import { DEFAULT_PLAN } from '../../constants/plan';
import { evaluateDay } from '../../game/missions';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { colors } from '../../theme/tokens';
import { useAmbientBackground } from '../../theme/useAmbientBackground';
import type { DailyNutritionLog } from '../../types';

const FRIDAY = '2026-10-23';
const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m);
const day = (hour: number): DailyNutritionLog => ({
  dateISO: FRIDAY, mealsEaten: {}, extraCalories: 500, extraProteinG: 30, waterMl: 0,
  extraItems: [{ id: 'a', name: 'Cơm', calories: 500, proteinG: 30, loggedAtISO: `${FRIDAY}T${String(hour).padStart(2, '0')}:00:00`, mealTime: 'dinner', purineMg: 100, saltG: 1, sugarG: 1 }],
});
const evalAt = (now: Date) =>
  evaluateDay({ dateKey: FRIDAY, now, log: day(12), mealTemplatesByDayType: DEFAULT_PLAN.mealTemplates, workouts: [], tdeeKcal: 3000, proteinTargetG: 200 });

afterEach(() => {
  useMealModeStore.setState({ fasting: true });
});

describe('the day closes with the eating window of the chosen mode', () => {
  it('fasting on: eating is closed from 20:00; off: not until 22:00', () => {
    useMealModeStore.setState({ fasting: true });
    expect([19, 20, 21, 22].map((h) => evalAt(at(h)).eatingClosed)).toEqual([false, true, true, true]);
    useMealModeStore.setState({ fasting: false });
    expect([19, 20, 21, 22].map((h) => evalAt(at(h)).eatingClosed)).toEqual([false, false, false, true]);
  });

  it('so a "stay under the line" mission is still holding at 21:00 on a normal day, and earned at 22:00', () => {
    useMealModeStore.setState({ fasting: false });
    expect(evalAt(at(21)).missions.find((m) => m.id === 'purine')?.status).toBe('holding');
    expect(evalAt(at(22)).missions.find((m) => m.id === 'purine')?.status).toBe('done');
    useMealModeStore.setState({ fasting: true });
    expect(evalAt(at(21)).missions.find((m) => m.id === 'purine')?.status).toBe('done');
  });

  it('a past day is closed whatever the mode', () => {
    useMealModeStore.setState({ fasting: false });
    const e = evaluateDay({ dateKey: '2026-10-22', now: at(9), log: undefined, mealTemplatesByDayType: DEFAULT_PLAN.mealTemplates, workouts: [], tdeeKcal: 3000, proteinTargetG: 200 });
    expect(e.eatingClosed).toBe(true);
  });
});

describe('the AI snapshots follow the mode', () => {
  beforeEach(() => {
    useSettingsStore.setState({ gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, startWeightKg: 106 });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
  });

  it('tells the AI when eating ends: 20 with fasting on, 22 with it off', () => {
    useNutritionStore.setState({ logs: {} });
    expect(buildCoachContext(at(16)).now.eatingWindowEndsAtHour).toBe(20);
    useMealModeStore.setState({ fasting: false });
    expect(buildCoachContext(at(16)).now.eatingWindowEndsAtHour).toBe(22);
  });

  it('counts a last meal as late from 20:00 with fasting on, and from 21:00 with it off', () => {
    const lateDays = () => buildWeeklyReportInput(at(16)).patterns.lateMealDays;
    for (const [hour, fastingLate, normalLate] of [[19, 0, 0], [20, 1, 0], [21, 1, 1]] as const) {
      useNutritionStore.setState({ logs: { [FRIDAY]: day(hour) } });
      useMealModeStore.setState({ fasting: true });
      expect(lateDays()).toBe(fastingLate);
      useMealModeStore.setState({ fasting: false });
      expect(lateDays()).toBe(normalLate);
    }
  });
});

describe('the ambient background has no fasting window without fasting', () => {
  let renderer: ReactTestRenderer | undefined;
  function Probe({ out }: { out: string[] }) {
    out.push(useAmbientBackground());
    return null;
  }
  const seen = async () => {
    const out: string[] = [];
    await act(async () => {
      renderer = create(<Probe out={out} />);
    });
    return out[out.length - 1];
  };
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T03:00:00') }); // the middle of the night: fasting under 16:8
    useSettingsStore.setState({ role: 'client' });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('fasting on, at 3 am: the fasting colour; fasting off: always the eating colour; a coach always gets the neutral one', async () => {
    useMealModeStore.setState({ fasting: true });
    expect(await seen()).toBe(colors.ifFastingBackground);
    act(() => renderer?.unmount());
    useMealModeStore.setState({ fasting: false });
    expect(await seen()).toBe(colors.ifEatingBackground);
    act(() => renderer?.unmount());
    useSettingsStore.setState({ role: 'coach' });
    expect(await seen()).toBe(colors.background);
  });
});
