// Cheat day > "where to eat it": the request the app sends (the user's wish, the dishes and the area, a compact picture of their
// recent eating), the prompt and tool of suggest-cheat-places, and the cleaning of its answer (dishes that fit the wish + places). The answer is only kept where it can be traced to what the web search actually returned: a
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

/** A URL as it is matched against what the search saw: http and https alike, "www." or not (the model often writes a URL it saw
 *  with or without them). Empty when it is not a web URL. */
export function urlKey(raw: unknown): string {
  const n = normalizeUrl(raw);
  return n ? n.replace(/^https?:\/\/(www\.)?/, '') : '';
}

/** A Google Maps search for a place (its name and address), for the "map" link of a place whose own Maps page the search did not
 *  show: it is a search, not a claim about the place. */
export function mapsSearchUrl(name: string, address: string | null, near: string): string {
  const q = [name, address || near].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ----- the wish -----
// What the user feels like on their cheat day, in their own words ("thèm gì đó giòn giòn", "buồn, muốn ăn gì ấm bụng", "trời mưa"),
// plus what the app knows that helps read it: the local time, and a compact picture of the last two weeks of eating built on the
// device (food names and kcal only: no dates, photos, ids or other free text). Also used by suggest-dinner's cheat-day ideas.

export const WISH_MAX_CHARS = 200;
export const WISH_SLOTS = ['breakfast', 'lunch', 'afternoon', 'dinner', 'late'] as const;
export type WishSlot = (typeof WISH_SLOTS)[number];

export interface CheatWishContext {
  /** Local time "HH:MM", weekday (0 = Sunday) and the meal slot it falls in. */
  time: string;
  weekday: number;
  slot: WishSlot;
  /** What was eaten in the last 3 days, most recent first. */
  recent: string[];
  /** What the user eats most in the last 14 days, most frequent first. */
  favorites: string[];
  /** The biggest foods of the days that went over the calorie target in the last 14 days (cheat days left out). */
  overTarget: { name: string; kcal: number }[];
  /** Days of the last 14 with food logged, and how many of them went over the calorie target. */
  loggedDays: number;
  overDays: number;
}

/** The wish as it is sent and put in the prompt: one line, no tags, at most 200 characters (empty is allowed). */
export const cleanWish = (v: unknown): string => clean(v, WISH_MAX_CHARS);

const nameList = (v: unknown, max: number): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    const name = clean(raw, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === max) break;
  }
  return out;
};
const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);

/** The context as a clean object (bounded numbers, at most a few short names each), or null when it holds no usable time. */
export function cleanWishContext(raw: unknown): CheatWishContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const time = typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : null;
  const weekday = int(r.weekday, 0, 6);
  if (!time || weekday === null) return null;
  const overTarget: { name: string; kcal: number }[] = [];
  for (const o of Array.isArray(r.overTarget) ? r.overTarget : []) {
    const x = (o ?? {}) as Record<string, unknown>;
    const name = clean(x.name, 60);
    const kcal = int(x.kcal, 0, 5000);
    if (!name || kcal === null || overTarget.some((e) => e.name.toLowerCase() === name.toLowerCase())) continue;
    overTarget.push({ name, kcal });
    if (overTarget.length === 6) break;
  }
  const loggedDays = int(r.loggedDays, 0, 14) ?? 0;
  return {
    time,
    weekday,
    slot: WISH_SLOTS.includes(r.slot as WishSlot) ? (r.slot as WishSlot) : 'dinner',
    recent: nameList(r.recent, 12),
    favorites: nameList(r.favorites, 8),
    overTarget,
    loggedDays,
    overDays: Math.min(loggedDays, int(r.overDays, 0, 14) ?? 0),
  };
}

const WEEKDAY_WORDS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const SLOT_WORDS: Record<WishSlot, string> = { breakfast: 'bữa sáng', lunch: 'bữa trưa', afternoon: 'xế chiều / ăn vặt', dinner: 'bữa tối', late: 'ăn khuya' };

/** The part of a prompt that reads the wish: what the user said, the time, their recent eating, and how to read it all (generously,
 *  pampering them: it is a planned cheat day, no limits). Shared by suggest-cheat-places and suggest-dinner's cheat ideas. */
