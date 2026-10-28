import { acceptDinner, MAX_DINNER_IDEAS, type DinnerBrief, type DinnerIdea } from '../ai/dinner';
import { foodKey } from '../food/remember';
import { cleanRecipeDetails } from './recipes';

/** The columns read from the shared cook book (table cookbook_recipes, every signed-in user can read it). */
export const SHARED_COOKBOOK_COLUMNS = 'name, description, meal, calories, protein_g, purine_mg, salt_g, sugar_g, emoji, minutes, difficulty, equipment, ingredients, steps';

const num = (v: unknown, max: number): number | null => {
  const n = typeof v === 'string' ? Number(v) : v; // numeric columns can come back as strings
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/** A row of the shared cook book as a meal idea (source `shared`), or null when it is not usable. */
export function ideaFromSharedRow(raw: unknown): DinnerIdea | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  const calories = num(o.calories, 5000);
  if (!name || calories === null) return null;
  const idea: DinnerIdea = {
    name,
    calories: Math.round(calories),
    proteinG: Math.round((num(o.protein_g, 500) ?? 0) * 10) / 10,
    purineMg: Math.round(num(o.purine_mg, 20000) ?? 0),
    saltG: Math.round((num(o.salt_g, 200) ?? 0) * 10) / 10,
    sugarG: Math.round((num(o.sugar_g, 1000) ?? 0) * 10) / 10,
    source: 'shared',
  };
  const recipe = cleanRecipeDetails(o);
  if (Object.keys(recipe).length > 0) idea.recipe = recipe;
  if (typeof o.description === 'string' && o.description.trim()) idea.how = o.description.trim().slice(0, 300);
  return idea;
}

/** Up to 3 dishes of the shared cook book for a meal: usable rows that pass the meal's own check (`acceptDinner`), not one of the
 *  names to skip (the ideas on screen), one per name. Rows of the same kind of meal come first, the rest keep their order. */
export function pickShared(rows: unknown[], brief: DinnerBrief, skipNames: string[], limit = MAX_DINNER_IDEAS): DinnerIdea[] {
  const skip = new Set(skipNames.map(foodKey));
  const meal = brief.meal ?? 'dinner';
  const ordered = [...rows].sort((a, b) => Number((b as { meal?: unknown })?.meal === meal) - Number((a as { meal?: unknown })?.meal === meal));
  const out: DinnerIdea[] = [];
  for (const row of ordered) {
    const idea = ideaFromSharedRow(row);
    if (!idea || !acceptDinner(brief, idea)) continue;
    const key = foodKey(idea.name);
    if (!key || skip.has(key)) continue;
    skip.add(key);
    out.push(idea);
    if (out.length === limit) break;
  }
  return out;
}

/** The search text as it can go into a PostgREST `ilike` filter: no characters with a meaning there (, . ( ) % * \ : "), single spaces, short. */
export function cleanSearch(q: string): string {
  return q.replace(/[,.()%*\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
