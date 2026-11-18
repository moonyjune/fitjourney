import type { StateStorage } from 'zustand/middleware';
import { cleanCompactItem, pickScored, type CompactPoolItem, type PickContext } from '../../supabase/functions/_shared/temptPick';
import { appStorage } from '../lib/appStorage';
import { recordTemptShown, requestTemptPool } from '../sync/cloudSync';

// The temptation pool on the device (1.5): the shared pool (~500 tagged items with their photo URLs, compact) is downloaded from
// tempt-me {"action":"pool"} with an etag (nothing is sent again when it did not change), kept in appStorage (IndexedDB on the web,
// AsyncStorage on a phone) and refreshed at most every REFRESH_EVERY_MS when online. When the server cannot be reached, the Hard
// level picks from it here with the same scoring as the server (temptPick.ts pickScored), never one shown in the last 30 days (the
// showings come with the download and are added to here; each local one is also sent to tempt_shown when possible).

export const POOL_CACHE_KEY = 'tempt-pool-cache-v1';
export const REFRESH_EVERY_MS = 12 * 3_600_000;
const SHOWN_DAYS = 30;

export interface PoolCache {
  etag: string;
  /** When it was last checked against the server (ms). */
  savedAt: number;
  items: CompactPoolItem[];
  /** Pool id -> ISO time it was last shown to this player. */
  shown: Record<string, string>;
}

/** What tempt-me {"action":"pool"} answers. */
export interface PoolAnswer {
  pool: { etag: string; items?: unknown[]; notModified?: boolean };
  shown?: { id: string; at: string }[];
}
export type PoolFetch = (etag: string | null) => Promise<PoolAnswer | null>;

let memory: PoolCache | null = null;

/** The newer showing of each id, those older than 30 days dropped. */
export function mergeShown(a: Record<string, string>, b: Record<string, string>, now: Date = new Date()): Record<string, string> {
  const since = now.getTime() - SHOWN_DAYS * 86_400_000;
  const out: Record<string, string> = {};
  for (const src of [a, b]) {
    for (const [id, at] of Object.entries(src)) {
      const t = Date.parse(at);
      if (!Number.isFinite(t) || t <= since) continue;
      if (!out[id] || Date.parse(out[id]) < t) out[id] = at;
    }
  }
  return out;
}

/** A stored cache read back (anything broken is dropped); null when there is none. */
export function cleanPoolCache(raw: unknown): PoolCache | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.etag !== 'string' || !Array.isArray(r.items)) return null;
  const items = r.items.map(cleanCompactItem).filter((i): i is CompactPoolItem => !!i);
  const shown: Record<string, string> = {};
  if (r.shown && typeof r.shown === 'object') for (const [id, at] of Object.entries(r.shown as Record<string, unknown>)) if (typeof at === 'string') shown[id] = at;
  return { etag: r.etag, savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0, items, shown };
}

export async function readPoolCache(storage: StateStorage = appStorage): Promise<PoolCache | null> {
  if (memory) return memory;
  try {
    const text = await storage.getItem(POOL_CACHE_KEY);
    memory = text ? cleanPoolCache(JSON.parse(text)) : null;
  } catch {
    memory = null;
  }
  return memory;
}

async function writePoolCache(cache: PoolCache, storage: StateStorage): Promise<void> {
  memory = cache;
  try {
    await storage.setItem(POOL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // kept in memory for this session
  }
}

/** Forgets the copy in memory (tests, sign-out). */
export function forgetPoolCache(): void {
  memory = null;
}

/** The pool download from tempt-me, or null (offline, the dev account, an error). */
export const fetchPoolFromServer: PoolFetch = async (etag) => {
  try {
    return await requestTemptPool(etag);
  } catch {
    return null;
  }
};

/** Brings the copy up to date when it is older than REFRESH_EVERY_MS (or `force`): 'updated' (new items), 'same' (the etag did not
 *  change; the showings are merged), 'fresh' (checked lately), 'unavailable' (no answer: the old copy stays). */
export async function refreshPool(
  opts: { force?: boolean; now?: Date; fetchPool?: PoolFetch; storage?: StateStorage } = {}
): Promise<'updated' | 'same' | 'fresh' | 'unavailable'> {
  const now = opts.now ?? new Date();
  const storage = opts.storage ?? appStorage;
  const cache = await readPoolCache(storage);
  if (!opts.force && cache && now.getTime() - cache.savedAt < REFRESH_EVERY_MS) return 'fresh';
  const answer = await (opts.fetchPool ?? fetchPoolFromServer)(cache?.etag ?? null);
  if (!answer) return 'unavailable';
  const serverShown: Record<string, string> = {};
  for (const s of answer.shown ?? []) if (s && typeof s.id === 'string' && typeof s.at === 'string') serverShown[s.id] = s.at;
  const shown = mergeShown(cache?.shown ?? {}, serverShown, now);
  if (answer.pool.notModified && cache) {
    await writePoolCache({ ...cache, savedAt: now.getTime(), shown }, storage);
    return 'same';
  }
  const items = (answer.pool.items ?? []).map(cleanCompactItem).filter((i): i is CompactPoolItem => !!i);
  if (items.length === 0 && cache) return 'unavailable';
  await writePoolCache({ etag: answer.pool.etag, savedAt: now.getTime(), items, shown }, storage);
  return 'updated';
}

/** The pool item for now from the copy (the same scoring as the server), or null when there is no copy. */
export function pickFromCache(cache: PoolCache | null, ctx: PickContext, at: Date = new Date(), rand: () => number = Math.random): { item: CompactPoolItem; repeat: boolean } | null {
  if (!cache || cache.items.length === 0) return null;
  const rows = cache.items.map((item) => ({ id: item.id, item, createdAt: item.createdAt }));
  const pick = pickScored(rows, cache.shown, ctx, at, rand);
  return pick ? { item: pick.row.item, repeat: pick.repeat } : null;
}

/** Records a local showing in the copy and, when possible, in tempt_shown (so the server does not offer it again either). */
export async function markShownLocal(id: string, at: Date = new Date(), storage: StateStorage = appStorage): Promise<void> {
  const cache = await readPoolCache(storage);
  if (cache) await writePoolCache({ ...cache, shown: { ...cache.shown, [id]: at.toISOString() } }, storage);
  try {
    await recordTemptShown(id, at);
  } catch {
    // the local record is enough to avoid a repeat on this device
  }
}

/** The pool item as the tempt-me answer the app already reads (itemFromAi). */
export function answerOfCompact(item: CompactPoolItem, repeat: boolean): Record<string, unknown> {
  return {
    name: item.name,
    emoji: item.emoji,
    whyNow: item.whyNow,
    description: '',
    pitch: item.pitch,
    kcal: item.kcal,
    sugarG: item.sugarG,
    purineMg: item.purineMg,
    sourceUrl: null,
    sourceDomain: item.sourceDomain,
    imageUrl: item.imageUrl,
    ...(item.photo && item.imageUrl ? { photo: item.photo } : {}),
    web: 'pool',
    ...(repeat ? { repeat: true } : {}),
  };
}
