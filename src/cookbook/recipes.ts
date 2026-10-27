import { acceptDinner, type DinnerBrief, type DinnerIdea } from '../ai/dinner';
import { foodKey } from '../food/remember';

export interface RecipeIngredient {
  name: string;
  quantity: string;
}

/** What a recipe adds to a dish's name and figures: how to make it. Everything here is optional (a dish from the food database has none until one is asked for). */
export interface RecipeDetails {
  emoji?: string;
  minutes?: number;
  /** 1 (very easy) to 5 (hard). */
  difficulty?: number;
  ingredients?: RecipeIngredient[];
  steps?: string[];
  equipment?: string[];
}

/** A dish kept in the cook book: the figures of one portion, how to make it, and the user's own rating. */
export interface CookbookRecipe extends RecipeDetails {
  /** `recipeKey(name)`: the same dish typed again is the same entry. */
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
  /** The portion the figures are for ("1 chén cơm + 150 g cá"). */
  amount?: string;
  /** The AI's one-line note on why it fits / how to get it. */
  how?: string;
  source: 'ai' | 'db' | 'manual';
  /** The user's stars, 1 to 5; 0 / absent = not rated. */
  rating?: number;
  /** Photo of the dish as the user made it (kept on this device only). */
  photoUri?: string;
  cookedCount?: number;
  createdAtISO: string;
}

export const recipeKey = (name: string): string => foodKey(name);

const MAX_INGREDIENTS = 25;
const MAX_STEPS = 20;
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The recipe part of an AI answer reduced to what is usable: short texts, at most 25 ingredients and 20 steps, a difficulty of 1-5, minutes up to 600. */
export function cleanRecipeDetails(raw: unknown): RecipeDetails {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: RecipeDetails = {};
  const emoji = text(o.emoji, 8);
  if (emoji) out.emoji = emoji;
  const minutes = typeof o.minutes === 'number' ? o.minutes : typeof o.durationMinutes === 'number' ? o.durationMinutes : NaN;
  if (Number.isFinite(minutes) && minutes > 0 && minutes <= 600) out.minutes = Math.round(minutes);
  if (typeof o.difficulty === 'number' && Number.isFinite(o.difficulty)) out.difficulty = Math.max(1, Math.min(5, Math.round(o.difficulty)));
  const ingredients = (Array.isArray(o.ingredients) ? o.ingredients : [])
    .map((i) => ({ name: text((i as Record<string, unknown>)?.name, 80), quantity: text((i as Record<string, unknown>)?.quantity, 40) }))
    .filter((i) => i.name)
    .slice(0, MAX_INGREDIENTS);
  if (ingredients.length > 0) out.ingredients = ingredients;
  const steps = (Array.isArray(o.steps) ? o.steps : []).map((s) => text(s, 400)).filter(Boolean).slice(0, MAX_STEPS);
  if (steps.length > 0) out.steps = steps;
  const equipment = (Array.isArray(o.equipment) ? o.equipment : []).map((s) => text(s, 40)).filter(Boolean).slice(0, 5);
  if (equipment.length > 0) out.equipment = equipment;
  return out;
}

/** A dish as it goes into the cook book, from an idea shown to the user. */
export function recipeFromIdea(idea: DinnerIdea, now: Date = new Date()): CookbookRecipe {
  const r: CookbookRecipe = {
    id: recipeKey(idea.name),
    name: idea.name,
    calories: idea.calories,
    proteinG: idea.proteinG,
    purineMg: idea.purineMg,
    saltG: idea.saltG,
    sugarG: idea.sugarG,
    source: idea.source === 'ai' ? 'ai' : idea.source === 'db' ? 'db' : 'manual',
    createdAtISO: now.toISOString(),
    ...idea.recipe,
  };
  if (idea.amount) r.amount = idea.amount;
  if (idea.how) r.how = idea.how;
  return r;
}

/** A cook book dish as an idea for a meal. */
export function ideaFromRecipe(r: CookbookRecipe): DinnerIdea {
  const idea: DinnerIdea = { name: r.name, calories: r.calories, proteinG: r.proteinG, purineMg: r.purineMg, saltG: r.saltG, sugarG: r.sugarG, source: 'book' };
  if (r.amount) idea.amount = r.amount;
  if (r.how) idea.how = r.how;
  const { emoji, minutes, difficulty, ingredients, steps, equipment } = r;
  idea.recipe = { emoji, minutes, difficulty, ingredients, steps, equipment };
  return idea;
}

