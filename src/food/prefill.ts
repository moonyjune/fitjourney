import type { ExtraMealTime } from '../types';

/** A food handed to the Add food screen through the route (e.g. a dinner idea): every field is optional and checked. */
export interface Prefill {
  name: string;
  calories: string;
  protein: string;
  purine: string;
  salt: string;
  sugar: string;
  mealTime: ExtraMealTime | null;
  /** The figures are the user's own saved ones, so saving needs no new food in the database. */
  fromDb: boolean;
}

const MEAL_TIMES: ExtraMealTime[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'late_afternoon_snack', 'dinner', 'evening_snack'];
const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');

function figure(v: unknown, max: number, decimals: 0 | 1): string {
  const n = parseFloat(first(v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > max) return '';
  const f = decimals === 1 ? 10 : 1;
  return String(Math.round(n * f) / f);
}

/** Route params to initial form values: a name (short, no angle brackets), figures in sane ranges (anything else is left
 *  empty), a known meal time. Never throws. */
export function parsePrefill(params: Record<string, unknown> | undefined): Prefill {
  const p = params ?? {};
  const mealTime = first(p.mealTime) as ExtraMealTime;
  return {
    name: first(p.name).replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
    calories: figure(p.calories, 5000, 0),
    protein: figure(p.protein, 500, 1),
    purine: figure(p.purine, 20000, 0),
    salt: figure(p.salt, 200, 1),
    sugar: figure(p.sugar, 1000, 1),
    mealTime: MEAL_TIMES.includes(mealTime) ? mealTime : null,
    fromDb: first(p.from) === 'db',
  };
}
