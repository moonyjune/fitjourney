import { acceptDinner, type DinnerBrief, type DinnerIdea } from '../ai/dinner';
import { foodKey } from '../food/remember';
import { fold } from '../food/search';
import type { FoodEntry } from '../food/types';
import {
  CRAVING_IDS,
  DISH_TYPE_IDS,
  OCCASION_IDS,
  type CravingId,
  type DinnerFilters,
  type DishTypeId,
  type OccasionId,
} from '../../supabase/functions/_shared/dinner';
import { ideaFromRecipe, type CookbookRecipe } from './recipes';
import { ideaFromSharedRow } from './shared';

// The cook book's "what do I feel like" finder: the user picks occasions, cravings, kinds of dish and ingredients; the dishes they
// already have (and the shared cook book) are ranked by how many of those they match, with no AI. The same filters go to the AI
// (suggest-dinner) for new ideas. The ids and their words for the prompt live in supabase/functions/_shared/dinner.ts.

export { CRAVING_IDS, DISH_TYPE_IDS, OCCASION_IDS };
export type { CravingId, DishTypeId, OccasionId };
export type CookbookFilters = DinnerFilters;

export const EMPTY_FILTERS: CookbookFilters = { occasions: [], cravings: [], types: [], have: [], avoid: [] };
export const MAX_INGREDIENTS_PICKED = 10;
/** A snack or dessert takes at most this much of what is left; a drink or coffee alone, `DRINK_KCAL`. */
export const SNACK_KCAL = 250;
export const DRINK_KCAL = 150;
/** At or above this much purine in one portion, a dish is flagged for the user's purine limit. */
export const HIGH_PURINE_MG = 300;
export const MAIN_MEALS: OccasionId[] = ['breakfast', 'lunch', 'dinner'];
const RESULTS = 10;

export const filtersEmpty = (f: CookbookFilters): boolean => f.occasions.length + f.cravings.length + f.types.length + f.have.length + f.avoid.length === 0;

/** The filters as they are stored / sent: known ids only, ingredient names trimmed and one per name, at most 10 each way. */
export function cleanFilters(raw: unknown): CookbookFilters {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? allowed.filter((id) => v.includes(id)) : []);
  const names = (v: unknown): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of Array.isArray(v) ? v : []) {
      const name = typeof n === 'string' ? n.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
      const key = foodKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length === MAX_INGREDIENTS_PICKED) break;
    }
    return out;
  };
  return { occasions: ids(r.occasions, OCCASION_IDS), cravings: ids(r.cravings, CRAVING_IDS), types: ids(r.types, DISH_TYPE_IDS), have: names(r.have), avoid: names(r.avoid) };
}

/** True when only snacks, drinks, coffee or desserts are asked for (no main meal). */
export const isSnackOnly = (f: CookbookFilters): boolean => f.occasions.length > 0 && f.occasions.every((o) => !MAIN_MEALS.includes(o));

// ----- matching (no AI): words in the dish's name, and its figures -----

