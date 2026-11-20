// Food diary + eating habit analysis for the temptation boss (1.7): from the food log of today, yesterday and the last 7 days, a
// compact summary the pick and the boss's lines read: kcal eaten today against the target and what is left, the main meals logged or
// missing, snacks by category and hour, favourite dishes, sweet / salty / fried / drink leanings, the usual snack hours and late-night
// eating. Deterministic (no AI cost). Built on the device (it has the log) and sent as the summary only, never the raw diary; the server
// cleans it again (`cleanHabitSummary`) and turns it into a few prompt lines (`habitPromptLines`). Shared by the app and the Edge
// Functions, so it imports NOTHING (a Deno `.ts` import between _shared files breaks the app's tsc): the food category comes from the
// caller (`categorize`, temptPick.ts foodCategory). Unit-tested in jest.

export type MainMeal = 'breakfast' | 'lunch' | 'dinner';
export const MAIN_MEALS: MainMeal[] = ['breakfast', 'lunch', 'dinner'];
export const MEAL_VI: Record<MainMeal, string> = { breakfast: 'bữa sáng', lunch: 'bữa trưa', dinner: 'bữa tối' };
/** A main meal counts as missed once this local minute has passed without it. */
export const MEAL_DUE_MIN: Record<MainMeal, number> = { breakfast: 10 * 60 + 30, lunch: 14 * 60, dinner: 21 * 60 };

/** Days of the log the week figures cover (today included). */
export const WEEK_DAYS = 7;
/** Late-night eating: from 21:00 to 04:59. */
export const LATE_FROM_MIN = 21 * 60;
export const LATE_TO_MIN = 5 * 60;

/** One food of the log as the analysis reads it. */
export interface DiaryEntry {
  /** Local date YYYY-MM-DD. */
  date: string;
  name: string;
  kcal: number;
  /** Local minute of the day it was eaten, null when unknown. */
  minutes: number | null;
  /** The main meal it made, or null (a snack, a drink between meals). */
  meal: MainMeal | null;
  /** A snack / treat (a snack meal time, "ăn vặt", junk). */
  snack: boolean;
  sugarG?: number;
  saltG?: number;
}

export interface HabitSummary {
  v: 1;
  today: { kcal: number; targetKcal: number | null; leftKcal: number | null; meals: MainMeal[]; missing: MainMeal[]; snacks: number };
  yesterday: { kcal: number; overTarget: boolean | null; snacks: number } | null;
  week: { daysLogged: number; avgKcal: number; overDays: number; snacks: number };
  /** Snack categories of the week, most first (temptPick CATEGORIES ids). */
  snackCats: { cat: string; n: number }[];
  /** Hours (0-23) the player snacks at most, most first. */
  snackHours: { hour: number; n: number }[];
  /** The dishes logged most this week (any food), most first. */
  favourites: { name: string; n: number }[];
  /** Foods of the week that read as sweet / salty / fried / a drink. */
  prefs: { sweet: number; salty: number; fried: number; drink: number };
  /** Foods eaten 21:00-04:59 this week, and on how many days. */
  lateNight: { n: number; days: number };
}

export const EMPTY_HABIT_SUMMARY: HabitSummary = {
  v: 1,
  today: { kcal: 0, targetKcal: null, leftKcal: null, meals: [], missing: [], snacks: 0 },
  yesterday: null,
  week: { daysLogged: 0, avgKcal: 0, overDays: 0, snacks: 0 },
  snackCats: [],
  snackHours: [],
  favourites: [],
  prefs: { sweet: 0, salty: 0, fried: 0, drink: 0 },
  lateNight: { n: 0, days: 0 },
};

