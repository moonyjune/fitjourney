// What the temptation boss learns from its own history with one player (1.7): every temptation shown is recorded (table
// tempt_interactions: the item, the moment, the context, the player's answer, the chat with their tease-back lines), and the last ones
// are turned here into a compact "what works on this player" summary: the categories, kinds, time slots and weather where they gave in
// or held out, the angles of the boss that worked, the lines they mocked it with, how often they tease back, and the items shown lately
// (not to repeat). It feeds (a) a bounded score adjustment per category into temptPick (`catBoost`: more where they give in, less where
// they always resist, with a floor so variety stays) and (b) a few prompt lines for the Sonnet 5.5 pick and chat replies. Only this
// player's own rows are ever read. Pure (no Deno, no imports): shared by the Edge Functions and the app (offline pick), unit-tested.

export const INTERACTION_RETENTION_DAYS = 180;
/** Interactions read for the summary (newest first). */
export const LEARN_WINDOW = 60;
/** A chat keeps at most this many player lines, each this long. */
export const MAX_USER_TURNS = 3;
export const TURN_CHARS = 200;
/** A shown temptation with no answer after this long counts as ignored. */
export const IGNORED_AFTER_MS = 3_600_000;
/** "Gave in" is also read from the food log: a matching food logged within this long after the pop-up. */
export const GAVE_IN_LOG_MS = 2 * 3_600_000;

export const OUTCOMES = ['resisted', 'gave_in', 'gave_in_logged', 'dismissed', 'ignored', 'reported_photo', 'practice'] as const;
export type InteractionOutcome = (typeof OUTCOMES)[number];
export const SLOT_IDS = ['morning', 'midmorning', 'noon', 'afternoon', 'evening', 'late'] as const;

export interface ChatTurn {
  from: 'boss' | 'me';
  text: string;
}

/** The moment of a temptation, as recorded with it (no street address: the area is district / city only). */
export interface InteractionContext {
  slot: string;
  weekday: number;
  weather: string[];
  tempC: number | null;
  kcalLeft: number | null;
  sinceMealMin: number | null;
  area: string;
  shop: string;
}

export interface Interaction {
  id?: string;
  shownAt: string;
  poolId: string | null;
  name: string;
  cat: string;
  kind: string;
  context: InteractionContext;
  /** Null while unanswered. */
  outcome: InteractionOutcome | null;
  turns: ChatTurn[];
  bonusXp: number;
  model: string;
  /** The angle the boss chose (the Sonnet pick's one-line reason), when any. */
  angle: string;
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);
const id = (v: unknown): string => (typeof v === 'string' && /^[a-z_]{1,20}$/.test(v) ? v : '');

/** The chat as stored: boss lines and player lines, at most MAX_USER_TURNS player lines of TURN_CHARS (boss lines 220), 12 lines in all. */
export function cleanTurns(raw: unknown): ChatTurn[] {
  const out: ChatTurn[] = [];
  let mine = 0;
  for (const t of Array.isArray(raw) ? raw : []) {
    if (!t || typeof t !== 'object') continue;
    const r = t as Record<string, unknown>;
    const from = r.from === 'me' ? 'me' : r.from === 'boss' ? 'boss' : null;
    const line = text(r.text, from === 'me' ? TURN_CHARS : 220);
    if (!from || !line) continue;
    if (from === 'me') {
      if (mine >= MAX_USER_TURNS) continue;
      mine++;
    }
    out.push({ from, text: line });
    if (out.length >= 12) break;
  }
  return out;
}

export function cleanContext(raw: unknown): InteractionContext {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    slot: (SLOT_IDS as readonly string[]).includes(r.slot as string) ? (r.slot as string) : '',
    weekday: num(r.weekday, 0, 6) ?? 0,
    weather: (Array.isArray(r.weather) ? r.weather : []).map(id).filter(Boolean).slice(0, 4),
    tempC: num(r.tempC, -50, 60),
    kcalLeft: num(r.kcalLeft, -20000, 20000),
    sinceMealMin: num(r.sinceMealMin, 0, 1440),
    area: text(r.area, 90),
    shop: text(r.shop, 80),
  };
}

export const cleanOutcome = (v: unknown): InteractionOutcome | null => ((OUTCOMES as readonly string[]).includes(v as string) ? (v as InteractionOutcome) : null);

