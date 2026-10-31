import type { HabitFields } from '../store/useHabitStore';
import type { HabitOverview, HabitStats, Tally } from './analysis';
import { formatHabitText, type HabitKey } from './strings';
import type { FormationLevel, Habit, HabitAuto } from './types';

type Lang = 'vi' | 'en';
const pct = (r: number | null) => Math.round((r ?? 0) * 100);
const ticks = (t: Tally) => t.done + t.missed;
const wd = (lang: Lang, w: number) => formatHabitText(lang, `hb.wd${w}` as HabitKey);
const AUTO_WHAT: Record<HabitAuto, HabitKey> = { water: 'hb.autoWater', weigh: 'hb.autoWeigh', walk: 'hb.autoWalk' };

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Line {
  text: string;
  tone: Tone;
}

/** The badge for a habit: what is shown, and what the data says when the user's mark disagrees. */
export function formationLabel(lang: Lang, s: HabitStats, level: FormationLevel = s.verdict): string {
  const t = (k: HabitKey, p?: Record<string, string | number>) => formatHabitText(lang, k, p);
  switch (level) {
    case 'formed':
      return t('hb.f.formed');
    case 'building':
      return t('hb.f.building', { d: Math.min(s.daysTracked, 21), p: pct(s.window.rate) });
    case 'unstable':
      return t('hb.f.unstable', { p: pct(s.window.rate) });
    case 'new':
      return t('hb.f.new', { n: ticks(s.window) });
    default:
      return t('hb.f.untracked');
  }
}

/** Comments on the ticks, each citing the numbers behind it. Empty when there is too little data. */
export function habitInsights(lang: Lang, o: HabitOverview): Line[] {
  const t = (k: HabitKey, p?: Record<string, string | number>) => formatHabitText(lang, k, p);
  const judged = o.stats.filter((s) => s.habit.tracked && ticks(s.window) > 0);
  if (judged.reduce((n, s) => n + ticks(s.window), 0) < 5) return [];
  const out: Line[] = [];
  if (ticks(o.last7) > 0) {
    const delta = pct(o.last7.rate) - pct(o.prev7.rate);
    out.push(
      ticks(o.prev7) > 0
        ? { text: t('hb.an.overall', { d: o.last7.done, t: ticks(o.last7), p: pct(o.last7.rate), pp: pct(o.prev7.rate), delta: delta > 0 ? `+${delta}` : String(delta) }), tone: delta >= 0 ? 'good' : 'warn' }
        : { text: t('hb.an.overallOnly', { d: o.last7.done, t: ticks(o.last7), p: pct(o.last7.rate) }), tone: 'info' }
    );
  }
  const by = (l: FormationLevel) => o.stats.filter((s) => s.habit.tracked && s.verdict === l).length;
  out.push({ text: t('hb.an.counts', { f: by('formed'), b: by('building'), u: by('unstable'), n: by('new') }), tone: 'info' });
  if (o.worstWeekday) out.push({ text: t('hb.an.weekday', { wd: wd(lang, o.worstWeekday.weekday), m: o.worstWeekday.missed, t: o.worstWeekday.ticked }), tone: 'warn' });
  if (o.pair) out.push({ text: t('hb.an.pair', { a: o.pair.a.name, b: o.pair.b.name, n: o.pair.both, m: o.pair.aMissed }), tone: 'warn' });

  for (const s of judged) {
    const name = s.habit.name;
    if (ticks(s.last7) > 0) {
      const p = pct(s.last7.rate);
      const base = { name, d: s.last7.done, t: ticks(s.last7), p };
      if (ticks(s.prev7) === 0) out.push({ text: t('hb.an.week', base), tone: p >= 71 ? 'good' : 'info' });
      else {
        const delta = p - pct(s.prev7.rate);
        out.push(
          delta > 0
            ? { text: t('hb.an.trendUp', { ...base, delta, pp: pct(s.prev7.rate) }), tone: 'good' }
            : delta < 0
              ? { text: t('hb.an.trendDown', { ...base, delta: -delta, pp: pct(s.prev7.rate) }), tone: 'bad' }
              : { text: t('hb.an.trendFlat', base), tone: 'info' }
        );
      }
    }
    if (s.missRun >= 2) out.push({ text: t('hb.an.missRun', { name, n: s.missRun }), tone: 'bad' });
    else if (s.bestStreak >= 3) out.push({ text: t('hb.an.streak', { name, n: s.streak, b: s.bestStreak }), tone: 'good' });
    if (s.worstWeekday) out.push({ text: t('hb.an.habitWeekday', { name, wd: wd(lang, s.worstWeekday.weekday), m: s.worstWeekday.missed, t: s.worstWeekday.ticked }), tone: 'warn' });
    if (s.auto && s.habit.auto && s.auto.days > 0) {
      if (s.auto.forgot > 0) out.push({ text: t('hb.an.autoForgot', { name, n: s.auto.forgot }), tone: 'warn' });
      if (s.auto.unconfirmed > 0) out.push({ text: t('hb.an.autoUnconfirmed', { name, n: s.auto.unconfirmed, what: t(AUTO_WHAT[s.habit.auto]) }), tone: 'warn' });
      if (s.auto.forgot === 0 && s.auto.unconfirmed === 0) out.push({ text: t('hb.an.autoAgree', { name, a: s.auto.agree, n: s.auto.days }), tone: 'good' });
    }
  }
  return out;
}

