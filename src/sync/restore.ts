import { supabase } from '../lib/supabase';
import { HABIT_STATUSES, type CheckValue, type Habit, type HabitAuto, type HabitChecks } from '../habits/types';
import type { UricReading } from '../uric/types';
import { useFoodDbStore } from '../store/useFoodDbStore';
import { useHabitStore } from '../store/useHabitStore';
import { useLearnStore } from '../store/useLearnStore';
import { LIMIT_DEFAULTS, LIMIT_RANGE, useLimitsStore, type LimitKey } from '../store/useLimitsStore';
import { useMealModeStore } from '../store/useMealModeStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { TARGET_RANGE, useUricStore } from '../store/useUricStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { DEFAULT_TARGET_UMOL } from '../uric/types';
import type { DailyNutritionLog, ExtraFoodItem, MealSlot, WeightEntry, WorkoutLogEntry } from '../types';
import { dayHasFood, withIntakeCounters } from '../utils/dayIntake';
import { currentUserId, pushNutritionLog, pushUserData } from './cloudSync';
import { USER_DATA_KEYS } from './userDataKeys';

/**
 * Restores the signed-in user's own records from the cloud into the device stores: the app keeps a local copy of
 * everything and only pushes changes, so after signing out (which wipes the device) or on a new device the cloud copy is
 * what brings the diary back. Rule everywhere: what is already on this device wins (it is newer or the user's edit);
 * the cloud only fills in what is missing.
 */

type Row = Record<string, unknown>;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 1000;
/** Rows saved without a time of day are put at midday in Vietnam (05:00 UTC), the same time the diary import uses. */
const DEFAULT_TIME = 'T05:00:00.000Z';
const MEAL_SLOTS: MealSlot[] = ['meal1', 'meal2', 'meal3'];

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dayKey = (v: unknown): string | null => (typeof v === 'string' && DAY_KEY.test(v.slice(0, 10)) ? v.slice(0, 10) : null);

export function mergeWeights(local: WeightEntry[], rows: Row[]): WeightEntry[] {
  const have = new Set(local.map((e) => e.id));
  const haveSameReading = (date: string, kg: number) => local.some((e) => e.dateISO.slice(0, 10) === date && Math.abs(e.weightKg - kg) < 0.001);
  // Rows from before weigh-ins had an id of their own: only keep one when nothing else already shows the same reading.
  const identified = rows.filter((r) => str(r.client_id));
  const added: WeightEntry[] = [];
  const perDay: Record<string, number> = {};
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    const kg = num(r.weight_kg);
    if (!date || !(kg > 0)) continue;
    const clientId = str(r.client_id);
    const id = clientId || `cloud-${str(r.id)}`;
    if (have.has(id)) continue;
    if (!clientId && (haveSameReading(date, kg) || identified.some((o) => dayKey(o.entry_date) === date && Math.abs(num(o.weight_kg) - kg) < 0.001))) continue;
    if (!clientId && added.some((a) => a.dateISO.slice(0, 10) === date && Math.abs(a.weightKg - kg) < 0.001)) continue;
    const logged = str(r.logged_at);
    const n = (perDay[date] = (perDay[date] ?? 0) + 1);
    // Without a recorded time, several readings of one day keep their saved order, a minute apart.
    const dateISO = logged && !Number.isNaN(Date.parse(logged)) ? new Date(logged).toISOString() : `${date}T05:${String(n - 1).padStart(2, '0')}:00.000Z`;
    added.push({ id, dateISO, weightKg: kg, ...(str(r.note) ? { note: str(r.note) } : {}) });
    have.add(id);
  }
  return added;
}

export function mergeNutrition(local: Record<string, DailyNutritionLog>, rows: Row[]): Record<string, DailyNutritionLog> {
  const added: Record<string, DailyNutritionLog> = {};
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    if (!date || local[date]) continue;
    const items = Array.isArray(r.extra_items) ? (r.extra_items as ExtraFoodItem[]).filter((i) => i && typeof i.id === 'string' && typeof i.name === 'string') : [];
    const eaten: Partial<Record<MealSlot, boolean>> = {};
    const raw = (r.meals_eaten ?? {}) as Record<string, unknown>;
    for (const slot of MEAL_SLOTS) if (raw[slot] === true) eaten[slot] = true;
    const removed = Array.isArray(r.removed_meal_slots) ? (r.removed_meal_slots as unknown[]).filter((s): s is MealSlot => MEAL_SLOTS.includes(s as MealSlot)) : [];
    added[date] = {
      dateISO: date,
      mealsEaten: eaten,
      extraCalories: num(r.extra_calories),
      extraProteinG: num(r.extra_protein_g),
      extraItems: items,
      waterMl: num(r.water_ml),
      ...(removed.length > 0 ? { removedMealSlots: removed } : {}),
    };
  }
  return added;
}

