import { GAVE_IN_LOG_MS, gaveInByLog } from '../../supabase/functions/_shared/temptLearn';
import type { PendingInteraction } from '../store/useTemptationStore';
import type { DailyNutritionLog } from '../types';
import { toDateKey } from '../utils/date';

// 1.7: a temptation the player said no to (or closed) but then logged a matching food within ~2 h counts as "gave in" for the boss's
// learning (the game's record and XP are not touched). Pure: the store and the request are passed in.

/** The records that the food log now shows as eaten after all, and the pending list still worth watching. */
export function reconcileLogged(
  pending: PendingInteraction[],
  logs: Record<string, DailyNutritionLog>,
  now: Date = new Date()
): { eaten: string[]; keep: PendingInteraction[] } {
  const eaten: string[] = [];
  const keep: PendingInteraction[] = [];
  const days = [toDateKey(now), toDateKey(new Date(now.getTime() - 86_400_000))];
  const foods = days.flatMap((d) => (logs[d]?.extraItems ?? []).map((i) => ({ name: i.name, atISO: i.loggedAtISO })));
  for (const p of pending) {
    if (p.outcome === 'gave_in' || p.outcome === 'gave_in_logged' || p.outcome === 'practice') continue;
    if (gaveInByLog({ shownAt: p.shownAt, name: p.name, cat: 'other' }, foods)) {
      eaten.push(p.id);
      continue;
    }
    // Still inside the window: watched again later.
    if (now.getTime() - Date.parse(p.shownAt) <= GAVE_IN_LOG_MS) keep.push(p);
  }
  return { eaten, keep };
}