/** Next small steps: smaller ones for habits that struggle, a step up for formed ones. */
export function kaizenTips(lang: Lang, o: HabitOverview): Line[] {
  const t = (k: HabitKey, p?: Record<string, string | number>) => formatHabitText(lang, k, p);
  const small = (h: Habit) => t(`hb.kz.small.${h.auto ?? 'generic'}` as HabitKey);
  const up = (h: Habit) => (h.kaizen.trim() ? h.kaizen.trim() : t(`hb.kz.up.${h.auto ?? 'generic'}` as HabitKey));
  const out: Line[] = [];
  const tracked = o.stats.filter((s) => s.habit.tracked);
  for (const s of tracked.filter((x) => x.verdict === 'unstable')) {
    const name = s.habit.name;
    if (s.missRun >= 2) out.push({ text: t('hb.kz.neverTwice', { name, n: s.missRun }), tone: 'bad' });
    out.push({ text: t('hb.kz.shrink', { name, p: pct(s.window.rate), step: small(s.habit) }), tone: 'warn' });
    if (s.worstWeekday) out.push({ text: t('hb.kz.anchor', { name, wd: wd(lang, s.worstWeekday.weekday), m: s.worstWeekday.missed, t: s.worstWeekday.ticked }), tone: 'warn' });
  }
  for (const s of tracked.filter((x) => x.verdict === 'formed' && x.slipping)) out.push({ text: t('hb.kz.slip', { name: s.habit.name, p: pct(s.last7.rate) }), tone: 'warn' });
  for (const s of tracked.filter((x) => x.verdict === 'building')) {
    if (s.missRun >= 2) out.push({ text: t('hb.kz.neverTwice', { name: s.habit.name, n: s.missRun }), tone: 'bad' });
    else if ((s.window.rate ?? 0) < 0.8) out.push({ text: t('hb.kz.hold', { name: s.habit.name, p: pct(s.window.rate), d: Math.min(s.daysTracked, 21) }), tone: 'info' });
    if (s.worstWeekday) out.push({ text: t('hb.kz.anchor', { name: s.habit.name, wd: wd(lang, s.worstWeekday.weekday), m: s.worstWeekday.missed, t: s.worstWeekday.ticked }), tone: 'warn' });
  }
  for (const s of tracked.filter((x) => x.verdict === 'formed' && !x.slipping && ticks(x.window) > 0)) out.push({ text: t('hb.kz.up', { name: s.habit.name, p: pct(s.window.rate), step: up(s.habit) }), tone: 'good' });
  return out;
}

export interface HabitCandidate {
  id: string;
  name: string;
  why: string;
  fields: HabitFields;
}

interface CandidateDef {
  id: string;
  vi: [name: string, why: string, measuredBy: string, kaizen: string];
  en: [name: string, why: string, measuredBy: string, kaizen: string];
  auto: HabitAuto | null;
  /** Matches an existing habit that already covers it. */
  have: RegExp;
}

