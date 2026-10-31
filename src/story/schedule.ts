import type { ChapterKind } from '../../supabase/functions/_shared/story';
import type { StageBoss } from '../game/stageBosses';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import { weekStartKey } from '../utils/weekKey';

/**
 * Which story chapters are due (Map > Câu chuyện). A chapter is one of:
 *  - a week (Monday to Sunday), due once the week is over and only when something was logged in it, for the weeks since the plan
 *    start but at most the last BACKLOG_WEEKS of them (an old diary does not leave a pile of chapters to write);
 *  - the fall of a stage boss, due from the day of the weigh-in that beat it (bosses beaten without a dated weigh-in, e.g. a start
 *    weight already under the band, have no fight to tell).
 * Chapters are written oldest first, one per tap, so the story reads in order and no AI quota is spent on its own.
 */

export const BACKLOG_WEEKS = 8;

export interface ChapterSpec {
  /** `week:<Monday>` or `boss:<bottom kg of its band>` (stable while the goal changes the boss numbering). */
  id: string;
  kind: ChapterKind;
  /** First and last day the chapter covers (local date keys, inclusive). */
  from: string;
  to: string;
  /** Boss chapter: the boss's index on the journey. */
  bossIndex?: number;
}

export interface ScheduleInput {
  todayKey: string;
  /** Plan start (local date key); null when unknown, then only the backlog window counts. */
  startDateKey: string | null;
  bosses: StageBoss[];
  /** Whether anything (food, a weigh-in, a workout) was logged between two date keys (inclusive). */
  hasData: (from: string, to: string) => boolean;
  /** Ids of chapters already written. */
  written: ReadonlySet<string>;
}

const at = (key: string) => new Date(`${key}T12:00:00`);
const shift = (key: string, days: number) => toDateKey(addDays(at(key), days));

export const weekChapterId = (monday: string) => `week:${monday}`;
export const bossChapterId = (b: Pick<StageBoss, 'toKg'>) => `boss:${b.toKg}`;

/** Every chapter the journey has so far (written or not), in story order: by last day, a boss before the week it fell in. */
export function allChapters(input: Omit<ScheduleInput, 'written'>): ChapterSpec[] {
  const { todayKey, startDateKey, bosses, hasData } = input;
  const out: ChapterSpec[] = [];

  const lastMonday = shift(weekStartKey(at(todayKey)), -7);
  const backlogStart = shift(lastMonday, -7 * (BACKLOG_WEEKS - 1));
  const startMonday = startDateKey ? weekStartKey(at(startDateKey)) : backlogStart;
  for (let monday = startMonday > backlogStart ? startMonday : backlogStart; monday <= lastMonday; monday = shift(monday, 7)) {
    const sunday = shift(monday, 6);
    if (hasData(monday, sunday)) out.push({ id: weekChapterId(monday), kind: 'week', from: monday, to: sunday });
  }

  let prev = startDateKey;
  for (const b of bosses) {
    if (b.status !== 'defeated' || !b.defeatedDateKey) continue;
    const to = b.defeatedDateKey;
    // The fight starts the day after the previous boss fell (or at the plan start); a boss beaten the same day gets that day alone.
    const from = prev && prev < to ? (prev === startDateKey ? prev : shift(prev, 1)) : to;
    if (to <= todayKey) out.push({ id: bossChapterId(b), kind: 'boss', from: from > to ? to : from, to, bossIndex: b.index });
    prev = to;
  }

  return out.sort((a, b) => a.to.localeCompare(b.to) || (a.kind === b.kind ? 0 : a.kind === 'boss' ? -1 : 1));
}

/** The chapters still to write, oldest first. */
export function dueChapters(input: ScheduleInput): ChapterSpec[] {
  return allChapters(input).filter((c) => !input.written.has(c.id));
}
