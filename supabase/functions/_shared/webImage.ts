// A real photo of a place (and, through it, of a dish) from the web pages its search found: the page's own preview picture
// (`og:image` / `twitter:image`, what a chat app shows when the link is shared). The page is fetched on the server with a timeout and
// a size cap, http(s) only and never a private / local address; the picture must answer as an image. Nothing here asks the model,
// so it costs no tokens. Pure (no Deno use, no imports: the app uses the photo type and the URL checks too); the fetching takes a
// `fetch` passed in, so it is unit-tested in jest without the network.

/** A photo found on the web, as stored with a place / dish and shown in the app: the picture, the page it came from (opened by the
 *  credit line "Ảnh: <host>"), and the credit text (the host; or author · licence · library for a dish-photo answer). */
export interface WebPhoto {
  url: string;
  pageUrl: string;
  credit: string;
}

/** Pages read per place, pages read in all, bytes read of a page, and how long a page / picture check may take. */
export const PAGES_PER_PLACE = 2;
export const MAX_PAGES = 8;
export const PAGE_MAX_BYTES = 400_000;
export const PAGE_TIMEOUT_MS = 4000;
export const PHOTOS_BUDGET_MS = 9000;

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Whether an IPv4 address is private, local, link-local, shared (CGNAT) or otherwise not on the public internet. */
function privateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** A URL the server may fetch: http(s), a public host name (no IP literal of a private network, no IPv6 literal, no "localhost" or
 *  single-label / .local / .internal name), no user:password, the default port. The URL as a string, else null. */
export function publicHttpUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let u: URL;
  try {
    u = base ? new URL(raw.trim(), base) : new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || (u.port && u.port !== '80' && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  if (!host || host.startsWith('[') || host.includes(':') || !host.includes('.')) return null;
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || privateIpv4(host)) return null;
  u.hash = '';
  return u.toString();
}

/** A picture URL the app may show: https only (a page served over https cannot show an http picture) and public. */
export function showableImageUrl(raw: unknown, base?: string): string | null {
  const u = publicHttpUrl(raw, base);
  return u && u.startsWith('https://') ? u : null;
}

/** The host of a URL without "www." (empty when it is not a web URL). */
export function photoHost(raw: unknown): string {
  try {
    return typeof raw === 'string' ? new URL(raw).hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/');

/** The value of one attribute in a tag's text (quoted or not), or null. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** Meta names, in the order they are trusted. */
const META_KEYS = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
/** File types that are never a photo (an icon, a vector logo). */
const NOT_PHOTO = /\.(svg|ico|gif)(\?|$)/i;
/** Picture names that are the site's logo or a placeholder, not the place. */
const LOGO_WORDS = /(^|[/_.-])(logo|favicon|icon|sprite|placeholder|default[-_]?(image|thumb|share)|no[-_]?image|blank)([/_.-]|$)/i;

/** The page's preview picture: the first `og:image` (secure URL first), `twitter:image` or `<link rel="image_src">` in the <head>
 *  part, made absolute against the page URL, https and public, not an svg / icon / gif or a logo. Null when there is none. */
export function extractOgImage(html: string, pageUrl: string): string | null {
  if (typeof html !== 'string' || !html) return null;
  const head = html.slice(0, PAGE_MAX_BYTES);
  const found = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop') ?? '').trim().toLowerCase();
    const content = attr(tag, 'content');
    if (!key || content === null || found.has(key)) continue;
    found.set(key, decodeEntities(content.trim()));
  }
  const candidates = META_KEYS.map((k) => found.get(k)).filter((v): v is string => !!v);
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) if ((attr(m[0], 'rel') ?? '').toLowerCase() === 'image_src') candidates.push(decodeEntities(attr(m[0], 'href') ?? ''));
  for (const c of candidates) {
    if (!c || /^data:/i.test(c)) continue;
    const url = showableImageUrl(c, pageUrl);
    if (!url || NOT_PHOTO.test(url) || LOGO_WORDS.test(new URL(url).pathname)) continue;
    return url;
  }
  return null;
}

/** An image answer's type is a photo the app can show (jpeg, png, webp, avif). */
export function isPhotoContentType(v: unknown): boolean {
  const t = typeof v === 'string' ? v.toLowerCase().split(';')[0].trim() : '';
  return t === 'image/jpeg' || t === 'image/jpg' || t === 'image/png' || t === 'image/webp' || t === 'image/avif';
}

/** Hosts whose pages carry no picture of the place (a map tile, the site's logo) or need a login: not read. */
const NO_PHOTO_HOSTS = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|maps\.app\.goo\.gl|facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)$/i;

/** The pages to read for a place's photo: its sources, then its reviews and rating page, each once, http(s) and public, hosts that
 *  have no useful picture left out; at most PAGES_PER_PLACE. */
export function photoPagesFor(place: { sources?: { url: string }[]; reviews?: { url: string }[]; rating?: { url: string } | null }): string[] {
  const out: string[] = [];
  for (const raw of [...(place.sources ?? []).map((s) => s.url), ...(place.reviews ?? []).map((r) => r.url), place.rating?.url]) {
    const url = publicHttpUrl(raw);
    if (!url || NO_PHOTO_HOSTS.test(new URL(url).hostname) || out.includes(url)) continue;
    out.push(url);
    if (out.length === PAGES_PER_PLACE) break;
  }
  return out;
}

