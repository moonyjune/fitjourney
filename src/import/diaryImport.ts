import { HABIT_STATUSES, type Habit } from '../habits/types';
import { pushWeightEntry, pushWorkoutEntry } from '../sync/cloudSync';
import { useHabitStore } from '../store/useHabitStore';
import { useLearnStore } from '../store/useLearnStore';
import { useUricStore } from '../store/useUricStore';
import { isPlausibleUmol } from '../uric/analysis';
import type { UricReading } from '../uric/types';
import { useNutritionStore } from '../store/useNutritionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import type { ExtraFoodItem, ExtraMealTime, MealSlot, UserSettings, WeightEntry, WorkoutLogEntry } from '../types';

/**
 * Imports a personal diary file (built by scripts/diary-import/build_seed.py from the workbook) into the app.
 * The file is the source of truth for the days it covers: it is written to the device stores and then pushed to the
 * cloud through the normal sync, so after one import the cloud holds the same data. Importing the same file again
 * changes nothing (every record has a stable `diary-` id).
 */
export const DIARY_FORMAT = 'fitjourney-diary';
export const DIARY_ID_PREFIX = 'diary-';

type ImportedProfile = Partial<
  Pick<UserSettings, 'startWeightKg' | 'startDateISO' | 'calorieTargetKcal' | 'targetDailyDeficitKcal' | 'proteinTargetG'>
>;

export interface DiaryImportFile {
  format: typeof DIARY_FORMAT;
  version: 1;
  profile?: ImportedProfile;
  weights: WeightEntry[];
  nutrition: { dateISO: string; items: ExtraFoodItem[] }[];
  workouts: WorkoutLogEntry[];
  /** Optional: the habit list (files made before habits existed have none). */
  habits?: Habit[];
  /** Optional: the owner's own comment on each reading topic, by topic number. */
  learnNotes?: Record<string, string>;
  /** Optional: uric acid blood tests. */
  uric?: UricReading[];
  /** Optional: days with no water figure get `ml` of water (the diary has no water column; the owner counts these days as 3 L). */
  water?: { fromDateKey: string; toDateKey: string; ml: number };
}

export type DiaryParseResult = { ok: true; data: DiaryImportFile } | { ok: false; reason: 'notJson' | 'format' | 'invalid' };

export interface DiaryImportSummary {
  days: number;
  foodItems: number;
  weightsAdded: number;
  workoutsAdded: number;
  habitsAdded: number;
  notesLoaded: number;
  uricAdded: number;
  waterDays: number;
  profileUpdated: boolean;
}

const MEAL_TIMES: ExtraMealTime[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'late_afternoon_snack', 'dinner', 'evening_snack'];
const PLAN_SLOTS: MealSlot[] = ['meal1', 'meal2', 'meal3'];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_CHARS = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min;
const isISO = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDiaryId = (v: unknown): v is string => typeof v === 'string' && v.startsWith(DIARY_ID_PREFIX) && v.length > DIARY_ID_PREFIX.length;
const optNum = (v: unknown) => v === undefined || isNum(v);

function validItem(i: unknown): i is ExtraFoodItem {
  if (!isObj(i)) return false;
  return (
    isDiaryId(i.id) &&
    typeof i.name === 'string' &&
    i.name.length > 0 &&
    isNum(i.calories) &&
    isNum(i.proteinG) &&
    isISO(i.loggedAtISO) &&
    (i.mealTime === null || MEAL_TIMES.includes(i.mealTime as ExtraMealTime)) &&
    optNum(i.purineMg) &&
    optNum(i.saltG) &&
    optNum(i.sugarG) &&
    (i.junk === undefined || typeof i.junk === 'boolean')
  );
}

function validHabit(h: unknown): h is Habit {
  if (!isObj(h)) return false;
  return (
    isDiaryId(h.id) &&
    typeof h.name === 'string' &&
    h.name.trim().length > 0 &&
    HABIT_STATUSES.includes(h.status as Habit['status']) &&
    typeof h.assessment === 'string' &&
    typeof h.kaizen === 'string' &&
    typeof h.measuredBy === 'string' &&
    typeof h.tracked === 'boolean' &&
    (h.auto === null || h.auto === 'water' || h.auto === 'weigh' || h.auto === 'walk') &&
    isNum(h.sort) &&
    typeof h.archived === 'boolean'
  );
}

