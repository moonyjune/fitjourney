import { foodKey } from '../food/remember';
import { useNutritionStore } from '../store/useNutritionStore';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';

/** How far back the user's own log is read for taste, and how many names are sent each way. */
export const TASTE_DAYS = 30;
const MAX_FAVORITES = 8;
const MAX_DISLIKES = 5;

export interface TasteProfile {
  /** Foods the user logs most often (their actual taste), most frequent first. */
  favorites: string[];
  /** Foods they flagged as junk. */
  dislikes: string[];
}

/** A short, de-duplicated picture of what the user eats, read from the last 30 days of their own log, so recipe
 *  suggestions fit their taste. Names only: no amounts, dates, photos or ids. A name keeps the spelling used most. */
export function buildTasteProfile(now: Date = new Date()): TasteProfile {
  const logs = useNutritionStore.getState().logs;
  const since = toDateKey(addDays(now, -TASTE_DAYS));
  const eaten = new Map<string, { count: number; spellings: Map<string, number> }>();
  const junk = new Map<string, string>();
  for (const [dateKey, log] of Object.entries(logs)) {
    if (dateKey < since) continue;
    for (const item of log.extraItems ?? []) {
      const name = item.name.trim();
      const key = foodKey(name);
      if (!key) continue;
      if (item.junk) {
        if (!junk.has(key)) junk.set(key, name);
        continue;
      }
      const entry = eaten.get(key) ?? { count: 0, spellings: new Map() };
      entry.count += 1;
      entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
      eaten.set(key, entry);
    }
  }
  const favorites = [...eaten.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FAVORITES)
    .map((e) => [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return { favorites, dislikes: [...junk.values()].slice(0, MAX_DISLIKES) };
}
