import type { MealTemplate, WaterCheckpoint, WorkoutTemplate } from '../types';
import { formatGameText, type GameKey } from '../game/strings';

/**
 * The day's water plan, generated from the daily target alone (plus the drinking window), so it always follows the setting:
 *
 * - Drinks: `round(target / 500)`, at least 1. Every drink is 500 ml except the last, which takes what is left
 *   (between 250 and 749 ml): 4500 → 9 × 500, 3500 → 7 × 500, 3700 → 6 × 500 + 700, 3800 → 7 × 500 + 300.
 * - Times: spread evenly from the window's start (default 06:00, waking up) to its end (default 21:00, the last glass about an
 *   hour before bed), rounded to 5 minutes. A single drink sits at the start. Water is fine while fasting, so the fasting
 *   window does not move any drink; it only names the morning ones.
 * - Labels: from the time of day — the first is waking up, the last is the last glass; one within 45 minutes of a workout
 *   is "around the workout", one up to 45 minutes before / 60 minutes after a meal is "before / after <meal>"; otherwise
 *   the part of the day. Labels never move a drink, so times and amounts depend only on target and window.
 * - `cumulativeTargetMl` rises to exactly the target.
 */
export const WATER_GLASS_ML = 500;
export const DEFAULT_WATER_START_MIN = 6 * 60;
export const DEFAULT_WATER_END_MIN = 21 * 60;
/** The window the settings allow: start 04:00-12:00, end 15:00-23:30, end at least 3 h after the start. */
export const WATER_START_RANGE = [4 * 60, 12 * 60] as const;
export const WATER_END_RANGE = [15 * 60, 23 * 60 + 30] as const;
/** Quick picks for the daily target, and the step of the − / + buttons. */
export const WATER_TARGET_PRESETS_ML = [2500, 3000, 3500, 4000, 4500] as const;
export const WATER_TARGET_STEP_ML = 250;
export const WATER_TARGET_RANGE = [500, 8000] as const;

const NEAR_WORKOUT_MIN = 45;
const BEFORE_MEAL_MIN = 45;
const AFTER_MEAL_MIN = 60;

export interface WaterAnchor {
  kind: 'meal' | 'workout';
  /** Minutes since midnight. */
  minutes: number;
}

export interface WaterScheduleOptions {
  /** First drink, minutes since midnight (default 06:00). */
  startMinutes?: number;
  /** Last drink, minutes since midnight (default 21:00). */
  endMinutes?: number;
  /** Meal / workout times used only to name nearby drinks. */
  anchors?: WaterAnchor[];
  /** Intermittent fasting on: morning drinks before the eating window are named as fasting-window drinks. */
  fasting?: boolean;
  /** First hour of the eating window when fasting (default 12). */
  eatingStartHour?: number;
  language?: 'vi' | 'en';
}

/** How many drinks and how much each: every drink a 500 ml glass, the last one the rest. */
export function waterDrinkAmounts(targetMl: number): number[] {
  const target = Math.max(0, Math.round(targetMl));
  if (target === 0) return [];
  const n = Math.max(1, Math.round(target / WATER_GLASS_ML));
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? WATER_GLASS_ML : target - WATER_GLASS_ML * (n - 1)));
}

export function clampWaterWindow(startMinutes?: number, endMinutes?: number): { start: number; end: number } {
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));
  const start = clamp(Number.isFinite(startMinutes) ? (startMinutes as number) : DEFAULT_WATER_START_MIN, WATER_START_RANGE);
  let end = clamp(Number.isFinite(endMinutes) ? (endMinutes as number) : DEFAULT_WATER_END_MIN, WATER_END_RANGE);
  if (end < start + 180) end = Math.min(WATER_END_RANGE[1], start + 180);
  return { start, end };
}

function mealKey(minutes: number): 'breakfast' | 'lunch' | 'afternoon' | 'dinner' {
  if (minutes < 10 * 60) return 'breakfast';
  if (minutes < 14 * 60) return 'lunch';
  if (minutes < 18 * 60) return 'afternoon';
  return 'dinner';
}

