import type {
  DailyNutritionLog,
  ExtraMealTime,
  FeelingRecord,
  MealPart,
  MealSlot,
  MealTemplate,
  Mood,
  WaterCheckpoint,
  WorkoutLogEntry,
} from '../types';
import { partsMatchTotals } from '../food/mealParts';
import { PLAN_SLOT_MEAL, type MainMeal } from '../insights/days';
import { SKIPPED_MEAL_NAME } from '../insights/missing';
import { toDateKey } from '../utils/date';
import { periodOfItem } from './mealSlots';
import { dayWaterMl } from '../water/drinks';

export type TimelineItem =
  | { kind: 'water'; id: string; minutes: number; incrementMl: number; cumulativeMl: number; reached: boolean; past: boolean }
  | {
      kind: 'meal';
      id: string;
      minutes: number;
      slot: MealSlot;
      label: string;
      kcal: number;
      proteinG: number;
      itemCount: number;
      eaten: boolean;
      hasPhoto: boolean;
      /** Protein eaten so far today once this meal is counted; only set for eaten meals. */
      proteinSoFarG: number | null;
      past: boolean;
    }
  | { kind: 'extra'; id: string; minutes: number; name: string; kcal: number; proteinG: number; purineMg: number; saltG: number; sugarG: number; junk: boolean; photoUri?: string; loggedAtISO: string; parts?: MealPart[]; mealTime?: ExtraMealTime | null }
  /** One or more workouts close together, shown as one row from the first start to the last end. */
  | { kind: 'workout'; id: string; minutes: number; endMinutes: number; label: string; durationMin: number; kcal: number; entryIds: string[] }
  | { kind: 'feeling'; id: string; minutes: number; mood: Mood; cravingLevel: number; hungerLevel: number }
  /** A main meal marked as not eaten, one row per meal: by "Bỏ bữa" (the day's skip list, `dayMealId`) and / or by the diary's
   *  "Không ăn" 0 kcal food (`itemId`). Stands in for the plan meal's own row and the "Không ăn" food's row; never shown for a meal that
   *  has real food logged. `label`: the plan meal's (or fasting plan's) name, else null (the main meal's name). */
  | { kind: 'skipped'; id: string; minutes: number; meal: MainMeal; label: string | null; dayMealId: string | null; itemId: string | null; past: boolean }
  | { kind: 'now'; id: string; minutes: number };

export interface TimelineInput {
  dateKey: string;
  now: Date;
  log: DailyNutritionLog | undefined;
  /** Meal templates for this date's day type. */
  meals: MealTemplate[];
  waterSchedule: WaterCheckpoint[];
  workouts: WorkoutLogEntry[];
  feelings: FeelingRecord[];
  /** Plan meal slots that have a proof photo for this date. */
  photoSlots: ReadonlySet<string>;
  /** Meals skipped on purpose that day ("Bỏ bữa", useSkippedMealStore): the evaluation's ids (`breakfast` / `lunch` / `dinner`, or a
   *  fasting plan's `meal1`…), each with its usual start (minutes) and its name when the plan gives one. */
  skippedDayMeals?: readonly { id: string; minutes: number; label?: string | null }[];
}

// Entries at the same minute list meals first, then food, workouts, check-ins, then water.
const PRIORITY: Record<TimelineItem['kind'], number> = { meal: 0, skipped: 0, extra: 1, workout: 2, feeling: 3, water: 4, now: 5 };

/** Workouts that start within this long after the previous one ended belong to the same row. */
export const WORKOUT_GROUP_GAP_MIN = 60;

/** A day's workouts in time order, grouped where one starts within `WORKOUT_GROUP_GAP_MIN` of the end of the one before
 *  (several single exercises in a row read as one workout). */
