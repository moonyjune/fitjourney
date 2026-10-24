import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import type { ActivityLevel, Gender } from '../types';

/** The body data the AI needs to fit calorie estimates to the person. Every field is optional: unknown ones are left
 *  out (never sent as null/0). Deliberately no email, name or ids. */
export interface BodyProfile {
  weightKg?: number;
  heightCm?: number;
  age?: number;
  gender?: Gender;
  activityLevel?: ActivityLevel;
}

const positive = (v: number | null | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Current body data for AI requests: the latest logged weight (falling back to the plan's starting weight), plus the
 *  height / age / gender / activity level saved in the profile. */
export function buildBodyProfile(): BodyProfile {
  const settings = useSettingsStore.getState();
  const latest = useWeightStore.getState().latest();
  const profile: BodyProfile = {};
  const weightKg = positive(latest?.weightKg) ?? positive(settings.startWeightKg);
  if (weightKg !== undefined) profile.weightKg = weightKg;
  const heightCm = positive(settings.heightCm);
  if (heightCm !== undefined) profile.heightCm = heightCm;
  const age = positive(settings.age);
  if (age !== undefined) profile.age = age;
  if (settings.gender) profile.gender = settings.gender;
  if (settings.activityLevel) profile.activityLevel = settings.activityLevel;
  return profile;
}