/** Lower case, no accents (đ as d), letters and digits only. (Same as temptPick.ts plainKey; kept here: no imports.) */
export function plain(text: unknown): string {
  return String(typeof text === 'string' ? text : '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SWEET = /\bche\b|\bkem\b|banh ngot|banh kem|tra sua|tran chau|socola|chocolate|\bkeo\b|\bmut\b|flan|pudding|tiramisu|cheesecake|donut|cookie|banh quy|sinh to|nuoc ngot|coca|pepsi|\bduong\b|mat ong|sua chua|tao pho|bingsu|cake|waffle|banh flan|nuoc mia|tra dao|tra vai/;
const SALTY = /mi tom|mi goi|bim bim|snack|chips|khoai tay|xuc xich|lap xuong|\bkho\b|ca kho|thit kho|nuoc mam|\bmuoi\b|kim chi|dua muoi|ca muoi|cha lua|gio lua|thit nguoi|pate|banh trang tron|banh trang nuong|ca vien|nem chua|kho ga|kho bo|mam/;
const FRIED = /chien|\bran\b|ga ran|khoai tay chien|gion|tempura|nugget|cha gio|nem ran|banh ran|bot chien|quay|fries|fried/;
const DRINK = /\btra\b|ca phe|cafe|coffee|\bnuoc\b|sinh to|\bbia\b|beer|soda|\bsua\b|latte|matcha|juice|coca|pepsi|smoothie|ruou|cacao|ca cao|milo/;

export type Flavour = 'sweet' | 'salty' | 'fried' | 'drink';
export const FLAVOUR_VI: Record<Flavour, string> = { sweet: 'đồ ngọt', salty: 'đồ mặn', fried: 'đồ chiên', drink: 'đồ uống' };

/** What a food reads as, from its name and figures (several may hold). */
export function flavoursOf(entry: { name: string; sugarG?: number; saltG?: number }): Flavour[] {
  const key = plain(entry.name);
  const out: Flavour[] = [];
  if ((entry.sugarG ?? 0) >= 15 || SWEET.test(key)) out.push('sweet');
  if ((entry.saltG ?? 0) >= 2 || SALTY.test(key)) out.push('salty');
  if (FRIED.test(key)) out.push('fried');
  if (DRINK.test(key)) out.push('drink');
  return out;
}

/** The local date `days` before `date` (YYYY-MM-DD), in the calendar (no time zone). */
export function dateBefore(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) - days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

const isLate = (minutes: number | null): boolean => minutes !== null && (minutes >= LATE_FROM_MIN || minutes < LATE_TO_MIN);
const round = (n: number) => Math.round(n);
const SKIPPED = /^khong an$/;

/** The summary of the diary for `today` at `nowMinutes` (local). `targetKcal` (> 0) is the day's target; `categorize` gives a food's
 *  category id (temptPick foodCategory); without it every snack is 'other'. Entries outside the week are ignored. */
export function analyzeDiary(input: {
  today: string;
  nowMinutes: number;
  entries: DiaryEntry[];
  targetKcal: number | null;
  categorize?: (name: string) => string;
  /** The day's eaten kcal as the app counts it (plan meals ticked included), when known; else the sum of the entries. */
  dayKcal?: (date: string) => number | null;
}): HabitSummary {
  const { today, nowMinutes } = input;
  const target = typeof input.targetKcal === 'number' && input.targetKcal > 0 ? round(input.targetKcal) : null;
  const yesterdayKey = dateBefore(today, 1);
  const weekStart = dateBefore(today, WEEK_DAYS - 1);
  const entries = input.entries.filter((e) => e && e.name && !SKIPPED.test(plain(e.name)) && e.date >= weekStart && e.date <= today);
  const kcalByDay = new Map<string, number>();
  const snackCats = new Map<string, number>();
  const snackHours = new Map<number, number>();
  const favs = new Map<string, { name: string; n: number }>();
  const prefs = { sweet: 0, salty: 0, fried: 0, drink: 0 };
  const lateDays = new Set<string>();
  let lateN = 0;
  let weekSnacks = 0;
  const todayMeals = new Set<MainMeal>();
  let todaySnacks = 0;
  let yesterdaySnacks = 0;
  for (const e of entries) {
    const kcal = Number.isFinite(e.kcal) && e.kcal > 0 ? e.kcal : 0;
    kcalByDay.set(e.date, (kcalByDay.get(e.date) ?? 0) + kcal);
    if (e.date === today && e.meal && !e.snack) todayMeals.add(e.meal);
    if (e.snack) {
      weekSnacks++;
      if (e.date === today) todaySnacks++;
      if (e.date === yesterdayKey) yesterdaySnacks++;
      const cat = input.categorize ? input.categorize(e.name) : 'other';
      snackCats.set(cat, (snackCats.get(cat) ?? 0) + 1);
      if (e.minutes !== null && Number.isFinite(e.minutes)) {
        const h = Math.floor((((e.minutes % 1440) + 1440) % 1440) / 60);
        snackHours.set(h, (snackHours.get(h) ?? 0) + 1);
      }
    }
    const key = plain(e.name);
    if (key) {
      const prev = favs.get(key);
      favs.set(key, { name: prev?.name ?? e.name.replace(/[<>\n\r]/g, ' ').trim().slice(0, 60), n: (prev?.n ?? 0) + 1 });
    }
    for (const f of flavoursOf(e)) prefs[f]++;
    if (isLate(e.minutes)) {
      lateN++;
      lateDays.add(e.date);
    }
  }
  if (input.dayKcal) {
    for (let i = 0; i < WEEK_DAYS; i++) {
      const d = dateBefore(today, i);
      const k = input.dayKcal(d);
      if (typeof k === 'number' && Number.isFinite(k) && k > 0) kcalByDay.set(d, k);
    }
  }
  const todayKcal = round(kcalByDay.get(today) ?? 0);
  const meals = MAIN_MEALS.filter((m) => todayMeals.has(m));
  const missing = MAIN_MEALS.filter((m) => !todayMeals.has(m) && nowMinutes >= MEAL_DUE_MIN[m]);
  const yKcal = kcalByDay.get(yesterdayKey);
  const days = [...kcalByDay.entries()].filter(([, k]) => k > 0);
  const pastDays = days.filter(([d]) => d !== today);
  return {
    v: 1,
    today: { kcal: todayKcal, targetKcal: target, leftKcal: target !== null ? target - todayKcal : null, meals, missing, snacks: todaySnacks },
    yesterday: yKcal !== undefined ? { kcal: round(yKcal), overTarget: target !== null ? yKcal > target : null, snacks: yesterdaySnacks } : null,
    week: {
      daysLogged: days.length,
      avgKcal: pastDays.length > 0 ? round(pastDays.reduce((a, [, k]) => a + k, 0) / pastDays.length) : 0,
      overDays: target !== null ? pastDays.filter(([, k]) => k > target).length : 0,
      snacks: weekSnacks,
    },
    snackCats: [...snackCats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([cat, n]) => ({ cat, n })),
    snackHours: [...snackHours.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([hour, n]) => ({ hour, n })),
    favourites: [...favs.values()].filter((f) => f.n >= 2).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 5),
    prefs,
    lateNight: { n: lateN, days: lateDays.size },
  };
}

const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);
const nameText = (v: unknown): string => (typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '');
const catId = (v: unknown): string => (typeof v === 'string' && /^[a-z]{2,16}$/.test(v) ? v : '');
const mealList = (v: unknown): MainMeal[] => MAIN_MEALS.filter((m) => Array.isArray(v) && v.includes(m));

