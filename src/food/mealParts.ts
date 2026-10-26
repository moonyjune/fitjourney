import type { ExtraFoodItem, MealPart } from '../types';

export const MAX_PARTS = 12;
const MAX_PART_NAME = 120;
/** A meal is only shown with its parts when they add up to its calories within this share (and at least MIN_SLACK_KCAL). */
const MATCH_SHARE = 0.05;
const MIN_SLACK_KCAL = 10;

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The parts reduced to usable ones: a name, calories and protein in range, optional purine / salt / sugar in range. At most 12.
 *  Anything with fewer than 2 parts is not a breakdown, so it comes back empty. */
export function cleanParts(raw: unknown): MealPart[] {
  if (!Array.isArray(raw)) return [];
  const out: MealPart[] = [];
  for (const entry of raw) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, MAX_PART_NAME) : '';
    const calories = num(o.calories, 5000);
    const proteinG = num(o.proteinG, 500);
    if (!name || calories === null || proteinG === null) continue;
    const part: MealPart = { name, calories: Math.round(calories), proteinG: r1(proteinG) };
    const purine = num(o.purineMg, 20000);
    const salt = num(o.saltG, 200);
    const sugar = num(o.sugarG, 1000);
    if (purine) part.purineMg = Math.round(purine);
    if (salt) part.saltG = r1(salt);
    if (sugar) part.sugarG = r1(sugar);
    out.push(part);
    if (out.length === MAX_PARTS) break;
  }
  return out.length >= 2 ? out : [];
}

export interface PartsTotal {
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
}

/** The sum of a list of parts (what the meal's own figures are when it is saved from them). */
export function sumParts(parts: Pick<MealPart, 'calories' | 'proteinG' | 'purineMg' | 'saltG' | 'sugarG'>[]): PartsTotal {
  const sum = (pick: (p: (typeof parts)[number]) => number) => parts.reduce((s, p) => s + pick(p), 0);
  return {
    calories: Math.round(sum((p) => p.calories)),
    proteinG: r1(sum((p) => p.proteinG)),
    purineMg: Math.round(sum((p) => p.purineMg ?? 0)),
    saltG: Math.round(sum((p) => p.saltG ?? 0) * 100) / 100,
    sugarG: r1(sum((p) => p.sugarG ?? 0)),
  };
}

/** The one description of a meal: the names of its parts in order, joined with ", " ("Yến mạch 30g, Sữa chua 100g, Sữa tươi 50ml"). */
export function joinTitle(names: string[]): string {
  return names.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
}

/** Do the parts still describe the meal: at least 2, and their calories within 5% (10 kcal at least) of the meal's own. When a total
 *  was edited by hand the parts no longer say anything true about it, so they are not shown. */
export function partsMatchTotals(item: Pick<ExtraFoodItem, 'calories' | 'parts'>): boolean {
  const parts = item.parts;
  if (!parts || parts.length < 2) return false;
  const total = parts.reduce((s, p) => s + p.calories, 0);
  return Math.abs(total - item.calories) <= Math.max(MIN_SLACK_KCAL, item.calories * MATCH_SHARE);
}

/** The AI's `components` (calories and protein under the API's own field names) as parts; empty unless there are 2 or more usable ones. */
export function partsFromComponents(raw: unknown): MealPart[] {
  if (!Array.isArray(raw)) return [];
  return cleanParts(
    raw.map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { name: o.name, calories: o.caloriesKcal ?? o.calories, proteinG: o.proteinG, purineMg: o.purineMg, saltG: o.saltG, sugarG: o.sugarG };
    })
  );
}
