/** XP needed to go from `level` to `level + 1`: 150 × n^1.5, rounded to the nearest 10. */
export function xpToNextLevel(level: number): number {
  return Math.round((150 * Math.pow(level, 1.5)) / 10) * 10;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level needs in total. */
  xpForNext: number;
  /** 0..1 */
  ratio: number;
}

/** Converts lifetime XP into a level and progress toward the next one. */
export function levelProgress(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  const xpForNext = xpToNextLevel(level);
  return { level, xpIntoLevel: remaining, xpForNext, ratio: xpForNext > 0 ? remaining / xpForNext : 0 };
}

export type TitleKey = 'recruit' | 'ifWarrior' | 'bossHunter' | 'disciplineKnight' | 'legend';

export function titleKeyForLevel(level: number): TitleKey {
  if (level >= 20) return 'legend';
  if (level >= 15) return 'disciplineKnight';
  if (level >= 10) return 'bossHunter';
  if (level >= 5) return 'ifWarrior';
  return 'recruit';
}