export function wishPrompt(wish: string, ctx: CheatWishContext | null | undefined): string {
  const parts: string[] = [];
  parts.push(
    wish
      ? `Mong muốn của người dùng (lời của họ, có thể là món, cảm giác, tâm trạng hay điều gì đó mơ hồ): "${wish}". Hãy đoán ý họ thật rộng lượng và tinh tế: cảm giác / tâm trạng / thời tiết họ nhắc tới hợp với kiểu món nào (giòn, ấm bụng, cay, ngọt, no nê, mát lạnh...).`
      : 'Người dùng không nói muốn gì: hãy tự đoán điều họ sẽ thích nhất lúc này từ thời gian và thói quen ăn uống bên dưới.'
  );
  if (ctx) {
    parts.push(`Bây giờ là ${ctx.time}, ${WEEKDAY_WORDS[ctx.weekday]} (giờ Việt Nam), đang là giờ ${SLOT_WORDS[ctx.slot]}. Không có thông tin thời tiết: đừng tự bịa thời tiết, chỉ dùng nếu người dùng nhắc.`);
    if (ctx.recent.length) parts.push(`Mấy ngày gần đây họ đã ăn: ${ctx.recent.join('; ')} (đừng gợi ý lặp lại, trừ khi mong muốn của họ nói rõ là muốn món đó).`);
    if (ctx.favorites.length) parts.push(`Món họ hay ăn (để hiểu khẩu vị): ${ctx.favorites.join('; ')}.`);
    if (ctx.loggedDays > 0) parts.push(`Trong ${ctx.loggedDays} ngày có ghi chép gần đây, ${ctx.overDays} ngày ăn vượt mục tiêu calo.`);
    if (ctx.overTarget.length)
      parts.push(`Những món đã làm họ vượt mục tiêu (họ thèm nhưng ngày thường phải kiêng — hôm nay là dịp được ăn): ${ctx.overTarget.map((o) => `${o.name} (~${o.kcal} kcal)`).join('; ')}.`);
  }
  parts.push(
    'Hôm nay là CHEAT DAY đã lên kế hoạch: không có giới hạn calo, purine, muối, đường, không cảnh báo sức khỏe hay bệnh gout. ' +
      'Hãy chiều người dùng hết mức, như chiều người yêu: giọng ấm áp, nuông chiều, gợi ý món thật đáng thưởng.'
  );
  return parts.join(' ');
}

