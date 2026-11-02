import type { DailyNutritionLog, ExtraMealTime, MealTemplate } from '../types';
import { eatingEndHour, skipsBreakfast } from '../utils/mealMode';
import { SKIPPED_MEAL_NAME } from '../insights/missing';

/* The meals of a day and which of them are already eaten or still to come: pure helpers shared by the meal suggestions (ai/mealSplit)
 * and the day's evaluation (game/missions), which uses them to tell a deficit still being eaten into from a final one. */

/** What kind of meal a slot is, for the words around it (and the AI prompt). */
export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'meal';

/** One meal of the day that could still be eaten. */
export interface MealSlotDef {
  id: string;
  kind: MealKind;
  /** The plan's own name for it (fasting mode); absent for the ordinary breakfast / lunch / dinner. */
  label?: string;
  startHour: number;
  startMinute: number;
  /** Minutes from midnight at which it is too late for this meal. */
  endMinutes: number;
  /** How big a share of what is left this meal should get, relative to the others. */
  weight: number;
  /** The plan's own meal for this slot (fasting mode), to compare with what is left. */
  plan?: { kcal: number; proteinG: number };
}

/** Ordinary three-meal day. Weights follow the usual split of a day's food. */
const NORMAL_MEALS: Omit<MealSlotDef, 'endMinutes'>[] = [
  { id: 'breakfast', kind: 'breakfast', startHour: 7, startMinute: 0, weight: 0.25 },
  { id: 'lunch', kind: 'lunch', startHour: 12, startMinute: 0, weight: 0.35 },
  { id: 'dinner', kind: 'dinner', startHour: 18, startMinute: 30, weight: 0.4 },
];
/** A normal day's meals stop being possible at these times (dinner at the end of the day's eating). */
const NORMAL_ENDS_MIN = [10 * 60 + 30, 15 * 60];

/** Fasting: off-plan food logged during a plan meal's time covers it from this share of the plan meal's kcal. */
export const FASTING_COVER_SHARE = 0.5;
/** Below this much logged for a period of a normal day, the period still counts as not eaten. */
export const COVER_MIN_KCAL = 150;

/** The meals of a day. Fasting on: the plan's own meals at the plan's times, each until the next starts (the last until the window
 *  closes), sized like the plan sized them. Fasting off: breakfast, lunch and dinner; without breakfast when the user said they skip it
 *  (lunch and dinner then share the whole day, so the day's expected intake stays the same). */
export function mealDefs(fasting: boolean, planMeals: MealTemplate[], skipBreakfast: boolean = skipsBreakfast()): MealSlotDef[] {
  if (!fasting) {
    const all = NORMAL_MEALS.map((m, i) => ({ ...m, endMinutes: i < NORMAL_ENDS_MIN.length ? NORMAL_ENDS_MIN[i] : eatingEndHour(false) * 60 }));
    if (!skipBreakfast) return all;
    const kept = all.filter((m) => m.id !== 'breakfast');
    const total = kept.reduce((sum, m) => sum + m.weight, 0);
    return kept.map((m) => ({ ...m, weight: m.weight / total }));
  }
  const endOfDay = eatingEndHour(true) * 60;
  return planMeals.map((m, i) => {
    const next = planMeals[i + 1];
    const kind: MealKind = i === planMeals.length - 1 ? 'dinner' : i === 0 ? 'lunch' : 'meal';
    return {
      id: m.slot,
      kind,
      label: m.label,
      startHour: m.startHour,
      startMinute: m.startMinute,
      endMinutes: next ? next.startHour * 60 + next.startMinute : endOfDay,
      weight: m.calories > 0 ? m.calories : 1,
      plan: { kcal: m.calories, proteinG: m.proteinG },
    };
  });
}

/** Which period of a normal day a logged food belongs to: by the meal time the user chose, else by the hour it was logged. */
export function periodOfItem(item: { mealTime?: ExtraMealTime | null; loggedAtISO: string }): 'breakfast' | 'lunch' | 'dinner' {
  const t = item.mealTime;
  if (t === 'breakfast' || t === 'morning_snack') return 'breakfast';
  if (t === 'lunch' || t === 'afternoon_snack') return 'lunch';
  if (t === 'late_afternoon_snack' || t === 'dinner' || t === 'evening_snack') return 'dinner';
  const h = new Date(item.loggedAtISO).getHours() + new Date(item.loggedAtISO).getMinutes() / 60;
  return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : 'dinner';
}

/** The meals of a day that are already taken care of. Fasting: a plan meal that is ticked eaten or removed, or one with half its kcal
 *  (at least 150) of food logged during its time. Normal day: a period with at least 150 kcal logged (what was eaten as off-plan food, by its meal
 *  time, plus the plan's meals ticked eaten: the first two count as lunch, the last as dinner). */
export function coveredMealIds(fasting: boolean, defs: MealSlotDef[], planMeals: MealTemplate[], log: DailyNutritionLog | undefined): Set<string> {
  const covered = new Set<string>();
  if (!log) return covered;
  if (fasting) {
    // Food logged on its own (not by ticking the plan meal) covers the plan meal whose time it was logged in once it is a meal's worth:
    // half the plan meal's kcal (at least 150), so a snack does not, but a lunch eaten instead of the plan's does.
    const kcal = new Map<string, number>();
    for (const item of log.extraItems ?? []) {
      const at = new Date(item.loggedAtISO);
      const min = at.getHours() * 60 + at.getMinutes();
      const slot = defs.find((d, i) => (i === 0 || min >= d.startHour * 60 + d.startMinute) && min < d.endMinutes) ?? defs[defs.length - 1];
      if (slot) kcal.set(slot.id, (kcal.get(slot.id) ?? 0) + item.calories);
    }
    for (const d of defs) {
      const enough = Math.max(COVER_MIN_KCAL, (d.plan?.kcal ?? 0) * FASTING_COVER_SHARE);
      if (log.mealsEaten[d.id as keyof typeof log.mealsEaten] || (log.removedMealSlots ?? []).includes(d.id as never) || (kcal.get(d.id) ?? 0) >= enough) covered.add(d.id);
    }
    return covered;
  }
  const kcal = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const item of log.extraItems ?? []) {
    kcal[periodOfItem(item)] += item.calories;
    // The diary's "Không ăn" mark (0 kcal) says the meal was skipped: taken care of, not missing.
    if (item.calories === 0 && item.name.trim() === SKIPPED_MEAL_NAME) covered.add(periodOfItem(item));
  }
  planMeals.forEach((m, i) => {
    if (log.mealsEaten[m.slot]) kcal[i === planMeals.length - 1 ? 'dinner' : 'lunch'] += m.calories;
  });
  for (const k of ['breakfast', 'lunch', 'dinner'] as const) if (kcal[k] >= COVER_MIN_KCAL) covered.add(k);
  return covered;
}

/** The meals still to come: not taken care of and not yet too late. */
export function remainingMeals(defs: MealSlotDef[], covered: Set<string>, nowMinutes: number): MealSlotDef[] {
  return defs.filter((d) => !covered.has(d.id) && d.endMinutes > nowMinutes);
}