const rowHasFood = (r: Row): boolean =>
  (Array.isArray(r.extra_items) && r.extra_items.length > 0) || num(r.extra_calories) > 0 || Object.values((r.meals_eaten ?? {}) as Record<string, unknown>).some((v) => v === true);

/** Days this device holds with no food (e.g. only the default water) while the cloud has food for them (e.g. a diary seeded in SQL, or
 *  eaten on another device). Food is taken from the cloud; the device's own water figure stays when it has one. */
export function foodFills(local: Record<string, DailyNutritionLog>, rows: Row[]): Record<string, DailyNutritionLog> {
  const fills: Record<string, DailyNutritionLog> = {};
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    if (!date || !local[date] || dayHasFood(local[date]) || !rowHasFood(r)) continue;
    const cloud = mergeNutrition({}, [r])[date];
    if (!cloud) continue;
    fills[date] = withIntakeCounters({ ...cloud, waterMl: local[date].waterMl > 0 ? local[date].waterMl : cloud.waterMl });
  }
  return fills;
}

/** Days with food on this device that the cloud does not have food for (the push never arrived): they are sent up. */
export function daysToPush(local: Record<string, DailyNutritionLog>, rows: Row[]): DailyNutritionLog[] {
  const cloudFood = new Set(rows.filter(rowHasFood).map((r) => dayKey(r.entry_date)));
  return Object.entries(local)
    .filter(([date, log]) => DAY_KEY.test(date) && dayHasFood(log) && !cloudFood.has(date))
    .map(([, log]) => log);
}

/** Days this device already has but with no water figure, while the cloud has one (e.g. seeded in SQL). */
export function waterFills(local: Record<string, DailyNutritionLog>, rows: Row[]): Record<string, number> {
  const fills: Record<string, number> = {};
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    const ml = num(r.water_ml);
    if (date && local[date] && !(local[date].waterMl > 0) && ml > 0) fills[date] = ml;
  }
  return fills;
}

export function mergeWorkouts(local: WorkoutLogEntry[], rows: Row[]): WorkoutLogEntry[] {
  const have = new Set(local.map((e) => e.id));
  const added: WorkoutLogEntry[] = [];
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    if (!date) continue;
    const clientId = str(r.client_id);
    const id = clientId || `cloud-${str(r.id)}`;
    if (have.has(id)) continue;
    const entry: WorkoutLogEntry = {
      id,
      dateISO: `${date}${DEFAULT_TIME}`,
      templateId: str(r.template_id) || null,
      label: str(r.label),
      durationMin: num(r.duration_min),
      caloriesBurned: num(r.calories_burned),
    };
    const same = (o: WorkoutLogEntry) => o.dateISO.slice(0, 10) === date && o.label === entry.label && o.durationMin === entry.durationMin;
    if (!clientId && [...local, ...added].some(same)) continue;
    added.push(entry);
    have.add(id);
  }
  return added;
}

export function mergeHabits(local: Habit[], rows: Row[]): Habit[] {
  const have = new Set(local.map((h) => h.id));
  const added: Habit[] = [];
  for (const r of rows) {
    const id = str(r.client_id);
    if (!id || have.has(id)) continue;
    const status = HABIT_STATUSES.find((s) => s === r.status) ?? 'todo';
    const auto = r.auto === 'water' || r.auto === 'weigh' || r.auto === 'walk' ? (r.auto as HabitAuto) : null;
    added.push({
      id,
      name: str(r.name),
      status,
      assessment: str(r.assessment),
      kaizen: str(r.kaizen),
      measuredBy: str(r.measured_by),
      tracked: r.tracked === true,
      auto,
      sort: num(r.sort),
      archived: r.archived === true,
    });
    have.add(id);
  }
  return added;
}