/** A summary sent by the app, cleaned (bounded numbers, short names, known ids); null when it is not one. */
export function cleanHabitSummary(raw: unknown): HabitSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, any>;
  if (!r.today || typeof r.today !== 'object') return null;
  const target = int(r.today.targetKcal, 1, 20000);
  const kcal = int(r.today.kcal, 0, 50000) ?? 0;
  const y = r.yesterday && typeof r.yesterday === 'object' ? r.yesterday : null;
  const w = r.week && typeof r.week === 'object' ? r.week : {};
  const p = r.prefs && typeof r.prefs === 'object' ? r.prefs : {};
  const l = r.lateNight && typeof r.lateNight === 'object' ? r.lateNight : {};
  return {
    v: 1,
    today: { kcal, targetKcal: target, leftKcal: target !== null ? target - kcal : null, meals: mealList(r.today.meals), missing: mealList(r.today.missing), snacks: int(r.today.snacks, 0, 200) ?? 0 },
    yesterday: y ? { kcal: int(y.kcal, 0, 50000) ?? 0, overTarget: typeof y.overTarget === 'boolean' ? y.overTarget : null, snacks: int(y.snacks, 0, 200) ?? 0 } : null,
    week: { daysLogged: int(w.daysLogged, 0, 7) ?? 0, avgKcal: int(w.avgKcal, 0, 50000) ?? 0, overDays: int(w.overDays, 0, 7) ?? 0, snacks: int(w.snacks, 0, 1000) ?? 0 },
    snackCats: (Array.isArray(r.snackCats) ? r.snackCats : []).flatMap((c: any) => (catId(c?.cat) && int(c?.n, 1, 1000) ? [{ cat: catId(c.cat), n: int(c.n, 1, 1000)! }] : [])).slice(0, 5),
    snackHours: (Array.isArray(r.snackHours) ? r.snackHours : []).flatMap((h: any) => (int(h?.hour, 0, 23) !== null && int(h?.n, 1, 1000) ? [{ hour: int(h.hour, 0, 23)!, n: int(h.n, 1, 1000)! }] : [])).slice(0, 3),
    favourites: (Array.isArray(r.favourites) ? r.favourites : []).flatMap((f: any) => (nameText(f?.name) && int(f?.n, 1, 1000) ? [{ name: nameText(f.name), n: int(f.n, 1, 1000)! }] : [])).slice(0, 5),
    prefs: { sweet: int(p.sweet, 0, 1000) ?? 0, salty: int(p.salty, 0, 1000) ?? 0, fried: int(p.fried, 0, 1000) ?? 0, drink: int(p.drink, 0, 1000) ?? 0 },
    lateNight: { n: int(l.n, 0, 1000) ?? 0, days: int(l.days, 0, 7) ?? 0 },
  };
}

/** Vietnamese words for the temptPick categories. */
export const CAT_VI: Record<string, string> = {
  milktea: 'trà sữa',
  coffee: 'cà phê',
  beer: 'bia rượu',
  cake: 'bánh ngọt',
  icecream: 'kem',
  che: 'chè',
  chocolate: 'bánh kẹo, snack',
  juice: 'nước ngọt, sinh tố',
  tea: 'trà',
  fruit: 'trái cây',
  fried: 'đồ chiên',
  grill: 'đồ nướng',
  street: 'đồ ăn vặt vỉa hè',
  hotpot: 'lẩu',
  noodle: 'bún, mì, phở',
  bread: 'bánh mì, pizza',
  rice: 'cơm, xôi',
  sweetpotato: 'khoai, bắp',
};

