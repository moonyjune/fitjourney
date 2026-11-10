import { TEMPTATION_RESIST_XP } from '../game/constants';
import { DEFAULT_TEMPT_SETTINGS, MAX_PER_DAY, type TemptFrequency, type TemptLevel, type TemptSettings } from './schedule';

// The record of the temptation challenge: how often the player resisted or gave in, the resist streak, and a short history. It is
// what is saved to the cloud (`user_data` key `temptation`) with the settings. Pure: unit-tested.

export type TemptOutcome = 'resisted' | 'gaveIn';

export interface TemptStats {
  resisted: number;
  gaveIn: number;
  /** Resisted in a row (giving in sets it back to 0). */
  streak: number;
  bestStreak: number;
  /** XP won on top of TEMPTATION_RESIST_XP in chats with the AI boss ("AI tương tác"): holding out turn after turn, making it give up. */
  bonusXp?: number;
}

export interface TemptHistoryEntry {
  /** ISO time it was answered. */
  at: string;
  name: string;
  emoji: string;
  kcal: number;
  outcome: TemptOutcome;
  level: TemptLevel;
}

export const NO_TEMPT_STATS: TemptStats = { resisted: 0, gaveIn: 0, streak: 0, bestStreak: 0 };
export const HISTORY_KEEP = 30;

/** XP per boss turn held out in a chat with the AI boss, at most CHAT_TURN_XP_MAX in all, and for making it give up. */
export const CHAT_TURN_XP = 5;
export const CHAT_TURN_XP_MAX = 20;
export const CHAT_WIN_XP = 15;

/** Bonus XP of a chat with the AI boss that the player won: `turns` boss turns held out, `conceded` when the boss gave up. */
export function chatBonusXp(turns: number, conceded: boolean): number {
  return Math.min(CHAT_TURN_XP_MAX, Math.max(0, turns) * CHAT_TURN_XP) + (conceded ? CHAT_WIN_XP : 0);
}

/** The record after one answer. Resisting adds to the streak (and any chat bonus); giving in only breaks it (no other penalty). */
export function applyOutcome(stats: TemptStats, outcome: TemptOutcome, bonusXp = 0): TemptStats {
  if (outcome === 'resisted') {
    const streak = stats.streak + 1;
    const bonus = (stats.bonusXp ?? 0) + Math.max(0, Math.round(bonusXp));
    return { ...stats, resisted: stats.resisted + 1, streak, bestStreak: Math.max(stats.bestStreak, streak), ...(bonus > 0 ? { bonusXp: bonus } : {}) };
  }
  return { ...stats, gaveIn: stats.gaveIn + 1, streak: 0 };
}

/** XP the challenge has earned: a modest bonus per temptation resisted (at most 5 a day by the schedule). */
export function temptationXp(stats: TemptStats): number {
  return Math.max(0, stats.resisted) * TEMPTATION_RESIST_XP + Math.max(0, stats.bonusXp ?? 0);
}

/** What is saved to the cloud. */
export interface TemptationData {
  settings: TemptSettings;
  stats: TemptStats;
  history: TemptHistoryEntry[];
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(1_000_000, Math.round(v)) : 0);
const hour = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback);

export function cleanTemptSettings(raw: unknown): TemptSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TEMPT_SETTINGS;
  return {
    enabled: r.enabled === true,
    level: r.level === 'hard' ? 'hard' : 'easy',
    frequency: (Object.keys(MAX_PER_DAY) as TemptFrequency[]).includes(r.frequency as TemptFrequency) ? (r.frequency as TemptFrequency) : d.frequency,
    quietStartHour: hour(r.quietStartHour, d.quietStartHour),
    quietEndHour: hour(r.quietEndHour, d.quietEndHour),
    city: typeof r.city === 'string' ? r.city.replace(/[<>\n\r]/g, ' ').trim().slice(0, 40) : '',
    aiChat: r.aiChat === true,
  };
}

export function cleanTemptStats(raw: unknown): TemptStats {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const stats: TemptStats = { resisted: count(r.resisted), gaveIn: count(r.gaveIn), streak: count(r.streak), bestStreak: count(r.bestStreak) };
  const bonus = count(r.bonusXp);
  if (bonus > 0) stats.bonusXp = bonus;
  stats.streak = Math.min(stats.streak, stats.resisted);
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  return stats;
}

/** Newest first, no two entries at the same time, at most HISTORY_KEEP. */
export function cleanTemptHistory(raw: unknown): TemptHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TemptHistoryEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at)) || seen.has(r.at)) continue;
    if (r.outcome !== 'resisted' && r.outcome !== 'gaveIn') continue;
    seen.add(r.at);
    out.push({
      at: r.at,
      name: typeof r.name === 'string' ? r.name.slice(0, 80) : '',
      emoji: typeof r.emoji === 'string' ? r.emoji.slice(0, 8) : '😋',
      kcal: count(r.kcal),
      outcome: r.outcome,
      level: r.level === 'hard' ? 'hard' : 'easy',
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, HISTORY_KEEP);
}

export function cleanTemptationData(raw: unknown): TemptationData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { settings: cleanTemptSettings(r.settings), stats: cleanTemptStats(r.stats), history: cleanTemptHistory(r.history) };
}

const answered = (s: TemptStats) => s.resisted + s.gaveIn;

/** Device and cloud copies joined: the record with more answers wins (answers only ever add up), the histories are merged, and the
 *  settings are the device's once they were changed from the defaults, else the cloud's. */
export function mergeTemptation(local: TemptationData, remote: TemptationData): TemptationData {
  const localDefault = JSON.stringify(local.settings) === JSON.stringify(DEFAULT_TEMPT_SETTINGS);
  return {
    settings: localDefault ? remote.settings : local.settings,
    stats: answered(remote.stats) > answered(local.stats) ? remote.stats : local.stats,
    history: cleanTemptHistory([...local.history, ...remote.history]),
  };
}
