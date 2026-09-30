import { MILESTONES, WEEKLY_FAT_LOSS_TARGET_KG } from '../constants/plan';

const AVG_WEEKLY_LOSS_KG = (WEEKLY_FAT_LOSS_TARGET_KG[0] + WEEKLY_FAT_LOSS_TARGET_KG[1]) / 2;

export type MilestoneStatus = 'upcoming' | 'achieved' | 'missed';

export interface MilestoneProgress {
  key: string;
  label: string;
  daysFromStart: number;
  targetDate: Date;
  targetWeightKg: number;
  status: MilestoneStatus;
  daysRemaining: number;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** The same weight-loss curve milestones are scored against, usable for any date — e.g. to draw
 *  a predicted trend line on the weight chart. */
export function predictedWeightKgAt(date: Date, startDateISO: string, startWeightKg: number, goalWeightKg: number): number {
  const daysFromStart = Math.max(0, (date.getTime() - new Date(startDateISO).getTime()) / (1000 * 60 * 60 * 24));
  const projectedLoss = AVG_WEEKLY_LOSS_KG * (daysFromStart / 7);
  return Math.max(goalWeightKg, startWeightKg - projectedLoss);
}

/** Inverse of predictedWeightKgAt: the date the weight-loss curve projects to first reach
 *  targetWeightKg (clamped at goalWeightKg, same floor predictedWeightKgAt uses). */
export function dateForTargetWeight(targetWeightKg: number, startDateISO: string, startWeightKg: number, goalWeightKg: number): Date {
  const clampedTarget = Math.max(targetWeightKg, goalWeightKg);
  const daysFromStart = ((startWeightKg - clampedTarget) / AVG_WEEKLY_LOSS_KG) * 7;
  return addDays(new Date(startDateISO), Math.max(0, daysFromStart));
}

export interface WeightLossMilestone {
  targetWeightKg: number;
  date: Date;
  /** True for the final entry, which is the plan's actual goal (may be <5kg below the previous
   *  step, unlike every other entry which is a clean multiple of 5kg below start). */
  isGoal: boolean;
}

/** Sequential 5kg-loss checkpoints (110 -> 105 -> 100 -> ...) down to the plan's goal weight, each
 *  with its predicted date on the same curve computeMilestones/the weight chart use. Used for the
 *  Weight tab's chart so the trend line reads as a series of concrete weight targets, not just one
 *  end-of-range number. */
export function buildWeightLossMilestones(startWeightKg: number, goalWeightKg: number, startDateISO: string): WeightLossMilestone[] {
  const milestones: WeightLossMilestone[] = [];
  let target = Math.floor(startWeightKg / 5) * 5;
  if (target >= startWeightKg) target -= 5;
  while (target > goalWeightKg) {
    milestones.push({ targetWeightKg: target, date: dateForTargetWeight(target, startDateISO, startWeightKg, goalWeightKg), isGoal: false });
    target -= 5;
  }
  milestones.push({
    targetWeightKg: goalWeightKg,
    date: dateForTargetWeight(goalWeightKg, startDateISO, startWeightKg, goalWeightKg),
    isGoal: true,
  });
  return milestones;
}

export function computeMilestones(
  startDateISO: string,
  startWeightKg: number,
  goalWeightKg: number,
  currentWeightKg: number,
  now: Date = new Date()
): MilestoneProgress[] {
  const startDate = new Date(startDateISO);

  return MILESTONES.map((milestone) => {
    const targetDate = addDays(startDate, milestone.daysFromStart);
    const targetWeightKg = predictedWeightKgAt(targetDate, startDateISO, startWeightKg, goalWeightKg);
    const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    let status: MilestoneStatus;
    if (daysRemaining > 0) {
      status = 'upcoming';
    } else if (currentWeightKg <= targetWeightKg) {
      status = 'achieved';
    } else {
      status = 'missed';
    }

    return {
      key: milestone.key,
      label: milestone.label,
      daysFromStart: milestone.daysFromStart,
      targetDate,
      targetWeightKg,
      status,
      daysRemaining,
    };
  });
}
