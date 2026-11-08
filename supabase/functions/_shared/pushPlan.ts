// The reminder plan a device sends with its Web Push subscription, and which reminders of it are due (send-push runs every 15
// minutes). The device works the plan out with the app's own code (water schedule, meal times, workouts) and writes the
// notification texts in the user's language, so the server only compares clocks: it mirrors the app's rules, it does not
// recompute them. Pure (no Deno APIs), unit-tested in jest.
//
// Rules (the same as the in-app water pop-up and the phone's scheduled notifications, src/notifications/schedule.ts):
// - Water: at each drink time the latest one reached (at most WATER_LATE_MIN ago) that was not sent yet, unless the day's water
//   (nutrition_logs.water_ml, synced) already reached its running total. Several missed times give one message. On the date of
//   `today` (a day with its own target) its drink times are used; on other days the day type's.
// - Meals: every day at each meal's start time (the training-day template, as on the phone).
// - Workouts: on training weekdays at each workout with a reminder slot.
// A meal / workout message is sent at most MEAL_LATE_MIN after its time (one cron run may be missed), never twice.

export const PUSH_PLAN_VERSION = 1;
/** Same as WATER_REMINDER_LATE_MIN in src/water/reminder.ts. */
export const WATER_LATE_MIN = 120;
export const MEAL_LATE_MIN = 30;
const MAX_ITEMS = 24;
const MAX_TEXT = 160;

export interface PushWaterPoint {
  /** Minutes since midnight. */
  m: number;
  /** Running total due by then (ml). */
  cum: number;
  label: string;
}

export interface PushTimed {
  m: number;
  title: string;
  body: string;
}

export interface PushPlan {
  v: number;
  /** Water drink times, by day type (labels differ around workouts), for the target of the days ahead (the setting). */
  water: { training: PushWaterPoint[]; rest: PushWaterPoint[] };
  /** Today's drink times when today's target is not the setting's (a day keeps the target it was started with); used only on that
   *  date in the user's time zone. Optional: a plan without it (older app versions) reminds every day from `water`. */
  today?: { date: string; water: PushWaterPoint[] };
  /** JS weekdays (0 = Sunday) that are training days. */
  trainingDays: number[];
  meals: PushTimed[];
  /** Sent only on training days. */
  workouts: PushTimed[];
  /** Water texts with {ml}, {label}, {total} placeholders. */
  waterTitle: string;
  waterBody: string;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : null);

function cleanWater(raw: unknown): PushWaterPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: PushWaterPoint[] = [];
  for (const p of raw.slice(0, MAX_ITEMS)) {
    const o = (p ?? {}) as Record<string, unknown>;
    const label = text(o.label);
    if (!isInt(o.m, 0, 1439) || !isInt(o.cum, 1, 20000) || label === null) continue;
    out.push({ m: o.m, cum: o.cum, label });
  }
  return out.sort((a, b) => a.m - b.m);
}

function cleanTimed(raw: unknown): PushTimed[] {
  if (!Array.isArray(raw)) return [];
  const out: PushTimed[] = [];
  for (const p of raw.slice(0, MAX_ITEMS)) {
    const o = (p ?? {}) as Record<string, unknown>;
    const title = text(o.title);
    if (!isInt(o.m, 0, 1439) || title === null) continue;
    out.push({ m: o.m, title, body: text(o.body) ?? '' });
  }
  return out;
}

/** A plan as stored (or sent by a device), checked and bounded; null when it is not a plan. */
export function cleanPushPlan(raw: unknown): PushPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== PUSH_PLAN_VERSION) return null;
  const water = (o.water ?? {}) as Record<string, unknown>;
  const days = Array.isArray(o.trainingDays) ? o.trainingDays.filter((d): d is number => isInt(d, 0, 6)) : [];
  const today = (o.today ?? null) as Record<string, unknown> | null;
  const todayDate = today && typeof today.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today.date) ? today.date : null;
  return {
    v: PUSH_PLAN_VERSION,
    water: { training: cleanWater(water.training), rest: cleanWater(water.rest) },
    ...(todayDate ? { today: { date: todayDate, water: cleanWater(today!.water) } } : {}),
    trainingDays: [...new Set(days)],
    meals: cleanTimed(o.meals),
    workouts: cleanTimed(o.workouts),
    waterTitle: text(o.waterTitle) ?? 'FitJourney',
    waterBody: text(o.waterBody) ?? '',
  };
}