function validUric(u: unknown): u is UricReading {
  if (!isObj(u)) return false;
  return (
    isDiaryId(u.id) &&
    typeof u.dateKey === 'string' &&
    DAY_KEY.test(u.dateKey) &&
    typeof u.valueUmol === 'number' &&
    isPlausibleUmol(u.valueUmol) &&
    typeof u.note === 'string' &&
    u.note.length <= 300
  );
}

function validProfile(p: unknown): p is ImportedProfile {
  if (!isObj(p)) return false;
  return (
    (p.startWeightKg === undefined || isNum(p.startWeightKg, 1)) &&
    (p.startDateISO === undefined || isISO(p.startDateISO)) &&
    optNum(p.calorieTargetKcal) &&
    optNum(p.targetDailyDeficitKcal) &&
    optNum(p.proteinTargetG)
  );
}

/** Reads and checks the file text. Nothing is written; a file that fails any check is rejected as a whole. */
const MAX_WATER_DAYS = 400;
const MIN_WATER_ML = 500;
const MAX_WATER_ML = 10000;
const dayNumber = (key: string): number => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000;
/** A real calendar day (not just the YYYY-MM-DD shape: 2026-02-30 is not one). */
const isRealDay = (key: unknown): key is string => typeof key === 'string' && DAY_KEY.test(key) && new Date(dayNumber(key) * 86400000).toISOString().slice(0, 10) === key;

function validWater(v: unknown): v is NonNullable<DiaryImportFile['water']> {
  if (!isObj(v) || !isRealDay(v.fromDateKey) || !isRealDay(v.toDateKey) || typeof v.ml !== 'number') return false;
  const span = dayNumber(v.toDateKey) - dayNumber(v.fromDateKey);
  return span >= 0 && span < MAX_WATER_DAYS && v.ml >= MIN_WATER_ML && v.ml <= MAX_WATER_ML;
}

export function parseDiaryImport(text: string): DiaryParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  if (!isObj(raw) || raw.format !== DIARY_FORMAT || raw.version !== 1) return { ok: false, reason: 'format' };
  const { weights, nutrition, workouts, profile, habits, learnNotes, uric, water } = raw;
  if (!Array.isArray(weights) || !Array.isArray(nutrition) || !Array.isArray(workouts)) return { ok: false, reason: 'invalid' };
  if (profile !== undefined && !validProfile(profile)) return { ok: false, reason: 'invalid' };
  if (habits !== undefined && (!Array.isArray(habits) || !habits.every(validHabit) || new Set(habits.map((h: Habit) => h.id)).size !== habits.length)) {
    return { ok: false, reason: 'invalid' };
  }

  if (
    learnNotes !== undefined &&
    (!isObj(learnNotes) ||
      !Object.entries(learnNotes).every(([k, v]) => /^[1-9]\d{0,2}$/.test(k) && typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_NOTE_CHARS))
  ) {
    return { ok: false, reason: 'invalid' };
  }

  if (uric !== undefined && (!Array.isArray(uric) || !uric.every(validUric) || new Set(uric.map((u: UricReading) => u.id)).size !== uric.length)) {
    return { ok: false, reason: 'invalid' };
  }

  if (water !== undefined && !validWater(water)) return { ok: false, reason: 'invalid' };

  const weightsOk = weights.every(
    (w) => isObj(w) && isDiaryId(w.id) && isISO(w.dateISO) && isNum(w.weightKg, 1) && (w.note === undefined || typeof w.note === 'string')
  );
  const workoutsOk = workouts.every(
    (w) =>
      isObj(w) &&
      isDiaryId(w.id) &&
      isISO(w.dateISO) &&
      (w.templateId === null || typeof w.templateId === 'string') &&
      typeof w.label === 'string' &&
      isNum(w.durationMin) &&
      isNum(w.caloriesBurned)
  );
  const days = new Set<string>();
  const nutritionOk = nutrition.every((n) => {
    if (!isObj(n) || typeof n.dateISO !== 'string' || !DAY_KEY.test(n.dateISO) || days.has(n.dateISO)) return false;
    days.add(n.dateISO);
    return Array.isArray(n.items) && n.items.every(validItem) && new Set(n.items.map((i: ExtraFoodItem) => i.id)).size === n.items.length;
  });
  const unique = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size === rows.length;
  if (!weightsOk || !workoutsOk || !nutritionOk || !unique(weights as WeightEntry[]) || !unique(workouts as WorkoutLogEntry[])) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, data: raw as unknown as DiaryImportFile };
}