function labelFor(minutes: number, index: number, count: number, options: WaterScheduleOptions): string {
  const lang = options.language ?? 'vi';
  const t = (key: GameKey, params?: Record<string, string>) => formatGameText(lang, key, params);
  if (index === 0) return t('water.label.wake');
  if (index === count - 1) return t('water.label.last');
  const anchors = options.anchors ?? [];
  if (anchors.some((a) => a.kind === 'workout' && Math.abs(a.minutes - minutes) <= NEAR_WORKOUT_MIN)) return t('water.label.workout');
  const meals = anchors.filter((a) => a.kind === 'meal');
  const before = meals.filter((a) => a.minutes - minutes >= 0 && a.minutes - minutes <= BEFORE_MEAL_MIN).sort((a, b) => a.minutes - b.minutes)[0];
  if (before) return t('water.label.beforeMeal', { meal: t(`water.meal.${mealKey(before.minutes)}` as GameKey) });
  const after = meals.filter((a) => minutes - a.minutes > 0 && minutes - a.minutes <= AFTER_MEAL_MIN).sort((a, b) => b.minutes - a.minutes)[0];
  if (after) return t('water.label.afterMeal', { meal: t(`water.meal.${mealKey(after.minutes)}` as GameKey) });
  if (options.fasting && minutes < (options.eatingStartHour ?? 12) * 60) return t('water.label.fasting');
  if (minutes < 9 * 60) return t('water.label.early');
  if (minutes < 11 * 60) return t('water.label.midMorning');
  if (minutes < 13 * 60 + 30) return t('water.label.noon');
  if (minutes < 17 * 60) return t('water.label.afternoon');
  if (minutes < 19 * 60) return t('water.label.lateAfternoon');
  return t('water.label.evening');
}

/** The checkpoints for a daily target. Pure and deterministic: same target and options, same schedule. */
export function buildWaterSchedule(targetMl: number, options: WaterScheduleOptions = {}): WaterCheckpoint[] {
  const amounts = waterDrinkAmounts(targetMl);
  const { start, end } = clampWaterWindow(options.startMinutes, options.endMinutes);
  const n = amounts.length;
  let cumulative = 0;
  return amounts.map((ml, i) => {
    const raw = n === 1 ? start : start + ((end - start) * i) / (n - 1);
    const minutes = Math.round(raw / 5) * 5;
    cumulative += ml;
    return { hour: Math.floor(minutes / 60), minute: minutes % 60, label: labelFor(minutes, i, n, options), cumulativeTargetMl: cumulative };
  });
}

/** Meal and workout times of a plan, for naming drinks. Workouts only count on training days. */
export function planAnchors(meals: MealTemplate[], workouts: WorkoutTemplate[], trainingDay = true): WaterAnchor[] {
  const out: WaterAnchor[] = meals.map((m) => ({ kind: 'meal' as const, minutes: m.startHour * 60 + m.startMinute }));
  if (trainingDay) {
    for (const w of workouts) {
      if (w.reminderSlot && w.startHour !== undefined && w.startMinute !== undefined) out.push({ kind: 'workout', minutes: w.startHour * 60 + w.startMinute });
    }
  }
  return out;
}

/** The total a schedule leads to (its last checkpoint), 0 for an empty one. */
export function scheduleTotalMl(schedule: WaterCheckpoint[]): number {
  return schedule.length ? schedule[schedule.length - 1].cumulativeTargetMl : 0;
}

/** Same times and amounts (labels aside). */
export function sameScheduleShape(a: WaterCheckpoint[], b: WaterCheckpoint[]): boolean {
  return a.length === b.length && a.every((c, i) => c.hour === b[i].hour && c.minute === b[i].minute && c.cumulativeTargetMl === b[i].cumulativeTargetMl);
}

export function sameSchedule(a: WaterCheckpoint[], b: WaterCheckpoint[]): boolean {
  return sameScheduleShape(a, b) && a.every((c, i) => c.label === b[i].label);
}

export const clockText = (hour: number, minute: number): string => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export interface NextDrink {
  /** How much to drink now / at that time: the checkpoint's running total less what was drunk so far. */
  ml: number;
  hour: number;
  minute: number;
  label: string;
  /** The checkpoint's time has already passed (catch up now). */
  overdue: boolean;
}

/** What to drink next: the latest checkpoint already due but not reached (catch up), else the next one ahead not reached
 *  yet; null once the day's target is met. */
export function nextDrink(schedule: WaterCheckpoint[], waterMl: number, now: Date): NextDrink | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const at = (x: WaterCheckpoint) => x.hour * 60 + x.minute;
  const open = schedule.filter((x) => waterMl < x.cumulativeTargetMl);
  const due = open.filter((x) => at(x) <= nowMin);
  const c = due.length > 0 ? due[due.length - 1] : open[0];
  if (!c) return null;
  return { ml: c.cumulativeTargetMl - waterMl, hour: c.hour, minute: c.minute, label: c.label, overdue: at(c) < nowMin };
}

/** The water target of a day: the one stored on the day's log, else the current setting. */
export function dayWaterTargetMl(log: { waterTargetMl?: number } | undefined, settingMl: number): number {
  return log?.waterTargetMl && log.waterTargetMl > 0 ? log.waterTargetMl : settingMl;
}