/** The flavour the player leans to most this week (at least 3 foods), or null. */
export function topFlavour(s: HabitSummary): Flavour | null {
  const best = (Object.entries(s.prefs) as [Flavour, number][]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 ? best[0] : null;
}

/** The kcal part of the "why" line: what is left today, or how far over. Empty without a target. */
export function kcalLeftText(s: HabitSummary): string {
  const left = s.today.leftKcal;
  if (left === null) return '';
  return left >= 0 ? `hôm nay còn ${left} kcal` : `hôm nay đã vượt ${-left} kcal`;
}

/** "Vì sao gợi ý món này?" in one short line, from the summary (and the item's category when known): the habit it plays on (the
 *  snack category the player has at that hour, else their leaning and usual snack hour, else a favourite, late-night eating at night)
 *  and the kcal left today. Empty when there is nothing to say. */
export function habitWhyLine(s: HabitSummary | null, opts: { cat?: string; nowMinutes?: number } = {}): string {
  if (!s) return '';
  const parts: string[] = [];
  const hour = s.snackHours[0]?.hour;
  const at = hour !== undefined ? ` lúc ${hour}h` : '';
  const late = opts.nowMinutes !== undefined && isLate(opts.nowMinutes);
  const catHit = opts.cat ? s.snackCats.find((c) => c.cat === opts.cat && c.n >= 2) : undefined;
  const flavour = topFlavour(s);
  if (late && s.lateNight.n >= 2) parts.push(`Tuần này bạn ăn đêm ${s.lateNight.n} lần`);
  else if (catHit && CAT_VI[catHit.cat]) parts.push(`Bạn hay ăn vặt ${CAT_VI[catHit.cat]}${at}`);
  else if (flavour && s.week.snacks >= 2) parts.push(`Bạn hay ăn vặt ${FLAVOUR_VI[flavour]}${at}`);
  else if (s.favourites[0]) parts.push(`Bạn hay ăn ${s.favourites[0].name}`);
  const kcal = kcalLeftText(s);
  if (kcal) parts.push(kcal);
  return parts.join(' · ');
}

/** The summary as a few prompt lines (no raw diary): today, yesterday, the week, the snacking habits. */
export function habitPromptLines(s: HabitSummary | null): string[] {
  if (!s) return [];
  const out: string[] = [];
  const t = s.today;
  const target = t.targetKcal !== null ? `/${t.targetKcal} kcal mục tiêu (${kcalLeftText(s)})` : ' kcal';
  out.push(`Hôm nay đã ăn ${t.kcal}${target}; bữa đã ghi: ${t.meals.map((m) => MEAL_VI[m]).join(', ') || 'chưa có'}${t.missing.length > 0 ? `; bỏ/chưa ghi: ${t.missing.map((m) => MEAL_VI[m]).join(', ')}` : ''}; ăn vặt hôm nay: ${t.snacks} lần.`);
  if (s.yesterday) out.push(`Hôm qua: ${s.yesterday.kcal} kcal${s.yesterday.overTarget === true ? ' (vượt mục tiêu)' : s.yesterday.overTarget === false ? ' (trong mục tiêu)' : ''}, ăn vặt ${s.yesterday.snacks} lần.`);
  out.push(`7 ngày: ghi ${s.week.daysLogged} ngày, trung bình ${s.week.avgKcal} kcal/ngày${s.week.overDays > 0 ? `, ${s.week.overDays} ngày vượt mục tiêu` : ''}, ăn vặt ${s.week.snacks} lần.`);
  if (s.snackCats.length > 0) out.push(`Hay ăn vặt: ${s.snackCats.map((c) => `${CAT_VI[c.cat] ?? 'món khác'} (${c.n})`).join(', ')}.`);
  if (s.snackHours.length > 0) out.push(`Giờ hay ăn vặt: ${s.snackHours.map((h) => `${h.hour}h`).join(', ')}.`);
  if (s.favourites.length > 0) out.push(`Món ăn nhiều tuần này: ${s.favourites.map((f) => `${f.name} (${f.n})`).join(', ')}.`);
  const p = s.prefs;
  out.push(`Khẩu vị tuần này: ngọt ${p.sweet}, mặn ${p.salty}, chiên ${p.fried}, đồ uống ${p.drink}${s.lateNight.n > 0 ? `; ăn đêm (sau 21h) ${s.lateNight.n} lần trong ${s.lateNight.days} ngày` : ''}.`);
  return out;
}