/** A stored / received photo as the app may show it: an https public picture, a public page, a short credit (the page's host when
 *  none). Null otherwise. */
export function cleanWebPhoto(raw: unknown): WebPhoto | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = showableImageUrl(r.url);
  const pageUrl = publicHttpUrl(r.pageUrl);
  if (!url || !pageUrl) return null;
  return { url, pageUrl, credit: clean(r.credit, 80) || photoHost(pageUrl) };
}

/** The part of `fetch` the page reads need (tested with a stand-in). */
export type PageFetch = (
  url: string,
  init: { method?: string; headers: Record<string, string>; redirect?: 'follow' | 'manual'; signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  url?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  body?: { getReader?(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> }; cancel?(): Promise<void> } | null;
}>;

/** At most `max` bytes of a response as text: read piece by piece and stopped there (the <head> with its meta tags comes first). */
async function readCapped(response: Awaited<ReturnType<PageFetch>>, max: number): Promise<string> {
  const reader = response.body?.getReader?.();
  if (!reader) return (await response.text()).slice(0, max);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    parts.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const all = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const p of parts) {
    const take = p.subarray(0, all.length - at);
    all.set(take, at);
    at += take.length;
    if (at >= all.length) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

const BROWSER_UA = 'Mozilla/5.0 (compatible; FitQuestBot/1.0; +https://fitjourney-vn.vercel.app)';
const MAX_REDIRECTS = 3;

/** A GET that follows redirects itself (at most MAX_REDIRECTS), checking every address is public before asking it, so a public page
 *  cannot send the server to a private one. The final response and its address, or null. */
async function fetchPublic(url: string, fetchImpl: PageFetch, accept: string, timeoutMs: number): Promise<{ response: Awaited<ReturnType<PageFetch>>; url: string } | null> {
  let at = publicHttpUrl(url);
  for (let hop = 0; at && hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(at, { headers: { 'user-agent': BROWSER_UA, accept, 'accept-language': 'vi,en;q=0.8' }, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!location) return { response, url: at };
    await response.body?.cancel?.().catch(() => undefined);
    at = publicHttpUrl(location, at);
  }
  return null;
}

/** One page's preview picture, checked: the page answers HTML (redirects followed, every address on the way must be public), its
 *  og:image is read, and the picture itself answers 2xx with a photo type. Null on anything else, never throws. */
export async function pagePhoto(pageUrl: string, fetchImpl: PageFetch, timeoutMs = PAGE_TIMEOUT_MS): Promise<WebPhoto | null> {
  if (!publicHttpUrl(pageUrl)) return null;
  try {
    const got = await fetchPublic(pageUrl, fetchImpl, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', timeoutMs);
    if (!got) return null;
    const { response: page, url: finalUrl } = got;
    const type = (page.headers.get('content-type') ?? '').toLowerCase();
    if (!page.ok || !/text\/html|application\/xhtml/.test(type)) {
      await page.body?.cancel?.().catch(() => undefined);
      return null;
    }
    const image = extractOgImage(await readCapped(page, PAGE_MAX_BYTES), finalUrl);
    if (!image) return null;
    const checked = await fetchPublic(image, fetchImpl, 'image/webp,image/jpeg,image/png,*/*;q=0.8', timeoutMs);
    if (!checked) return null;
    const check = checked.response;
    await check.body?.cancel?.().catch(() => undefined);
    if (!check.ok || !isPhotoContentType(check.headers.get('content-type'))) return null;
    const size = Number(check.headers.get('content-length'));
    if (Number.isFinite(size) && size > 8_000_000) return null;
    return { url: image, pageUrl: finalUrl, credit: photoHost(finalUrl) };
  } catch {
    return null;
  }
}

/** A photo for each place, from the pages its search found (`photoPagesFor`): every page read at once (each page once, at most
 *  MAX_PAGES), the first page of a place that has a picture wins, and a picture already given to another place is not given again
 *  (a site's shared banner). Bounded by PHOTOS_BUDGET_MS: what is not done by then is null. Same order as `places`. */
export async function findPlacePhotos(
  places: { sources?: { url: string }[]; reviews?: { url: string }[]; rating?: { url: string } | null }[],
  fetchImpl: PageFetch,
  budgetMs = PHOTOS_BUDGET_MS,
  maxPages = MAX_PAGES
): Promise<(WebPhoto | null)[]> {
  const pagesOf = places.map(photoPagesFor);
  const unique = [...new Set(pagesOf.flat())].slice(0, maxPages);
  const results = new Map<string, WebPhoto | null>();
  const work = Promise.all(unique.map(async (u) => results.set(u, await pagePhoto(u, fetchImpl, Math.min(PAGE_TIMEOUT_MS, budgetMs)))));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise((resolve) => (timer = setTimeout(resolve, budgetMs)))]);
  clearTimeout(timer);
  const used = new Set<string>();
  return pagesOf.map((pages) => {
    for (const p of pages) {
      const photo = results.get(p);
      if (photo && !used.has(photo.url)) {
        used.add(photo.url);
        return photo;
      }
    }
    return null;
  });
}
