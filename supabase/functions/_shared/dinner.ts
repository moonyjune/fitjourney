// Sanitising of the dinner request the client sends (what is left of today's calories, protein and limits, the usual foods):
// bounded numbers and short names only, so a bad client can't put instructions into the prompt. Pure (no Deno use),
// unit-tested in jest.

const bounded = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : undefined;

/** A name for the prompt: no angle brackets or line breaks, trimmed, short. (Same rule as `cleanName` in swap.ts; kept as its own
 *  copy because the shared files import nothing from each other, which keeps them loadable by both Deno and the app's tests.) */
function cleanName(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'meal'];

export interface DinnerRequest {
  budgetKcal: number;
  proteinLeftG: number;
  headroom: { purine: number; salt: number; sugar: number };
  limits: { purine: number; salt: number; sugar: number };
  hour: number;
  /** Which meal it is for (absent counts as dinner), and the hour it should be eaten by. */
  meal: 'breakfast' | 'lunch' | 'dinner' | 'meal';
  eatByHour: number;
  /** The user set the calories (and maybe protein) wanted for this meal: the figures are targets to land within ±10% of. */
  exact: boolean;
  proteinExact: boolean;
  /** Never more calories than `budgetKcal`. */
  strictKcal: boolean;
  favorites: string[];
}

/** The request as a clean object, or null when it is unusable (no budget figure or hour). */
export function cleanDinnerRequest(raw: unknown): DinnerRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const budgetKcal = bounded(r.budgetKcal, 0, 10000);
  const hour = bounded(r.hour, 0, 23);
  if (budgetKcal === undefined || hour === undefined) return null;
  const num = (v: unknown, max: number) => bounded(v, 0, max) ?? 0;
  const head = (v: unknown) => bounded(v, -100000, 100000) ?? 0;
  return {
    budgetKcal,
    proteinLeftG: num(r.proteinLeftG, 1000),
    headroom: { purine: head(r.headroom?.purine), salt: head(r.headroom?.salt), sugar: head(r.headroom?.sugar) },
    limits: { purine: num(r.limits?.purine, 20000), salt: num(r.limits?.salt, 200), sugar: num(r.limits?.sugar, 1000) },
    hour,
    meal: MEALS.includes(r.meal) ? r.meal : 'dinner',
    eatByHour: bounded(r.eatByHour, 0, 24) ?? Math.min(24, hour + 3),
    exact: r.exact === true,
    proteinExact: r.proteinExact === true,
    strictKcal: r.strictKcal === true,
    favorites: (Array.isArray(r.favorites) ? r.favorites : []).map((f: unknown) => cleanName(f, 60)).filter(Boolean).slice(0, 8),
  };
}
