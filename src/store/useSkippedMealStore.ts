import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

/** Days kept: a skip older than this no longer matters to any colour. */
const KEEP_DAYS = 400;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Date key (YYYY-MM-DD) → ids of the meals skipped on purpose that day (a normal day's `breakfast` / `lunch` / `dinner`, or a fasting
 *  plan's slot ids). What the day engine reads. */
export type SkippedMeals = Record<string, string[]>;

/** One meal's mark: skipped or un-skipped (a tombstone, so an undo on one device is not brought back by another), and when (ms). */
export interface SkipEntry {
  skipped: boolean;
  at: number;
}
/** Date key → meal id → its latest mark. The synced form: the newest mark of each (day, meal) wins. */
export type SkipEntries = Record<string, Record<string, SkipEntry>>;

/** The cloud payload (user_data `skippedMeals`). `days` is kept beside `entries` for devices still on the old version, which read
 *  only `days`; a new device reads `entries` when present. */
export interface SkippedMealsPayload {
  v: 2;
  entries: SkipEntries;
  days: SkippedMeals;
}

interface SkippedMealState {
  days: SkippedMeals;
  entries: SkipEntries;
  isSkipped: (dateKey: string, mealId: string) => boolean;
  /** Marks the meal as skipped that day, or un-marks it when it already is. */
  toggle: (dateKey: string, mealId: string) => void;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valid date keys only, each with its unique non-empty ids; empty days dropped; the newest KEEP_DAYS days kept. */
export function cleanSkippedMeals(value: unknown): SkippedMeals {
  if (!isObj(value)) return {};
  const out: SkippedMeals = {};
  const keys = Object.keys(value)
    .filter((k) => DATE_KEY.test(k))
    .sort()
    .reverse()
    .slice(0, KEEP_DAYS);
  for (const k of keys) {
    const ids = value[k];
    if (!Array.isArray(ids)) continue;
    const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort();
    if (clean.length > 0) out[k] = clean;
  }
  return out;
}

/** Valid date keys and marks only, empty days dropped, the newest KEEP_DAYS days kept (keys in a stable order). */
export function cleanSkipEntries(value: unknown): SkipEntries {
  if (!isObj(value)) return {};
  const out: SkipEntries = {};
  const keys = Object.keys(value)
    .filter((k) => DATE_KEY.test(k))
    .sort()
    .reverse()
    .slice(0, KEEP_DAYS);
  for (const k of keys) {
    const day = value[k];
    if (!isObj(day)) continue;
    const clean: Record<string, SkipEntry> = {};
    for (const id of Object.keys(day).sort()) {
      const e = day[id];
      if (!id || !isObj(e) || typeof e.skipped !== 'boolean') continue;
      const at = typeof e.at === 'number' && Number.isFinite(e.at) && e.at > 0 ? Math.round(e.at) : 0;
      clean[id] = { skipped: e.skipped, at };
    }
    if (Object.keys(clean).length > 0) out[k] = clean;
  }
  return out;
}

/** The old per-day lists as marks: skipped, with no time (any timed mark beats them). */
export function entriesFromDays(days: SkippedMeals): SkipEntries {
  const out: SkipEntries = {};
  for (const [k, ids] of Object.entries(cleanSkippedMeals(days))) out[k] = Object.fromEntries(ids.map((id) => [id, { skipped: true, at: 0 }]));
  return out;
}

/** The meals currently skipped, by day (what the engine reads). */
export function daysFromEntries(entries: SkipEntries): SkippedMeals {
  const out: Record<string, string[]> = {};
  for (const [k, day] of Object.entries(entries)) {
    const ids = Object.keys(day).filter((id) => day[id].skipped);
    if (ids.length > 0) out[k] = ids;
  }
  return cleanSkippedMeals(out);
}

/** The marks of a cloud payload: the new `{ v: 2, entries }`, or the old `{ days }` read as skips with no time. */
export function readSkippedPayload(raw: unknown): SkipEntries {
  if (!isObj(raw)) return {};
  if (isObj(raw.entries)) return cleanSkipEntries(raw.entries);
  return entriesFromDays(cleanSkippedMeals(raw.days));
}

export function skippedPayload(entries: SkipEntries): SkippedMealsPayload {
  return { v: 2, entries, days: daysFromEntries(entries) };
}

/** Last writer wins per (day, meal): the newer mark is kept, an un-skip included. Equal times (two old-format marks) keep the skip. */
export function mergeSkipEntries(a: SkipEntries, b: SkipEntries): SkipEntries {
  const joined: SkipEntries = {};
  for (const side of [a, b]) {
    for (const [k, day] of Object.entries(side)) {
      const into = (joined[k] = { ...(joined[k] ?? {}) });
      for (const [id, e] of Object.entries(day)) {
        const prev = into[id];
        if (!prev || e.at > prev.at || (e.at === prev.at && e.skipped && !prev.skipped)) into[id] = e;
      }
    }
  }
  return cleanSkipEntries(joined);
}

/** Both day lists joined (old format; kept for callers that only have lists). */
export function mergeSkippedMeals(a: SkippedMeals, b: SkippedMeals): SkippedMeals {
  return daysFromEntries(mergeSkipEntries(entriesFromDays(a), entriesFromDays(b)));
}

export const useSkippedMealStore = create<SkippedMealState>()(
  persist(
    (set, get) => ({
      days: {},
      entries: {},
      isSkipped: (dateKey, mealId) => (get().days[dateKey] ?? []).includes(mealId),
      toggle: (dateKey, mealId) => {
        const { days, entries } = get();
        const skipped = !(days[dateKey] ?? []).includes(mealId);
        // Always later than the mark it replaces, even with a clock that went back.
        const at = Math.max(Date.now(), (entries[dateKey]?.[mealId]?.at ?? 0) + 1);
        const nextEntries = cleanSkipEntries({ ...entries, [dateKey]: { ...(entries[dateKey] ?? {}), [mealId]: { skipped, at } } });
        const current = days[dateKey] ?? [];
        const nextDays = cleanSkippedMeals({ ...days, [dateKey]: skipped ? [...current, mealId] : current.filter((id) => id !== mealId) });
        set({ days: nextDays, entries: nextEntries });
        void pushUserData(USER_DATA_KEYS.skippedMeals, skippedPayload(nextEntries));
      },
    }),
    {
      name: 'skipped-meal-store',
      storage: createJSONStorage(() => appStorage),
      version: 2,
      partialize: (s) => ({ days: s.days, entries: s.entries }),
      // Saved by older versions as `{ days }` only: those skips become marks with no time.
      migrate: (persisted, version) => {
        const p = isObj(persisted) ? persisted : {};
        const days = cleanSkippedMeals(p.days);
        if (version < 2 || !isObj(p.entries)) return { days, entries: entriesFromDays(days) } as unknown as SkippedMealState;
        const entries = cleanSkipEntries(p.entries);
        return { days: daysFromEntries(entries), entries } as unknown as SkippedMealState;
      },
    }
  )
);