/** A row of tempt_interactions (or the app's copy) as an Interaction; null when it has no time or name. */
export function cleanInteraction(raw: unknown): Interaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const shownAt = typeof r.shown_at === 'string' ? r.shown_at : typeof r.shownAt === 'string' ? r.shownAt : '';
  const name = text(r.name, 80);
  if (!shownAt || !Number.isFinite(Date.parse(shownAt)) || !name) return null;
  const poolId = typeof r.pool_id === 'string' ? r.pool_id : typeof r.poolId === 'string' ? r.poolId : null;
  return {
    ...(typeof r.id === 'string' ? { id: r.id } : {}),
    shownAt,
    poolId: poolId && /^[0-9a-f-]{8,40}$/i.test(poolId) ? poolId : null,
    name,
    cat: id(r.cat) || 'other',
    kind: r.kind === 'drink' ? 'drink' : 'food',
    context: cleanContext(r.context),
    outcome: cleanOutcome(r.outcome),
    turns: cleanTurns(r.turns),
    bonusXp: num(r.bonus_xp ?? r.bonusXp, 0, 1000) ?? 0,
    model: text(r.model, 60),
    angle: text(r.angle, 200),
  };
}

/** The row to write for a newly shown temptation (snake_case, as the table has it). */
export function interactionRow(userId: string, i: Omit<Interaction, 'id' | 'turns' | 'bonusXp' | 'outcome'> & { outcome?: InteractionOutcome | null; turns?: ChatTurn[] }): Record<string, unknown> {
  return {
    user_id: userId,
    shown_at: i.shownAt,
    pool_id: i.poolId,
    name: text(i.name, 80),
    cat: id(i.cat) || 'other',
    kind: i.kind === 'drink' ? 'drink' : 'food',
    context: cleanContext(i.context),
    outcome: i.outcome ?? null,
    turns: cleanTurns(i.turns ?? []),
    bonus_xp: 0,
    model: text(i.model, 60),
    angle: text(i.angle, 200),
  };
}

/** The app's answer as a stored outcome. A practice round is recorded as practice (never learned from). */
export function outcomeOf(answer: 'resisted' | 'gaveIn' | 'dismissed' | 'reportedPhoto', practice = false): InteractionOutcome {
  if (practice) return 'practice';
  return answer === 'resisted' ? 'resisted' : answer === 'gaveIn' ? 'gave_in' : answer === 'reportedPhoto' ? 'reported_photo' : 'dismissed';
}

/** The chat after one more exchange: the player's line and the boss's answer appended (bounded by cleanTurns). */
export function appendTurns(turns: ChatTurn[], mine: string, boss: string[]): ChatTurn[] {
  return cleanTurns([...turns, { from: 'me', text: mine }, ...boss.map((b) => ({ from: 'boss', text: b }))]);
}

/** ISO time before which interactions are deleted (retention). */
export const retentionCutoffISO = (now: Date = new Date()): string => new Date(now.getTime() - INTERACTION_RETENTION_DAYS * 86_400_000).toISOString();

/** The interactions still kept at `now`. */
export const withinRetention = (list: Interaction[], now: Date = new Date()): Interaction[] => list.filter((i) => Date.parse(i.shownAt) >= Date.parse(retentionCutoffISO(now)));

const plain = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Whether the food log shows the player ate the temptation after all: a food logged within GAVE_IN_LOG_MS after it was shown whose
 *  name matches the item's (one contains the other, or two of its words), or whose category is the item's (when `categorize` is given
 *  and the category is not 'other'). */
export function gaveInByLog(i: Pick<Interaction, 'shownAt' | 'name' | 'cat'>, foods: { name: string; atISO: string }[], categorize?: (name: string) => string): boolean {
  const shown = Date.parse(i.shownAt);
  const key = plain(i.name);
  const words = key.split(' ').filter((w) => w.length >= 3);
  return foods.some((f) => {
    const t = Date.parse(f.atISO);
    if (!Number.isFinite(t) || t < shown || t - shown > GAVE_IN_LOG_MS) return false;
    const fk = plain(f.name);
    if (fk.length >= 3 && (fk.includes(key) || key.includes(fk))) return true;
    if (words.length >= 2 && words.filter((w) => fk.includes(w)).length >= 2) return true;
    return !!categorize && i.cat !== 'other' && categorize(f.name) === i.cat;
  });
}

/** The outcome as learned from: unanswered and older than IGNORED_AFTER_MS → ignored; still fresh → null (not counted yet). */
export function effectiveOutcome(i: Interaction, now: Date = new Date()): InteractionOutcome | null {
  if (i.outcome) return i.outcome;
  return now.getTime() - Date.parse(i.shownAt) > IGNORED_AFTER_MS ? 'ignored' : null;
}