export function groupWorkouts(workouts: WorkoutLogEntry[]): WorkoutLogEntry[][] {
  const sorted = [...workouts].sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO));
  const groups: WorkoutLogEntry[][] = [];
  let endMs = -Infinity;
  for (const w of sorted) {
    const start = Date.parse(w.dateISO);
    const end = start + w.durationMin * 60_000;
    if (groups.length > 0 && start <= endMs + WORKOUT_GROUP_GAP_MIN * 60_000) {
      groups[groups.length - 1].push(w);
      endMs = Math.max(endMs, end);
    } else {
      groups.push([w]);
      endMs = end;
    }
  }
  return groups;
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** The diary's "Không ăn" mark: a 0 kcal food named "Không ăn". */
const isSkipMark = (e: { name: string; calories: number }) => e.calories === 0 && e.name.trim() === SKIPPED_MEAL_NAME;

/** The main meal a skip id of the day's evaluation stands for (a fasting plan's slot is its plan meal's main meal). */
function mainMealOfSkipId(id: string): MainMeal | null {
  if (Object.prototype.hasOwnProperty.call(PLAN_SLOT_MEAL, id)) return PLAN_SLOT_MEAL[id as MealSlot];
  return id === 'breakfast' || id === 'lunch' || id === 'dinner' ? id : null;
}

/**
 * One day as a time-ordered list. Plan meals and water checkpoints sit at their *planned* time
 * (the app records no actual time for those); extras, workouts and check-ins use the time they
 * were logged. For today a "now" marker is inserted so upcoming items read as upcoming.
 */
