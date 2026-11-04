import { quest } from '../theme/quest';
import type { GameKey } from './strings';

// A boss's HP bar changes colour with the HP left (the user's ask, 1.0.3): full green, half yellow, nearly dead red.
//   > 75 %      full      green          (quest.xp)
//   50–75 %     high      yellow-green
//   25–50 %     mid       gold
//   10–25 %     low       orange
//   < 10 %      critical  red            (quest.hp)
// Stepped, not blended, so a level reads as one clear colour. Every boss bar (weekly boss, stage bosses) goes through here.
export type HpLevel = 'full' | 'high' | 'mid' | 'low' | 'critical';

export const HP_LEVEL_COLOR: Record<HpLevel, string> = {
  full: quest.xp,
  high: '#D4F04A',
  mid: quest.gold,
  low: '#FF9F43',
  critical: quest.hp,
};

/** The HP left as a share of the maximum, 0..1 (0 when there is no maximum). */
export function hpFraction(left: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(left)) return 0;
  return Math.max(0, Math.min(1, left / max));
}

export function hpLevel(fraction: number): HpLevel {
  if (fraction > 0.75) return 'full';
  if (fraction > 0.5) return 'high';
  if (fraction > 0.25) return 'mid';
  if (fraction >= 0.1) return 'low';
  return 'critical';
}

export function hpColour(fraction: number): string {
  return HP_LEVEL_COLOR[hpLevel(fraction)];
}

/** The level's words for screen readers ("máu thấp"). */
export function hpLevelKey(fraction: number): GameKey {
  return `boss.hpLevel.${hpLevel(fraction)}` as GameKey;
}
