// Cheat day > "where to eat it": the request the app sends (the dishes and the area), the prompt and tool of suggest-cheat-places,
// and the cleaning of its answer. The answer is only kept where it can be traced to what the web search actually returned: a
// rating, a review or a source whose URL the search did not see is dropped (shown as "not found"), never trusted. The reliability
// the model gives is capped by what can be checked here (independent sources, how recent the newest review is, sponsored content).
// Pure (no Deno use): the Edge Function and the app (dev stand-in, re-check of the answer) both use it; unit-tested in jest.

/** A URL as it is compared: http(s) only, no fragment, host in lower case, no trailing slash. Empty when it is not a web URL.
 *  (The same rule as in webSearch.ts; kept as its own copy because the shared files import nothing from each other, which keeps
 *  them loadable by both Deno and the app.) */
export function normalizeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const m = /^(https?):\/\/([^/?#\s]+)([^#\s]*)/i.exec(raw.trim());
  if (!m) return '';
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3].replace(/\/+(\?|$)/, '$1')}`;
}

/** The host of a URL without "www." (empty when it is not a web URL). */
export function urlHost(raw: unknown): string {
  const m = /^https?:\/\/([^/?#:]+)/.exec(normalizeUrl(raw));
  return m ? m[1].replace(/^www\./, '') : '';
}

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export interface PlacesRequest {
  dishes: string[];
  /** The area typed by the user ("Quận 1, TP.HCM"). */
  location: string;
  /** Device position, rounded to ~100 m, when the user chose "use my location". */
  coords?: { lat: number; lon: number };
  /** Today in the user's time (YYYY-MM-DD), to judge how recent a review is. */
  today: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The request as a clean object, or null when there is no dish or no place to search around. */
export function cleanPlacesRequest(raw: unknown, now: Date = new Date()): PlacesRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const dishes: string[] = [];
  for (const d of Array.isArray(r.dishes) ? r.dishes : []) {
    const name = clean(d, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    dishes.push(name);
    if (dishes.length === 3) break;
  }
  const location = clean(r.location, 80);
  const c = r.coords as Record<string, unknown> | undefined;
  const lat = typeof c?.lat === 'number' && Number.isFinite(c.lat) && Math.abs(c.lat) <= 90 ? Math.round(c.lat * 1000) / 1000 : null;
  const lon = typeof c?.lon === 'number' && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180 ? Math.round(c.lon * 1000) / 1000 : null;
  const coords = lat !== null && lon !== null ? { lat, lon } : undefined;
  if (dishes.length === 0 || (!location && !coords)) return null;
  const today = typeof r.today === 'string' && DAY_RE.test(r.today) ? r.today : now.toISOString().slice(0, 10);
  return { dishes, location, ...(coords ? { coords } : {}), today };
}

/** The user message of suggest-cheat-places. */
export function placesPrompt(req: PlacesRequest): string {
  const where = [req.location, req.coords ? `gần tọa độ ${req.coords.lat}, ${req.coords.lon}` : ''].filter(Boolean).join(' — ');
  return (
    `Hôm nay là ${req.today}. Người dùng ở khu vực: ${where}. Họ muốn ăn (cheat day): ${req.dishes.join('; ')}.\n` +
    'Hãy DÙNG CÔNG CỤ TÌM KIẾM WEB để tìm các quán thật gần khu vực đó bán các món này (tối đa 2 quán mỗi món): tìm trang Google Maps của quán, ' +
    'trang Foody / ShopeeFood / GrabFood, bài review của báo, blog ẩm thực, reviewer và bài đăng mạng xã hội (Facebook, TikTok, Instagram).\n' +
    'QUY TẮC BẮT BUỘC: chỉ ghi điều bạn thấy trong kết quả tìm kiếm; KHÔNG bịa tên quán, địa chỉ, điểm, số lượt đánh giá hay lời review. ' +
    'Mỗi điểm đánh giá, mỗi review và mỗi nguồn phải kèm đúng URL của trang tìm thấy nó. Không thấy thì để null hoặc bỏ trống, và ghi món đó vào notFound. ' +
    'Review: chép ngắn (dưới 200 ký tự) lời của người đánh giá, ghi ngày đăng dạng YYYY-MM-DD hoặc YYYY-MM nếu trang có ngày (không có thì null), ưu tiên review mới nhất. ' +
    'Đánh giá độ tin cậy từng quán: high chỉ khi có từ 2 nguồn độc lập trở lên khớp nhau và có review trong 6 tháng gần đây; low khi chỉ có một nguồn, review cũ, ' +
    'bài có dấu hiệu quảng cáo / PR / được tài trợ, hoặc thông tin có thể đã cũ (quán có thể đã đóng / chuyển địa chỉ). Ghi lý do ngắn gọn. ' +
    'Ghi sponsored = true nếu bài viết có dấu hiệu quảng cáo hoặc hợp tác. Ghi openStatus nếu nguồn có giờ mở cửa / tình trạng hoạt động, không có thì null. ' +
    'Xong thì gọi tool report_cheat_places đúng một lần.'
  );
}

export const PLACES_TOOL = {
  name: 'report_cheat_places',
  description: 'Reports places that sell the dishes, only with facts seen in the web search results, each with the URL it was seen on.',
  input_schema: {
    type: 'object',
    properties: {
      places: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            dish: { type: 'string', description: 'Which of the requested dishes this place sells.' },
            name: { type: 'string', description: 'The place name exactly as on its listing.' },
            address: { type: ['string', 'null'] },
            priceRange: { type: ['string', 'null'], description: 'e.g. "40.000–70.000đ / người", as seen; null if not seen.' },
            rating: {
              type: ['object', 'null'],
              description: 'Null when no rating was seen.',
              properties: {
                value: { type: 'number', description: '0-5 (convert a /10 score to /5).' },
                count: { type: ['integer', 'null'], description: 'Number of reviews behind the rating, null if not shown.' },
                source: { type: 'string', description: 'e.g. "Google Maps", "Foody", "ShopeeFood".' },
                url: { type: 'string', description: 'URL of the page showing this rating.' },
              },
              required: ['value', 'source', 'url'],
            },
            reviews: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  date: { type: ['string', 'null'], description: 'YYYY-MM-DD or YYYY-MM; null if the page shows no date.' },
                  source: { type: 'string', description: 'e.g. "Google Maps", "Foody", "Facebook", a newspaper or blog name.' },
                  url: { type: 'string' },
                },
                required: ['text', 'source', 'url'],
              },
            },
            sources: {
              type: 'array',
              maxItems: 5,
              items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } }, required: ['url'] },
            },
            openStatus: { type: ['string', 'null'], description: 'Opening hours / still operating, as seen; null if unknown.' },
            sponsored: { type: 'boolean', description: 'True when an article about it looks like an ad / PR / sponsored post.' },
            reliability: { type: 'string', enum: ['high', 'medium', 'low'] },
            reliabilityReasons: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Short Vietnamese reasons.' },
          },
          required: ['dish', 'name', 'reviews', 'sources', 'reliability', 'reliabilityReasons'],
        },
      },
      notFound: { type: 'array', items: { type: 'string' }, description: 'Dishes for which no place could be found in the results.' },
      note: { type: ['string', 'null'], description: 'One short Vietnamese sentence, e.g. what could not be checked.' },
    },
    required: ['places', 'notFound'],
  },
};

// ----- the answer -----

export type Reliability = 'high' | 'medium' | 'low';
const LEVELS: Reliability[] = ['low', 'medium', 'high'];

export interface PlaceReview {
  text: string;
  /** YYYY-MM-DD or YYYY-MM; null when the page showed no date. */
  date: string | null;
  source: string;
  url: string;
}
export interface PlaceRating {
  value: number;
  count: number | null;
  source: string;
  url: string;
}
export interface CheatPlace {
  dish: string;
  name: string;
  address: string | null;
  priceRange: string | null;
  /** Null: no rating with a source the search saw ("không tìm thấy"). */
  rating: PlaceRating | null;
  /** Newest first, at most 3. */
  reviews: PlaceReview[];
  sources: { title: string; url: string }[];
  openStatus: string | null;
  sponsored: boolean;
  reliability: {
    level: Reliability;
    /** The model's own reasons (Vietnamese). */
    reasons: string[];
    /** Distinct sites behind what is shown. */
    sites: number;
    /** Date of the newest dated review, or null. */
    newestReview: string | null;
    /** The model rated it higher than the checks here allow. */
    capped: boolean;
  };
}
export interface CheatPlacesAnswer {
  places: CheatPlace[];
  notFound: string[];
  note: string | null;
  /** When the search was made (ISO): what "last verified" means for every place. */
  checkedAtISO: string;
  /** Searches the model ran. */
  searches: number;
  /** Things the model said that were dropped because no search result backed them (fake ratings, unknown URLs...). */
  dropped: number;
  /** Error codes of failed searches. */
  searchErrors: string[];
  /** Offline sample data (dev account), never real places. */
  sample?: true;
  /** Every URL the web search returned or cited (what the answer is checked against). */
  seenUrls?: string[];
}

/** A review date as YYYY-MM-DD or YYYY-MM, not in the future; null otherwise. */
export function cleanReviewDate(v: unknown, today: string): string | null {
  const s = clean(v, 10);
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return null;
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number(m[1]) < 2000) return null;
  return s.slice(0, 7) <= today.slice(0, 7) && (s.length === 7 || s <= today) ? s : null;
}

/** Days from a review date (a month counts from its first day) to today. */
export function daysSince(date: string, today: string): number {
  const d = Date.parse(date.length === 7 ? `${date}-01` : date);
  const t = Date.parse(today);
  return Math.max(0, Math.round((t - d) / 86_400_000));
}

/** The most the checks allow: high needs 2+ independent sites, a rating, a review from the last 180 days and nothing sponsored;
 *  medium needs a rating or a review from the last year; anything else is low. */
export function reliabilityCap(p: { sites: number; rating: boolean; newestReviewDays: number | null; sponsored: boolean }): Reliability {
  if (p.sites >= 2 && p.rating && p.newestReviewDays !== null && p.newestReviewDays <= 180 && !p.sponsored) return 'high';
  if (p.sites >= 1 && (p.rating || (p.newestReviewDays !== null && p.newestReviewDays <= 365))) return 'medium';
  return 'low';
}

/** The answer reduced to what the search backs. `seenUrls`: every URL the web search returned or cited (null = do not check,
 *  only for data that has no search behind it, and then nothing is trusted above "low"). */
export function cleanPlacesAnswer(
  raw: unknown,
  opts: { seenUrls: string[] | null; today: string; checkedAtISO: string; searches?: number; searchErrors?: string[]; sample?: boolean }
): CheatPlacesAnswer {
  const o = (raw ?? {}) as Record<string, unknown>;
  const seen = opts.seenUrls ? new Set(opts.seenUrls.map(normalizeUrl).filter(Boolean)) : null;
  let dropped = 0;
  const verified = (u: unknown): string | null => {
    const n = normalizeUrl(u);
    if (!n) return null;
    if (seen && !seen.has(n)) return null;
    return n;
  };
  const places: CheatPlace[] = [];
  const perDish = new Map<string, number>();
  const names = new Set<string>();
  for (const entry of Array.isArray(o.places) ? o.places : []) {
    const p = (entry ?? {}) as Record<string, unknown>;
    const name = clean(p.name, 100);
    const dish = clean(p.dish, 80);
    if (!name || !dish) {
      dropped++;
      continue;
    }
    // Rating: a number 0-5 with a source and a URL the search saw.
    let rating: PlaceRating | null = null;
    const r = p.rating as Record<string, unknown> | null | undefined;
    if (r && typeof r === 'object') {
      const value = typeof r.value === 'number' && Number.isFinite(r.value) && r.value >= 0 && r.value <= 5 ? Math.round(r.value * 10) / 10 : null;
      const url = verified(r.url);
      const source = clean(r.source, 40);
      const count = typeof r.count === 'number' && Number.isInteger(r.count) && r.count >= 0 && r.count < 10_000_000 ? r.count : null;
      if (value !== null && url && source) rating = { value, count, source, url };
      else dropped++;
    }
    const reviews: PlaceReview[] = [];
    for (const rv of Array.isArray(p.reviews) ? p.reviews : []) {
      const x = (rv ?? {}) as Record<string, unknown>;
      const text = clean(x.text, 300);
      const url = verified(x.url);
      const source = clean(x.source, 40);
      if (!text || !url || !source) {
        dropped++;
        continue;
      }
      reviews.push({ text, date: cleanReviewDate(x.date, opts.today), source, url });
    }
    reviews.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const sources: { title: string; url: string }[] = [];
    const urls = new Set<string>();
    for (const s of Array.isArray(p.sources) ? p.sources : []) {
      const x = (s ?? {}) as Record<string, unknown>;
      const url = verified(x.url);
      if (!url) {
        dropped++;
        continue;
      }
      if (urls.has(url)) continue;
      urls.add(url);
      sources.push({ title: clean(x.title, 120) || urlHost(url), url });
      if (sources.length === 5) break;
    }
    const allUrls = [...sources.map((s) => s.url), ...reviews.map((x) => x.url), ...(rating ? [rating.url] : [])];
    // A place nothing the search found backs is not shown at all.
    if (allUrls.length === 0) {
      dropped++;
      continue;
    }
    const key = `${dish.toLowerCase()}|${name.toLowerCase()}`;
    if (names.has(key) || (perDish.get(dish.toLowerCase()) ?? 0) >= 3) continue;
    names.add(key);
    perDish.set(dish.toLowerCase(), (perDish.get(dish.toLowerCase()) ?? 0) + 1);
    const sites = new Set(allUrls.map(urlHost).filter(Boolean)).size;
    const newestReview = reviews.find((x) => x.date)?.date ?? null;
    const sponsored = p.sponsored === true;
    // The model's call (a string), or the call of an answer cleaned before (an object), so cleaning twice changes nothing.
    const before = (p.reliability && typeof p.reliability === 'object' ? p.reliability : {}) as Record<string, unknown>;
    const claimedRaw = typeof p.reliability === 'string' ? p.reliability : before.capped === true ? 'high' : before.level;
    const claimed: Reliability = LEVELS.includes(claimedRaw as Reliability) ? (claimedRaw as Reliability) : 'low';
    let cap = reliabilityCap({ sites, rating: !!rating, newestReviewDays: newestReview ? daysSince(newestReview, opts.today) : null, sponsored });
    if (!seen) cap = 'low';
    const level = LEVELS[Math.min(LEVELS.indexOf(claimed), LEVELS.indexOf(cap))];
    places.push({
      dish,
      name,
      address: clean(p.address, 160) || null,
      priceRange: clean(p.priceRange, 60) || null,
      rating,
      reviews: reviews.slice(0, 3),
      sources,
      openStatus: clean(p.openStatus, 100) || null,
      sponsored,
      reliability: {
        level,
        reasons: (Array.isArray(p.reliabilityReasons) ? p.reliabilityReasons : Array.isArray(before.reasons) ? before.reasons : []).map((x) => clean(x, 140)).filter(Boolean).slice(0, 3),
        sites,
        newestReview,
        capped: level !== claimed,
      },
    });
    if (places.length === 6) break;
  }
  const found = new Set(places.map((p) => p.dish.toLowerCase()));
  const notFound = [...new Set((Array.isArray(o.notFound) ? o.notFound : []).map((x) => clean(x, 80)).filter((x) => x && !found.has(x.toLowerCase())))].slice(0, 3);
  return {
    places,
    notFound,
    note: clean(o.note, 200) || null,
    checkedAtISO: opts.checkedAtISO,
    searches: Math.max(0, Math.round(opts.searches ?? 0)),
    dropped,
    searchErrors: (opts.searchErrors ?? []).map((e) => clean(e, 40)).filter(Boolean).slice(0, 5),
    ...(opts.sample ? { sample: true as const } : {}),
    ...(opts.seenUrls ? { seenUrls: [...new Set(opts.seenUrls.map(normalizeUrl).filter(Boolean))].slice(0, 200) } : {}),
  };
}
