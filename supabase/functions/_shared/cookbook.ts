// Rows for the shared cook book (table cookbook_recipes, readable by every signed-in user) from the meal ideas the AI returned:
// bounded numbers and short texts only. The table dedupes on the normalised name (lower case, single spaces), so the same dish
// proposed again is not stored twice. Pure (no Deno use), unit-tested in jest; the app builds its rows with the same function.

export interface CookbookRow {
  name: string;
  description: string | null;
  meal: string | null;
  calories: number;
  protein_g: number;
  purine_mg: number;
  salt_g: number;
  sugar_g: number;
  emoji: string | null;
  minutes: number | null;
  difficulty: number | null;
  equipment: string[];
  ingredients: { name: string; quantity: string }[];
  steps: string[];
  created_by: string;
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'meal'];

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The name as the table dedupes it (the same expression as the `name_key` column). */
export const cookbookNameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** One idea (AI tool output or the app's own idea object) as a row, or null when it has no usable name or calories. */
export function cookbookRow(raw: unknown, meal: unknown, userId: string): CookbookRow | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const recipe = (o.recipe && typeof o.recipe === 'object' ? o.recipe : o) as Record<string, unknown>;
  const name = text(o.name, 100);
  const calories = num(o.calories, 5000);
  if (!name || calories === null) return null;
  const minutes = num(recipe.minutes, 600);
  const difficulty = num(recipe.difficulty, 5);
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .map((i) => ({ name: text((i as Record<string, unknown>)?.name, 80), quantity: text((i as Record<string, unknown>)?.quantity, 40) }))
    .filter((i) => i.name)
    .slice(0, 25);
  return {
    name,
    description: text(o.how, 300) || null,
    meal: typeof meal === 'string' && MEALS.includes(meal) ? meal : null,
    calories: Math.round(calories),
    protein_g: r1(num(o.proteinG, 500) ?? 0),
    purine_mg: Math.round(num(o.purineMg, 20000) ?? 0),
    salt_g: r1(num(o.saltG, 200) ?? 0),
    sugar_g: r1(num(o.sugarG, 1000) ?? 0),
    emoji: text(recipe.emoji, 8) || null,
    minutes: minutes !== null && minutes > 0 ? Math.round(minutes) : null,
    difficulty: difficulty !== null && difficulty >= 1 ? Math.round(difficulty) : null,
    equipment: (Array.isArray(recipe.equipment) ? recipe.equipment : []).map((s) => text(s, 40)).filter(Boolean).slice(0, 5),
    ingredients,
    steps: (Array.isArray(recipe.steps) ? recipe.steps : []).map((s) => text(s, 400)).filter(Boolean).slice(0, 20),
    created_by: userId,
  };
}

/** Rows for a list of ideas, one per normalised name. */
export function cookbookRows(list: unknown, meal: unknown, userId: string): CookbookRow[] {
  const seen = new Set<string>();
  const out: CookbookRow[] = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const row = cookbookRow(entry, meal, userId);
    if (!row || seen.has(cookbookNameKey(row.name))) continue;
    seen.add(cookbookNameKey(row.name));
    out.push(row);
  }
  return out;
}
