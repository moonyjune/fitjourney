import { addDaysToKey } from '../insights/dateMath';
import { dayScore, type DayRow } from '../insights/days';
import type { Thresholds } from '../insights/thresholds';
import { isMainMeal, type DiaryItem } from './items';
import { matchRules, isSkippedMeal, mentionsAlcohol } from './match';
import { commentMeal, mealWarnings, type MealLine, type MealWarning } from './meal';
import { repeatsOnDay, type RepeatHit } from './repeats';
import type { FoodRule } from './types';
import { FOOD_RULES } from './rulesData';

export type AdviceKey =
  | 'missing'
  | 'lowKcal'
  | 'skipped'
  | 'alcohol'
  | 'sodiumStreak'
  | 'sodiumHigh'
  | 'purineStreak'
  | 'purineOver'
  | 'surplus'
  | 'lowDeficitStreak'
  | 'lowProtein'
  | 'sugar'
  | 'noExercise'
  | 'goodSaltOnly'
  | 'veryGood';

/** One thing to do tomorrow, from how today went. `value` is the figure it refers to, when it has one. */
export interface Advice {
  key: AdviceKey;
  value?: number;
}

export interface ItemFeedback {
  item: DiaryItem;
  lines: MealLine[];
  warnings: MealWarning[];
}

export interface DayFeedback {
  dateKey: string;
  score: number | null;
  /** Foods of the day to change, with the short replacement. */
  replace: FoodRule[];
  repeats: RepeatHit[];
  advice: Advice[];
  items: ItemFeedback[];
}

/** What to do tomorrow, in the order of importance used by the diary method. */
export function adviceFor(row: DayRow, rows: DayRow[], items: DiaryItem[], th: Thresholds): Advice[] {
  const out: Advice[] = [];
  const byKey = new Map(rows.map((r) => [r.dateKey, r]));
  const day = (offset: number) => byKey.get(addDaysToKey(row.dateKey, offset));
  const today = items.filter((i) => i.dateKey === row.dateKey);

  if (!row.complete) out.push({ key: 'missing', value: row.missing.length });
  if (row.complete && row.kcal < th.minKcal) out.push({ key: 'lowKcal', value: row.kcal });
  // A "Không ăn" mark no longer counts once real food is logged for that same meal (the user marked it, then remembered eating).
  const ateAt = (meal: DiaryItem['mealTime']) => isMainMeal(meal) && today.some((o) => o.mealTime === meal && !isSkippedMeal(o.text));
  if (today.some((i) => isSkippedMeal(i.text) && !ateAt(i.mealTime))) out.push({ key: 'skipped' });
  if (mentionsAlcohol(today.map((i) => i.text))) out.push({ key: 'alcohol' });

  const sodiumOver = (r: DayRow | undefined) => !!r && r.sodiumMg > th.sodiumMax;
  if (sodiumOver(row) && sodiumOver(day(-1)) && sodiumOver(day(-2))) out.push({ key: 'sodiumStreak' });
  else if (row.sodiumMg > th.sodiumFair) out.push({ key: 'sodiumHigh', value: row.sodiumMg });

  const purineOver = (r: DayRow | undefined) => !!r && r.purineMg > th.purineMax;
  if (purineOver(row) && purineOver(day(-1))) out.push({ key: 'purineStreak' });
  else if (purineOver(row)) out.push({ key: 'purineOver', value: row.purineMg });

  const lowDeficit = (r: DayRow | undefined) => !!r && r.deficit < th.deficitFair;
  if (row.deficit < 0) out.push({ key: 'surplus' });
  else if (lowDeficit(row) && lowDeficit(day(-1))) out.push({ key: 'lowDeficitStreak' });

  if (row.complete && row.proteinG < th.proteinFair) out.push({ key: 'lowProtein', value: row.proteinG });
  if (row.sugarG > th.sugarMax) out.push({ key: 'sugar', value: row.sugarG });

  const from = addDaysToKey(row.dateKey, -6);
  if (rows.filter((r) => r.dateKey >= from && r.dateKey <= row.dateKey).every((r) => r.exerciseKcal === 0)) out.push({ key: 'noExercise' });

  const score = dayScore(row, th);
  if (row.complete && score !== null && score >= 8 && row.kcal >= th.minKcal) {
    out.push({ key: row.sodiumMg > th.sodiumMax ? 'goodSaltOnly' : 'veryGood' });
  }
  return out;
}

/** Everything the app says about one logged day: the foods to change, repeats, comments per meal, and tomorrow's to-do. */
export function buildDayFeedback(
  dateKey: string,
  items: DiaryItem[],
  rows: DayRow[],
  th: Thresholds,
  rules: FoodRule[] = FOOD_RULES
): DayFeedback | null {
  const row = rows.find((r) => r.dateKey === dateKey);
  if (!row) return null;
  const today = items.filter((i) => i.dateKey === dateKey);

  const replaceByShort = new Map<string, FoodRule>();
  for (const it of today) for (const r of matchRules(it.text, rules)) if (r.kind !== 'good' && !replaceByShort.has(r.short)) replaceByShort.set(r.short, r);

  return {
    dateKey,
    score: dayScore(row, th),
    replace: [...replaceByShort.values()],
    repeats: repeatsOnDay(dateKey, items, rules),
    advice: adviceFor(row, rows, items, th),
    items: today.map((item) => ({
      item,
      lines: commentMeal(item.text, rules),
      warnings: isSkippedMeal(item.text) ? [] : mealWarnings({ ...item, main: isMainMeal(item.mealTime) }, th),
    })),
  };
}