/** Adds a dish to the cook book, or fills in the one already there: what the user set (rating, photo, count) stays, details already known stay,
 *  details that were missing are taken from the new one. */
export function mergeRecipe(existing: CookbookRecipe | undefined, incoming: CookbookRecipe): CookbookRecipe {
  if (!existing) return incoming;
  return {
    ...incoming,
    ...existing,
    emoji: existing.emoji ?? incoming.emoji,
    minutes: existing.minutes ?? incoming.minutes,
    difficulty: existing.difficulty ?? incoming.difficulty,
    ingredients: existing.ingredients?.length ? existing.ingredients : incoming.ingredients,
    steps: existing.steps?.length ? existing.steps : incoming.steps,
    equipment: existing.equipment?.length ? existing.equipment : incoming.equipment,
    how: existing.how ?? incoming.how,
    amount: existing.amount ?? incoming.amount,
  };
}

/** Dishes of the cook book that fit what is left for a meal (the same rule every idea must pass), the best rated and most cooked first. */
export function recipesFitting(book: CookbookRecipe[], brief: DinnerBrief, limit = 3): CookbookRecipe[] {
  return book
    .filter((r) => acceptDinner(brief, r))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.cookedCount ?? 0) - (a.cookedCount ?? 0) || (a.createdAtISO < b.createdAtISO ? 1 : -1))
    .slice(0, limit);
}

/** Cook book entries read back from the cloud: well-formed ones only, at most 300; the device's photo path never comes from there. */
export function cleanCookbook(raw: unknown): CookbookRecipe[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { recipes?: unknown }).recipes) ? (raw as { recipes: unknown[] }).recipes : [];
  const out: CookbookRecipe[] = [];
  const seen = new Set<string>();
  const n = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  for (const entry of list) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = text(o.name, 100);
    const calories = n(o.calories, 5000);
    const proteinG = n(o.proteinG, 500);
    const id = recipeKey(name);
    if (!name || !id || seen.has(id) || calories === null || proteinG === null) continue;
    seen.add(id);
    const r: CookbookRecipe = {
      id,
      name,
      calories: Math.round(calories),
      proteinG: Math.round(proteinG * 10) / 10,
      purineMg: Math.round(n(o.purineMg, 20000) ?? 0),
      saltG: Math.round((n(o.saltG, 200) ?? 0) * 10) / 10,
      sugarG: Math.round((n(o.sugarG, 1000) ?? 0) * 10) / 10,
      source: o.source === 'db' || o.source === 'manual' ? o.source : 'ai',
      createdAtISO: typeof o.createdAtISO === 'string' && !Number.isNaN(Date.parse(o.createdAtISO)) ? o.createdAtISO : new Date(0).toISOString(),
      ...cleanRecipeDetails(o),
    };
    const amount = text(o.amount, 120);
    if (amount) r.amount = amount;
    const how = text(o.how, 300);
    if (how) r.how = how;
    if (typeof o.rating === 'number' && o.rating >= 1 && o.rating <= 5) r.rating = Math.round(o.rating);
    if (typeof o.cookedCount === 'number' && o.cookedCount > 0 && o.cookedCount < 100000) r.cookedCount = Math.round(o.cookedCount);
    out.push(r);
    if (out.length === 300) break;
  }
  return out;
}

/** The cook book as it is sent to the cloud: without the device-only photo path. */
export function cookbookForCloud(book: CookbookRecipe[]): { recipes: Omit<CookbookRecipe, 'photoUri'>[] } {
  return { recipes: book.map(({ photoUri: _p, ...rest }) => rest) };
}

const STEP_ICONS: [RegExp, string][] = [
  [/rửa|ngâm|sơ chế|làm sạch/i, '🚿'],
  [/thái|cắt|băm|xắt|bào|gọt|lọc|phi lê/i, '🔪'],
  [/ướp|tẩm|nêm|gia vị|muối|tiêu|nước mắm/i, '🧂'],
  [/trộn|khuấy|đánh|nhào|bóp/i, '🥣'],
  [/luộc|hấp|nấu|ninh|hầm|sôi|canh/i, '🍲'],
  [/chiên|áp chảo|xào|rán|phi|áp/i, '🍳'],
  [/nướng|lò|quay/i, '🔥'],
  [/dọn|bày|ăn|thưởng thức|múc|rắc/i, '🍽️'],
];

/** An emoji for a cooking step, from the verbs in it. */
export function stepIcon(step: string): string {
  return STEP_ICONS.find(([re]) => re.test(step))?.[1] ?? '👩‍🍳';
}
