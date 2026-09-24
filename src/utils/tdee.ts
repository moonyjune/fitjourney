import { WEEKLY_FAT_LOSS_TARGET_KG } from '../constants/plan';

// Widely used rule-of-thumb: ~7700 kcal of stored energy per kg of body fat.
export const KCAL_PER_KG_FAT = 7700;

const AVG_WEEKLY_LOSS_KG = (WEEKLY_FAT_LOSS_TARGET_KG[0] + WEEKLY_FAT_LOSS_TARGET_KG[1]) / 2;

/** The plan's target daily calorie deficit, implied by its weekly fat-loss goal (the same
 *  WEEKLY_FAT_LOSS_TARGET_KG the weight-prediction curve in milestones.ts is built from). */
export const TARGET_DAILY_DEFICIT_KCAL = Math.round((AVG_WEEKLY_LOSS_KG * KCAL_PER_KG_FAT) / 7);

/** Estimated TDEE (total daily energy expenditure), back-derived from the plan's daily calorie
 *  intake target plus the deficit that target was sized to create. This app doesn't collect
 *  age/sex/activity-level to run a real BMR formula (Mifflin-St Jeor etc.) — but the intake
 *  target itself was already set against a specific weekly fat-loss goal, so adding that deficit
 *  back is a reasonable estimate of maintenance calories for this app's own plan model. */
export function estimateTdeeKcal(calorieTargetKcal: number): number {
  return calorieTargetKcal + TARGET_DAILY_DEFICIT_KCAL;
}

/** Actual energy balance so far today: estimated TDEE plus any extra calories burned through
 *  logged exercise, minus what's actually been eaten. Positive = running a deficit (losing fat),
 *  negative = running a surplus. */
export function actualDailyDeficitKcal(tdeeKcal: number, caloriesBurnedExerciseToday: number, caloriesConsumedToday: number): number {
  return tdeeKcal + caloriesBurnedExerciseToday - caloriesConsumedToday;
}
