import type { FeelingRecord, ProofPhoto, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import { weekStartKey } from '../utils/weekKey';
import { EXERCISES, MAX_LEVEL, type ExerciseId } from './training/exercises';
import type { ExerciseProgress } from './training/progress';
import type { GameState } from './state';

// Stickers and banners are DERIVED from the logs on every render, like XP: nothing is stored, so an
// achievement can't be "earned" by a bug and deleting a bad log takes it away again. The only exception
// is that the longest streak / best boss run are measured over the whole history, so a badge you earned
// stays earned after the streak breaks.
//
// Purine / salt / sugar streaks count only days on which that mission was actually earned (a closed day with
// food logged and the user's own ceiling respected) — a day with no data is never "under the limit". The
// ceilings are rough keyword estimates, so these stickers are about consistency, not lab-grade numbers.
//
// Not included (no trustworthy data behind them yet): 16:8 fasting (the app records no real meal times), AI meal
// swaps and the coach badges. See the notes in the migration memory.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CategoryId = 'weight' | 'streak' | 'boss' | 'training' | 'nutrition' | 'water' | 'level' | 'perfect' | 'records';

export type AchievementKind =
  | 'firstWeigh'
  | 'weightLost'
  | 'weightPercent'
  | 'goalReached'
  | 'streak'
  | 'bossFirst'
  | 'bossRun'
  | 'bossTotal'
  | 'sessions'
  | 'abcWeek'
  | 'mastery'
  | 'firstMeal'
  | 'proteinDays'
  | 'junkFreeDays'
  | 'purineStreak'
  | 'saltStreak'
  | 'sugarStreak'
  | 'waterDays'
  | 'level'
  | 'perfectDays'
  | 'photos'
  | 'checkinDays';

export interface AchievementDef {
  id: string;
  category: CategoryId;
  kind: AchievementKind;
  /** The threshold (kg, days, count, level, …). */
  n: number;
  rarity: Rarity;
  /** Only for `mastery`. */
  exerciseId?: ExerciseId;
  /** Only for `weightLost`: the weight the user reaches (start − n), shown in the name. */
  weightKg?: number;
}

export interface AchievementState extends AchievementDef {
  earned: boolean;
  /** Progress towards `target`, clamped to it; `current === target` once earned. */
  current: number;
  target: number;
}

/** Kinds that only banners use (no sticker is built from them). */
export type BannerKind = AchievementKind | 'workoutDays' | 'workoutWeek' | 'bossEarly';

export interface BannerDef {
  id: string;
  kind: BannerKind;
  n: number;
  /** Ribbon colour. */
  color: string;
}

export interface BannerState extends BannerDef {
  earned: boolean;
  current: number;
  target: number;
}

export interface AchievementStats {
  startWeightKg: number;
  goalWeightKg: number;
  /** Lowest weight ever logged, or null before the first weigh-in. */
  lowestKg: number | null;
  weighIns: number;
  longestStreak: number;
  bossesDefeated: number;
  bestBossRun: number;
  workoutSessions: number;
  /** A week in which all three home groups A, B and C were trained. */
  abcWeek: boolean;
  masteredIds: ExerciseId[];
  mealsLogged: boolean;
  proteinDays: number;
  junkFreeDays: number;
  waterDays: number;
  workoutMissionDays: number;
  /** Longest run of consecutive days on which the purine / salt / sugar mission was earned. */
  purineStreak: number;
  saltStreak: number;
  sugarStreak: number;
  /** Most days with the Workout mission earned within one Monday–Sunday week. */
  bestWorkoutWeek: number;
  /** Some weekly boss reached 0 HP using Monday–Saturday damage alone. */
  bossBeforeSunday: boolean;
  level: number;
  perfectDays: number;
  photos: number;
  checkinDays: number;
}

export interface StatsInput {
  game: Pick<GameState, 'days' | 'bossHistory' | 'bossesDefeated' | 'level' | 'perfectDays'>;
  startWeightKg: number;
  goalWeightKg: number;
  weights: { weightKg: number }[];
  longestStreak: number;
  workouts: WorkoutLogEntry[];
  trainingProgress: Partial<Record<ExerciseId, ExerciseProgress>>;
  photos: ProofPhoto[];
  feelings: FeelingRecord[];
  /** Daily water goal in ml (the sum of the plan's schedule). */
  waterGoalMl: number;
  waterByDay: Record<string, number>;
}

/** Longest run of consecutive calendar days on which `id` was earned. `days` is the replay: one entry per day, no gaps. */
function longestDoneRun(days: StatsInput['game']['days'], id: string): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day.missions.some((m) => m.id === id && m.status === 'done') ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Longest run of consecutive defeated weeks in a newest-first boss history. */
function bestRun(history: { defeated: boolean }[]): number {
  let best = 0;
  let run = 0;
  for (const week of [...history].reverse()) {
    run = week.defeated ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function computeAchievementStats(input: StatsInput): AchievementStats {
  const { game, workouts } = input;
  const done = (day: StatsInput['game']['days'][number], id: string) => day.missions.some((m) => m.id === id && m.status === 'done');

  const weeks = new Map<string, Set<string>>();
  for (const w of workouts) {
    const m = /^home-([ABC])$/.exec(w.templateId ?? '');
    if (!m) continue;
    const week = weekStartKey(new Date(w.dateISO));
    const set = weeks.get(week) ?? new Set<string>();
    set.add(m[1]);
    weeks.set(week, set);
  }

  const workoutDaysByWeek = new Map<string, number>();
  for (const day of game.days) {
    if (!done(day, 'workout')) continue;
    const week = weekStartKey(new Date(`${day.dateKey}T12:00:00`));
    workoutDaysByWeek.set(week, (workoutDaysByWeek.get(week) ?? 0) + 1);
  }

  // Boss damage per day is already capped, so "before Sunday" is simply: Monday–Saturday damage alone empties the HP bar.
  const bossBeforeSunday = game.bossHistory.some(
    (boss) => boss.days.filter((_, i) => i < 6).reduce((sum, d) => sum + d.damage, 0) >= boss.maxHp
  );

  const checkinDays = new Set(input.feelings.map((f) => toDateKey(new Date(f.loggedAtISO))));
  const waterDays = Object.values(input.waterByDay).filter((ml) => input.waterGoalMl > 0 && ml >= input.waterGoalMl).length;

  return {
    startWeightKg: input.startWeightKg,
    goalWeightKg: input.goalWeightKg,
    lowestKg: input.weights.length ? Math.min(...input.weights.map((w) => w.weightKg)) : null,
    weighIns: input.weights.length,
    longestStreak: input.longestStreak,
    bossesDefeated: game.bossesDefeated,
    bestBossRun: bestRun(game.bossHistory),
    workoutSessions: workouts.length,
    abcWeek: [...weeks.values()].some((s) => s.size === 3),
    masteredIds: EXERCISES.filter((e) => input.trainingProgress[e.id]?.level === MAX_LEVEL).map((e) => e.id),
    mealsLogged: game.days.some((d) => d.eatenKcal > 0),
    proteinDays: game.days.filter((d) => done(d, 'protein')).length,
    junkFreeDays: game.days.filter((d) => done(d, 'junk')).length,
    waterDays,
    workoutMissionDays: game.days.filter((d) => done(d, 'workout')).length,
    purineStreak: longestDoneRun(game.days, 'purine'),
    saltStreak: longestDoneRun(game.days, 'salt'),
    sugarStreak: longestDoneRun(game.days, 'sugar'),
    bestWorkoutWeek: Math.max(0, ...workoutDaysByWeek.values()),
    bossBeforeSunday,
    level: game.level.level,
    perfectDays: game.perfectDays,
    photos: input.photos.length,
    checkinDays: checkinDays.size,
  };
}

const R = { c: 'common', r: 'rare', e: 'epic', l: 'legendary' } as const;

/** The catalogue. Weight steps follow the user's own start/goal, so it scales to any journey. */
export function achievementCatalogue(startWeightKg: number, goalWeightKg: number): AchievementDef[] {
  const defs: AchievementDef[] = [];
  const add = (category: CategoryId, kind: AchievementKind, n: number, rarity: Rarity, extra: Partial<AchievementDef> = {}) =>
    defs.push({ id: `${kind}-${extra.exerciseId ?? n}`, category, kind, n, rarity, ...extra });

  const goalLoss = Math.max(1, Math.round(startWeightKg - goalWeightKg));
  add('weight', 'firstWeigh', 1, R.c);
  for (let kg = 1; kg < Math.min(goalLoss, 31); kg++) {
    // Every fifth kilo is a milestone; the finish line itself is the separate `goalReached` badge.
    const rarity: Rarity = kg % 5 === 0 ? R.l : kg % 3 === 0 ? R.r : R.c;
    add('weight', 'weightLost', kg, rarity, { weightKg: Math.round((startWeightKg - kg) * 10) / 10 });
  }
  add('weight', 'weightPercent', 5, R.e);
  add('weight', 'weightPercent', 10, R.e);
  add('weight', 'goalReached', goalLoss, R.l);

  for (const [n, r] of [[3, R.c], [7, R.r], [14, R.r], [21, R.e], [30, R.e], [60, R.e], [90, R.l], [180, R.l], [365, R.l]] as const) {
    add('streak', 'streak', n, r);
  }

  add('boss', 'bossFirst', 1, R.r);
  add('boss', 'bossRun', 2, R.r);
  add('boss', 'bossRun', 4, R.e);
  for (const [n, r] of [[8, R.e], [12, R.e], [26, R.l], [52, R.l]] as const) add('boss', 'bossTotal', n, r);

  for (const [n, r] of [[1, R.c], [10, R.c], [25, R.r], [50, R.e], [100, R.e], [200, R.l]] as const) add('training', 'sessions', n, r);
  add('training', 'abcWeek', 1, R.r);
  for (const e of EXERCISES) add('training', 'mastery', MAX_LEVEL, R.r, { exerciseId: e.id });

  add('nutrition', 'firstMeal', 1, R.c);
  for (const [n, r] of [[7, R.r], [30, R.e], [100, R.l]] as const) add('nutrition', 'proteinDays', n, r);
  for (const [n, r] of [[7, R.c], [30, R.r], [90, R.e], [180, R.l]] as const) add('nutrition', 'junkFreeDays', n, r);
  for (const kind of ['purineStreak', 'saltStreak', 'sugarStreak'] as const) {
    for (const [n, r] of [[3, R.c], [7, R.r], [14, R.e], [30, R.l]] as const) add('nutrition', kind, n, r);
  }

  for (const [n, r] of [[1, R.c], [7, R.r], [30, R.e], [100, R.l]] as const) add('water', 'waterDays', n, r);

  for (const [n, r] of [[5, R.c], [10, R.r], [15, R.e], [20, R.l], [25, R.l], [30, R.l]] as const) add('level', 'level', n, r);

  for (const [n, r] of [[1, R.c], [7, R.r], [30, R.e], [50, R.e], [100, R.l]] as const) add('perfect', 'perfectDays', n, r);

  for (const [n, r] of [[1, R.c], [10, R.c], [50, R.r], [100, R.e]] as const) add('records', 'photos', n, r);
  add('records', 'checkinDays', 7, R.c);
  add('records', 'checkinDays', 30, R.r);
  return defs;
}

export const CATEGORY_ORDER: CategoryId[] = ['weight', 'streak', 'boss', 'training', 'nutrition', 'water', 'level', 'perfect', 'records'];

/** Current value and target of a definition against the user's stats. */
function measure(def: AchievementDef | BannerDef, stats: AchievementStats): { current: number; target: number } {
  const lost = stats.lowestKg === null ? 0 : Math.max(0, stats.startWeightKg - stats.lowestKg);
  switch (def.kind) {
    case 'firstWeigh': return { current: stats.weighIns, target: 1 };
    case 'weightLost': return { current: lost, target: def.n };
    case 'weightPercent': return { current: lost, target: (stats.startWeightKg * def.n) / 100 };
    case 'goalReached': return { current: lost, target: def.n };
    case 'streak': return { current: stats.longestStreak, target: def.n };
    case 'bossFirst': return { current: stats.bossesDefeated, target: 1 };
    case 'bossRun': return { current: stats.bestBossRun, target: def.n };
    case 'bossTotal': return { current: stats.bossesDefeated, target: def.n };
    case 'sessions': return { current: stats.workoutSessions, target: def.n };
    case 'abcWeek': return { current: stats.abcWeek ? 1 : 0, target: 1 };
    case 'mastery': {
      const id = (def as AchievementDef).exerciseId;
      return { current: id && stats.masteredIds.includes(id) ? 1 : 0, target: 1 };
    }
    case 'firstMeal': return { current: stats.mealsLogged ? 1 : 0, target: 1 };
    case 'proteinDays': return { current: stats.proteinDays, target: def.n };
    case 'junkFreeDays': return { current: stats.junkFreeDays, target: def.n };
    case 'purineStreak': return { current: stats.purineStreak, target: def.n };
    case 'saltStreak': return { current: stats.saltStreak, target: def.n };
    case 'sugarStreak': return { current: stats.sugarStreak, target: def.n };
    case 'waterDays': return { current: stats.waterDays, target: def.n };
    case 'level': return { current: stats.level, target: def.n };
    case 'perfectDays': return { current: stats.perfectDays, target: def.n };
    case 'photos': return { current: stats.photos, target: def.n };
    case 'checkinDays': return { current: stats.checkinDays, target: def.n };
    case 'workoutDays': return { current: stats.workoutMissionDays, target: def.n };
    case 'workoutWeek': return { current: stats.bestWorkoutWeek, target: def.n };
    case 'bossEarly': return { current: stats.bossBeforeSunday ? 1 : 0, target: 1 };
  }
}

// Floating-point kg arithmetic: 110 − 106.2 is 3.8000000000000114 and 110 − 109 can be 0.9999999…
const EPS = 1e-6;

export function evaluateAchievements(stats: AchievementStats): AchievementState[] {
  return achievementCatalogue(stats.startWeightKg, stats.goalWeightKg).map((def) => {
    const { current, target } = measure(def, stats);
    const earned = current + EPS >= target;
    return { ...def, earned, current: earned ? target : Math.min(current, target), target };
  });
}

export const BANNERS: BannerDef[] = [
  { id: 'bossHunter4', kind: 'bossRun', n: 4, color: '#FFC83D' },
  { id: 'clean30', kind: 'junkFreeDays', n: 30, color: '#8BFF6B' },
  { id: 'level10', kind: 'level', n: 10, color: '#4CC9F0' },
  { id: 'goal', kind: 'goalReached', n: 0, color: '#FF8FA3' },
  { id: 'warrior100', kind: 'workoutDays', n: 100, color: '#A78BFA' },
  { id: 'fire90', kind: 'streak', n: 90, color: '#FF7A45' },
  { id: 'ten', kind: 'weightLost', n: 10, color: '#F4F1FF' },
  { id: 'level20', kind: 'level', n: 20, color: '#FFE08A' },
  { id: 'mana100', kind: 'waterDays', n: 100, color: '#7C9CFF' },
  { id: 'protein100', kind: 'proteinDays', n: 100, color: '#D4FF4F' },
  { id: 'perfect30', kind: 'perfectDays', n: 30, color: '#FFA6E1' },
  { id: 'week6', kind: 'workoutWeek', n: 6, color: '#FF6B9D' },
  { id: 'bossEarly', kind: 'bossEarly', n: 1, color: '#5EEAD4' },
];

export function evaluateBanners(stats: AchievementStats): BannerState[] {
  const goalLoss = Math.max(1, Math.round(stats.startWeightKg - stats.goalWeightKg));
  return BANNERS.map((def) => {
    const d = def.kind === 'goalReached' ? { ...def, n: goalLoss } : def;
    const { current, target } = measure(d, stats);
    const earned = current + EPS >= target;
    return { ...d, earned, current: earned ? target : Math.min(current, target), target };
  });
}
