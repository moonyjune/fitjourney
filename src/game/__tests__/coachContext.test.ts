import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

import { buildCoachContext, COACH_HISTORY_DAYS } from '../../ai/coachContext';
import { adviceLines, cleanAdvice } from '../../ai/adviceText';
import { fakePhotoAnalysis } from '../../ai/devPhotoAnalysis';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import type { DailyNutritionLog } from '../../types';

const NOW = new Date('2026-10-23T16:10:00'); // Friday
const day = (dateISO: string, kcal: number, extra: Partial<DailyNutritionLog> = {}): DailyNutritionLog => ({
  dateISO,
  mealsEaten: {},
  extraCalories: kcal,
  extraProteinG: kcal / 10,
  extraItems: kcal > 0 ? [{ id: `i-${dateISO}`, name: 'Món riêng tư', calories: kcal, proteinG: kcal / 10, loggedAtISO: `${dateISO}T05:00:00.000Z`, mealTime: 'lunch', purineMg: 100, saltG: 2, sugarG: 10 }] : [],
  waterMl: 0,
  ...extra,
});

describe('buildCoachContext', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      startDateISO: '2026-10-01T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light',
      calorieTargetKcal: 1950, targetDailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000,
    });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWeightStore.setState({ entries: [] });
    useWorkoutStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: {} });
  });

  it('sends targets, today so far, the boss and at most 7 earlier days that hold something', () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (let d = 1; d <= 22; d++) {
      const key = `2026-10-${String(d).padStart(2, '0')}`;
      logs[key] = day(key, 1500, { waterMl: 3000 });
    }
    logs['2026-10-21'] = day('2026-10-21', 0); // nothing at all: not worth sending
    logs['2026-10-23'] = day('2026-10-23', 600, { waterMl: 1000 });
    useNutritionStore.setState({ logs });
    useWorkoutStore.setState({ entries: [{ id: 'w1', dateISO: '2026-10-22T05:00:00', templateId: null, label: 'Bơi', durationMin: 45, caloriesBurned: 400 }] });
    useWeightStore.setState({ entries: Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, dateISO: `2026-10-${String(11 + i).padStart(2, '0')}T06:00:00`, weightKg: 110 - i * 0.3 })) });

    const c = buildCoachContext(NOW);
    expect(c.now).toMatchObject({ date: '2026-10-23', time: '16:10', eatingClosed: false });
    expect(c.targets).toMatchObject({ dailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, purineLimitMg: 1200, saltLimitG: 7, sugarLimitG: 25, goalWeightKg: 95 });
    expect(c.targets.tdeeKcal).toBeGreaterThan(2000);
    expect(c.today).toMatchObject({ date: '2026-10-23', eatenKcal: 600, waterMl: 1000, purineMg: 100, saltG: 2, sugarG: 10 });
    expect(c.today.plannedMealsLeft.length).toBeGreaterThan(0);
    expect(c.recentDays.length).toBeLessThanOrEqual(COACH_HISTORY_DAYS);
    expect(c.recentDays.map((d) => d.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-22']); // 21st is empty, today is separate
    const d22 = c.recentDays.find((d) => d.date === '2026-10-22')!;
    expect(d22).toMatchObject({ eatenKcal: 1500, burnedKcal: 400, workouts: 1, waterMl: 3000 });
    expect(d22.deficitKcal).toBe(Math.round(c.targets.tdeeKcal + 400 - 1500));
    expect(c.recentWeights).toHaveLength(COACH_HISTORY_DAYS);
    expect(c.recentWeights[c.recentWeights.length - 1]).toEqual({ date: '2026-10-22', kg: 106.7 });
    expect(c.week).toMatchObject({ bossMaxHp: 7700, defeated: false, daysUntilReset: 3 });
    expect(c.week.bossHpLeft + c.week.damageSoFar).toBe(7700);
  });

  it('leaves out a day with no food (deficit unknown) rather than reporting a huge deficit, and carries no free text', () => {
    useNutritionStore.setState({ logs: { '2026-10-22': day('2026-10-22', 0, { waterMl: 3000 }), '2026-10-23': day('2026-10-23', 500) } });
    const c = buildCoachContext(NOW);
    expect(c.recentDays).toHaveLength(1);
    expect(c.recentDays[0].deficitKcal).toBeUndefined();
    const json = JSON.stringify(c);
    expect(json).not.toContain('Món riêng tư');
    expect(json).not.toMatch(/@|user-|"id"/);
  });

  it('sends only weights from the last 7 days up to today, not older or future-dated ones', () => {
    useWeightStore.setState({ entries: [
      { id: 'old', dateISO: '2026-10-01T06:00:00', weightKg: 111 },
      { id: 'in', dateISO: '2026-10-20T06:00:00', weightKg: 107.5 },
      { id: 'future', dateISO: '2026-10-25T06:00:00', weightKg: 100 },
    ] });
    expect(buildCoachContext(NOW).recentWeights).toEqual([{ date: '2026-10-20', kg: 107.5 }]);
  });

  it('works on an empty account', () => {
    const c = buildCoachContext(NOW);
    expect(c.recentDays).toEqual([]);
    expect(c.recentWeights).toEqual([]);
    expect(c.today.eatenKcal).toBe(0);
  });
});

