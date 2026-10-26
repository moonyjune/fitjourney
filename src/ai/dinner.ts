import { IF_EATING_END_HOUR, getDayType } from '../constants/plan';
import { foodKey } from '../food/remember';
import { NEVER_AS_MEAL, scaleFood } from '../food/swaps';
import type { FoodEntry } from '../food/types';
import { toDateKey } from '../utils/date';
import { makeDayEvaluator } from './coachContext';

/** The dinner card shows from this hour until the eating window closes. */
export const DINNER_FROM_HOUR = 15;
/** Below this many kcal left, dinner is a light one (vegetables, lean protein), not a meal. */
export const LIGHT_BUDGET_KCAL = 150;
export const MAX_DINNER_IDEAS = 3;

export type Room = { purine: number; salt: number; sugar: number };

/** What is left of today, worked out here from the logs: the AI is only told it, never asked to compute it. */
export interface DinnerBrief {
  hour: number;
  /** Calories still available: TDEE + exercise − the daily deficit target − what was eaten. 0 when nothing is left. */
  budgetKcal: number;
  /** Protein still missing from the day's target. */
  proteinLeftG: number;
  /** Room left in each limit (limit minus the day so far); negative when already over. */
  headroom: Room;
  limits: Room;
  /** The plan's own dinner (its last meal of the day), if it is still to be eaten. */
  planMeal?: { label: string; kcal: number; proteinG: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Today so far against the targets, and the plan's dinner. Null when the plan has no meal left to eat tonight (the last
 *  meal is already eaten or removed): then there is no dinner to suggest. */
export function buildDinnerBrief(now: Date = new Date()): DinnerBrief | null {
  const { evaluate, logs, plan, settings, limits, tdeeKcal } = makeDayEvaluator(now);
  const dateKey = toDateKey(now);
  const today = evaluate(dateKey);
  const meals = plan.mealTemplates[getDayType(now)];
  const last = meals[meals.length - 1];
  const log = logs[dateKey];
  const planMealLeft = !!last && !log?.mealsEaten[last.slot] && !(log?.removedMealSlots ?? []).includes(last.slot);
  if (!planMealLeft) return null;
  const budget = tdeeKcal + today.burnedKcal - settings.targetDailyDeficitKcal - today.eatenKcal;
  const n = today.nutrients;
  return {
    hour: now.getHours(),
    budgetKcal: Math.max(0, Math.round(budget)),
    proteinLeftG: Math.max(0, Math.round(settings.proteinTargetG - today.proteinG)),
    headroom: { purine: Math.round(limits.purineMg - n.purineMg), salt: r1(limits.saltG - n.saltG), sugar: r1(limits.sugarG - n.sugarG) },
    limits: { purine: limits.purineMg, salt: limits.saltG, sugar: limits.sugarG },
    planMeal: { label: last.label, kcal: last.calories, proteinG: last.proteinG },
  };
}

/** The card is for the afternoon and evening, while eating is still allowed. */
export function dinnerCardVisible(now: Date, brief: DinnerBrief | null): boolean {
  return brief !== null && now.getHours() >= DINNER_FROM_HOUR && now.getHours() < IF_EATING_END_HOUR;
}

export type DinnerVerdict =
  | { kind: 'light' } // almost no calories left: eat light
  | { kind: 'fits' } // the plan's dinner fits what is left
  | { kind: 'over'; overKcal: number }; // the plan's dinner is bigger than what is left

/** How the plan's own dinner compares with what is left (a little slack, 100 kcal, is fine). */
export function dinnerVerdict(brief: DinnerBrief): DinnerVerdict {
  if (brief.budgetKcal < LIGHT_BUDGET_KCAL) return { kind: 'light' };
  const over = (brief.planMeal?.kcal ?? 0) - brief.budgetKcal;
  return over > 100 ? { kind: 'over', overKcal: Math.round(over) } : { kind: 'fits' };
}

export interface DinnerIdea {
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
  source: 'db' | 'ai';
  amount?: string;
  how?: string;
  accuracy?: number;
}

const EPS = 1e-9;
const keys = ['purine', 'salt', 'sugar'] as const;
const FIELD = { purine: 'purineMg', salt: 'saltG', sugar: 'sugarG' } as const;

/** Does a dinner fit what is left: calories within the budget (a light dinner under 200 kcal when the budget is nearly gone,
 *  otherwise at least 40% of it), enough protein (60% of what is missing, at most 30 g asked), and every limit within its room
 *  (a limit with no room left takes at most 10% of itself). The AI proposes; this decides. */
export function acceptDinner(brief: DinnerBrief, idea: Pick<DinnerIdea, 'calories' | 'proteinG' | 'purineMg' | 'saltG' | 'sugarG'>): boolean {
  if (![idea.calories, idea.proteinG, idea.purineMg, idea.saltG, idea.sugarG].every((n) => Number.isFinite(n) && n >= 0)) return false;
  if (brief.budgetKcal < LIGHT_BUDGET_KCAL) {
    if (idea.calories > 200 + EPS) return false;
  } else if (idea.calories > brief.budgetKcal * 1.1 + EPS || idea.calories < brief.budgetKcal * 0.4 - EPS) {
    return false;
  }
  if (idea.proteinG < Math.min(brief.proteinLeftG * 0.6, 30) - EPS) return false;
  for (const k of keys) {
    const room = brief.headroom[k];
    const cap = room > 0 ? room : brief.limits[k] * 0.1;
    if (idea[FIELD[k]] > cap + EPS) return false;
  }
  return true;
}

/** Dinner ideas from the user's own food database (no AI): foods of a meal-like group scaled to the calories left, that pass
 *  `acceptDinner`; the ones that supply the most of the missing protein first. At most 3 distinct names. */
export function dinnerIdeasFromFoods(brief: DinnerBrief, foods: FoodEntry[]): DinnerIdea[] {
  const target = brief.budgetKcal < LIGHT_BUDGET_KCAL ? 150 : Math.min(700, brief.budgetKcal);
  const scored: { idea: DinnerIdea; score: number }[] = [];
  for (const food of foods) {
    if (NEVER_AS_MEAL.includes(food.group)) continue;
    const scaled = scaleFood(food, target);
    if (!scaled) continue;
    const idea: DinnerIdea = { name: food.name, ...scaled.figures, source: 'db', amount: scaled.amount };
    if (!acceptDinner(brief, idea)) continue;
    scored.push({ idea, score: Math.min(idea.proteinG, Math.max(brief.proteinLeftG, 1)) });
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter(({ idea }) => {
      const key = foodKey(idea.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_DINNER_IDEAS)
    .map((s) => s.idea);
}

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/** The AI's dinner ideas reduced to the usable ones: well-formed, in bounds, passing `acceptDinner`, no duplicates. At most 3. */
export function cleanAiDinner(raw: unknown, brief: DinnerBrief): DinnerIdea[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown }).options) ? (raw as { options: unknown[] }).options : [];
  const out: DinnerIdea[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 100) : '';
    const calories = num(o.calories, 5000);
    const proteinG = num(o.proteinG, 500);
    if (!name || calories === null || proteinG === null) continue;
    const idea: DinnerIdea = {
      name,
      calories: Math.round(calories),
      proteinG: Math.round(proteinG * 10) / 10,
      purineMg: Math.round(num(o.purineMg, 20000) ?? 0),
      saltG: Math.round((num(o.saltG, 200) ?? 0) * 10) / 10,
      sugarG: Math.round((num(o.sugarG, 1000) ?? 0) * 10) / 10,
      source: 'ai',
    };
    const key = foodKey(name);
    if (!key || seen.has(key) || !acceptDinner(brief, idea)) continue;
    seen.add(key);
    if (typeof o.how === 'string' && o.how.trim()) idea.how = o.how.trim().slice(0, 300);
    if (typeof o.accuracyPercent === 'number' && Number.isFinite(o.accuracyPercent)) idea.accuracy = Math.max(0, Math.min(100, Math.round(o.accuracyPercent)));
    out.push(idea);
    if (out.length === MAX_DINNER_IDEAS) break;
  }
  return out;
}
