import { useEffect, useMemo, useState } from 'react';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { computeCurrentStreak, computeLongestStreak } from '../utils/streak';
import { DEFAULT_WATER_TARGET_ML } from '../constants/plan';
import { useLimitsStore } from '../store/useLimitsStore';
import { useFeelingStore } from '../store/useFeelingStore';
import { useProofStore } from '../store/useProofStore';
import { useTrainingStore } from '../store/useTrainingStore';
import {
  computeAchievementStats,
  evaluateAchievements,
  evaluateBanners,
  type AchievementState,
  type AchievementStats,
  type BannerState,
} from './achievements';
import { resolveTdeeKcal } from '../utils/tdee';
import { toDateKey } from '../utils/date';
import type { Limits } from './constants';
import { buildDayEvaluator } from './dayEvaluator';
import { evaluateDay, type DayEvaluation, type DayInput } from './missions';
import type { WorkoutLogEntry } from '../types';
import { computeGameState, type GameState } from './state';

/** A `Date` that refreshes every `intervalMs` so countdowns and the eating-window cut-off stay live. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface GameView extends GameState {
  /** Consecutive days at or above the streak deficit — the "campfire" streak. */
  streak: number;
}

/** Today's TDEE from the saved profile, falling back to the plan-derived estimate when incomplete. */
export function useTdeeKcal(): number {
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const calorieTargetKcal = useSettingsStore((s) => s.calorieTargetKcal);
  const targetDailyDeficitKcal = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const gender = useSettingsStore((s) => s.gender);
  const age = useSettingsStore((s) => s.age);
  const heightCm = useSettingsStore((s) => s.heightCm);
  const activityLevel = useSettingsStore((s) => s.activityLevel);
  const latestWeight = useWeightStore((s) => s.latest());
  const weightKg = latestWeight?.weightKg ?? startWeightKg;
  return useMemo(
    () =>
      resolveTdeeKcal({ gender, age, heightCm, activityLevel, weightKg, calorieTargetKcal, targetDailyDeficitKcal }).tdeeKcal,
    [gender, age, heightCm, activityLevel, weightKg, calorieTargetKcal, targetDailyDeficitKcal]
  );
}

/** The user's own daily limits for the purine / salt / sugar missions (defaults until changed). */
export function useLimits(): Pick<Limits, 'purineMg' | 'saltG' | 'sugarG'> {
  const purineMg = useLimitsStore((s) => s.purineMg);
  const saltG = useLimitsStore((s) => s.saltG);
  const sugarG = useLimitsStore((s) => s.sugarG);
  return useMemo(() => ({ purineMg, saltG, sugarG }), [purineMg, saltG, sugarG]);
}

/** Everything `evaluateDay` needs for today, so a screen can preview a change before committing it. */
export function useTodayInput(now: Date): DayInput {
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const tdeeKcal = useTdeeKcal();
  const dateKey = toDateKey(now);
  const log = useNutritionStore((s) => s.logs[dateKey]);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const mealTemplatesByDayType = usePlanStore((s) => s.plan.mealTemplates);
  const limits = useLimits();
  const workouts = useMemo(
    () => workoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey),
    [workoutEntries, dateKey]
  );
  const minuteStamp = Math.floor(now.getTime() / 60_000);
  return useMemo(
    () => ({ dateKey, now: new Date(minuteStamp * 60_000), log, mealTemplatesByDayType, workouts, tdeeKcal, proteinTargetG, limits }),
    [dateKey, minuteStamp, log, mealTemplatesByDayType, workouts, tdeeKcal, proteinTargetG, limits]
  );
}

/** Returns a function that evaluates the missions of any calendar day from the existing logs, so a
 *  screen can show several days (the Journal week strip) without one hook call per day. */
export function useDayEvaluator(now: Date): (dateKey: string) => DayEvaluation {
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const tdeeKcal = useTdeeKcal();
  const logs = useNutritionStore((s) => s.logs);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const mealTemplatesByDayType = usePlanStore((s) => s.plan.mealTemplates);
  const limits = useLimits();
  const minuteStamp = Math.floor(now.getTime() / 60_000);
  return useMemo(
    () => buildDayEvaluator({ now: new Date(minuteStamp * 60_000), logs, workouts: workoutEntries, mealTemplatesByDayType, tdeeKcal, proteinTargetG, limits }),
    [minuteStamp, logs, workoutEntries, mealTemplatesByDayType, tdeeKcal, proteinTargetG, limits]
  );
}

/** All FitQuest progress for the signed-in user, derived from the existing log stores. */
export function useGameState(now: Date): GameView {
  const startDateISO = useSettingsStore((s) => s.startDateISO);
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const tdeeKcal = useTdeeKcal();
  const logs = useNutritionStore((s) => s.logs);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const limits = useLimits();

  // Re-evaluate once per minute rather than on every 30 s tick: nothing in the rules changes
  // faster than the eating-window cut-off, and the replay walks every day since the start date.
  const minuteStamp = Math.floor(now.getTime() / 60_000);
  return useMemo(() => {
    const at = new Date(minuteStamp * 60_000);
    const state = computeGameState({
      now: at,
      startDateISO,
      logs,
      workoutEntries,
      mealTemplatesByDayType: mealTemplates,
      tdeeKcal,
      proteinTargetG,
      limits,
    });
    return { ...state, streak: computeCurrentStreak(logs, mealTemplates, workoutEntries, tdeeKcal, at) };
  }, [minuteStamp, startDateISO, logs, workoutEntries, mealTemplates, tdeeKcal, proteinTargetG, limits]);
}

/** Stickers and banners for the signed-in user, derived from every log store. */
export function useAchievements(now: Date): {
  stats: AchievementStats;
  stickers: AchievementState[];
  banners: BannerState[];
} {
  const game = useGameState(now);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const tdeeKcal = useTdeeKcal();
  const logs = useNutritionStore((s) => s.logs);
  const weights = useWeightStore((s) => s.entries);
  const workouts = useWorkoutStore((s) => s.entries);
  const trainingProgress = useTrainingStore((s) => s.progress);
  const photos = useProofStore((s) => s.photos);
  const feelings = useFeelingStore((s) => s.records);
  const plan = usePlanStore((s) => s.plan);

  return useMemo(() => {
    const schedule = plan.waterSchedule;
    const waterGoalMl = schedule.length ? schedule[schedule.length - 1].cumulativeTargetMl : DEFAULT_WATER_TARGET_ML;
    const waterByDay: Record<string, number> = {};
    for (const [key, log] of Object.entries(logs)) waterByDay[key] = log.waterMl ?? 0;
    const stats = computeAchievementStats({
      game,
      startWeightKg,
      goalWeightKg,
      weights,
      longestStreak: computeLongestStreak(logs, plan.mealTemplates, workouts, tdeeKcal),
      workouts,
      trainingProgress,
      photos,
      feelings,
      waterGoalMl,
      waterByDay,
    });
    return { stats, stickers: evaluateAchievements(stats), banners: evaluateBanners(stats) };
  }, [game, startWeightKg, goalWeightKg, weights, logs, workouts, trainingProgress, photos, feelings, plan, tdeeKcal]);
}