describe('advice text', () => {
  const g = ((key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ''}`) as never;

  it('accepts well-formed advice and drops what has no known verdict or no summary, capping the steps at 4', () => {
    expect(cleanAdvice(undefined)).toBeNull();
    expect(cleanAdvice({ verdict: 'meh' as never, summary: 'x', nextSteps: [] })).toBeNull();
    expect(cleanAdvice({ verdict: 'watch', summary: '  ', nextSteps: [] })).toBeNull();
    const ok = cleanAdvice({ verdict: 'over', summary: ' Hơi nhiều ', nextSteps: ['a', '', 'b', 'c', 'd', 'e', 5 as never] });
    expect(ok).toMatchObject({ verdict: 'over', summary: 'Hơi nhiều', nextSteps: ['a', 'b', 'c', 'd'] });
  });

  it('lists verdict, the remaining-today figures, steps and the boss note; ignores nonsense numbers', () => {
    const lines = adviceLines(
      { verdict: 'watch', summary: 'Gần hết ngân sách', nextSteps: ['Ăn rau'], remainingKcalToEat: 310.4, remainingProteinG: -5, extraBurnKcal: 0, bossNote: ' Cần 900 mỗi ngày ' },
      g
    );
    expect(lines[0]).toBe('ai.verdict.watch: Gần hết ngân sách');
    expect(lines[1]).toBe('ai.advice.eat{"kcal":310}');
    expect(lines.slice(2)).toEqual(['• Ăn rau', 'Cần 900 mỗi ngày']);
  });
});

describe('offline dev advice', () => {
  it('does the arithmetic on the snapshot: budget = TDEE + burned − deficit target − eaten', () => {
    useSettingsStore.setState({ targetDailyDeficitKcal: 1100, proteinTargetG: 200, startWeightKg: 110, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useNutritionStore.setState({ logs: { '2026-10-23': day('2026-10-23', 600) } });
    const coach = buildCoachContext(NOW);
    const meal = fakePhotoAnalysis('meal', { weightKg: 110 }, coach);
    const eaten = 600 + 480;
    expect(meal.advice?.remainingKcalToEat).toBe(Math.max(0, Math.round(coach.targets.tdeeKcal - 1100 - eaten)));
    expect(meal.advice?.remainingProteinG).toBe(Math.max(0, Math.round(200 - coach.today.proteinG - 42)));
    expect(meal.estimatedPurineMg).toBeGreaterThan(0);
    expect(fakePhotoAnalysis('meal', { weightKg: 110 }).advice).toBeUndefined();
    expect(fakePhotoAnalysis('workout', { weightKg: 110 }, coach).advice?.summary).toContain('giả lập');
  });
});
