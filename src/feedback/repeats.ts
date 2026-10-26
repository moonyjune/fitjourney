import { addDaysToKey } from '../insights/dateMath';
import type { DiaryItem } from './items';
import { matchRules } from './match';
import { FOOD_RULES } from './rulesData';
import type { FoodRule } from './types';

export interface RepeatHit {
  rule: FoodRule;
  /** Items matching the rule in the 3 days ending on the given day. */
  count: number;
}

const WINDOW_DAYS = 3;

/** Whether a rule's repeat threshold is reached: the rule's own number, but never fewer than 2 (one item is not a repeat). */
const reached = (rule: FoodRule, count: number): boolean => rule.repeatAt > 0 && count >= Math.max(rule.repeatAt, 2);

function inWindow(item: DiaryItem, dateKey: string): boolean {
  return item.dateKey >= addDaysToKey(dateKey, -(WINDOW_DAYS - 1)) && item.dateKey <= dateKey;
}

/** Repeats among the foods eaten on `dateKey`: a food that comes up as many times in the 3 days ending that day as its
 *  rule allows ("tôm 3 lần/3 ngày"). Only foods eaten on that day are reported. */
export function repeatsOnDay(dateKey: string, items: DiaryItem[], rules: FoodRule[] = FOOD_RULES): RepeatHit[] {
  const matched = items.filter((i) => inWindow(i, dateKey)).map((i) => ({ item: i, rules: matchRules(i.text, rules) }));
  // Foods are counted by name, so "mì tôm" one day and "mì indo" the next are two helpings of the same instant noodles.
  const today = new Map<string, FoodRule>();
  for (const m of matched) if (m.item.dateKey === dateKey) for (const r of m.rules) if (!today.has(r.short)) today.set(r.short, r);
  const out: RepeatHit[] = [];
  for (const rule of today.values()) {
    const count = matched.filter((m) => m.rules.some((r) => r.short === rule.short)).length;
    if (reached(rule, count)) out.push({ rule, count });
  }
  return out;
}

/** The same check for a food about to be added: `history` is what is already logged, the new item counts as one more. */
export function repeatsForDraft(text: string, dateKey: string, history: DiaryItem[], rules: FoodRule[] = FOOD_RULES): RepeatHit[] {
  const draft: DiaryItem = { id: 'draft', dateKey, text, mealTime: null, kcal: 0, proteinG: 0, purineMg: 0, sugarG: 0, sodiumMg: 0 };
  const mine = new Set(matchRules(text, rules).map((r) => r.short));
  return repeatsOnDay(dateKey, [...history, draft], rules).filter((h) => mine.has(h.rule.short));
}

export interface FrequentFood {
  rule: FoodRule;
  count: number;
}

/** Foods to be careful with that show up at least `minCount` times in a period (default 3), most frequent first. */
export function frequentFoods(items: DiaryItem[], fromKey: string, toKey: string, minCount = 3, rules: FoodRule[] = FOOD_RULES): FrequentFood[] {
  const counts = new Map<string, FrequentFood>();
  for (const item of items) {
    if (item.dateKey < fromKey || item.dateKey > toKey) continue;
    for (const rule of matchRules(item.text, rules)) {
      if (rule.kind === 'good') continue;
      const hit = counts.get(rule.short);
      if (hit) hit.count += 1;
      else counts.set(rule.short, { rule, count: 1 });
    }
  }
  return [...counts.values()].filter((h) => h.count >= minCount).sort((a, b) => b.count - a.count);
}