export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const { dateKey, now, log, meals, waterSchedule, workouts, feelings, photoSlots } = input;
  const todayKey = toDateKey(now);
  const isToday = dateKey === todayKey;
  const dayOver = dateKey < todayKey;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isPast = (minutes: number) => dayOver || (isToday && minutes <= nowMinutes);

  const items: TimelineItem[] = [];
  const dayFeelings = feelings.filter((f) => toDateKey(new Date(f.loggedAtISO)) === dateKey);
  const extras = log?.extraItems ?? [];

  // Protein running total in clock order across eaten meals and extras.
  const proteinEvents: { minutes: number; protein: number; slot?: MealSlot }[] = [
    ...meals.filter((m) => log?.mealsEaten[m.slot]).map((m) => ({ minutes: m.startHour * 60 + m.startMinute, protein: m.proteinG, slot: m.slot })),
    ...extras.map((e) => ({ minutes: minutesOfDay(e.loggedAtISO), protein: e.proteinG })),
  ].sort((a, b) => a.minutes - b.minutes);
  const proteinAtSlot = new Map<MealSlot, number>();
  let running = 0;
  for (const event of proteinEvents) {
    running += event.protein;
    if (event.slot) proteinAtSlot.set(event.slot, running);
  }

  for (const m of meals) {
    const minutes = m.startHour * 60 + m.startMinute;
    const eaten = !!log?.mealsEaten[m.slot];
    items.push({
      kind: 'meal',
      id: `meal-${m.slot}`,
      minutes,
      slot: m.slot,
      label: m.label,
      kcal: m.calories,
      proteinG: m.proteinG,
      itemCount: m.items.length,
      eaten,
      hasPhoto: photoSlots.has(m.slot),
      proteinSoFarG: eaten ? (proteinAtSlot.get(m.slot) ?? null) : null,
      past: isPast(minutes),
    });
  }

  const waterMl = dayWaterMl(log);
  waterSchedule.forEach((c, i) => {
    const minutes = c.hour * 60 + c.minute;
    const previous = i > 0 ? waterSchedule[i - 1].cumulativeTargetMl : 0;
    items.push({
      kind: 'water',
      id: `water-${i}`,
      minutes,
      incrementMl: c.cumulativeTargetMl - previous,
      cumulativeMl: c.cumulativeTargetMl,
      reached: waterMl >= c.cumulativeTargetMl,
      past: isPast(minutes),
    });
  });

  for (const e of extras) {
    items.push({
      kind: 'extra',
      id: `extra-${e.id}`,
      minutes: minutesOfDay(e.loggedAtISO),
      name: e.name,
      kcal: e.calories,
      proteinG: e.proteinG,
      // Totals of the whole meal. Its parts are never listed here: the journal shows one entry per meal.
      purineMg: e.purineMg ?? 0,
      saltG: e.saltG ?? 0,
      sugarG: e.sugarG ?? 0,
      junk: !!e.junk,
      photoUri: e.photoUri,
      loggedAtISO: e.loggedAtISO,
      mealTime: e.mealTime,
      parts: partsMatchTotals(e) ? e.parts : undefined,
    });
  }
  for (const group of groupWorkouts(workouts)) {
    const first = group[0];
    const labels = [...new Set(group.map((w) => w.label))];
    items.push({
      kind: 'workout',
      id: `workout-${first.id}`,
      minutes: minutesOfDay(first.dateISO),
      endMinutes: Math.max(...group.map((w) => minutesOfDay(w.dateISO) + Math.round(w.durationMin))),
      label: labels.join(' + '),
      durationMin: group.reduce((sum, w) => sum + w.durationMin, 0),
      kcal: Math.round(group.reduce((sum, w) => sum + w.caloriesBurned, 0)),
      entryIds: group.map((w) => w.id),
    });
  }
  for (const f of dayFeelings) {
    items.push({ kind: 'feeling', id: `feeling-${f.id}`, minutes: minutesOfDay(f.loggedAtISO), mood: f.mood, cravingLevel: f.cravingLevel, hungerLevel: f.hungerLevel });
  }

  // Meals marked as not eaten: one "Không ăn" row per main meal, in place of the plan meal's row and the "Không ăn" food's row, unless
  // the meal has real food logged after all (then the mark is stale and only the food shows).
  const realFood = new Set<MainMeal>();
  for (const e of extras) if (!isSkipMark(e) && e.calories > 0) realFood.add(periodOfItem(e));
  for (const m of meals) if (log?.mealsEaten[m.slot]) realFood.add(PLAN_SLOT_MEAL[m.slot]);
  const marks = new Map<MainMeal, { minutes: number; label: string | null; dayMealId: string | null; itemId: string | null }>();
  for (const d of input.skippedDayMeals ?? []) {
    const meal = mainMealOfSkipId(d.id);
    if (!meal || marks.has(meal)) continue;
    marks.set(meal, { minutes: d.minutes, label: d.label ?? null, dayMealId: d.id, itemId: null });
  }
  for (const e of extras) {
    if (!isSkipMark(e)) continue;
    const meal = periodOfItem(e);
    const mark = marks.get(meal);
    if (mark) mark.itemId ??= e.id;
    else marks.set(meal, { minutes: minutesOfDay(e.loggedAtISO), label: null, dayMealId: null, itemId: e.id });
  }
  const skipItemIds = new Set(extras.filter(isSkipMark).map((e) => `extra-${e.id}`));
  const shownMarks = [...marks].filter(([meal]) => !realFood.has(meal));
  const replacedSlots = new Set<string>();
  for (const [meal, mark] of shownMarks) {
    const planRow = items.find((i): i is Extract<TimelineItem, { kind: 'meal' }> => i.kind === 'meal' && PLAN_SLOT_MEAL[i.slot] === meal);
    if (planRow) replacedSlots.add(planRow.id);
    const minutes = planRow ? planRow.minutes : mark.minutes;
    items.push({
      kind: 'skipped',
      // A row standing for the "Không ăn" food alone keeps that food's id, so it opens (and deletes) like the food would.
      id: mark.dayMealId == null && mark.itemId != null ? `extra-${mark.itemId}` : `skipped-${meal}`,
      minutes,
      meal,
      label: planRow?.label ?? mark.label,
      dayMealId: mark.dayMealId,
      itemId: mark.itemId,
      past: isPast(minutes),
    });
  }
  const shown = items.filter((i) => !(i.kind === 'extra' && skipItemIds.has(i.id)) && !(i.kind === 'meal' && replacedSlots.has(i.id)));
  items.length = 0;
  items.push(...shown);

  items.sort((a, b) => a.minutes - b.minutes || PRIORITY[a.kind] - PRIORITY[b.kind]);

  if (isToday) {
    const at = items.findIndex((i) => i.minutes > nowMinutes);
    const marker: TimelineItem = { kind: 'now', id: 'now', minutes: nowMinutes };
    if (at === -1) items.push(marker);
    else items.splice(at, 0, marker);
  }
  return items;
}
