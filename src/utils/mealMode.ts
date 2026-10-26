import { IF_EATING_END_HOUR, IF_EATING_START_HOUR } from '../constants/plan';

/** A normal eating day (intermittent fasting off): three ordinary meals, with dinner allowed until this hour. */
export const NORMAL_EATING_START_HOUR = 6;
export const NORMAL_EATING_END_HOUR = 22;

/** The current mode, kept here (no imports of stores or the network) so that pure game code such as `evaluateDay` can read it.
 *  `useMealModeStore` is the only writer: it mirrors its state into this variable on every change. Defaults to fasting on. */
let fasting = true;

export const isFasting = (): boolean => fasting;
export function setFastingState(value: boolean): void {
  fasting = value;
}

/** First and last hour of the day's eating: the 12:00-20:00 window with fasting on, 06:00-22:00 with it off. */
export const eatingStartHour = (f: boolean = fasting): number => (f ? IF_EATING_START_HOUR : NORMAL_EATING_START_HOUR);
export const eatingEndHour = (f: boolean = fasting): number => (f ? IF_EATING_END_HOUR : NORMAL_EATING_END_HOUR);

/** A last meal at or after this hour counts as late: past the window with fasting on, from 21:00 with it off. */
export const lateMealHour = (f: boolean = fasting): number => (f ? IF_EATING_END_HOUR : NORMAL_EATING_END_HOUR - 1);