export interface PlacesRequest {
  /** What to eat: one dish the user asked for (`typed`), up to 3 AI dish names, or none (the AI picks dishes from the wish). */
  dishes: string[];
  /** The area or address: typed by the user ("Quận 1, TP.HCM") or read from the device position ("123 Lê Lợi, Phường Bến Thành..."). */
  location: string;
  /** Device position (4 decimals, ~10 m) when the user chose "my location". */
  coords?: { lat: number; lon: number };
  /** Today in the user's time (YYYY-MM-DD), to judge how recent a review is. */
  today: string;
  /** The user typed exactly what they want ("lẩu bò", "trà sữa ít ngọt"): search for that, not for a dish name. */
  typed?: true;
  /** What the user feels like (see `cleanWish`); empty when they said nothing. */
  wish: string;
  context?: CheatWishContext;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The request as a clean object, or null when there is no place to search around. With no dish the AI picks them from the wish
 *  (or, with no wish either, from the time and the user's eating). */
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
  const typed = r.typed === true;
  if (typed) dishes.splice(1);
  const location = clean(r.location, 160);
  const c = r.coords as Record<string, unknown> | undefined;
  const lat = typeof c?.lat === 'number' && Number.isFinite(c.lat) && Math.abs(c.lat) <= 90 ? Math.round(c.lat * 10_000) / 10_000 : null;
  const lon = typeof c?.lon === 'number' && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180 ? Math.round(c.lon * 10_000) / 10_000 : null;
  const coords = lat !== null && lon !== null ? { lat, lon } : undefined;
  if (!location && !coords) return null;
  const today = typeof r.today === 'string' && DAY_RE.test(r.today) ? r.today : now.toISOString().slice(0, 10);
  const context = cleanWishContext(r.context);
  return {
    dishes,
    location,
    ...(coords ? { coords } : {}),
    today,
    ...(typed && dishes.length > 0 ? { typed: true as const } : {}),
    wish: cleanWish(r.wish),
    ...(context ? { context } : {}),
  };
}

/** Why a request was refused, for the 400 answer (the app shows it). */
export function placesRequestProblem(_raw: unknown): string {
  return 'Thiếu địa chỉ / khu vực hoặc vị trí để tìm quán gần đó.';
}

/** The user message of suggest-cheat-places. */
export function placesPrompt(req: PlacesRequest): string {
  const where = [
    req.location ? `địa chỉ / khu vực: ${req.location}` : '',
    req.coords ? `tọa độ chính xác: ${req.coords.lat}, ${req.coords.lon} (https://www.google.com/maps?q=${req.coords.lat},${req.coords.lon})` : '',
  ]
    .filter(Boolean)
    .join('; ');
  const want = req.typed
    ? `Người dùng muốn tìm đúng thứ này: "${req.dishes[0]}". Tìm quán bán đúng món / đồ uống đó (hiểu theo cách người Việt gọi, kể cả kiểu như "ít ngọt", "ốc" là các quán ốc), tối đa 5 quán; ghi dish = "${req.dishes[0]}".`
    : req.dishes.length > 0
      ? `Họ muốn ăn: ${req.dishes.join('; ')}. Tìm tối đa 2 quán mỗi món.`
      : 'Họ chưa chọn món: hãy tự chọn 3 món (ăn ngoài được) hợp nhất với mong muốn, rồi tìm tối đa 2 quán mỗi món.';
  return (
    `Hôm nay là ${req.today}. Người dùng đang ở Việt Nam, ${where}. ${want}\n` +
    `${wishPrompt(req.wish, req.context)}\n` +
    'PHẦN 1 — MÓN: trong dishes gợi ý 3 món (tối đa 4) hợp với mong muốn ' +
    (req.dishes.length > 0 ? `(gồm ${req.typed ? 'đúng món họ tìm' : 'các món họ muốn ăn ở trên'}, có thể thêm món gần giống)` : '(chính là các món bạn tìm quán)') +
    ': tên món tiếng Việt, why = một câu ấm áp vì sao món hợp ý họ lúc này, kcal = ước tính cho một phần (chỉ để tham khảo). ' +
    'Trong readWish viết MỘT câu ngắn: bạn hiểu mong muốn của họ thế nào (ví dụ "Bạn đang buồn và trời mưa, cần món nóng hổi, ấm bụng"). ' +
    'Có thể dùng 1 lần tìm kiếm web để xem món / đồ uống nào đang hot trend ở Việt Nam (hoặc ở khu vực của họ) gần đây, nếu hợp với mong muốn; các lần còn lại để tìm quán.\n' +
    'PHẦN 2 — QUÁN: ' +
    'hãy DÙNG CÔNG CỤ TÌM KIẾM WEB để tìm các quán thật GẦN NHẤT vị trí đó (cùng phường / quận trước, rồi mới xa dần; tìm kèm tên đường, phường, quận): tìm trang Google Maps của quán, ' +
    'trang Foody / ShopeeFood / GrabFood, bài review của báo, blog ẩm thực, reviewer và bài đăng mạng xã hội (Facebook, TikTok, Instagram).\n' +
    'QUY TẮC BẮT BUỘC: chỉ ghi điều bạn thấy trong kết quả tìm kiếm; KHÔNG bịa tên quán, địa chỉ, điểm, số lượt đánh giá hay lời review. ' +
    'Mỗi điểm đánh giá, mỗi review và mỗi nguồn phải kèm đúng URL của trang tìm thấy nó. Không thấy thì để null hoặc bỏ trống, và ghi món đó vào notFound. ' +
    'Review: chép ngắn (dưới 200 ký tự) lời của người đánh giá, ghi ngày đăng dạng YYYY-MM-DD hoặc YYYY-MM nếu trang có ngày (không có thì null), ưu tiên review mới nhất. ' +
    'Đánh giá độ tin cậy từng quán: high chỉ khi có từ 2 nguồn độc lập trở lên khớp nhau và có review trong 6 tháng gần đây; low khi chỉ có một nguồn, review cũ, ' +
    'bài có dấu hiệu quảng cáo / PR / được tài trợ, hoặc thông tin có thể đã cũ (quán có thể đã đóng / chuyển địa chỉ). Ghi lý do ngắn gọn. ' +
    'Ghi sponsored = true nếu bài viết có dấu hiệu quảng cáo hoặc hợp tác. Ghi openStatus nếu nguồn có giờ mở cửa / tình trạng hoạt động, không có thì null. ' +
    'Nếu thấy địa chỉ của quán thì ước tính distanceKm từ vị trí người dùng (đường chim bay, km), không thấy địa chỉ thì null. ' +
    'Nếu kết quả tìm kiếm có trang Google Maps của quán thì ghi mapsUrl đúng URL đó, không thì null. Xếp quán gần nhất lên trước. ' +
    'Ghi dish của mỗi quán đúng bằng tên một món trong dishes. Quy tắc trung thực trên áp dụng cho quán; phần món là gợi ý của bạn. ' +
    'Xong thì gọi tool report_cheat_places đúng một lần, LUÔN có cả readWish, dishes và places (không thấy quán thì places để trống).'
  );
}

export const PLACES_TOOL = {
  name: 'report_cheat_places',
  description:
    'Reports how the wish was read, the dishes that fit it, and places that sell them (places only with facts seen in the web search results, each with the URL it was seen on).',
  input_schema: {
    type: 'object',
    properties: {
      readWish: { type: 'string', description: 'One short Vietnamese sentence: how the wish was understood.' },
      dishes: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Vietnamese dish or drink name.' },
            why: { type: 'string', description: 'One warm Vietnamese sentence: why it fits the wish right now.' },
            kcal: { type: 'number', description: 'Rough kcal of one portion as eaten.' },
            emoji: { type: 'string' },
          },
          required: ['name', 'why', 'kcal'],
        },
      },
      places: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            dish: { type: 'string', description: 'Which of the requested dishes this place sells.' },
            name: { type: 'string', description: 'The place name exactly as on its listing.' },
            address: { type: ['string', 'null'] },
            distanceKm: { type: ['number', 'null'], description: 'Straight-line distance from the user, estimated from the address seen; null if no address.' },
            mapsUrl: { type: ['string', 'null'], description: 'URL of the Google Maps page of the place, only if it was in the search results.' },
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
    required: ['readWish', 'dishes', 'places', 'notFound'],
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
  /** Estimated by the model from the address it saw (km, straight line); null when unknown. */
  distanceKm: number | null;
  /** The place's Google Maps page, only when the search saw it. */
  mapsUrl: string | null;
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
/** A dish the AI suggests for the wish (not checked against the web: a suggestion, with a rough kcal for information). */
export interface CheatWishDish {
  name: string;
  why: string;
  /** One portion, rough; null when the AI gave none usable. */
  kcal: number | null;
  emoji: string | null;
}
export interface CheatPlacesAnswer {
  /** How the AI read the wish (one line); null when it said nothing. */
  readWish: string | null;
  /** Dishes that fit the wish, at most 4 (empty on answers stored before they existed). */
  dishes: CheatWishDish[];
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
  const seen = opts.seenUrls ? new Set(opts.seenUrls.map(urlKey).filter(Boolean)) : null;
  let dropped = 0;
  const verified = (u: unknown): string | null => {
    const n = normalizeUrl(u);
    if (!n) return null;
    if (seen && !seen.has(urlKey(n))) return null;
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
    if (names.has(key) || (perDish.get(dish.toLowerCase()) ?? 0) >= 5) continue;
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
      distanceKm: typeof p.distanceKm === 'number' && Number.isFinite(p.distanceKm) && p.distanceKm >= 0 && p.distanceKm <= 200 ? Math.round(p.distanceKm * 10) / 10 : null,
      mapsUrl: verified(p.mapsUrl),
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
  // Nearest first; a place without a distance keeps its order after the ones with one.
  places.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  const dishes: CheatWishDish[] = [];
  for (const entry of Array.isArray(o.dishes) ? o.dishes : []) {
    const d = (entry ?? {}) as Record<string, unknown>;
    const name = clean(d.name, 80);
    if (!name || dishes.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    const kcal = typeof d.kcal === 'number' && Number.isFinite(d.kcal) && d.kcal > 0 && d.kcal <= 5000 ? Math.round(d.kcal) : null;
    dishes.push({ name, why: clean(d.why, 200), kcal, emoji: clean(d.emoji, 8) || null });
    if (dishes.length === 4) break;
  }
  const found = new Set(places.map((p) => p.dish.toLowerCase()));
  const notFound = [...new Set((Array.isArray(o.notFound) ? o.notFound : []).map((x) => clean(x, 80)).filter((x) => x && !found.has(x.toLowerCase())))].slice(0, 3);
  return {
    readWish: clean(o.readWish, 200) || null,
    dishes,
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
