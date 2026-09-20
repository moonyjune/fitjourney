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
