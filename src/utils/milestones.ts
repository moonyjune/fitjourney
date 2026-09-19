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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
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
    const projectedLoss = AVG_WEEKLY_LOSS_KG * (milestone.daysFromStart / 7);
    const targetWeightKg = Math.max(goalWeightKg, startWeightKg - projectedLoss);
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