/** New habits relevant to the app (weight loss, gout / uric acid, water, protein, sleep, walking), most useful first. */
export const CANDIDATES: CandidateDef[] = [
  {
    id: 'water',
    vi: ['Uống đủ 3 lít nước/ngày', 'Nước giúp thận đào thải axit uric và giảm cảm giác đói', 'Nước trong mục Dinh dưỡng', 'Bắt đầu 2 L, 1 cốc sau mỗi bữa'],
    en: ['Drink 3 L of water a day', 'Water helps the kidneys clear uric acid and curbs hunger', 'Water in Nutrition', 'Start with 2 L, one glass after each meal'],
    auto: 'water',
    have: /uống.*nước|lít nước|water/i,
  },
  {
    id: 'weigh',
    vi: ['Cân buổi sáng mỗi ngày', 'Cân đều đặn giúp thấy xu hướng và giữ cam kết', 'Lần cân buổi sáng', 'Cân ngay sau khi đánh răng'],
    en: ['Weigh in every morning', 'Regular weigh-ins show the trend and keep you committed', 'Morning weigh-in', 'Weigh right after brushing your teeth'],
    auto: 'weigh',
    have: /\bcân\b|weigh/i,
  },
  {
    id: 'walk',
    vi: ['Đi bộ 15 phút sau bữa', 'Đi bộ sau ăn giảm đường huyết và đốt thêm calo', 'Buổi đi bộ ≥ 15 phút', 'Bắt đầu 5 phút sau bữa tối'],
    en: ['Walk 15 minutes after a meal', 'A walk after eating lowers blood sugar and burns extra calories', 'Walk of 15 minutes or more', 'Start with 5 minutes after dinner'],
    auto: 'walk',
    have: /đi bộ|walk/i,
  },
  {
    id: 'alcohol',
    vi: ['Không bia rượu', 'Bia rượu làm tăng axit uric và dễ gây cơn gút', 'Ngày không uống bia rượu', 'Thay bằng nước có ga không đường'],
    en: ['No beer or alcohol', 'Alcohol, beer especially, raises uric acid and triggers gout', 'Alcohol-free days', 'Swap for sugar-free sparkling water'],
    auto: null,
    have: /bia|rượu|beer|alcohol/i,
  },
  {
    id: 'sugary',
    vi: ['Không nước ngọt', 'Fructose trong nước ngọt làm tăng axit uric và calo rỗng', 'Ngày không uống nước ngọt', 'Thay bằng trà không đường'],
    en: ['No sugary drinks', 'Fructose in soft drinks raises uric acid and adds empty calories', 'Days without sugary drinks', 'Swap for unsweetened tea'],
    auto: null,
    have: /nước ngọt|đồ ngọt|soda|sugary/i,
  },
  {
    id: 'protein',
    vi: ['Có đạm trong mỗi bữa chính', 'Đủ đạm giữ cơ khi giảm cân và no lâu hơn', 'Gam đạm mỗi ngày', 'Thêm 1 quả trứng hoặc hộp sữa chua vào bữa sáng'],
    en: ['Protein at every main meal', 'Enough protein keeps muscle while losing weight and keeps you full', 'Protein grams per day', 'Add an egg or a yoghurt to breakfast'],
    auto: null,
    have: /đạm|protein/i,
  },
  {
    id: 'sleep',
    vi: ['Ngủ trước 23h', 'Thiếu ngủ làm tăng cảm giác thèm ăn', 'Giờ đi ngủ', 'Tắt màn hình lúc 22h30'],
    en: ['In bed by 11 pm', 'Short sleep increases cravings', 'Bedtime', 'Screens off at 10:30 pm'],
    auto: null,
    have: /ngủ|sleep|bed/i,
  },
  {
    id: 'purine',
    vi: ['Hạn chế nội tạng và hải sản', 'Nhiều purine, làm tăng axit uric', 'Bữa có nội tạng/hải sản', 'Mỗi tuần bớt 1 bữa hải sản'],
    en: ['Limit organ meats and seafood', 'High in purines, raises uric acid', 'Meals with organ meat / seafood', 'Cut one seafood meal a week'],
    auto: null,
    have: /nội tạng|hải sản|purine|organ|seafood/i,
  },
  {
    id: 'veg',
    vi: ['Ăn rau trước mỗi bữa', 'Rau trước giúp no sớm và ăn ít hơn', 'Bữa có rau ăn trước', 'Bắt đầu với bữa tối'],
    en: ['Vegetables first at each meal', 'Vegetables first fill you up so you eat less', 'Meals starting with vegetables', 'Start with dinner'],
    auto: null,
    have: /\brau\b|vegetable|veg/i,
  },
];

/** Candidates the user does not already have (by auto type or name), most useful first. */
export function habitCandidates(lang: Lang, habits: Habit[], limit = 3): HabitCandidate[] {
  const active = habits.filter((h) => !h.archived);
  return CANDIDATES.filter((c) => !active.some((h) => (c.auto !== null && h.auto === c.auto) || c.have.test(h.name)))
    .slice(0, limit)
    .map((c) => {
      const [name, why, measuredBy, kaizen] = lang === 'en' ? c.en : c.vi;
      return { id: c.id, name, why, fields: { name, status: 'building', assessment: '', kaizen, measuredBy, tracked: true, auto: c.auto, formedMark: null } };
    });
}

/** The struggling habit to steady before adding a new one, if any. */
export const habitToSteadyFirst = (o: HabitOverview): Habit | null => o.stats.find((s) => s.habit.tracked && s.verdict === 'unstable')?.habit ?? null;
