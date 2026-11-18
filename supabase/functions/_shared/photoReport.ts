// "Ảnh sai?" (1.5): a player reports that the photo shown with a dish is not that dish. The pure parts, shared by the function
// report-photo (Deno) and the app's tests; no imports, so the app's TypeScript can read it too.
//
// A report hides the photo for that player at once (on the device), and flags it on the server inside the jsonb that holds it,
// with no schema change: `photoFlag: { count, lastAt, url, by }` on the dish_photos row's `photo` (a cached dish photo) or on the
// tempt_pool row's `item` (a temptation challenge photo). A flagged dish photo is no longer served: dish-photo answers "none" for it
// and searches the web first for another one (the request that meets it, or the repair job), never taking the reported picture
// again (`bad`). tempt-me treats a pool item with `photoFlag` as needing a new photo.

/** Reports one player may send per day (the function counts them in ai_usage under PHOTO_REPORT_FEATURE, at no cost). */
export const REPORTS_PER_DAY = 20;
/** The ai_usage feature the reports are counted under (calls only, cost 0). */
export const PHOTO_REPORT_FEATURE = 'photoreport';
/** Reporters kept on a flag (each counted once). */
export const FLAG_REPORTERS_MAX = 20;
/** Pictures remembered as wrong for one dish. */
export const BAD_PICTURES_MAX = 10;

/** The flag a reported picture carries in its jsonb. */
export interface PhotoFlag {
  /** Players who reported it (each once). */
  count: number;
  /** When it was last reported (ISO). */
  lastAt: string;
  /** The picture reported (its URL as shown). */
  url: string;
  /** Short tags of the players who reported it, so one player counts once. */
  by: string[];
}

/** What the app sends: which photo, shown with which dish. `kind` 'dish': a dish photo (dish_photos, looked up by the dish name);
 *  'tempt': a temptation challenge picture (tempt_pool, by its pool id when the app has it, else by the dish name). */
export interface PhotoReportRequest {
  kind: 'dish' | 'tempt';
  name: string;
  url: string;
  poolId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The request cleaned: a known kind, a dish name (1-100 characters), an https picture URL; else null. */
export function cleanReportRequest(raw: unknown): PhotoReportRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === 'dish' || r.kind === 'tempt' ? r.kind : null;
  const name = typeof r.name === 'string' ? r.name.replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  const url = typeof r.url === 'string' ? r.url.trim() : '';
  if (!kind || !name || !/^https:\/\/[^\s]{4,1990}$/i.test(url)) return null;
  const poolId = typeof r.poolId === 'string' && UUID.test(r.poolId) ? r.poolId.toLowerCase() : undefined;
  return { kind, name, url, ...(poolId && kind === 'tempt' ? { poolId } : {}) };
}

/** A picture's identity (host and path in lower case, no query, no trailing slash): the same rule as photoMatch.ts pictureKey. */
export function reportPictureKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const m = /^https?:\/\/([^/?#\s]+)([^?#\s]*)/i.exec(raw.trim());
  return m ? `${m[1].toLowerCase()}${m[2].replace(/\/+$/, '')}` : '';
}

/** Whether two URLs are the same picture. */
export const samePicture = (a: unknown, b: unknown): boolean => {
  const x = reportPictureKey(a);
  return x !== '' && x === reportPictureKey(b);
};

/** A short tag for a player on a flag (not the whole id). */
export const reporterTag = (userId: string): string => String(userId).replace(/-/g, '').slice(0, 12);

/** A flag read back from a jsonb, or null when it has none (or a broken one). */
export function readPhotoFlag(holder: unknown): PhotoFlag | null {
  if (!holder || typeof holder !== 'object') return null;
  const f = (holder as Record<string, unknown>).photoFlag as Record<string, unknown> | undefined;
  if (!f || typeof f !== 'object') return null;
  const count = typeof f.count === 'number' && Number.isFinite(f.count) ? Math.max(1, Math.round(f.count)) : 1;
  const lastAt = typeof f.lastAt === 'string' ? f.lastAt : '';
  const url = typeof f.url === 'string' ? f.url : '';
  const by = Array.isArray(f.by) ? f.by.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40).slice(0, FLAG_REPORTERS_MAX) : [];
  return { count, lastAt, url, by };
}

/** Whether a jsonb holds a flagged picture. */
export const isPhotoFlagged = (holder: unknown): boolean => readPhotoFlag(holder) !== null;

/** `holder` (a dish photo or a pool item) with the report of `reporter` added to its flag: a new flag counts 1, a player already on
 *  it is not counted again (`counted` false; `lastAt` is still moved). */
export function withPhotoFlag(holder: Record<string, unknown>, url: string, reporter: string, now: Date = new Date()): { value: Record<string, unknown>; counted: boolean } {
  const old = readPhotoFlag(holder);
  const by = old?.by ?? [];
  const counted = !by.includes(reporter);
  const flag: PhotoFlag = {
    count: (old?.count ?? 0) + (counted ? 1 : 0),
    lastAt: now.toISOString(),
    url: old?.url || url,
    by: counted ? [...by, reporter].slice(-FLAG_REPORTERS_MAX) : by,
  };
  return { value: { ...holder, photoFlag: flag }, counted };
}

/** The picture a pool item shows (its own `imageUrl`, else its photo's URL), for matching a report. */
export function poolItemPicture(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  if (typeof r.imageUrl === 'string' && r.imageUrl) return r.imageUrl;
  const p = r.photo as Record<string, unknown> | undefined;
  return p && typeof p.url === 'string' ? p.url : null;
}

/** What a report does to a stored jsonb that should show `url`: flagged (`value`), or why not ('other': it shows another picture now,
 *  e.g. it was replaced already; 'none': it shows none). */
export function flagStored(
  holder: unknown,
  picture: string | null,
  url: string,
  reporter: string,
  now: Date = new Date()
): { ok: true; value: Record<string, unknown>; counted: boolean } | { ok: false; why: 'none' | 'other' } {
  if (!holder || typeof holder !== 'object' || !picture) return { ok: false, why: 'none' };
  if (!samePicture(picture, url)) return { ok: false, why: 'other' };
  return { ok: true, ...withPhotoFlag(holder as Record<string, unknown>, url, reporter, now) };
}

/** Picture keys remembered as wrong for a dish (the `bad` list of a dish_photos value), plus a flagged photo's own picture. */
export function badPictures(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const r = value as Record<string, unknown>;
  const list = Array.isArray(r.bad) ? r.bad.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 400) : [];
  const flag = readPhotoFlag(r);
  const flagged = flag ? [reportPictureKey(flag.url || r.url)] : [];
  return [...new Set([...list, ...flagged].filter(Boolean))].slice(-BAD_PICTURES_MAX);
}

/** Whether one more report is allowed today, given the reports already counted. */
export const reportAllowed = (usedToday: number, limit: number = REPORTS_PER_DAY): boolean => usedToday < limit;