/** Writes a parsed diary into the device stores and syncs it to the cloud. Safe to run again with the same file. */
export function applyDiaryImport(data: DiaryImportFile): DiaryImportSummary {
  const summary: DiaryImportSummary = { days: 0, foodItems: 0, weightsAdded: 0, workoutsAdded: 0, habitsAdded: 0, notesLoaded: 0, uricAdded: 0, waterDays: 0, profileUpdated: false };

  if (data.profile && Object.keys(data.profile).length > 0) {
    useSettingsStore.getState().updateSettings(data.profile);
    summary.profileUpdated = true;
  }

  // Weights: add the ones this device does not have yet (by id), keep the list sorted by date.
  const haveWeights = new Set(useWeightStore.getState().entries.map((e) => e.id));
  const newWeights = data.weights.filter((w) => !haveWeights.has(w.id));
  if (newWeights.length > 0) {
    useWeightStore.setState((s) => ({
      entries: [...s.entries, ...newWeights].sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()),
    }));
    for (const w of newWeights) pushWeightEntry(w);
    summary.weightsAdded = newWeights.length;
  }

  // Workouts: new ones are added; a known id is overwritten with the diary's numbers.
  const store = useWorkoutStore.getState();
  for (const w of data.workouts) {
    if (store.entries.some((e) => e.id === w.id)) {
      useWorkoutStore.getState().updateEntry(w.id, { label: w.label, durationMin: w.durationMin, caloriesBurned: w.caloriesBurned, dateISO: w.dateISO });
    } else {
      useWorkoutStore.setState((s) => ({ entries: [...s.entries, w] }));
      pushWorkoutEntry(w);
      summary.workoutsAdded += 1;
    }
  }

  if (data.habits) summary.habitsAdded = useHabitStore.getState().importHabits(data.habits);

  if (data.uric) summary.uricAdded = useUricStore.getState().importReadings(data.uric);
  if (data.learnNotes) summary.notesLoaded = useLearnStore.getState().setNotes(data.learnNotes);

  // Water: a day with no water figure counts as drunk; a day that already has one (typed in the app) is left alone.
  if (data.water) {
    const { fromDateKey, toDateKey, ml } = data.water;
    for (let n = dayNumber(fromDateKey); n <= dayNumber(toDateKey); n += 1) {
      const dateKey = new Date(n * 86400000).toISOString().slice(0, 10);
      if (useNutritionStore.getState().getLog(dateKey).waterMl > 0) continue;
      useNutritionStore.getState().addWater(dateKey, ml);
      summary.waterDays += 1;
    }
  }

  // Food: for each day the diary's items replace the diary's earlier items; anything logged in the app is kept.
  // The plan's own meals were not what was eaten, so a plan slot is removed from the day unless it was ticked.
  for (const day of data.nutrition) {
    const current = useNutritionStore.getState().getLog(day.dateISO);
    const mine = (current.extraItems ?? []).filter((i) => !i.id.startsWith(DIARY_ID_PREFIX));
    const removed = PLAN_SLOTS.filter((slot) => !current.mealsEaten[slot]);
    useNutritionStore.getState().saveDayLog(day.dateISO, {
      mealsEaten: current.mealsEaten,
      extraItems: [...mine, ...day.items],
      removedMealSlots: removed,
    });
    summary.days += 1;
    summary.foodItems += day.items.length;
  }
  return summary;
}
