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
