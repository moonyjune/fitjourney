import { quest } from '../theme/quest';
import { DAILY_DAMAGE_CAP_KCAL, totalDeficitWarnKcal } from './constants';

// How a day's calorie deficit compares with the daily target, in four colours (the user's rule, 2026-10-31):
//   ≥ 90 % of the target (within 10 %, or more)          → met        green
//   50–90 %  (e.g. 500–900 of 1000 kcal)                  → ok         yellow  "tạm chấp nhận"
//   10–50 %  (e.g. 100–500 kcal)                          → low        orange  "không đạt"
//   0–10 %, about what the body burns                     → flat       light red "duy trì"
//   < 0, a surplus                                        → over       red     "ăn dư"
// A cheat day is always "cheat" (added 2026-11-01: it is left out of the calorie math, so it has no level).
// Warnings, never a ban (the user's rule, 2026-11-01), in violet ahead of the levels above:
//   the deficit from eating alone (TDEE − eaten) above 1500 kcal              → underEat   "ăn quá ít"
//   the whole deficit (eating + exercise) above 1800 kcal (2000 for TDEE ≥ 2600) → excess  "thâm hụt quá lớn"
// Losing that fast costs muscle and, with gout, raises uric acid (flare risk).
export type DeficitLevel = 'underEat' | 'excess' | 'met' | 'ok' | 'low' | 'flat' | 'over' | 'cheat';

/** What the warnings need: the day's exercise kcal (to split off the deficit from eating) and the TDEE (for the whole-day limit). */
export interface DeficitBody {
  burnedKcal?: number;
  tdeeKcal?: number;
}

export const DEFICIT_LEVEL_COLOR: Record<DeficitLevel, string> = {
  underEat: '#C77DFF',
  excess: '#C77DFF',
  met: quest.xp,
  ok: quest.gold,
  low: '#FF9F43',
  flat: quest.hpText,
  over: quest.hp,
  cheat: quest.manaText,
};

export const DEFICIT_LEVELS: DeficitLevel[] = ['underEat', 'excess', 'met', 'ok', 'low', 'flat', 'over', 'cheat'];

/** The level of a day's deficit against the target, or null when the day has no figure (nothing eaten logged) or no
 *  target is set. A day marked as a cheat day is "cheat" whatever it ate: its kcal are not counted. */
export function deficitLevel(
  deficitKcal: number | null | undefined,
  targetKcal: number,
  cheatDay = false,
  body: DeficitBody = {}
): DeficitLevel | null {
  if (cheatDay) return 'cheat';
  if (deficitKcal == null || !Number.isFinite(deficitKcal) || !(targetKcal > 0)) return null;
  if (deficitKcal - Math.max(0, body.burnedKcal ?? 0) > DAILY_DAMAGE_CAP_KCAL) return 'underEat';
  if (deficitKcal > totalDeficitWarnKcal(body.tdeeKcal)) return 'excess';
  const ratio = deficitKcal / targetKcal;
  if (ratio >= 0.9) return 'met';
  if (ratio >= 0.5) return 'ok';
  if (ratio >= 0.1) return 'low';
  return deficitKcal >= 0 ? 'flat' : 'over';
}

export function deficitColor(level: DeficitLevel | null, fallback: string = quest.textSecondary): string {
  return level ? DEFICIT_LEVEL_COLOR[level] : fallback;
}
