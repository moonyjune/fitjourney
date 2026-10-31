import { supabase } from '../lib/supabase';
import { HABIT_STATUSES, type CheckValue, type Habit, type HabitAuto, type HabitChecks } from '../habits/types';
import type { UricReading } from '../uric/types';
import { cleanCookbook, cookbookForCloud } from '../cookbook/recipes';
import { useCookbookStore } from '../store/useCookbookStore';
import { useFoodDbStore } from '../store/useFoodDbStore';
import { useHabitStore } from '../store/useHabitStore';
import { useLearnStore } from '../store/useLearnStore';
import { LIMIT_DEFAULTS, LIMIT_RANGE, useLimitsStore, type LimitKey } from '../store/useLimitsStore';
import { cleanMealPrefs, NO_MEAL_PREFS, pick as pickPrefs, useMealPrefStore } from '../store/useMealPrefStore';
import { useMealModeStore } from '../store/useMealModeStore';
import { useAnalysisStore } from '../store/useAnalysisStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { TARGET_RANGE, useUricStore } from '../store/useUricStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { DEFAULT_TARGET_UMOL } from '../uric/types';
import type { DailyNutritionLog, ExtraFoodItem, FeelingRecord, MealSlot, Mood, WeightEntry, WorkoutCondition, WorkoutLogEntry } from '../types';
import { useFeelingStore } from '../store/useFeelingStore';
import { withIntakeCounters } from '../utils/dayIntake';
import { toDateKey } from '../utils/date';
import { currentUserId, pushFeelingRecord, pushNutritionLog, pushUserData, whenPushesSettled } from './cloudSync';
import { pendingKeys } from './syncQueue';
import { healLog, uniqueExtraIds } from '../utils/extraIds';
import { restoreProofPhotos } from './restorePhotos';
import { USER_DATA_KEYS } from './userDataKeys';

/**
 * Brings the device in line with the cloud. The cloud is the source of truth for the diary (food, water, weigh-ins, workouts,
 * check-ins, habits and ticks, uric acid): after a restore the device holds exactly the cloud's records. The only exception is a
 * record with a write still waiting in the retry queue: there the device's copy (or its removal) is newer and is kept until it is sent.
 * A record the device has but the cloud does not, with nothing waiting, is gone from the device too (it was removed elsewhere, or is
 * an old copy the browser brought back). Settings (user_data) keep their own rules below.
 */

type Row = Record<string, unknown>;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 1000;
/** Rows saved without a time of day are put at midday in Vietnam (05:00 UTC), the same time the diary import uses. */
const DEFAULT_TIME = 'T05:00:00.000Z';
const MEAL_SLOTS: MealSlot[] = ['meal1', 'meal2', 'meal3'];
const MOODS: Mood[] = ['great', 'good', 'neutral', 'stressed', 'tired'];
const WORKOUT_CONDITIONS: WorkoutCondition[] = ['energetic', 'normal', 'tired', 'sore', 'skipped'];

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
    added[date] = healLog({
      dateISO: date,
      mealsEaten: eaten,
      extraCalories: num(r.extra_calories),
      extraProteinG: num(r.extra_protein_g),
      extraItems: items,
      waterMl: num(r.water_ml),
      ...(removed.length > 0 ? { removedMealSlots: removed } : {}),
    });
  }
  return added;
}

const foodShape = (log: Pick<DailyNutritionLog, 'extraItems' | 'mealsEaten' | 'removedMealSlots'>): string =>
  JSON.stringify({
    items: (log.extraItems ?? []).map(({ photoUri: _photo, ...rest }) => rest),
    eaten: MEAL_SLOTS.filter((s) => log.mealsEaten?.[s]),
    removed: [...(log.removedMealSlots ?? [])].sort(),
  });

const DAY_MS = 86_400_000;