const GAVE = new Set<InteractionOutcome>(['gave_in', 'gave_in_logged']);
const HELD = new Set<InteractionOutcome>(['resisted', 'dismissed', 'ignored']);

export interface Tally {
  key: string;
  gaveIn: number;
  held: number;
}

export interface LearnSummary {
  /** Interactions counted (practice and photo reports left out). */
  n: number;
  gaveIn: number;
  held: number;
  byCat: Tally[];
  bySlot: Tally[];
  byWeather: Tally[];
  byKind: Tally[];
  /** Score adjustment per category for temptPick (bounded, see CAT_BOOST_*). */
  catBoost: Record<string, number>;
  /** Share of chats in which the player typed at least one line of their own (0-1), and how many chats there were. */
  teaseRate: number;
  chats: number;
  /** The player's latest own lines (mocking / answering the boss), newest first. */
  mocked: string[];
  /** Angles / boss lines of the temptations the player gave in to, newest first. */
  worked: string[];
  /** Names shown in the last 14 days (not to repeat). */
  recent: string[];
}

export const CAT_BOOST_MAX = 2;
/** The floor: a category always resisted loses at most this much, so it still comes up now and then. */
export const CAT_BOOST_MIN = -1.5;
/** Decided interactions a category needs before it is adjusted. */
export const CAT_BOOST_MIN_N = 2;

function tally(map: Map<string, Tally>, key: string, gave: boolean) {
  if (!key) return;
  const t = map.get(key) ?? { key, gaveIn: 0, held: 0 };
  if (gave) t.gaveIn++;
  else t.held++;
  map.set(key, t);
}

const sorted = (m: Map<string, Tally>): Tally[] => [...m.values()].sort((a, b) => b.gaveIn + b.held - (a.gaveIn + a.held) || a.key.localeCompare(b.key));

/** The give-in rate of a tally with a prior of one each way (two tries are not a certainty). */
export const rateOf = (t: Tally): number => (t.gaveIn + 1) / (t.gaveIn + t.held + 2);

/** The bounded score adjustment of a category: (rate - 0.5) × 4, between CAT_BOOST_MIN and CAT_BOOST_MAX, rounded to 0.1; 0 below
 *  CAT_BOOST_MIN_N decided interactions. */
export function boostOf(t: Tally): number {
  if (t.gaveIn + t.held < CAT_BOOST_MIN_N) return 0;
  const b = Math.max(CAT_BOOST_MIN, Math.min(CAT_BOOST_MAX, (rateOf(t) - 0.5) * 4));
  return Math.round(b * 10) / 10;
}

/** The summary of the player's last interactions (newest first or not; the latest LEARN_WINDOW are used). */
export function learnSummary(list: Interaction[], now: Date = new Date()): LearnSummary {
  const recentCut = now.getTime() - 14 * 86_400_000;
  const items = withinRetention(list, now)
    .slice()
    .sort((a, b) => b.shownAt.localeCompare(a.shownAt))
    .slice(0, LEARN_WINDOW);
  const cats = new Map<string, Tally>();
  const slots = new Map<string, Tally>();
  const weather = new Map<string, Tally>();
  const kinds = new Map<string, Tally>();
  const mocked: string[] = [];
  const worked: string[] = [];
  const recent: string[] = [];
  let n = 0;
  let gaveIn = 0;
  let held = 0;
  let chats = 0;
  let teased = 0;
  for (const i of items) {
    if (Date.parse(i.shownAt) >= recentCut && !recent.includes(i.name)) recent.push(i.name);
    const outcome = effectiveOutcome(i, now);
    if (i.turns.length > 0) {
      chats++;
      const mine = i.turns.filter((t) => t.from === 'me').map((t) => t.text);
      if (mine.length > 0) teased++;
      for (const m of mine) if (mocked.length < 5 && !mocked.includes(m)) mocked.push(m);
    }
    if (!outcome || (!GAVE.has(outcome) && !HELD.has(outcome))) continue;
    const gave = GAVE.has(outcome);
    n++;
    if (gave) gaveIn++;
    else held++;
    tally(cats, i.cat, gave);
    tally(slots, i.context.slot, gave);
    tally(kinds, i.kind, gave);
    for (const w of i.context.weather) tally(weather, w, gave);
    if (gave && worked.length < 3) {
      const angle = i.angle || i.turns.find((t) => t.from === 'boss')?.text || '';
      if (angle) worked.push(`${i.name}: ${angle}`.slice(0, 200));
    }
  }
  const byCat = sorted(cats);
  const catBoost: Record<string, number> = {};
  for (const t of byCat) {
    const b = boostOf(t);
    if (b !== 0 && t.key !== 'other') catBoost[t.key] = b;
  }
  return {
    n,
    gaveIn,
    held,
    byCat,
    bySlot: sorted(slots),
    byWeather: sorted(weather),
    byKind: sorted(kinds),
    catBoost,
    teaseRate: chats > 0 ? Math.round((teased / chats) * 100) / 100 : 0,
    chats,
    mocked,
    worked,
    recent: recent.slice(0, 12),
  };
}

