import { DEFAULT_CALORIE_TARGET, DEFAULT_PROTEIN_TARGET_G, DEFAULT_START_WEIGHT_KG, DEFAULT_WATER_TARGET_ML } from '../constants/plan';
import { LIMITS } from '../game/constants';
import type { ActivityLevel, DailyNutritionLog, Gender, PlanData, WorkoutLogEntry } from '../types';
import { DEFAULT_TARGET_DAILY_DEFICIT_KCAL, resolveTdeeKcal } from '../utils/tdee';
import { toDateKey } from '../utils/date';
import type { WeekInput, WeekSource } from './weeklyReport';

/** How many clients one request carries (the server's cap). */
export const DIGEST_CHUNK = 12;

/** Where a client stands this week, decided on the device from their numbers (the AI only writes the words). */
export type ClientStatus = 'nudge' | 'no_data' | 'watch' | 'good';

/** Order on the coach's list: the ones to reach out to first. */
export const STATUS_ORDER: ClientStatus[] = ['nudge', 'no_data', 'watch', 'good'];

/** no_data: nothing logged this week. nudge: far behind the boss, or logging on fewer than half of the days so far. watch:
 *  behind the boss. good: the boss is down or the week is on track. */
export function clientStatusOf(week: WeekInput): ClientStatus {
  const { patterns, boss, week: w } = week;
  if (patterns.daysLogged === 0) return 'no_data';
  if (boss.defeated) return 'good';
  if (boss.status === 'far' || patterns.daysLogged * 2 < w.daysElapsed) return 'nudge';
  if (boss.status === 'behind') return 'watch';
  return 'good';
}

export function chunk<T>(items: T[], size: number = DIGEST_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface DigestText {
  summary: string;
  nudge?: string;
}

const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** The model's answer by client key: only keys that were asked, a summary is required, each key at most once (the first). */
export function cleanDigest(raw: unknown, keys: string[]): Record<string, DigestText> {
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
  const wanted = new Set(keys);
  const out: Record<string, DigestText> = {};
  for (const entry of items) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const key = typeof o.key === 'string' ? o.key : '';
    const summary = text(o.summary, 400);
    if (!wanted.has(key) || key in out || !summary) continue;
    const nudge = text(o.nudge, 300);
    out[key] = nudge ? { summary, nudge } : { summary };
  }
  return out;
}

/** A client's rows as the coach's device reads them (PostgREST gives `numeric` columns as strings, so every figure is coerced here). */
export interface ClientRows {
  profile: Record<string, unknown> | null;
  plan: PlanData;
  weights: { entry_date: string; weight_kg: unknown }[];
  nutrition: Record<string, unknown>[];
  workouts: Record<string, unknown>[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** What the day rules need for one client, built from their rows. Missing profile fields fall back to the app's defaults, and
 *  the purine / salt / sugar limits are the defaults (a client's own limits are private to their account). */
export function weekSourceFromRows(rows: ClientRows): WeekSource {
  const p = rows.profile ?? {};
  const weights = rows.weights
    .map((w) => ({ dateISO: `${String(w.entry_date).slice(0, 10)}T06:00:00`, weightKg: num(w.weight_kg) }))
    .filter((w): w is { dateISO: string; weightKg: number } => w.weightKg !== null && w.weightKg > 0)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const latest = weights.length > 0 ? weights[weights.length - 1].weightKg : null;
  const dailyDeficitKcal = num(p.target_daily_deficit_kcal) ?? DEFAULT_TARGET_DAILY_DEFICIT_KCAL;
  const { tdeeKcal } = resolveTdeeKcal({
    gender: (p.gender as Gender) ?? null,
    age: num(p.age),
    heightCm: num(p.height_cm),
    activityLevel: (p.activity_level as ActivityLevel) ?? null,
    weightKg: latest ?? num(p.start_weight_kg) ?? DEFAULT_START_WEIGHT_KG,
    calorieTargetKcal: num(p.calorie_target_kcal) ?? DEFAULT_CALORIE_TARGET,
    targetDailyDeficitKcal: dailyDeficitKcal,
  });

  const logs: Record<string, DailyNutritionLog> = {};
  for (const row of rows.nutrition) {
    const key = toDateKey(new Date(String(row.entry_date)));
    logs[key] = {
      dateISO: String(row.entry_date),
      mealsEaten: (row.meals_eaten ?? {}) as DailyNutritionLog['mealsEaten'],
      extraCalories: num(row.extra_calories) ?? 0,
      extraProteinG: num(row.extra_protein_g) ?? 0,
      extraItems: Array.isArray(row.extra_items) ? (row.extra_items as DailyNutritionLog['extraItems']) : [],
      waterMl: num(row.water_ml) ?? 0,
      removedMealSlots: Array.isArray(row.removed_meal_slots) ? (row.removed_meal_slots as DailyNutritionLog['removedMealSlots']) : [],
    };
  }

  const workoutEntries: WorkoutLogEntry[] = rows.workouts.map((row, i) => ({
    id: String(row.id ?? `w${i}`),
    dateISO: `${String(row.entry_date).slice(0, 10)}T12:00:00`,
    templateId: typeof row.template_id === 'string' ? row.template_id : null,
    label: String(row.label ?? ''),
    durationMin: num(row.duration_min) ?? 0,
    caloriesBurned: num(row.calories_burned) ?? 0,
  }));

  return {
    logs,
    workoutEntries,
    mealTemplates: rows.plan.mealTemplates,
    tdeeKcal,
    proteinTargetG: num(p.protein_target_g) ?? DEFAULT_PROTEIN_TARGET_G,
    limits: { purineMg: LIMITS.purineMg, saltG: LIMITS.saltG, sugarG: LIMITS.sugarG },
    weights,
    dailyDeficitKcal,
    waterTargetMl: num(p.water_target_ml) ?? DEFAULT_WATER_TARGET_ML,
  };
}
