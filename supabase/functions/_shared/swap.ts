// Sanitising of the swap request the client sends (the item that breaks a limit, which limits, the room left, the user's
// usual foods): bounded numbers and short names only, so a bad client can't put instructions into the prompt. Pure (no Deno
// use), unit-tested in jest.

const NUTRIENTS = ['purine', 'salt', 'sugar'];
const MEAL_TIMES = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'late_afternoon_snack', 'dinner', 'evening_snack'];

const bounded = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : undefined;

/** A name for the prompt: no angle brackets or line breaks, trimmed, short. */
export function cleanName(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export interface SwapRequest {
  item: { name: string; calories: number; proteinG: number; purineMg: number; saltG: number; sugarG: number };
  exceeded: string[];
  headroom: Record<string, number>;
  limits: Record<string, number>;
  mealTime?: string;
  favorites: string[];
}

/** The request as a clean object, or null when it is unusable (no name or calories, or no known exceeded limit). */
export function cleanSwapRequest(raw: unknown): SwapRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const name = cleanName(r.item?.name);
  const calories = bounded(r.item?.calories, 1, 5000);
  if (!name || calories === undefined) return null;
  const exceeded = (Array.isArray(r.exceeded) ? r.exceeded : []).filter((n: unknown): n is string => typeof n === 'string' && NUTRIENTS.includes(n));
  const unique = [...new Set(exceeded)];
  if (unique.length === 0) return null;
  const num = (v: unknown, max: number) => bounded(v, 0, max) ?? 0;
  const head = (v: unknown) => bounded(v, -100000, 100000) ?? 0;
  return {
    item: { name, calories, proteinG: num(r.item?.proteinG, 500), purineMg: num(r.item?.purineMg, 20000), saltG: num(r.item?.saltG, 200), sugarG: num(r.item?.sugarG, 1000) },
    exceeded: unique,
    headroom: { purine: head(r.headroom?.purine), salt: head(r.headroom?.salt), sugar: head(r.headroom?.sugar) },
    limits: { purine: num(r.limits?.purine, 20000), salt: num(r.limits?.salt, 200), sugar: num(r.limits?.sugar, 1000) },
    ...(MEAL_TIMES.includes(r.mealTime) ? { mealTime: r.mealTime as string } : {}),
    favorites: (Array.isArray(r.favorites) ? r.favorites : []).map((f: unknown) => cleanName(f, 60)).filter(Boolean).slice(0, 8),
  };
}
