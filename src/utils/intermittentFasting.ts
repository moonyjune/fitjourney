import { IF_EATING_END_HOUR, IF_EATING_START_HOUR } from '../constants/plan';

export interface IfStatus {
  isEatingWindow: boolean;
  label: string;
  hoursUntilTransition: number;
}

export function getIfStatus(now: Date = new Date()): IfStatus {
  const hour = now.getHours() + now.getMinutes() / 60;
  const isEatingWindow = hour >= IF_EATING_START_HOUR && hour < IF_EATING_END_HOUR;

  if (isEatingWindow) {
    return {
      isEatingWindow: true,
      label: `Đang trong khung ăn (${IF_EATING_START_HOUR}:00 - ${IF_EATING_END_HOUR}:00)`,
      hoursUntilTransition: IF_EATING_END_HOUR - hour,
    };
  }

  const hoursUntilNoon = hour < IF_EATING_START_HOUR ? IF_EATING_START_HOUR - hour : 24 - hour + IF_EATING_START_HOUR;
  return {
    isEatingWindow: false,
    label: `Đang nhịn ăn (${IF_EATING_END_HOUR}:00 - ${IF_EATING_START_HOUR}:00 hôm sau)`,
    hoursUntilTransition: hoursUntilNoon,
  };
}
