import { IF_EATING_END_HOUR, IF_EATING_START_HOUR } from '../constants/plan';

export interface IfStatus {
  isEatingWindow: boolean;
  hoursUntilTransition: number;
}

export function getIfStatus(now: Date = new Date()): IfStatus {
  const hour = now.getHours() + now.getMinutes() / 60;
  const isEatingWindow = hour >= IF_EATING_START_HOUR && hour < IF_EATING_END_HOUR;

  if (isEatingWindow) {
    return { isEatingWindow: true, hoursUntilTransition: IF_EATING_END_HOUR - hour };
  }

  const hoursUntilNoon = hour < IF_EATING_START_HOUR ? IF_EATING_START_HOUR - hour : 24 - hour + IF_EATING_START_HOUR;
  return { isEatingWindow: false, hoursUntilTransition: hoursUntilNoon };
}