/** Ticks missing on this device; a tick already there (even a different one) is kept. */
export function mergeChecks(local: HabitChecks, rows: Row[]): HabitChecks {
  const next: HabitChecks = {};
  for (const [d, day] of Object.entries(local)) next[d] = { ...day };
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    const habitId = str(r.habit_client_id);
    const value = r.value === 'done' || r.value === 'missed' ? (r.value as CheckValue) : null;
    if (!date || !habitId || !value) continue;
    const day = (next[date] ??= {});
    if (!(habitId in day)) day[habitId] = value;
  }
  return next;
}

export function mergeUric(local: UricReading[], rows: Row[]): UricReading[] {
  const have = new Set(local.map((r) => r.id));
  const added: UricReading[] = [];
  for (const r of rows) {
    const id = str(r.client_id);
    const date = dayKey(r.entry_date);
    const value = num(r.value_umol);
    if (!id || !date || !(value > 0) || have.has(id)) continue;
    added.push({ id, dateKey: date, valueUmol: value, note: str(r.note) });
    have.add(id);
  }
  return added;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Brings the user's saved settings back; anything the user already changed on this device wins and is saved again to the cloud. */
function restoreUserData(remote: Map<string, unknown>): void {
  const notes = remote.get(USER_DATA_KEYS.learnNotes);
  const remoteNotes: Record<string, string> = {};
  if (isObj(notes)) for (const [k, v] of Object.entries(notes)) if (typeof v === 'string') remoteNotes[k] = v;
  const localNotes = useLearnStore.getState().notes;
  const mergedNotes = { ...remoteNotes, ...localNotes };
  if (!sameJson(mergedNotes, localNotes)) useLearnStore.setState({ notes: mergedNotes });
  if (Object.keys(localNotes).length > 0 && !sameJson(mergedNotes, remoteNotes)) void pushUserData(USER_DATA_KEYS.learnNotes, mergedNotes);

  const target = remote.get(USER_DATA_KEYS.uricTarget);
  const localTarget = useUricStore.getState().targetUmol;
  if (localTarget === DEFAULT_TARGET_UMOL) {
    if (typeof target === 'number' && target >= TARGET_RANGE.min && target <= TARGET_RANGE.max) useUricStore.setState({ targetUmol: target });
  } else if (target !== localTarget) void pushUserData(USER_DATA_KEYS.uricTarget, localTarget);

  const limits = remote.get(USER_DATA_KEYS.limits);
  const local = useLimitsStore.getState();
  const localLimits = { purineMg: local.purineMg, saltG: local.saltG, sugarG: local.sugarG };
  if (sameJson(localLimits, LIMIT_DEFAULTS)) {
    if (isObj(limits)) {
      const next: Partial<Record<LimitKey, number>> = {};
      for (const key of Object.keys(LIMIT_RANGE) as LimitKey[]) {
        const v = limits[key];
        if (typeof v === 'number' && v >= LIMIT_RANGE[key].min && v <= LIMIT_RANGE[key].max) next[key] = v;
      }
      useLimitsStore.setState(next);
    }
  } else if (!sameJson(limits, localLimits)) void pushUserData(USER_DATA_KEYS.limits, localLimits);

  // Meal mode: fasting is on by default, so an off setting is the only thing worth keeping. This device still on the default takes the
  // cloud's choice; a device that chose off pushes it.
  const mealMode = remote.get(USER_DATA_KEYS.mealMode);
  const remoteFasting = isObj(mealMode) && typeof mealMode.fasting === 'boolean' ? mealMode.fasting : null;
  const localFasting = useMealModeStore.getState().fasting;
  if (localFasting) {
    if (remoteFasting === false) useMealModeStore.setState({ fasting: false });
  } else if (remoteFasting !== false) void pushUserData(USER_DATA_KEYS.mealMode, { fasting: false });

  const foods = remote.get(USER_DATA_KEYS.foodDb);
  const localFoods = useFoodDbStore.getState();
  const remoteCustom = isObj(foods) && Array.isArray(foods.custom) ? (foods.custom as { id?: unknown }[]).filter((f) => f && typeof f.id === 'string') : [];
  const remoteOverrides = isObj(foods) && isObj(foods.overrides) ? foods.overrides : {};
  const haveFoods = new Set(localFoods.custom.map((f) => f.id));
  const custom = [...localFoods.custom, ...(remoteCustom.filter((f) => !haveFoods.has(f.id as string)) as typeof localFoods.custom)];
  const overrides = { ...remoteOverrides, ...localFoods.overrides } as typeof localFoods.overrides;
  if (custom.length !== localFoods.custom.length || !sameJson(overrides, localFoods.overrides)) useFoodDbStore.setState({ custom, overrides });
  if ((custom.length > 0 || Object.keys(overrides).length > 0) && !sameJson({ custom, overrides }, foods)) void pushUserData(USER_DATA_KEYS.foodDb, { custom, overrides });
}

/** Every row of the user's own data in a table, page by page (the server returns at most 1000 rows per request). */
async function fetchAll(table: string, userId: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export interface RestoreResult {
  /** False when the user is signed out/on the dev login, or a request failed (nothing is half-applied per table). */
  ok: boolean;
  weights: number;
  days: number;
  workouts: number;
  habits: number;
  uric: number;
}

const EMPTY: RestoreResult = { ok: false, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 };

let inFlight: Promise<RestoreResult> | null = null;

/** Pulls the signed-in user's records and settings from the cloud and merges them into the device stores. Never throws. */
export function restoreOwnData(): Promise<RestoreResult> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<RestoreResult> {
  const userId = currentUserId();
  if (!userId) return EMPTY;
  try {
    const [weights, nutrition, workouts, habits, checks, uric, userData] = await Promise.all([
      fetchAll('weight_entries', userId),
      fetchAll('nutrition_logs', userId),
      fetchAll('workout_entries', userId),
      fetchAll('habits', userId),
      fetchAll('habit_checks', userId),
      fetchAll('uric_readings', userId),
      supabase.from('user_data').select('key,value').eq('user_id', userId).then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as { key: string; value: unknown }[];
      }),
    ]);
    // Signed out or switched account while the requests were running: do not put someone else's data on this device.
    if (currentUserId() !== userId) return EMPTY;

    const result: RestoreResult = { ok: true, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 };
    // Each merge reads the stores at the moment it applies, so anything logged while the requests ran is kept.
    const newWeights = mergeWeights(useWeightStore.getState().entries, weights);
    if (newWeights.length > 0) {
      useWeightStore.setState((s) => ({
        entries: [...s.entries, ...mergeWeights(s.entries, weights)].sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()),
      }));
      result.weights = newWeights.length;
    }
    const newLogs = mergeNutrition(useNutritionStore.getState().logs, nutrition);
    result.days = Object.keys(newLogs).length;
    if (result.days > 0) useNutritionStore.setState((s) => ({ logs: { ...mergeNutrition(s.logs, nutrition), ...s.logs } }));
    const food = foodFills(useNutritionStore.getState().logs, nutrition);
    if (Object.keys(food).length > 0) {
      useNutritionStore.setState((s) => ({ logs: { ...s.logs, ...foodFills(s.logs, nutrition) } }));
      result.days += Object.keys(food).length;
    }
    for (const log of daysToPush(useNutritionStore.getState().logs, nutrition)) void pushNutritionLog(log);
    const fills = waterFills(useNutritionStore.getState().logs, nutrition);
    if (Object.keys(fills).length > 0) {
      useNutritionStore.setState((s) => {
        const logs = { ...s.logs };
        for (const [date, ml] of Object.entries(waterFills(s.logs, nutrition))) logs[date] = { ...logs[date], waterMl: ml };
        return { logs };
      });
    }
    const newWorkouts = mergeWorkouts(useWorkoutStore.getState().entries, workouts);
    if (newWorkouts.length > 0) {
      useWorkoutStore.setState((s) => ({ entries: [...s.entries, ...mergeWorkouts(s.entries, workouts)] }));
      result.workouts = newWorkouts.length;
    }
    const newHabits = mergeHabits(useHabitStore.getState().habits, habits);
    if (newHabits.length > 0) {
      useHabitStore.setState((s) => ({ habits: [...s.habits, ...mergeHabits(s.habits, habits)].sort((a, b) => a.sort - b.sort) }));
      result.habits = newHabits.length;
    }
    useHabitStore.setState((s) => ({ checks: mergeChecks(s.checks, checks) }));
    const newUric = mergeUric(useUricStore.getState().readings, uric);
    if (newUric.length > 0) {
      useUricStore.setState((s) => ({ readings: [...s.readings, ...mergeUric(s.readings, uric)] }));
      result.uric = newUric.length;
    }
    restoreUserData(new Map(userData.map((d) => [d.key, d.value])));
    return result;
  } catch (error) {
    console.warn('[restore] restoreOwnData failed:', error);
    return EMPTY;
  }
}
