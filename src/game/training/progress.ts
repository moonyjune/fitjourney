import type { ExerciseId, Level } from './exercises';
import { MAX_LEVEL } from './exercises';

export type Rating = 'easy' | 'medium' | 'hard';

export interface RatingRecord {
  dateISO: string;
  rating: Rating;
}

export interface ExerciseProgress {
  level: Level;
  /** When the level last changed; only ratings given after it count towards the next change. */
  lastChangeISO: string | null;
  ratings: RatingRecord[];
}

export const NEW_PROGRESS: ExerciseProgress = { level: 1, lastChangeISO: null, ratings: [] };

/** An exercise levels up after this many "easy" ratings in a row... */
export const EASY_STREAK_TO_LEVEL_UP = 2;
/** ...and never more than once per this many days. */
export const MIN_DAYS_BETWEEN_LEVEL_UPS = 7;
/** Ratings kept per exercise (only the recent ones matter). */
const KEPT_RATINGS = 8;

const DAY_MS = 86_400_000;

export interface RatingOutcome {
  progress: ExerciseProgress;
  /** `up` — moved to the next level; `ready` — two easy sessions but the weekly cap holds it for now. */
  change: 'up' | 'ready' | 'none';
}

/** Applies one session rating to an exercise's progress.
 *
 *  Rules (from the plan board): 2 easy sessions in a row -> up one level, at most one level per week;
 *  "hard" never moves the level (it simply resets the easy streak), so a bad day can't punish you. */
export function applyRating(progress: ExerciseProgress, rating: Rating, now: Date): RatingOutcome {
  const ratings = [...progress.ratings, { dateISO: now.toISOString(), rating }].slice(-KEPT_RATINGS);
  const since = progress.lastChangeISO;
  const counted = since ? ratings.filter((r) => r.dateISO > since) : ratings;

  let streak = 0;
  for (let i = counted.length - 1; i >= 0 && counted[i].rating === 'easy'; i--) streak++;

  if (streak >= EASY_STREAK_TO_LEVEL_UP && progress.level < MAX_LEVEL) {
    const lastChangeMs = since ? new Date(since).getTime() : -Infinity;
    if (now.getTime() - lastChangeMs >= MIN_DAYS_BETWEEN_LEVEL_UPS * DAY_MS) {
      return {
        progress: { level: (progress.level + 1) as Level, lastChangeISO: now.toISOString(), ratings },
        change: 'up',
      };
    }
    return { progress: { ...progress, ratings }, change: 'ready' };
  }
  return { progress: { ...progress, ratings }, change: 'none' };
}

export function progressFor(map: Partial<Record<ExerciseId, ExerciseProgress>>, id: ExerciseId): ExerciseProgress {
  return map[id] ?? NEW_PROGRESS;
}
