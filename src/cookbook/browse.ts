import { acceptDinner, type DinnerBrief } from '../ai/dinner';
import { fold } from '../food/search';
import { purineWarning } from './filters';
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
