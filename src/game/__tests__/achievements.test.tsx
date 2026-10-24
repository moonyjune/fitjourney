import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-image-picker', () => ({}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), imageUriToBase64: jest.fn(), deletePersistedPhoto: jest.fn() }));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushFeelingRecord: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

import AchievementsScreen from '../../../app/achievements';
import {
  achievementCatalogue,
  computeAchievementStats,
  evaluateAchievements,
  evaluateBanners,
  type AchievementStats,
  type StatsInput,
} from '../achievements';
import { formatGameText, type GameKey } from '../strings';
import { useAchievementStore } from '../../store/useAchievementStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { computeLongestStreak, computeCurrentStreak } from '../../utils/streak';

const baseStats: AchievementStats = {
  startWeightKg: 110,
  goalWeightKg: 95,
  lowestKg: null,
  weighIns: 0,
  longestStreak: 0,
  bossesDefeated: 0,
  bestBossRun: 0,
  workoutSessions: 0,
  abcWeek: false,
  masteredIds: [],
  mealsLogged: false,
  proteinDays: 0,
  junkFreeDays: 0,
  waterDays: 0,
  workoutMissionDays: 0,
  purineStreak: 0,
  saltStreak: 0,
  sugarStreak: 0,
  bestWorkoutWeek: 0,
  bossBeforeSunday: false,
  level: 1,
  perfectDays: 0,
  photos: 0,
  checkinDays: 0,
};
const earnedIds = (stats: AchievementStats) => evaluateAchievements(stats).filter((a) => a.earned).map((a) => a.id);