export interface LocalClock {
  /** YYYY-MM-DD in the user's time zone. */
  dateKey: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall clock of `tz` at `now` (an unknown zone falls back to Asia/Ho_Chi_Minh, where the app's users are). */
export function localClock(now: Date, tz: string | null | undefined): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return localClock(now, 'Asia/Ho_Chi_Minh');
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')), weekday: WEEKDAYS.indexOf(get('weekday')) };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const fill = (template: string, params: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (all, key: string) => (key in params ? String(params[key]) : all));

export interface DuePush {
  /** Recorded as sent, with `alsoKeys`, so the same reminder is never sent twice. */
  key: string;
  alsoKeys: string[];
  title: string;
  body: string;
  /** Notification tag: a newer message of the same kind replaces the older one on the lock screen. */
  tag: string;
  url: string;
}

/** The day's water from its `nutrition_logs` row: `water_ml` plus the drinks logged as food that count as water (`waterMl` of each
 *  of `extra_items`), as the app adds them (src/water/drinks.ts). Null when the day has no row. */
export function rowWaterMl(row: { water_ml?: unknown; extra_items?: unknown } | null | undefined): number | null {
  if (!row) return null;
  const items = Array.isArray(row.extra_items) ? (row.extra_items as { waterMl?: unknown }[]) : [];
  const drinks = items.reduce((sum, i) => {
    const ml = Number(i?.waterMl);
    return sum + (Number.isFinite(ml) && ml > 0 ? ml : 0);
  }, 0);
  const water = Number(row.water_ml);
  return Math.max(0, Number.isFinite(water) ? water : 0) + drinks;
}

/** The messages due for one user now. `waterMl` is the day's water so far (null when unknown: treated as 0). */
export function duePushes(plan: PushPlan, clock: LocalClock, sent: ReadonlySet<string>, waterMl: number | null): DuePush[] {
  const out: DuePush[] = [];
  const { dateKey, minutes } = clock;
  const training = plan.trainingDays.includes(clock.weekday);

  // Water: mirrors dueWaterReminder (src/water/reminder.ts). Today's own drink times when the plan has them for this date.
  const water = plan.today?.date === dateKey ? plan.today.water : training ? plan.water.training : plan.water.rest;
  const reached = water.filter((p) => p.m <= minutes);
  const latest = reached[reached.length - 1];
  if (latest) {
    const key = `water@${dateKey}@${hhmm(latest.m)}`;
    const drunk = Math.max(0, waterMl ?? 0);
    if (!sent.has(key) && minutes - latest.m <= WATER_LATE_MIN && drunk < latest.cum) {
      const ml = latest.cum - drunk;
      out.push({
        key,
        alsoKeys: reached.map((p) => `water@${dateKey}@${hhmm(p.m)}`).filter((k) => k !== key && !sent.has(k)),
        title: plan.waterTitle,
        body: fill(plan.waterBody, { ml, label: latest.label, total: latest.cum }),
        tag: 'water',
        url: '/',
      });
    }
  }

  const timed = (kind: 'meal' | 'workout', items: PushTimed[]) => {
    for (const item of items) {
      const key = `${kind}@${dateKey}@${hhmm(item.m)}`;
      const late = minutes - item.m;
      if (late < 0 || late > MEAL_LATE_MIN || sent.has(key)) continue;
      out.push({ key, alsoKeys: [], title: item.title, body: item.body, tag: key, url: '/' });
    }
  };
  timed('meal', plan.meals);
  if (training) timed('workout', plan.workouts);
  return out;
}

/** The plan to use for a user with several devices: the one updated last. */
export function latestPlan<T extends { plan: unknown; plan_updated_at: string | null; tz: string | null }>(rows: T[]): { plan: PushPlan; tz: string | null } | null {
  let best: { plan: PushPlan; tz: string | null; at: number } | null = null;
  for (const r of rows) {
    const plan = cleanPushPlan(r.plan);
    if (!plan) continue;
    const at = r.plan_updated_at ? Date.parse(r.plan_updated_at) : 0;
    if (!best || at > best.at) best = { plan, tz: r.tz, at };
  }
  return best ? { plan: best.plan, tz: best.tz } : null;
}
