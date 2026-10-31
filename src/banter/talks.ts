import { cleanBanterAnswer, type BanterText } from '../../supabase/functions/_shared/banter';

/** An exchange written by the AI (or the offline dev sample) for one day, as kept on the device and in the cloud (user_data key
 *  `bossTalk`). Template exchanges are not kept: they are rebuilt from the day's numbers whenever they are shown. */
export interface BossTalk extends BanterText {
  date: string;
  source: 'ai' | 'sample';
  /** The day's deficit when it was written, to tell when the day changed since. */
  deficitKcal: number;
  madeAtISO: string;
}

export interface BossTalkData {
  /** Oldest first, one per day. */
  talks: BossTalk[];
  /** The last day whose exchange was asked of the AI on its own (one automatic try per day). */
  autoTried: string | null;
}

/** Days kept: about four months. */
export const TALK_KEEP = 120;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

function cleanTalk(raw: unknown): BossTalk | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const text = cleanBanterAnswer(t);
  if (!text || typeof t.date !== 'string' || !DATE_RE.test(t.date)) return null;
  const deficitKcal = typeof t.deficitKcal === 'number' && Number.isFinite(t.deficitKcal) ? Math.round(t.deficitKcal) : 0;
  const madeAtISO = typeof t.madeAtISO === 'string' && !Number.isNaN(Date.parse(t.madeAtISO)) ? t.madeAtISO : new Date(0).toISOString();
  return { date: t.date, ...text, source: t.source === 'sample' ? 'sample' : 'ai', deficitKcal, madeAtISO };
}

/** The saved exchanges reduced to valid ones: one per day (the latest written wins), oldest first, at most TALK_KEEP (the newest). */
export function cleanBossTalkData(raw: unknown): BossTalkData {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const byDate = new Map<string, BossTalk>();
  for (const t of (Array.isArray(o.talks) ? o.talks : []).map(cleanTalk)) {
    if (!t) continue;
    const seen = byDate.get(t.date);
    if (!seen || time(t.madeAtISO) > time(seen.madeAtISO)) byDate.set(t.date, t);
  }
  const talks = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-TALK_KEEP);
  const autoTried = typeof o.autoTried === 'string' && DATE_RE.test(o.autoTried) ? o.autoTried : null;
  return { talks, autoTried };
}

/** This device's exchanges joined with the cloud's: every day of either side, the one written last when both have it; the later
 *  automatic try. */
export function mergeBossTalk(local: BossTalkData, remote: BossTalkData): BossTalkData {
  const autoTried = [local.autoTried, remote.autoTried].filter((d): d is string => !!d).sort().pop() ?? null;
  return cleanBossTalkData({ talks: [...local.talks, ...remote.talks], autoTried });
}
