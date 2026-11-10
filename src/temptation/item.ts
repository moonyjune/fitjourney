import { cleanPlacePhoto, type PlacePhoto } from '../../supabase/functions/_shared/places';
import { OPENERS, TEMPT_CATALOG, isWeekendMood, slotOfHour, type BossKind, type CatalogItem } from './catalog';

/** One temptation as the pop-up shows it, whichever level made it. */
export interface TemptItem {
  /** Catalog id, or `ai:<name>` for an AI item. */
  id: string;
  name: string;
  emoji: string;
  color: string;
  kcal: number;
  sugarG: number;
  purineMg: number;
  /** The chat lines the boss says (1-3 bubbles). */
  lines: string[];
  boss: BossKind;
  whyNow?: string;
  description?: string;
  imageUrl?: string;
  sourceDomain?: string;
  /** The credit of `imageUrl` when the server found it (a pool item's real photo, 0.26.2): "Ảnh: <credit>", opening its page. */
  photo?: PlacePhoto;
  /** Where it came from: the bundled list, the AI, or the dev account's sample. */
  source: 'easy' | 'ai' | 'sample';
  /** Picked by the AI boss of "AI tương tác" (its pool id): the player can chat with the boss after saying no. */
  chat?: { poolId: string };
  /** AI answered without web search (the key may not use it), or Hard fell back to Easy (AI unavailable). */
  note?: 'noWeb' | 'fallback';
}

type Rand = () => number;
const pickOne = <T,>(list: T[], rand: Rand): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/** Items that fit the hour: those of its slot; on a weekend evening the weekend items count twice (beer o'clock). Ids in `avoid`
 *  (shown lately) are left out while anything else fits. */
export function candidatesFor(now: Date, avoid: string[] = []): CatalogItem[] {
  const slot = slotOfHour(now.getHours());
  const weekend = isWeekendMood(now);
  let list = TEMPT_CATALOG.filter((i) => i.slots.includes(slot));
  // Weekend items still fit their slot on other days, only less often: they are doubled on the weekend.
  if (weekend) list = [...list, ...list.filter((i) => i.weekend)];
  const fresh = list.filter((i) => !avoid.includes(i.id));
  return fresh.length > 0 ? fresh : list.length > 0 ? list : TEMPT_CATALOG;
}

/** The Easy level's pick for `now`: a fitting bundled item, with a time-of-day (or weekend) lead-in and one of its pitches. */
export function pickEasy(now: Date, language: 'vi' | 'en', avoid: string[] = [], rand: Rand = Math.random): TemptItem {
  const chosen = pickOne(candidatesFor(now, avoid), rand);
  const openers = OPENERS[isWeekendMood(now) && rand() < 0.5 ? 'weekend' : slotOfHour(now.getHours())][language];
  return {
    id: chosen.id,
    name: language === 'vi' ? chosen.vi : chosen.en,
    emoji: chosen.emoji,
    color: chosen.color,
    kcal: chosen.kcal,
    sugarG: chosen.sugarG,
    purineMg: chosen.purineMg,
    lines: [pickOne(openers, rand), pickOne(language === 'vi' ? chosen.pitchVi : chosen.pitchEn, rand)],
    boss: chosen.boss,
    source: 'easy',
  };
}

const KEYWORDS: [RegExp, BossKind][] = [
  [/bia|beer|rượu|ruou|vang|wine|soju|cocktail|nhậu|ốc|nướng|bbq/i, 'beer'],
  [/trà|tra |tea|cà phê|ca phe|coffee|latte|matcha|sữa tươi|nước|juice|soda/i, 'tea'],
  [/mì|mi |phở|pho|bún|bun|ramen|noodle|lẩu|hotpot|cháo|hủ tiếu/i, 'noodle'],
  [/bánh|kem|chè|ice cream|cake|sô-cô-la|socola|chocolate|donut|ngọt|dessert|flan|pudding|kẹo/i, 'sweet'],
];

/** Which boss fits a name the AI gave (sweet, tea, beer, noodle; fried food otherwise). */
export function bossForName(name: string): BossKind {
  return KEYWORDS.find(([re]) => re.test(name))?.[1] ?? 'fried';
}

const BOSS_COLOR: Record<BossKind, string> = { sweet: '#F4A3C0', tea: '#8B5A3C', beer: '#F2B705', noodle: '#C0392B', fried: '#E3872D' };

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const figure = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : 0);

/** An https URL, or undefined. */
function httpsUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^https:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(v.trim())) return undefined;
  return v.trim();
}

/** The `tempt-me` answer as an item, or null when it has no name. The server already dropped URLs it did not see; here only the
 *  shape is checked again (https, bounded numbers, short texts). */
export function itemFromAi(raw: unknown, source: 'ai' | 'sample' = 'ai', chat = false): TemptItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 80);
  if (!name) return null;
  const boss = bossForName(name);
  const pitch = text(r.pitch, 400);
  // The AI boss's own lines (tempt-chat) instead of the pool's why-now and pitch.
  const ownLines = Array.isArray(r.lines) ? r.lines.map((l) => text(l, 220)).filter(Boolean).slice(0, 3) : [];
  const whyNow = text(r.whyNow, 200);
  const description = text(r.description, 300);
  const imageUrl = httpsUrl(r.imageUrl);
  const domain = text(r.sourceDomain, 80);
  const photo = imageUrl ? cleanPlacePhoto(r.photo) : null;
  return {
    id: `ai:${name.toLowerCase()}`,
    name,
    emoji: text(r.emoji, 8) || '😋',
    color: BOSS_COLOR[boss],
    kcal: figure(r.kcal, 5000),
    sugarG: figure(r.sugarG, 500),
    purineMg: figure(r.purineMg, 5000),
    lines: ownLines.length > 0 ? ownLines : [whyNow, pitch].filter(Boolean),
    boss,
    ...(whyNow ? { whyNow } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(photo ? { photo } : {}),
    ...(domain && /^[a-z0-9.-]+$/i.test(domain) ? { sourceDomain: domain } : {}),
    source,
    ...(r.web === 'unavailable' ? { note: 'noWeb' as const } : {}),
    ...(chat ? { chat: { poolId: text(r.poolId, 64) } } : {}),
  };
}