const OCCASION_WORDS: Record<OccasionId, string[]> = {
  breakfast: ['banh mi', 'xoi', 'chao', 'pho', 'bun', 'yen mach', 'trung', 'sua chua', 'ngu coc', 'banh cuon', 'sandwich', 'oat', 'granola'],
  lunch: ['com', 'canh', 'bun', 'pho', 'mi', 'mien', 'hu tieu', 'salad'],
  dinner: ['com', 'canh', 'hap', 'luoc', 'kho', 'salad', 'ap chao', 'nuong', 'rau'],
  snack: ['hat', 'trai cay', 'sua chua', 'khoai', 'bap', 'ngo', 'snack', 'rong bien', 'dua leo', 'tao', 'chuoi', 'hanh nhan', 'oc cho', 'dau phong', 'granola'],
  drink: ['nuoc ep', 'nuoc chanh', 'nuoc dua', 'nuoc cam', 'sinh to', 'tra', 'sua', 'smoothie', 'ca phe', 'cafe', 'coffee', 'soda', 'kombucha', 'detox'],
  coffee: ['ca phe', 'cafe', 'coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'bac xiu'],
  dessert: ['che', 'flan', 'rau cau', 'thach', 'kem', 'sua chua', 'pudding', 'trai cay', 'panna cotta', 'banh'],
};
const TYPE_WORDS: Record<DishTypeId, string[]> = {
  soup: ['canh', 'sup', 'lau', 'chao', 'ham', 'nuoc leo'],
  rice: ['com'],
  noodle: ['bun', 'pho', 'mi', 'mien', 'hu tieu', 'banh canh', 'banh da', 'nui', 'spaghetti', 'my'],
  salad: ['salad', 'goi', 'nom'],
  grilled: ['nuong', 'ap chao', 'quay'],
  steamed: ['hap', 'luoc'],
  smoothie: ['sinh to', 'nuoc ep', 'smoothie'],
  tea: ['tra'],
  cake: ['banh'],
};
const CRAVING_WORDS: Record<CravingId, string[]> = {
  sweet: ['ngot', 'che', 'mat ong', 'chuoi', 'xoai', 'trai cay', 'flan', 'kem', 'sinh to'],
  salty: ['kho', 'rim', 'man', 'rang muoi', 'mam'],
  sourSpicy: ['chua', 'cay', 'ot', 'me', 'chanh', 'goi', 'nom', 'kim chi', 'tom yum', 'thai', 'sa te'],
  crunchy: ['gion', 'chien', 'rang', 'hat', 'goi', 'nom', 'salad', 'rau song', 'bap'],
  fresh: ['salad', 'goi', 'nom', 'rau', 'luoc', 'hap', 'mat', 'dua leo', 'canh chua', 'sinh to', 'tra'],
  warm: ['canh', 'sup', 'chao', 'lau', 'pho', 'bun', 'hu tieu', 'ham', 'nong', 'ninh', 'mi', 'mien', 'kho'],
  highProtein: [],
  lowCal: [],
};
/** Organ meat, small oily fish, shellfish and seafood, long-simmered bone broth, beer and spirits: high in purine. */
const HIGH_PURINE_WORDS = [
  'noi tang', 'gan ga', 'gan heo', 'gan lon', 'gan bo', 'pate', 'long lon', 'long heo', 'long ga', 'long bo', 'tim heo', 'tim lon', 'tim ga', 'cat heo', 'cat lon', 'bau duc',
  'doi', 'tiet canh', 'oc heo', 'oc lon', 'ca com', 'ca moi', 'ca trich', 'ca thu', 'tom', 'cua', 'ghe', 'muc', 'bach tuoc', 'ngheu', 'so diep', 'so huyet', 'hau', 'oc', 'hai san',
  'nuoc dung xuong', 'nuoc ham xuong', 'bia', 'ruou',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does `text` (already folded) contain `word` as whole words? */
export function hasWord(text: string, word: string): boolean {
  const w = fold(word).trim();
  return !!w && new RegExp(`(^|[^a-z0-9])${escape(w)}($|[^a-z0-9])`).test(text);
}
const anyWord = (text: string, words: string[]) => words.some((w) => hasWord(text, w));

const nameText = (idea: DinnerIdea) => fold(idea.name);
const fullText = (idea: DinnerIdea) => fold([idea.name, ...(idea.recipe?.ingredients ?? []).map((i) => i.name)].join(' | '));

function cravingMatches(id: CravingId, idea: DinnerIdea, text: string): boolean {
  switch (id) {
    case 'sweet':
      return idea.sugarG >= 8 || anyWord(text, CRAVING_WORDS.sweet);
    case 'salty':
      return idea.saltG >= 2 || anyWord(text, CRAVING_WORDS.salty);
    case 'highProtein':
      return idea.proteinG >= 25 || (idea.calories > 0 && (idea.proteinG * 4) / idea.calories >= 0.3);
    case 'lowCal':
      return idea.calories <= 350;
    case 'fresh':
      return anyWord(text, CRAVING_WORDS.fresh);
    default:
      return anyWord(text, CRAVING_WORDS[id]);
  }
}

/** A dish flagged for the purine limit: a lot of purine in one portion, or an ingredient known to be high in it. ("óc chó" is walnut.) */
export function purineWarning(idea: DinnerIdea): boolean {
  if (idea.purineMg >= HIGH_PURINE_MG) return true;
  const text = fullText(idea).replace(/(^|[^a-z0-9])oc cho($|[^a-z0-9])/g, ' ');
  return anyWord(text, HIGH_PURINE_WORDS);
}

/** Does the dish use one of the ingredients to avoid (in its name or its ingredient list)? */
export const usesAvoided = (idea: DinnerIdea, filters: CookbookFilters): boolean => anyWord(fullText(idea), filters.avoid);

export type FilterTag = { group: 'occasion'; id: OccasionId } | { group: 'craving'; id: CravingId } | { group: 'type'; id: DishTypeId } | { group: 'have'; name: string };

/** Which of the filters a dish matches (an ingredient to use counts double), or null when it uses an ingredient to avoid or none of
 *  the ingredients to use. `meal` is the shared cook book's own label for the dish (breakfast / lunch / dinner), when known. */
export function matchFilters(idea: DinnerIdea, filters: CookbookFilters, meal?: string | null): { score: number; tags: FilterTag[] } | null {
  if (usesAvoided(idea, filters)) return null;
  const name = nameText(idea);
  const full = fullText(idea);
  const tags: FilterTag[] = [];
  for (const id of filters.occasions) if (meal === id || anyWord(name, OCCASION_WORDS[id])) tags.push({ group: 'occasion', id });
  for (const id of filters.cravings) if (cravingMatches(id, idea, name)) tags.push({ group: 'craving', id });
  const noBread = name.replace(/banh mi/g, ' '); // "bánh mì" is bread, not noodles ("mì")
  for (const id of filters.types) if (anyWord(id === 'noodle' ? noBread : name, TYPE_WORDS[id])) tags.push({ group: 'type', id });
  const have = filters.have.filter((h) => hasWord(full, h));
  if (filters.have.length > 0 && have.length === 0) return null;
  for (const h of have) tags.push({ group: 'have', name: h });
  return { score: tags.length + have.length, tags };
}

export interface RankInput {
  idea: DinnerIdea;
  meal?: string | null;
  rating?: number;
  cooked?: number;
}
export interface RankedIdea {
  idea: DinnerIdea;
  score: number;
  tags: FilterTag[];
  /** Fits what is left today for this kind of meal (`acceptDinner`). */
  fits: boolean;
  purineWarning: boolean;
}

/** Dishes ranked by the filters: those matching nothing chosen (when something to match is chosen), using an ingredient to avoid or none of
 *  the ingredients to use are left out; then the most matches first, those that fit what is left today next, then the best rated and
 *  most cooked. One per name, at most `limit`. */
export function rankByFilters(items: RankInput[], filters: CookbookFilters, brief: DinnerBrief | null, limit = RESULTS): RankedIdea[] {
  // Something to match was chosen (ingredients to avoid alone only take dishes away).
  const any = filters.occasions.length + filters.cravings.length + filters.types.length + filters.have.length > 0;
  const seen = new Set<string>();
  const out: (RankedIdea & { rating: number; cooked: number })[] = [];
  for (const item of items) {
    const key = foodKey(item.idea.name);
    if (!key || seen.has(key)) continue;
    const match = matchFilters(item.idea, filters, item.meal);
    if (!match || (any && match.score === 0)) continue;
    seen.add(key);
    out.push({ idea: item.idea, score: match.score, tags: match.tags, fits: brief ? acceptDinner(brief, item.idea) : true, purineWarning: purineWarning(item.idea), rating: item.rating ?? 0, cooked: item.cooked ?? 0 });
  }
  return out
    .sort((a, b) => b.score - a.score || Number(b.fits) - Number(a.fits) || b.rating - a.rating || b.cooked - a.cooked)
    .slice(0, limit)
    .map(({ rating: _r, cooked: _c, ...rest }) => rest);
}

/** The user's cook book ranked by the filters. */
export const rankCookbook = (book: CookbookRecipe[], filters: CookbookFilters, brief: DinnerBrief | null, limit = RESULTS): RankedIdea[] =>
  rankByFilters(book.map((r) => ({ idea: ideaFromRecipe(r), rating: r.rating, cooked: r.cookedCount })), filters, brief, limit);

/** Rows of the shared cook book ranked by the filters: only dishes that fit what is left today, none of the names to skip, at most 5. */
export function rankShared(rows: unknown[], filters: CookbookFilters, brief: DinnerBrief, skipNames: string[], limit = 5): DinnerIdea[] {
  const skip = new Set(skipNames.map(foodKey));
  const items: RankInput[] = [];
  for (const row of rows) {
    const idea = ideaFromSharedRow(row);
    if (!idea || skip.has(foodKey(idea.name))) continue;
    const meal = (row as { meal?: unknown })?.meal;
    items.push({ idea, meal: typeof meal === 'string' ? meal : null });
  }
  return rankByFilters(items, filters, brief, 300)
    .filter((r) => r.fits)
    .slice(0, limit)
    .map((r) => r.idea);
}

// ----- ingredients to pick from -----

/** Everyday ingredients offered before the user types anything. */
export const COMMON_INGREDIENTS = [
  'Ức gà', 'Trứng', 'Đậu phụ', 'Cá basa', 'Cá hồi', 'Thịt heo nạc', 'Thịt bò', 'Rau cải', 'Bông cải xanh', 'Cà chua', 'Dưa leo', 'Bí đỏ',
  'Bí xanh', 'Khoai lang', 'Nấm', 'Gạo lứt', 'Yến mạch', 'Bún', 'Sữa chua không đường', 'Sữa tươi không đường', 'Chuối', 'Táo', 'Bơ', 'Cà phê',
  'Trà xanh', 'Chanh', 'Gừng', 'Sả',
];

/** Names to pick ingredients from: the everyday list, the ingredients of the user's cook book and the foods of their database. One per name. */
export function ingredientPool(book: CookbookRecipe[], foods: Pick<FoodEntry, 'name'>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const name = raw.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = foodKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  COMMON_INGREDIENTS.forEach(add);
  for (const r of book) for (const i of r.ingredients ?? []) add(i.name);
  for (const f of foods) add(f.name);
  return out;
}

/** Up to `limit` names of the pool containing every word typed (accent-insensitive), those starting with it first, leaving out the chosen ones. */
export function suggestIngredients(pool: string[], query: string, chosen: string[], limit = 8): string[] {
  const taken = new Set(chosen.map(foodKey));
  const words = fold(query).split(/\s+/).filter(Boolean);
  const free = pool.filter((n) => !taken.has(foodKey(n)));
  if (words.length === 0) return free.slice(0, limit);
  const hits = free.filter((n) => words.every((w) => fold(n).includes(w)));
  const q = words.join(' ');
  return [...hits.filter((n) => fold(n).startsWith(q)), ...hits.filter((n) => !fold(n).startsWith(q))].slice(0, limit);
}
