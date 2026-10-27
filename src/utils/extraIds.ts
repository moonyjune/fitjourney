import type { DailyNutritionLog } from '../types';

let last = 0;

/** A new id for a logged food, never equal to one already in use: the time in ms, moved up when two foods are logged within the same ms
 *  (a meal saved as several foods) or when the id is taken. Every delete and edit of a food finds it by this id. */
export function newExtraId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  let n = Math.max(Date.now(), last + 1);
  while (used.has(String(n))) n += 1;
  last = n;
  return String(n);
}

/** The items with every repeated id made unique (the first keeps its id; later ones get "<id>-2", "<id>-3"...). `changed` says whether anything moved.
 *  Older saves could give two foods one id, so deleting or editing either one changed both. */
export function uniqueExtraIds<T extends { id: string }>(items: T[]): { items: T[]; changed: boolean } {
  const seen = new Set(items.map((i) => i.id));
  const used = new Set<string>();
  let changed = false;
  const out = items.map((item) => {
    if (!used.has(item.id)) {
      used.add(item.id);
      return item;
    }
    let k = 2;
    while (seen.has(`${item.id}-${k}`) || used.has(`${item.id}-${k}`)) k += 1;
    const id = `${item.id}-${k}`;
    used.add(id);
    changed = true;
    return { ...item, id };
  });
  return { items: changed ? out : items, changed };
}

/** The log with its foods' ids made unique; the same object when there was nothing to fix. */
export function healLog(log: DailyNutritionLog): DailyNutritionLog {
  const { items, changed } = uniqueExtraIds(log.extraItems ?? []);
  return changed ? { ...log, extraItems: items } : log;
}