/** A catBoost sent by the app (offline) or read back, cleaned and bounded. */
export function cleanCatBoost(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z]{2,16}$/.test(k) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = Math.round(Math.max(CAT_BOOST_MIN, Math.min(CAT_BOOST_MAX, v)) * 10) / 10;
    if (Object.keys(out).length >= 20) break;
  }
  return out;
}

const SLOT_VI: Record<string, string> = { morning: 'sáng', midmorning: 'giữa buổi sáng', noon: 'trưa', afternoon: 'chiều', evening: 'tối', late: 'khuya' };
const WEATHER_VI: Record<string, string> = { hot: 'trời nóng', cold: 'trời lạnh', rain: 'trời mưa', sunny: 'trời nắng' };
const KIND_VI: Record<string, string> = { food: 'đồ ăn', drink: 'đồ uống' };

const fmt = (t: Tally, label: (k: string) => string) => `${label(t.key)} (chịu thua ${t.gaveIn}/${t.gaveIn + t.held})`;

/** The summary as a few prompt lines for the boss (empty when there is nothing to learn from yet). `catVi` names the categories. */
export function learnPromptLines(s: LearnSummary | null, catVi: Record<string, string> = {}): string[] {
  if (!s || (s.n === 0 && s.chats === 0)) return [];
  const out: string[] = [];
  const cat = (k: string) => catVi[k] ?? k;
  out.push(`Lịch sử cám dỗ người này: ${s.n} lần có kết quả, chịu thua ${s.gaveIn}, cứng rắn ${s.held}.`);
  const weak = s.byCat.filter((t) => t.gaveIn > 0 && rateOf(t) > 0.5).slice(0, 3);
  const strong = s.byCat.filter((t) => t.gaveIn === 0 && t.held >= CAT_BOOST_MIN_N).slice(0, 3);
  if (weak.length > 0) out.push(`Hay chịu thua với: ${weak.map((t) => fmt(t, cat)).join(', ')}.`);
  if (strong.length > 0) out.push(`Luôn cứng rắn với: ${strong.map((t) => fmt(t, cat)).join(', ')} (đổi chiêu, đừng lặp lại).`);
  const slot = s.bySlot.filter((t) => t.gaveIn > 0).sort((a, b) => rateOf(b) - rateOf(a))[0];
  const wx = s.byWeather.filter((t) => t.gaveIn > 0).sort((a, b) => rateOf(b) - rateOf(a))[0];
  if (slot || wx) out.push(`Dễ chịu thua nhất: ${[slot ? `buổi ${SLOT_VI[slot.key] ?? slot.key}` : '', wx ? WEATHER_VI[wx.key] ?? wx.key : ''].filter(Boolean).join(', ')}.`);
  const kind = s.byKind.filter((t) => t.gaveIn + t.held >= 2).sort((a, b) => rateOf(b) - rateOf(a))[0];
  if (kind) out.push(`Yếu lòng hơn với ${KIND_VI[kind.key] ?? kind.key}.`);
  if (s.worked.length > 0) out.push(`Chiêu từng hiệu quả: ${s.worked.join(' | ')}.`);
  if (s.chats > 0) out.push(`Người chơi đáp trả Quỷ trong ${Math.round(s.teaseRate * 100)}% cuộc trò chuyện${s.mocked.length > 0 ? `; câu họ từng nói: ${s.mocked.map((m) => `"${m.slice(0, 80)}"`).join(', ')}` : ''}.`);
  if (s.recent.length > 0) out.push(`Món đã mời gần đây (đừng lặp): ${s.recent.slice(0, 8).join(', ')}.`);
  return out;
}