/** When a workout row started. `started_at` when the row has it; for older rows (only a date was stored) the time the
 *  row was first written, less the workout's length, as long as that lands on the row's date or the day after (older
 *  rows stored the UTC date, a day early for early-morning workouts); otherwise midday of the row's date. */
export function workoutStart(r: Row, date: string): string {
  const started = str(r.started_at);
  if (started && !Number.isNaN(Date.parse(started))) return new Date(started).toISOString();
  const created = str(r.created_at);
  if (created && !Number.isNaN(Date.parse(created))) {
    const start = new Date(Date.parse(created) - num(r.duration_min) * 60_000);
    const day = toDateKey(start);
    if (day === date || day === toDateKey(new Date(Date.parse(`${date}T12:00:00`) + DAY_MS))) return start.toISOString();
  }
  return `${date}${DEFAULT_TIME}`;
}

/** The per-exercise results of a row, kept only when they have the expected shape. */
function workoutDetails(v: unknown): WorkoutLogEntry['details'] | undefined {
  const exercises = (v as { exercises?: unknown } | null)?.exercises;
  if (!Array.isArray(exercises)) return undefined;
  const ok = exercises.every((e) => e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string' && Array.isArray((e as { results?: unknown }).results));
  return ok ? (v as WorkoutLogEntry['details']) : undefined;
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
    const details = workoutDetails(r.details);
    const entry: WorkoutLogEntry = {
      id,
      dateISO: workoutStart(r, date),
      templateId: str(r.template_id) || null,
      label: str(r.label),
      durationMin: num(r.duration_min),
      caloriesBurned: num(r.calories_burned),
      ...(details ? { details } : {}),
    };
    const same = (o: WorkoutLogEntry) => (o.dateISO.slice(0, 10) === date || toDateKey(new Date(o.dateISO)) === date) && o.label === entry.label && o.durationMin === entry.durationMin;
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
      // Only a real mark: no column yet (older cloud) or null both mean "follow the data".
      ...(typeof r.formed_mark === 'boolean' ? { formedMark: r.formed_mark } : {}),
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


/** The cloud's records, except where a write is waiting (key `prefix + id`): there the device's copy is kept, or left out when the device
 *  removed it. With `preferLocal` the device's own object is kept for a record the cloud also has (fields the cloud does not store, such as
 *  a workout's time of day). */
export function reconcile<T extends { id: string }>(local: T[], cloud: T[], pending: Set<string>, prefix: string, preferLocal: boolean): T[] {
  const localById = new Map(local.map((e) => [e.id, e]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const c of cloud) {
    if (seen.has(c.id) || pending.has(prefix + c.id)) continue;
    seen.add(c.id);
    out.push(preferLocal ? (localById.get(c.id) ?? c) : c);
  }
  for (const l of local) if (!seen.has(l.id) && pending.has(prefix + l.id)) out.push(l);
  return out;
}

/** The days as the cloud has them (food and water), except days with a write waiting, which stay as they are here. The device's photo
 *  files are kept on the foods that still exist; a day the cloud has the same as the device keeps the device's object. */
export function reconcileNutrition(local: Record<string, DailyNutritionLog>, rows: Row[], pending: Set<string>): Record<string, DailyNutritionLog> {
  const out: Record<string, DailyNutritionLog> = {};
  for (const r of rows) {
    const date = dayKey(r.entry_date);
    if (!date || pending.has(`day:${date}`)) continue;
    const cloud = mergeNutrition({}, [r])[date];
    if (!cloud) continue;
    const mine = local[date];
    if (mine && foodShape(mine) === foodShape(cloud) && mine.waterMl === cloud.waterMl) {
      out[date] = mine;
      continue;
    }
    const photos = new Map((mine?.extraItems ?? []).map((i) => [i.id, i.photoUri]));
    const extraItems = cloud.extraItems.map((i) => (photos.get(i.id) && !i.photoUri ? { ...i, photoUri: photos.get(i.id) } : i));
    out[date] = withIntakeCounters({ ...cloud, extraItems });
  }
  for (const [date, log] of Object.entries(local)) if (!out[date] && pending.has(`day:${date}`)) out[date] = log;
  return out;
}

export function feelingsFromRows(rows: Row[]): FeelingRecord[] {
  const out: FeelingRecord[] = [];
  for (const r of rows) {
    const logged = str(r.logged_at);
    const mood = MOODS.find((m) => m === r.mood);
    if (!logged || Number.isNaN(Date.parse(logged)) || !mood) continue;
    const condition = WORKOUT_CONDITIONS.find((c) => c === r.workout_condition) ?? null;
    out.push({
      id: str(r.client_id) || `cloud-${str(r.id)}`,
      loggedAtISO: new Date(logged).toISOString(),
      cravingLevel: num(r.craving_level),
      hungerLevel: num(r.hunger_level),
      mood,
      workoutCondition: condition,
      note: str(r.note),
    });
  }
  return out.sort((a, b) => a.loggedAtISO.localeCompare(b.loggedAtISO));
}

/** Check-ins on this device the cloud never got: until the check-in id existed they were sent without one, so some never arrived. They are
 *  sent up once (not those the cloud already has from that time). */
export function feelingsToUpload(local: FeelingRecord[], cloud: FeelingRecord[]): FeelingRecord[] {
  const ids = new Set(cloud.map((c) => c.id));
  const times = new Set(cloud.map((c) => Date.parse(c.loggedAtISO)));
  return local.filter((l) => !ids.has(l.id) && !times.has(Date.parse(l.loggedAtISO)));
}

/** Ticks as the cloud has them, except a tick with a write waiting, which stays as it is here. */
export function reconcileChecks(local: HabitChecks, rows: Row[], pending: Set<string>): HabitChecks {
  const next = mergeChecks({}, rows);
  for (const [date, day] of Object.entries(next)) for (const habitId of Object.keys(day)) if (pending.has(`check:${habitId}:${date}`)) delete day[habitId];
  for (const [date, day] of Object.entries(local))
    for (const [habitId, value] of Object.entries(day)) if (pending.has(`check:${habitId}:${date}`)) (next[date] ??= {})[habitId] = value;
  for (const date of Object.keys(next)) if (Object.keys(next[date]).length === 0) delete next[date];
  return next;
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

  // Analysis refresh: automatic by default, so manual is the only choice worth keeping. Same rule as the meal mode.
  const analysis = remote.get(USER_DATA_KEYS.analysisMode);
  const remoteManual = isObj(analysis) && analysis.mode === 'manual';
  if (useAnalysisStore.getState().mode === 'auto') {
    if (remoteManual) useAnalysisStore.setState({ mode: 'manual' });
  } else if (!remoteManual) void pushUserData(USER_DATA_KEYS.analysisMode, { mode: 'manual' });

  // Meal preferences (calories / protein wanted per meal): a device with none set takes the cloud's; a device with some pushes them.
  const prefsLocal = pickPrefs(useMealPrefStore.getState());
  const prefsRemote = remote.get(USER_DATA_KEYS.mealPrefs);
  if (sameJson(prefsLocal, NO_MEAL_PREFS)) {
    if (isObj(prefsRemote)) useMealPrefStore.setState(cleanMealPrefs(prefsRemote));
  } else if (!sameJson(prefsLocal, prefsRemote)) void pushUserData(USER_DATA_KEYS.mealPrefs, prefsLocal);

  // Cook book: dishes only the cloud has are added; the device's own copy wins, and what only the device has is saved up.
  const remoteBook = cleanCookbook(remote.get(USER_DATA_KEYS.cookbook));
  useCookbookStore.getState().merge(remoteBook);
  const book = useCookbookStore.getState().recipes;
  const haveRemote = new Set(remoteBook.map((r) => r.id));
  if (book.some((r) => !haveRemote.has(r.id))) void pushUserData(USER_DATA_KEYS.cookbook, cookbookForCloud(book));

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
    // Writes still on their way would make the cloud copy read below look older than the device's.
    await whenPushesSettled();
    const [weights, nutrition, workouts, habits, checks, uric, feelings, userData] = await Promise.all([
      fetchAll('weight_entries', userId),
      fetchAll('nutrition_logs', userId),
      fetchAll('workout_entries', userId),
      fetchAll('habits', userId),
      fetchAll('habit_checks', userId),
      fetchAll('uric_readings', userId),
      fetchAll('feeling_records', userId),
      supabase.from('user_data').select('key,value').eq('user_id', userId).then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as { key: string; value: unknown }[];
      }),
    ]);
    // Signed out or switched account while the requests were running: do not put someone else's data on this device.
    if (currentUserId() !== userId) return EMPTY;

    const result: RestoreResult = { ok: true, weights: 0, days: 0, workouts: 0, habits: 0, uric: 0 };
    // Read at the moment each store is set, so a write made while the requests ran is still treated as waiting.
    const pending = () => pendingKeys();

    useNutritionStore.setState((s) => {
      const logs = reconcileNutrition(s.logs, nutrition, pending());
      result.days = Object.keys(logs).filter((d) => logs[d] !== s.logs[d]).length + Object.keys(s.logs).filter((d) => !logs[d]).length;
      return { logs };
    });
    // A cloud day saved with two foods under one id is repaired on the device (healLog); the repaired copy goes back up.
    for (const r of nutrition) {
      const date = dayKey(r.entry_date);
      const items = Array.isArray(r.extra_items) ? (r.extra_items as { id?: unknown }[]).filter((i) => i && typeof i.id === 'string') : [];
      const log = date ? useNutritionStore.getState().logs[date] : undefined;
      if (log && uniqueExtraIds(items as { id: string }[]).changed) void pushNutritionLog(healLog(log));
    }

    const cloudWeights = mergeWeights([], weights);
    useWeightStore.setState((s) => {
      const entries = reconcile(s.entries, cloudWeights, pending(), 'weight:', true).sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
      result.weights = Math.abs(entries.length - s.entries.length);
      return { entries };
    });
    const cloudWorkouts = mergeWorkouts([], workouts);
    useWorkoutStore.setState((s) => {
      const entries = reconcile(s.entries, cloudWorkouts, pending(), 'workout:', true);
      result.workouts = Math.abs(entries.length - s.entries.length);
      return { entries };
    });
    const cloudHabits = mergeHabits([], habits);
    useHabitStore.setState((s) => {
      const list = reconcile(s.habits, cloudHabits, pending(), 'habit:', false).sort((a, b) => a.sort - b.sort);
      result.habits = Math.abs(list.length - s.habits.length);
      return { habits: list, checks: reconcileChecks(s.checks, checks, pending()) };
    });
    const cloudUric = mergeUric([], uric);
    useUricStore.setState((s) => {
      const readings = reconcile(s.readings, cloudUric, pending(), 'uric:', false);
      result.uric = Math.abs(readings.length - s.readings.length);
      return { readings };
    });

    const cloudFeelings = feelingsFromRows(feelings);
    const upload = useFeelingStore.getState().cloudChecked ? [] : feelingsToUpload(useFeelingStore.getState().records, cloudFeelings);
    useFeelingStore.setState((s) => ({ records: [...reconcile(s.records, cloudFeelings, pending(), 'feeling:', true), ...upload].sort((a, b) => a.loggedAtISO.localeCompare(b.loggedAtISO)), cloudChecked: true }));
    for (const record of upload) void pushFeelingRecord(record);

    restoreUserData(new Map(userData.map((d) => [d.key, d.value])));
    void restoreProofPhotos();
    return result;
  } catch (error) {
    console.warn('[restore] restoreOwnData failed:', error);
    return EMPTY;
  }
}
