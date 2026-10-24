import type {
  DailyNutritionLog,
  FeelingRecord,
  MealSlot,
  MealTemplate,
  Mood,
  WaterCheckpoint,
  WorkoutLogEntry,
} from '../types';
import { toDateKey } from '../utils/date';

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
  | { kind: 'extra'; id: string; minutes: number; name: string; kcal: number; proteinG: number; junk: boolean; photoUri?: string }
  | { kind: 'workout'; id: string; minutes: number; label: string; durationMin: number; kcal: number }
  | { kind: 'feeling'; id: string; minutes: number; mood: Mood; cravingLevel: number; hungerLevel: number }
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
}

// Entries at the same minute list meals first, then food, workouts, check-ins, then water.
const PRIORITY: Record<TimelineItem['kind'], number> = { meal: 0, extra: 1, workout: 2, feeling: 3, water: 4, now: 5 };

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
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

  const waterMl = log?.waterMl ?? 0;
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
      junk: !!e.junk,
      photoUri: e.photoUri,
    });
  }
  for (const w of workouts) {
    items.push({ kind: 'workout', id: `workout-${w.id}`, minutes: minutesOfDay(w.dateISO), label: w.label, durationMin: w.durationMin, kcal: w.caloriesBurned });
  }
  for (const f of dayFeelings) {
    items.push({ kind: 'feeling', id: `feeling-${f.id}`, minutes: minutesOfDay(f.loggedAtISO), mood: f.mood, cravingLevel: f.cravingLevel, hungerLevel: f.hungerLevel });
  }

  items.sort((a, b) => a.minutes - b.minutes || PRIORITY[a.kind] - PRIORITY[b.kind]);

  if (isToday) {
    const at = items.findIndex((i) => i.minutes > nowMinutes);
    const marker: TimelineItem = { kind: 'now', id: 'now', minutes: nowMinutes };
    if (at === -1) items.push(marker);
    else items.splice(at, 0, marker);
  }
  return items;
}
