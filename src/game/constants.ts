import { KCAL_PER_KG_FAT } from '../utils/tdee';
import { STREAK_MIN_DEFICIT_KCAL } from '../utils/streak';

// FitQuest rules — see Design/v4-fitquest/0-phong-cach-luat-choi for the design this implements.

/** Weekly boss HP = the kcal needed to lose 1 kg of fat, so defeating it means roughly 1 kg lost. */
export const BOSS_MAX_HP = KCAL_PER_KG_FAT;

/** A single day can only deal this much damage, so starving yourself is never rewarded further. */
export const DAILY_DAMAGE_CAP_KCAL = 1500;

export const BOSS_DEFEAT_XP = 500;
export const PERFECT_DAY_BONUS_XP = 50;

/** Minimum logged workout length (minutes) that completes the daily workout mission. */
export const WORKOUT_MIN_MINUTES = 10;

export type MissionId = 'workout' | 'deficit' | 'protein' | 'purine' | 'salt' | 'sugar' | 'junk';

export const MISSION_ORDER: MissionId[] = ['workout', 'deficit', 'protein', 'purine', 'salt', 'sugar', 'junk'];

export const MISSION_XP: Record<MissionId, number> = {
  workout: 60,
  deficit: 50,
  protein: 40,
  purine: 30,
  salt: 30,
  sugar: 30,
  junk: 30,
};

/** Daily limits for the "stay under the line" missions. */
export const LIMITS = {
  /** Same fixed bar the streak uses, so the two never disagree about what a good day is. */
  deficitKcal: STREAK_MIN_DEFICIT_KCAL,
  /** Sized to the built-in plan, whose menus come to ~970 mg purine on a training day (estimated from food names), so a
   *  day that follows the plan passes and a day with a lot of extra high-purine food does not. The user can change it. */
  purineMg: 1200,
  /** Table salt, not sodium. The built-in plan comes to ~6.4 g on a training day; WHO's 5 g would make the mission unwinnable
   *  by following the plan, so the default sits just above it. The user can lower it. */
  saltG: 7,
  /** Free sugars (added sugar, syrups, juice) — WHO's ~5% of energy suggestion at ~2,000 kcal. */
  sugarG: 25,
} as const;

export type Limits = { [K in keyof typeof LIMITS]: number };
