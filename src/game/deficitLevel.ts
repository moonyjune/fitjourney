import { quest } from '../theme/quest';

// How a day's calorie deficit compares with the daily target, in four colours (the user's rule, 2026-10-31):
//   ≥ 90 % of the target (within 10 %, or more)          → met        green
//   50–90 %  (e.g. 500–900 of 1000 kcal)                  → ok         yellow  "tạm chấp nhận"
//   10–50 %  (e.g. 100–500 kcal)                          → low        orange  "không đạt"
//   0–10 %, about what the body burns                     → flat       light red "duy trì"
//   < 0, a surplus                                        → over       red     "ăn dư"
// A cheat day is always "cheat" (added 2026-11-01: it is left out of the calorie math, so it has no level). Added 2026-11-01: a deficit far beyond the target (more than 1.6× and
// more than 1000 kcal) is "excess" in violet — losing that fast costs muscle and, with gout, raises uric acid (flare risk).
export type DeficitLevel = 'excess' | 'met' | 'ok' | 'low' | 'flat' | 'over' | 'cheat';

/** A deficit is "excess" above both this share of the target and EXCESS_DEFICIT_MIN_KCAL. */
export const EXCESS_DEFICIT_RATIO = 1.6;
export const EXCESS_DEFICIT_MIN_KCAL = 1000;

export const DEFICIT_LEVEL_COLOR: Record<DeficitLevel, string> = {
  excess: '#C77DFF',
  met: quest.xp,
  ok: quest.gold,
  low: '#FF9F43',
  flat: quest.hpText,
  over: quest.hp,
  cheat: quest.manaText,
};

export const DEFICIT_LEVELS: DeficitLevel[] = ['excess', 'met', 'ok', 'low', 'flat', 'over', 'cheat'];

/** The level of a day's deficit against the target, or null when the day has no figure (nothing eaten logged) or no
 *  target is set. A day marked as a cheat day is "cheat" whatever it ate: its kcal are not counted. */
export function deficitLevel(deficitKcal: number | null | undefined, targetKcal: number, cheatDay = false): DeficitLevel | null {
  if (cheatDay) return 'cheat';
  if (deficitKcal == null || !Number.isFinite(deficitKcal) || !(targetKcal > 0)) return null;
  const ratio = deficitKcal / targetKcal;
  if (ratio > EXCESS_DEFICIT_RATIO && deficitKcal > EXCESS_DEFICIT_MIN_KCAL) return 'excess';
  if (ratio >= 0.9) return 'met';
  if (ratio >= 0.5) return 'ok';
  if (ratio >= 0.1) return 'low';
  return deficitKcal >= 0 ? 'flat' : 'over';
}

export function deficitColor(level: DeficitLevel | null, fallback: string = quest.textSecondary): string {
  return level ? DEFICIT_LEVEL_COLOR[level] : fallback;
}
