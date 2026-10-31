import { quest } from '../theme/quest';

// How a day's calorie deficit compares with the daily target, in four colours (the user's rule, 2026-10-31):
//   ≥ 90 % of the target (within 10 %, or more)          → met        green
//   50–90 %  (e.g. 500–900 of 1000 kcal)                  → ok         yellow  "tạm chấp nhận"
//   10–50 %  (e.g. 100–500 kcal)                          → low        orange  "không đạt"
//   < 10 %, no deficit at all or a surplus                → over       red     "quá lố" — unless the day is a cheat day
export type DeficitLevel = 'met' | 'ok' | 'low' | 'over' | 'cheat';

export const DEFICIT_LEVEL_COLOR: Record<DeficitLevel, string> = {
  met: quest.xp,
  ok: quest.gold,
  low: '#FF9F43',
  over: quest.hp,
  cheat: quest.manaText,
};

export const DEFICIT_LEVELS: DeficitLevel[] = ['met', 'ok', 'low', 'over', 'cheat'];

/** The level of a day's deficit against the target, or null when the day has no figure (nothing eaten logged) or no
 *  target is set. A day marked as a cheat day is never "over". */
export function deficitLevel(deficitKcal: number | null | undefined, targetKcal: number, cheatDay = false): DeficitLevel | null {
  if (deficitKcal == null || !Number.isFinite(deficitKcal) || !(targetKcal > 0)) return null;
  const ratio = deficitKcal / targetKcal;
  if (ratio >= 0.9) return 'met';
  if (ratio >= 0.5) return 'ok';
  if (ratio >= 0.1) return 'low';
  return cheatDay ? 'cheat' : 'over';
}

export function deficitColor(level: DeficitLevel | null, fallback: string = quest.textSecondary): string {
  return level ? DEFICIT_LEVEL_COLOR[level] : fallback;
}
