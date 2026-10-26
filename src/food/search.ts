import type { FoodEntry, FoodGroup } from './types';

/** Lower-case without Vietnamese diacritics, so "ga" finds "gà" and "dau phu" finds "đậu phụ". */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** Foods whose name contains every word of the query (accent-insensitive). Names that start with the query come first,
 *  then the rest in table order. An empty query returns everything (optionally narrowed to one group). */
export function searchFoods(foods: FoodEntry[], query: string, group: FoodGroup | null = null): FoodEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const pool = group ? foods.filter((f) => f.group === group) : foods;
  if (words.length === 0) return pool;
  const folded = (f: FoodEntry) => fold(f.name);
  const hits = pool.filter((f) => {
    const name = folded(f);
    return words.every((w) => name.includes(w));
  });
  const q = words.join(' ');
  const starts = hits.filter((f) => folded(f).startsWith(q));
  return [...starts, ...hits.filter((f) => !starts.includes(f))];
}
