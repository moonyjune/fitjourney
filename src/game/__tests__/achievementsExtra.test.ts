import { describe, expect, it } from '@jest/globals';
import {
  computeAchievementStats,
  evaluateAchievements,
  evaluateBanners,
  type StatsInput,
} from '../achievements';
import type { MissionId } from '../constants';
import type { DayEvaluation, MissionStatus } from '../missions';
import type { BossState } from '../boss';
import { addDays } from '../../utils/milestones';
import { toDateKey } from '../../utils/date';

// Monday 2026-10-19 … Sunday 2026-10-25, then the next week.
const MONDAY = new Date('2026-10-19T12:00:00');
const key = (offset: number) => toDateKey(addDays(MONDAY, offset));

function day(offset: number, done: MissionId[] = [], missed: MissionId[] = []): DayEvaluation {
  const ids: MissionId[] = ['workout', 'deficit', 'protein', 'purine', 'salt', 'sugar', 'junk'];
  return {
    dateKey: key(offset),
    missions: ids.map((id) => ({
      id,
      status: (done.includes(id) ? 'done' : missed.includes(id) ? 'missed' : 'holding') as MissionStatus,
      value: 0,
      target: 0,
      xp: 0,
    })),
  } as unknown as DayEvaluation;
}

function boss(weekOffset: number, damages: number[], maxHp = 7700): BossState {
  const weekKey = key(weekOffset * 7);
  return {
    weekKey,
    maxHp,
    hpLeft: Math.max(0, maxHp - damages.reduce((a, b) => a + b, 0)),
    totalDamage: damages.reduce((a, b) => a + b, 0),
    days: damages.map((damage, i) => ({ dateKey: key(weekOffset * 7 + i), damage, deficitKcal: damage, capped: false })),
    defeated: damages.reduce((a, b) => a + b, 0) >= maxHp,
    daysUntilReset: 1,
    neededPerRemainingDay: 0,
  };
}

function statsFor(days: DayEvaluation[], bossHistory: BossState[] = []) {
  const input: StatsInput = {
    game: { days, bossHistory, bossesDefeated: bossHistory.filter((b) => b.defeated).length, level: { level: 1 } as never, perfectDays: 0 },
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
  };
  return computeAchievementStats(input);
}

const earned = (stats: ReturnType<typeof statsFor>) => evaluateAchievements(stats).filter((a) => a.earned).map((a) => a.id);
const banner = (stats: ReturnType<typeof statsFor>, id: string) => evaluateBanners(stats).find((b) => b.id === id)!;

describe('purine / salt / sugar streak stickers', () => {
  it('counts consecutive days on which the mission was earned', () => {
    const days = [0, 1, 2, 3].map((i) => day(i, ['purine']));
    const stats = statsFor(days);
    expect(stats.purineStreak).toBe(4);
    expect(earned(stats)).toEqual(expect.arrayContaining(['purineStreak-3']));
    expect(earned(stats)).not.toContain('purineStreak-7');
    expect(stats.saltStreak).toBe(0);
    expect(stats.sugarStreak).toBe(0);
  });

  it('tracks salt and sugar separately', () => {
    const stats = statsFor([0, 1, 2].map((i) => day(i, ['salt', 'sugar'])));
    expect(earned(stats)).toEqual(expect.arrayContaining(['saltStreak-3', 'sugarStreak-3']));
    expect(earned(stats)).not.toContain('purineStreak-3');
  });

  it('is broken by a missed day and by a day with no data (a closed day without food is "missed")', () => {
    const days = [day(0, ['salt']), day(1, ['salt']), day(2, [], ['salt']), day(3, ['salt']), day(4, ['salt'])];
    expect(statsFor(days).saltStreak).toBe(2);
    expect(earned(statsFor(days))).not.toContain('saltStreak-3');
  });

  it('does not count a day still in progress (holding) as earned', () => {
    const days = [day(0, ['sugar']), day(1, ['sugar']), day(2)];
    expect(statsFor(days).sugarStreak).toBe(2);
  });

  it('keeps the best run after the streak breaks', () => {
    const days = [0, 1, 2].map((i) => day(i, ['purine'])).concat([day(3, [], ['purine']), day(4, ['purine'])]);
    expect(statsFor(days).purineStreak).toBe(3);
    expect(earned(statsFor(days))).toContain('purineStreak-3');
  });
});

describe('"6-workout week" banner', () => {
  const week = (workoutDays: number[], offset = 0) => workoutDays.map((i) => day(offset + i, ['workout']));

  it('is earned with 6 workout days in one Monday–Sunday week', () => {
    const stats = statsFor(week([0, 1, 2, 3, 4, 5]));
    expect(stats.bestWorkoutWeek).toBe(6);
    expect(banner(stats, 'week6').earned).toBe(true);
  });

  it('is not earned with 5, and reports progress', () => {
    const stats = statsFor(week([0, 1, 2, 3, 4]));
    expect(banner(stats, 'week6')).toMatchObject({ earned: false, current: 5, target: 6 });
  });

  it('does not add days across a week boundary (Thu–Sun + Mon–Tue is not one week)', () => {
    const days = week([3, 4, 5, 6]).concat(week([0, 1], 7)); // 4 days then 2 days in the next week
    expect(statsFor(days).bestWorkoutWeek).toBe(4);
    expect(banner(statsFor(days), 'week6').earned).toBe(false);
  });

  it('ignores days whose workout mission was not earned (e.g. under 10 minutes)', () => {
    const days = [0, 1, 2, 3, 4].map((i) => day(i, ['workout'])).concat([day(5, [], ['workout'])]);
    expect(banner(statsFor(days), 'week6').earned).toBe(false);
  });
});

describe('"defeat the boss before Sunday" banner', () => {
  it('is earned when Monday–Saturday damage empties the bar', () => {
    const stats = statsFor([], [boss(0, [1500, 1500, 1500, 1500, 1500, 500, 0])]);
    expect(stats.bossBeforeSunday).toBe(true);
    expect(banner(stats, 'bossEarly').earned).toBe(true);
  });

  it('is NOT earned when only Sunday finishes it', () => {
    const stats = statsFor([], [boss(0, [1500, 1500, 1500, 1500, 1000, 500, 1500])]);
    expect(stats.bossBeforeSunday).toBe(false);
    expect(banner(stats, 'bossEarly').earned).toBe(false);
  });

  it('is NOT earned when the boss survives the week', () => {
    expect(statsFor([], [boss(0, [1000, 1000, 1000, 1000, 1000, 1000, 1000])]).bossBeforeSunday).toBe(false);
  });

  it('counts any past week, not just the latest', () => {
    const history = [boss(1, [100, 0, 0, 0, 0, 0, 0]), boss(0, [1500, 1500, 1500, 1500, 1500, 500])];
    expect(statsFor([], history).bossBeforeSunday).toBe(true);
  });
});
