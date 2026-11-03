import { acceptDinner, type DinnerBrief, type DinnerIdea } from '../ai/dinner';
import { fold } from '../food/search';
import { matchFilters, purineWarning, type CookbookFilters } from './filters';
import { ideaFromRecipe, type CookbookRecipe } from './recipes';

// The cook book list: search (dish name and ingredients, accent-insensitive), quick filters and sort. Pure, unit-tested.

export const SORT_IDS = ['newest', 'cooked', 'rating', 'kcal'] as const;
export type SortId = (typeof SORT_IDS)[number];
export const QUICK_IDS = ['fits', 'lowPurine', 'quick', 'rated'] as const;
export type QuickId = (typeof QUICK_IDS)[number];

/** A dish takes at most this many minutes to count as quick. */
export const QUICK_MINUTES = 20;

/** Does the dish match every word typed, in its name or its ingredients (accents and case ignored)? */
export function matchesSearch(r: Pick<CookbookRecipe, 'name' | 'ingredients'>, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold([r.name, ...(r.ingredients ?? []).map((i) => i.name)].join(' '));
  return words.every((w) => text.includes(w));
}

const quickTest: Record<QuickId, (r: CookbookRecipe, brief: DinnerBrief | null) => boolean> = {
  fits: (r, brief) => !!brief && acceptDinner(brief, r),
  lowPurine: (r) => !purineWarning(ideaFromRecipe(r)),
  quick: (r) => typeof r.minutes === 'number' && r.minutes <= QUICK_MINUTES,
  rated: (r) => (r.rating ?? 0) > 0,
};

const byNewest = (a: CookbookRecipe, b: CookbookRecipe) => (a.createdAtISO < b.createdAtISO ? 1 : a.createdAtISO > b.createdAtISO ? -1 : 0);
const SORTS: Record<SortId, (a: CookbookRecipe, b: CookbookRecipe) => number> = {
  newest: byNewest,
  cooked: (a, b) => (b.cookedCount ?? 0) - (a.cookedCount ?? 0) || (b.rating ?? 0) - (a.rating ?? 0) || byNewest(a, b),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.cookedCount ?? 0) - (a.cookedCount ?? 0) || byNewest(a, b),
  kcal: (a, b) => a.calories - b.calories || byNewest(a, b),
};

/** The dishes to show: matching the search and every quick filter chosen, in the order chosen. */
export function browseCookbook(book: CookbookRecipe[], opts: { query?: string; quick?: QuickId[]; sort?: SortId; brief?: DinnerBrief | null }): CookbookRecipe[] {
  const quick = opts.quick ?? [];
  const brief = opts.brief ?? null;
  return book
    .filter((r) => matchesSearch(r, opts.query ?? '') && quick.every((q) => quickTest[q](r, brief)))
    .sort(SORTS[opts.sort ?? 'newest']);
}

/** The cook book grid with the filter sheet's filters: the dishes matching them (best match first, then in the order given) and the
 *  rest. Nothing chosen (or only ingredients to avoid): every dish not using an avoided one is a hit. */
export function splitByFilters(book: CookbookRecipe[], filters: CookbookFilters): { hits: CookbookRecipe[]; misses: CookbookRecipe[] } {
  const any = filters.occasions.length + filters.cravings.length + filters.types.length + filters.have.length > 0;
  const scored: { r: CookbookRecipe; score: number; i: number }[] = [];
  const misses: CookbookRecipe[] = [];
  book.forEach((r, i) => {
    const m = matchFilters(ideaFromRecipe(r), filters);
    if (!m || (any && m.score === 0)) misses.push(r);
    else scored.push({ r, score: m.score, i });
  });
  return { hits: scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.r), misses };
}

/** The one badge of a dish card: "Purine cao" first (everyday dishes), else "Vừa" when it fits the next meal, else "+N" kcal over it;
 *  none on a cheat day or without a meal to check against. */
export type DishBadge = { kind: 'purine' } | { kind: 'fits' } | { kind: 'over'; kcal: number } | null;
export function dishBadge(idea: DinnerIdea, brief: DinnerBrief | null, cheat = false): DishBadge {
  if (cheat || idea.cheat) return null;
  if (purineWarning(idea)) return { kind: 'purine' };
  if (!brief) return null;
  if (acceptDinner(brief, idea)) return { kind: 'fits' };
  const over = Math.round(idea.calories - brief.budgetKcal);
  return over > 0 ? { kind: 'over', kcal: over } : null;
}