describe('achievement catalogue', () => {
  it('scales to the journey, keeps ids unique and ends on the finish line', () => {
    const defs = achievementCatalogue(110, 95);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    expect(defs.filter((d) => d.kind === 'weightLost').map((d) => d.n)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(defs.find((d) => d.kind === 'goalReached')?.n).toBe(15);
    expect(defs.find((d) => d.kind === 'weightLost' && d.n === 1)?.weightKg).toBe(109);
    expect(achievementCatalogue(80, 79.6).filter((d) => d.kind === 'weightLost')).toHaveLength(0); // goal < 1 kg away
    expect(defs.length).toBeGreaterThan(60);
  });

  it('has a name and a condition in both languages for every kind and banner', () => {
    const kinds = new Set(achievementCatalogue(110, 95).map((d) => d.kind));
    for (const lang of ['vi', 'en'] as const) {
      for (const kind of kinds) {
        for (const prefix of ['name', 'cond']) {
          const text = formatGameText(lang, `ach.${prefix}.${kind}` as GameKey, { n: 3, kg: 107, start: 110, name: 'X' });
          expect(typeof text).toBe('string');
          expect(text).not.toMatch(/\{\w+\}/); // every placeholder is filled
          expect(text.length).toBeGreaterThan(0);
        }
      }
      for (const b of evaluateBanners(baseStats)) {
        expect(formatGameText(lang, `ach.banner.${b.id}` as GameKey)).toBeTruthy();
        expect(formatGameText(lang, `ach.cond.${b.kind}` as GameKey, { n: b.n, kg: 1, start: 1, name: '' })).toBeTruthy();
      }
    }
  });
});

describe('evaluating achievements', () => {
  it('earns nothing on an empty account', () => {
    expect(earnedIds(baseStats)).toEqual([]);
  });

  it('judges weight on the lowest weigh-in, with kilograms immune to floating-point noise', () => {
    const at = (kg: number) => earnedIds({ ...baseStats, lowestKg: kg, weighIns: 1 });
    expect(at(106.2)).toEqual(expect.arrayContaining(['firstWeigh-1', 'weightLost-1', 'weightLost-2', 'weightLost-3']));
    expect(at(106.2)).not.toContain('weightLost-4'); // 110 - 106.2 = 3.8, not 4
    expect(at(107)).toContain('weightLost-3'); // exactly 3 kg although 110 - 107 may not be exactly 3
    expect(at(105.9)).toContain('weightLost-4');
    expect(at(109.1 - 0.1)).toContain('weightLost-1'); // 109.00000000000001 style values
    const five = evaluateAchievements({ ...baseStats, lowestKg: 104.5, weighIns: 1 }).find((a) => a.id === 'weightPercent-5')!;
    expect(five.earned).toBe(true); // 5 % of 110 = 5.5 kg
    expect(evaluateAchievements({ ...baseStats, lowestKg: 104.6, weighIns: 1 }).find((a) => a.id === 'weightPercent-5')!.earned).toBe(false);
  });

  it('reports progress towards a locked sticker, clamped to its target', () => {
    const lock = evaluateAchievements({ ...baseStats, lowestKg: 106.2, weighIns: 1 }).find((a) => a.id === 'weightLost-4')!;
    expect(lock.earned).toBe(false);
    expect(lock.current).toBeCloseTo(3.8, 5);
    expect(lock.target).toBe(4);
    const streak = evaluateAchievements({ ...baseStats, longestStreak: 500 }).find((a) => a.id === 'streak-365')!;
    expect(streak.earned).toBe(true);
    expect(streak.current).toBe(365);
  });

  it('maps stats to the right stickers across categories', () => {
    const ids = earnedIds({
      ...baseStats,
      longestStreak: 8,
      bossesDefeated: 3,
      bestBossRun: 2,
      workoutSessions: 12,
      abcWeek: true,
      masteredIds: ['chairSquat'],
      mealsLogged: true,
      proteinDays: 7,
      junkFreeDays: 6,
      waterDays: 1,
      level: 11,
      perfectDays: 1,
      photos: 10,
      checkinDays: 7,
    });
    expect(ids).toEqual(
      expect.arrayContaining(['streak-3', 'streak-7', 'bossFirst-1', 'bossRun-2', 'sessions-10', 'abcWeek-1', 'mastery-chairSquat', 'firstMeal-1', 'proteinDays-7', 'waterDays-1', 'level-10', 'perfectDays-1', 'photos-10', 'checkinDays-7'])
    );
    for (const not of ['streak-14', 'bossRun-4', 'sessions-25', 'mastery-wallPushup', 'junkFreeDays-7', 'level-15', 'perfectDays-7', 'photos-50']) {
      expect(ids).not.toContain(not);
    }
  });

  it('evaluates banners, using the user’s own goal for the finish-line banner', () => {
    const goal = (s: AchievementStats) => evaluateBanners(s).find((b) => b.id === 'goal')!;
    expect(goal({ ...baseStats, lowestKg: 96 }).earned).toBe(false);
    expect(goal({ ...baseStats, lowestKg: 95 }).earned).toBe(true);
    expect(goal({ ...baseStats, goalWeightKg: 100, lowestKg: 100 }).earned).toBe(true);
    expect(evaluateBanners({ ...baseStats, lowestKg: 99 }).find((b) => b.id === 'ten')!.earned).toBe(true);
    expect(evaluateBanners({ ...baseStats, level: 9 }).find((b) => b.id === 'level10')!.earned).toBe(false);
  });
});

describe('deriving the stats', () => {
  const day = (dateKey: string, done: string[], eatenKcal = 1500) => ({
    dateKey,
    eatenKcal,
    missions: ['workout', 'deficit', 'protein', 'purine', 'salt', 'sugar', 'junk'].map((id) => ({ id, status: done.includes(id) ? 'done' : 'missed' })),
  });
  const input = (over: Partial<StatsInput> = {}): StatsInput => ({
    game: { days: [], bossHistory: [], bossesDefeated: 0, level: { level: 1 } as never, perfectDays: 0 },
    startWeightKg: 110,
    goalWeightKg: 95,
    weights: [],
    longestStreak: 0,
    workouts: [],
    trainingProgress: {},
    photos: [],
    feelings: [],
    waterGoalMl: 4500,
    waterByDay: {},
    ...over,
  });

  it('counts mission days from the replayed days', () => {
    const stats = computeAchievementStats(
      input({ game: { days: [day('2026-10-19', ['protein', 'junk', 'workout']), day('2026-10-20', ['protein']), day('2026-10-21', [], 0)] as never, bossHistory: [], bossesDefeated: 0, level: { level: 3 } as never, perfectDays: 0 } })
    );
    expect(stats.proteinDays).toBe(2);
    expect(stats.junkFreeDays).toBe(1);
    expect(stats.workoutMissionDays).toBe(1);
    expect(stats.mealsLogged).toBe(true);
    expect(stats.level).toBe(3);
  });

  it('takes the best boss run over the history, not only the current one', () => {
    const w = (defeated: boolean) => ({ defeated, days: [], maxHp: 7700 });
    // newest first: broke the run last week, but had three in a row before
    const stats = computeAchievementStats(input({ game: { days: [], bossHistory: [w(false), w(true), w(true), w(true), w(false), w(true)] as never, bossesDefeated: 4, level: { level: 1 } as never, perfectDays: 0 } }));
    expect(stats.bestBossRun).toBe(3);
  });

  it('keeps the lowest weight after a rebound', () => {
    const stats = computeAchievementStats(input({ weights: [{ weightKg: 106.2 }, { weightKg: 108 }] }));
    expect(stats.lowestKg).toBe(106.2);
    expect(stats.weighIns).toBe(2);
  });

  it('needs A, B and C inside one week for the full-set sticker', () => {
    const w = (id: string, iso: string) => ({ id, dateISO: iso, templateId: `home-${id}`, label: id, durationMin: 12, caloriesBurned: 80 });
    const split = computeAchievementStats(input({ workouts: [w('A', '2026-10-19T17:00:00'), w('B', '2026-10-20T17:00:00'), w('C', '2026-10-26T17:00:00')] }));
    expect(split.abcWeek).toBe(false);
    const full = computeAchievementStats(input({ workouts: [w('A', '2026-10-19T17:00:00'), w('B', '2026-10-20T17:00:00'), w('C', '2026-10-21T17:00:00')] }));
    expect(full.abcWeek).toBe(true);
    expect(full.workoutSessions).toBe(3);
  });

  it('counts water days against the goal and check-ins per distinct day', () => {
    const f = (iso: string) => ({ id: iso, loggedAtISO: iso, cravingLevel: 1, hungerLevel: 1, mood: 'good', workoutCondition: null, note: '' });
    const stats = computeAchievementStats(
      input({
        waterByDay: { '2026-10-19': 4500, '2026-10-20': 4499, '2026-10-21': 5000 },
        feelings: [f('2026-10-19T08:00:00'), f('2026-10-19T20:00:00'), f('2026-10-20T08:00:00')] as never,
      })
    );
    expect(stats.waterDays).toBe(2);
    expect(stats.checkinDays).toBe(2);
  });

  it('finds the longest streak even after it broke (the fire badge stays earned)', () => {
    const plan = usePlanStore.getState().plan;
    const log = (dateKey: string) => ({ dateISO: dateKey, mealsEaten: { meal1: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 });
    const logs = { '2026-10-12': log('2026-10-12'), '2026-10-13': log('2026-10-13'), '2026-10-14': log('2026-10-14'), '2026-10-16': log('2026-10-16'), '2026-10-17': log('2026-10-17') };
    expect(computeLongestStreak(logs, plan.mealTemplates, [], 4000)).toBe(3);
    expect(computeCurrentStreak(logs, plan.mealTemplates, [], 4000, new Date('2026-10-17T12:00:00'))).toBe(2);
    expect(computeLongestStreak({}, plan.mealTemplates, [], 4000)).toBe(0);
  });
});

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return parts.join(' ');
}

describe('Achievements screen', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<AchievementsScreen />);
    });
    renderer = r;
    return r;
  };
  const labels = (r: ReactTestRenderer) => r.root.findAll((n) => n.props.accessible === true && typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    Object.values(mockRouter).forEach((m) => m.mockClear());
    useSettingsStore.setState({ language: 'vi', startWeightKg: 110, goalWeightKg: 95, startDateISO: '2026-10-19T08:00:00' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useNutritionStore.setState({ logs: {} });
    useWorkoutStore.setState({ entries: [] });
    useAchievementStore.setState({ equippedBannerId: null });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('shows earned and locked stickers with real progress', () => {
    const r = render();
    const text = allText(r);
    expect(text).toContain('Thành tích');
    expect(text).toContain('Cân nặng');
    const all = labels(r);
    const earned = all.find((l) => l.startsWith('Chạm 109 kg'))!;
    expect(earned).toContain('Đã mở');
    const locked = all.find((l) => l.startsWith('Chạm 106 kg'))!;
    expect(locked).toContain('Chưa mở');
    expect(locked).toContain('3.8 / 4 kg');
    expect(all.find((l) => l.startsWith('Lần cân đầu tiên'))).toContain('Đã mở');
    expect(all.find((l) => l.startsWith('Buổi tập') || l.startsWith('1 buổi tập'))).toContain('Chưa mở');
  });

  it('is honest about what it does not track yet', () => {
    expect(allText(render())).toContain('Chưa có: chuỗi purine/muối/đường');
  });

  it('lets only an earned banner be put on the profile, and removed again', async () => {
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 99 }] });
    const r = render();
    const pressables = (label: string) => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
    expect(pressables('MƯỜI KÝ ĐẦU TIÊN: Đặt lên hồ sơ')).not.toHaveLength(0);
    expect(r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('VỀ ĐÍCH'))).toHaveLength(0); // locked: no button
    await act(async () => {
      pressables('MƯỜI KÝ ĐẦU TIÊN: Đặt lên hồ sơ')[0].props.onPress();
    });
    expect(useAchievementStore.getState().equippedBannerId).toBe('ten');
    expect(pressables('MƯỜI KÝ ĐẦU TIÊN: Gỡ khỏi hồ sơ')).not.toHaveLength(0); // the button now offers to remove it
    await act(async () => {
      pressables('MƯỜI KÝ ĐẦU TIÊN: Gỡ khỏi hồ sơ')[0].props.onPress();
    });
    expect(useAchievementStore.getState().equippedBannerId).toBeNull();
  });

  it('goes back', () => {
    const r = render();
    act(() => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Quay lại')[0].props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('speaks English', () => {
    useSettingsStore.setState({ language: 'en' });
    const r = render();
    expect(allText(r)).toContain('Achievements');
    expect(labels(r).some((l) => l.startsWith('Reach 109 kg'))).toBe(true);
  });
});
