import { MAX_DINNER_IDEAS, type DinnerIdea } from '../ai/dinner';
import { foodKey } from '../food/remember';
import { CHEAT_WHERE, type CheatWhere } from '../../supabase/functions/_shared/dinner';
import { cleanPlacesAnswer, type CheatPlacesAnswer } from '../../supabase/functions/_shared/places';
import { purineWarning } from './filters';
import { cleanRecipeDetails, type CookbookRecipe } from './recipes';

// Cheat day: the cook book finder's checkbox lifts the calorie and limit budget for the ideas (any dish, cooked at home or eaten
// out), keeps them in their own part of the cook book, and can look up real places to eat them near the user (suggest-cheat-places).

export { CHEAT_WHERE };
export type { CheatWhere, CheatPlacesAnswer };

/** At or above this much purine in one portion a cheat dish gets the gout warning (the everyday flag is 300 mg). */
export const CHEAT_HIGH_PURINE_MG = 300;

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/** The AI's cheat-day ideas reduced to the usable ones: well-formed, in bounds, no duplicates, no budget check (it is a cheat day),
 *  each marked `cheat` with where it is eaten. At most 3. */
export function cleanCheatIdeas(raw: unknown, where: CheatWhere): DinnerIdea[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown }).options) ? (raw as { options: unknown[] }).options : [];
  const out: DinnerIdea[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
    const calories = num(o.calories, 5000);
    const proteinG = num(o.proteinG, 500);
    const key = foodKey(name);
    if (!name || !key || seen.has(key) || calories === null || proteinG === null) continue;
    seen.add(key);
    const idea: DinnerIdea = {
      name,
      calories: Math.round(calories),
      proteinG: Math.round(proteinG * 10) / 10,
      purineMg: Math.round(num(o.purineMg, 20000) ?? 0),
      saltG: Math.round((num(o.saltG, 200) ?? 0) * 10) / 10,
      sugarG: Math.round((num(o.sugarG, 1000) ?? 0) * 10) / 10,
      source: 'ai',
      cheat: true,
    };
    const w = o.where === 'home' || o.where === 'out' ? o.where : where === 'both' ? undefined : where;
    if (w) idea.where = w;
    const recipe = cleanRecipeDetails(o);
    if (Object.keys(recipe).length > 0) idea.recipe = recipe;
    if (typeof o.how === 'string' && o.how.trim()) idea.how = o.how.trim().slice(0, 300);
    if (typeof o.accuracyPercent === 'number' && Number.isFinite(o.accuracyPercent)) idea.accuracy = Math.max(0, Math.min(100, Math.round(o.accuracyPercent)));
    out.push(idea);
    if (out.length === MAX_DINNER_IDEAS) break;
  }
  return out;
}

/** The cook book split into everyday dishes and cheat-day dishes. */
export function splitCookbook(book: CookbookRecipe[]): { everyday: CookbookRecipe[]; cheat: CookbookRecipe[] } {
  return { everyday: book.filter((r) => !r.cheat), cheat: book.filter((r) => r.cheat) };
}

/** The gout warning of a cheat dish: high purine in one portion or an ingredient known to be high in it. */
export const cheatPurineWarning = (idea: DinnerIdea): boolean => idea.purineMg >= CHEAT_HIGH_PURINE_MG || purineWarning(idea);

/** Which dishes to look up places for: the ones eaten out (or of unknown kind when the user wants both / eating out), at most 3. */
export function dishesToLocate(ideas: DinnerIdea[], where: CheatWhere): string[] {
  if (where === 'home') return [];
  return ideas
    .filter((i) => i.where !== 'home')
    .map((i) => i.name)
    .slice(0, 3);
}

/** A location as it is remembered and sent: one line, at most 80 characters. */
export const cleanLocation = (v: unknown): string => (typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '');

/** A stored or received places answer, checked again (the same rules as on the server, against the URLs its search saw). */
export function recheckPlaces(raw: unknown): CheatPlacesAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const seenUrls = Array.isArray(o.seenUrls) ? o.seenUrls.filter((u): u is string => typeof u === 'string') : null;
  const checkedAtISO = typeof o.checkedAtISO === 'string' && !Number.isNaN(Date.parse(o.checkedAtISO)) ? o.checkedAtISO : new Date().toISOString();
  const today = checkedAtISO.slice(0, 10);
  const searchErrors = Array.isArray(o.searchErrors) ? o.searchErrors.filter((e): e is string => typeof e === 'string') : [];
  const answer = cleanPlacesAnswer(raw, {
    seenUrls,
    today,
    checkedAtISO,
    searches: typeof o.searches === 'number' ? o.searches : 0,
    searchErrors,
    sample: o.sample === true,
  });
  // What the server already dropped still counts (cleaning an answer cleaned before drops nothing more).
  if (typeof o.dropped === 'number' && o.dropped > 0 && o.dropped < 1000) answer.dropped += Math.round(o.dropped);
  return answer;
}
