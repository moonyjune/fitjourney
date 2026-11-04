import { DEFICIT_LEVEL_COLOR, deficitLevel, type DeficitLevel } from './deficitLevel';
import type { GameKey } from './strings';
import type { DayEvaluation, DayMeal } from './missions';

/** The deficit a screen shows for a day, so every screen reads a day the same way:
 *  - nothing logged (or a cheat day): no number;
 *  - a day still being eaten into (today, meals to come): the end-of-day estimate, marked `projected`;
 *  - a settled day with a meal not logged: the real figure, marked `incomplete` (shown without the level colours). */
export interface ShownDeficit {
  kcal: number | null;
  projected: boolean;
  incomplete: boolean;
}

export function shownDeficit(day: Pick<DayEvaluation, 'deficitKcal' | 'settled' | 'projectedDeficitKcal' | 'missingMeals'>): ShownDeficit {
  if (day.deficitKcal == null) return { kcal: null, projected: false, incomplete: false };
  if (!day.settled) return { kcal: day.projectedDeficitKcal, projected: true, incomplete: false };
  return { kcal: day.deficitKcal, projected: false, incomplete: day.missingMeals.length > 0 };
}

/** How a calendar draws a day (Journal › Tháng and the date sheet read it from here, so both colour a day the same way):
 *  - `none`: nothing eaten logged, no colour;
 *  - `settled`: the day's level colour as the fill;
 *  - `pending`: today still being eaten into, the end-of-day estimate's level as a faded fill and "~";
 *  - `incomplete`: a settled day with a meal not logged, grey with ⚠ (no level: the figure is too high);
 *  - `cheat`: a cheat day, the cheat colour (no figure). */
export interface DayDeficitMark {
  kind: 'none' | 'settled' | 'pending' | 'incomplete' | 'cheat';
  level: DeficitLevel | null;
  /** The figure shown: the settled deficit, or today's estimate. Null for `none` and `cheat`. */
  kcal: number | null;
  /** The level colour; null when the day has none (`none`, `incomplete`). */
  color: string | null;
}

export interface DayDeficitMarkOptions {
  targetKcal: number;
  tdeeKcal?: number;
  /** A cheat day (the evaluator already says so for the user's own days; a coach's view passes its own list). */
  cheat?: boolean;
}

/** A day's calendar mark, from the day evaluator's reading of it (`shownDeficit`) and the deficit levels (`deficitLevel`). */
export function dayDeficitMark(
  day: Pick<DayEvaluation, 'deficitKcal' | 'settled' | 'projectedDeficitKcal' | 'missingMeals' | 'burnedKcal' | 'cheat'>,
  { targetKcal, tdeeKcal, cheat }: DayDeficitMarkOptions
): DayDeficitMark {
  if (day.cheat || cheat) return { kind: 'cheat', level: 'cheat', kcal: null, color: DEFICIT_LEVEL_COLOR.cheat };
  const shown = shownDeficit(day);
  if (shown.kcal == null) return { kind: 'none', level: null, kcal: null, color: null };
  if (shown.incomplete) return { kind: 'incomplete', level: null, kcal: shown.kcal, color: null };
  const level = deficitLevel(shown.kcal, targetKcal, false, { burnedKcal: day.burnedKcal, tdeeKcal });
  return { kind: shown.projected ? 'pending' : 'settled', level, kcal: shown.kcal, color: level ? DEFICIT_LEVEL_COLOR[level] : null };
}

const KIND_KEY: Record<DayMeal['kind'], GameKey> = {
  breakfast: 'meals.kind.breakfast',
  lunch: 'meals.kind.lunch',
  dinner: 'meals.kind.dinner',
  meal: 'meals.kind.meal',
};

/** "Bữa trưa, Bữa tối" (a fasting plan's own names when it has them). */
export function mealNames(meals: DayMeal[], g: (key: GameKey) => string): string {
  return meals.map((m) => m.label ?? g(KIND_KEY[m.kind])).join(', ');
}
