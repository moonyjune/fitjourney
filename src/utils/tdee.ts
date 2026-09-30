import { WEEKLY_FAT_LOSS_TARGET_KG } from '../constants/plan';
import type { ActivityLevel, Gender } from '../types';

// Widely used rule-of-thumb: ~7700 kcal of stored energy per kg of body fat.
export const KCAL_PER_KG_FAT = 7700;

const AVG_WEEKLY_LOSS_KG = (WEEKLY_FAT_LOSS_TARGET_KG[0] + WEEKLY_FAT_LOSS_TARGET_KG[1]) / 2;

/** The plan's target daily calorie deficit, implied by its weekly fat-loss goal (the same
 *  WEEKLY_FAT_LOSS_TARGET_KG the weight-prediction curve in milestones.ts is built from). */
export const TARGET_DAILY_DEFICIT_KCAL = Math.round((AVG_WEEKLY_LOSS_KG * KCAL_PER_KG_FAT) / 7);

/** Standard activity-multiplier tiers (Harris-Benedict/Mifflin convention) scaling BMR into TDEE. */
export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2, // little/no exercise
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // moderate exercise 3-5 days/week
  active: 1.725, // hard exercise 6-7 days/week
  very_active: 1.9, // very hard exercise or a physical job
};

/** Mifflin-St Jeor BMR (basal metabolic rate) — the modern standard replacement for the older
 *  Harris-Benedict formula. Branches on sex because the formula itself does (a ~5kcal/day-per-kg
 *  correction term differs by sex, not a simplification made here). */
export function computeBmrKcal(gender: Gender, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'male' ? base + 5 : base - 161;
}

/** Estimated TDEE, back-derived from the plan's daily calorie intake target plus the deficit that
 *  target was sized to create. Used only as a fallback when a real BMR can't be computed (missing
 *  age/gender/height/activity level) — see resolveTdeeKcal below. */
export function estimateTdeeFromPlanTarget(calorieTargetKcal: number): number {
  return calorieTargetKcal + TARGET_DAILY_DEFICIT_KCAL;
}

export interface TdeeProfileInput {
  gender: Gender | null;
  age: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  weightKg: number;
  calorieTargetKcal: number;
}

export type TdeeSource = 'profile' | 'planTargetWithActivity' | 'planTarget';

/** Prefers a real Mifflin-St Jeor + activity-level TDEE whenever gender/age/height/activity level
 *  are all known; falls back to the cruder plan-target-derived estimate otherwise (e.g. a user who
 *  hasn't filled in their profile yet). Reports which method was used so the UI can be transparent
 *  about it rather than silently showing two different numbers for the same person over time.
 *
 *  If only activityLevel is known (age/gender/height still missing), the plan-target estimate is
 *  scaled by that tier's multiplier relative to "moderate" — the activity level the plan's built-in
 *  workout schedule implicitly assumes — so picking a lower/higher tier always visibly moves the
 *  number instead of being silently ignored until the full profile is filled in. */
export function resolveTdeeKcal(input: TdeeProfileInput): { tdeeKcal: number; source: TdeeSource } {
  const { gender, age, heightCm, activityLevel, weightKg, calorieTargetKcal } = input;
  if (gender != null && age != null && heightCm != null && activityLevel != null) {
    const bmr = computeBmrKcal(gender, weightKg, heightCm, age);
    return { tdeeKcal: bmr * ACTIVITY_MULTIPLIER[activityLevel], source: 'profile' };
  }
  const planTargetTdee = estimateTdeeFromPlanTarget(calorieTargetKcal);
  if (activityLevel != null) {
    return { tdeeKcal: planTargetTdee * (ACTIVITY_MULTIPLIER[activityLevel] / ACTIVITY_MULTIPLIER.moderate), source: 'planTargetWithActivity' };
  }
  return { tdeeKcal: planTargetTdee, source: 'planTarget' };
}

/** Actual energy balance so far today: TDEE plus any extra calories burned through logged
 *  exercise, minus what's actually been eaten. Positive = running a deficit (losing fat),
 *  negative = running a surplus. */
export function actualDailyDeficitKcal(tdeeKcal: number, caloriesBurnedExerciseToday: number, caloriesConsumedToday: number): number {
  return tdeeKcal + caloriesBurnedExerciseToday - caloriesConsumedToday;
}
