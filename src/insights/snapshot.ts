import { getDayType } from '../constants/plan';
import type { DailyNutritionLog, PlanData, WeightEntry, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import { addDaysToKey } from './dateMath';

/** How the analysis follows the diary. auto: every change is analysed again at once (the AI weekly review a little later);
 *  manual: what is shown stays as it was analysed until the user asks again, and says when the data changed since. */
export type AnalysisMode = 'auto' | 'manual';
export const ANALYSIS_MODES: AnalysisMode[] = ['auto', 'manual'];

/** The parts of the Analysis screen that keep their own analysis (one per tab), so each can be analysed again on its own. */
export type AnalysisScope = 'overview' | 'periods' | 'move' | 'feedback';
export const ANALYSIS_SCOPES: AnalysisScope[] = ['overview', 'periods', 'move', 'feedback'];

/** Everything one day of the diary contributes to the analysis. Photos are left out: they do not change any figure. */
export interface DayData {
  log: DailyNutritionLog | null;
  workouts: WorkoutLogEntry[];
  weights: WeightEntry[];
}

/** When a day was analysed, and the fingerprint of its data at that moment. */
export interface DayStamp {
  fp: string;
  atISO: string;
}

/** A day's data as it is now, with its fingerprint. */
export interface LiveDay {
  fp: string;
  data: DayData;
}

/** The fingerprint of nothing on record (a day that was emptied or deleted). */
export const EMPTY_DAY: DayData = { log: null, workouts: [], weights: [] };

/** JSON with object keys in a fixed order, so the same data always gives the same text. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(',')}}`;
}

/** A short hash of any data (FNV-1a, 2 x 32 bit): equal data, equal fingerprint. */
export function fingerprint(value: unknown): string {
  const text = stableJson(value);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

function stripLog(log: DailyNutritionLog): DailyNutritionLog {
  return { ...log, extraItems: (log.extraItems ?? []).map(({ photoUri: _photo, ...rest }) => rest) };
}

/** Every day with something on record (food, water, a workout or a weigh-in), with its data and fingerprint. The plan meals ticked
 *  that day are part of the fingerprint, so editing the plan also counts as a change of those days. */
export function liveDays(
  logs: Record<string, DailyNutritionLog>,
  workouts: WorkoutLogEntry[],
  weights: WeightEntry[],
  mealTemplates: PlanData['mealTemplates']
): Map<string, LiveDay> {
  const draft = new Map<string, DayData>();
  const day = (key: string) => {
    let d = draft.get(key);
    if (!d) {
      d = { log: null, workouts: [], weights: [] };
      draft.set(key, d);
    }
    return d;
  };
  for (const [key, log] of Object.entries(logs)) day(key).log = stripLog(log);
  for (const w of workouts) day(toDateKey(new Date(w.dateISO))).workouts.push(w);
  for (const w of weights) day(toDateKey(new Date(w.dateISO))).weights.push(w);
  const out = new Map<string, LiveDay>();
  for (const key of [...draft.keys()].sort()) {
    const data = draft.get(key)!;
    const eaten = data.log ? (mealTemplates[getDayType(new Date(key))] ?? []).filter((m) => data.log!.mealsEaten[m.slot]) : [];
    out.set(key, { data, fp: fingerprint({ data, eaten }) });
  }
  return out;
}

/** The fingerprint a day has now: its data's, or that of an empty day. */
export function liveFp(live: Map<string, LiveDay>, dateKey: string): string {
  return live.get(dateKey)?.fp ?? EMPTY_FP;
}
export const EMPTY_FP = fingerprint({ data: EMPTY_DAY, eaten: [] });

/** The diary the analysis works on: in auto mode, as it is now; in manual mode, each day as it was when last analysed (a day never
 *  analysed yet is taken as it is now). */
export function composeInput(
  live: Map<string, LiveDay>,
  stamps: Record<string, DayStamp>,
  stored: Record<string, DayData>,
  mode: AnalysisMode
): { logs: Record<string, DailyNutritionLog>; workouts: WorkoutLogEntry[]; weights: WeightEntry[] } {
  const keys = mode === 'auto' ? [...live.keys()] : [...new Set([...live.keys(), ...Object.keys(stamps)])].sort();
  const logs: Record<string, DailyNutritionLog> = {};
  const workouts: WorkoutLogEntry[] = [];
  const weights: WeightEntry[] = [];
  for (const key of keys) {
    const frozen = mode === 'manual' && stamps[key] ? stored[stamps[key].fp] : undefined;
    const data = frozen ?? live.get(key)?.data ?? EMPTY_DAY;
    if (data.log) logs[key] = data.log;
    workouts.push(...data.workouts);
    weights.push(...data.weights);
  }
  workouts.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  weights.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return { logs, workouts, weights };
}

/** The days whose data changed since they were analysed (deleted days included). */
export function outdatedDays(live: Map<string, LiveDay>, stamps: Record<string, DayStamp>): string[] {
  return Object.keys(stamps)
    .filter((k) => stamps[k].fp !== liveFp(live, k))
    .sort();
}

/** When a set of days was last analysed (the latest of their times, null if none was) and whether any changed since. */
export interface RangeStatus {
  atISO: string | null;
  outdated: boolean;
  /** Days that changed since. */
  changed: string[];
}

export function rangeStatus(live: Map<string, LiveDay>, stamps: Record<string, DayStamp>, fromKey?: string, toKey?: string): RangeStatus {
  const inRange = (k: string) => (fromKey === undefined || k >= fromKey) && (toKey === undefined || k <= toKey);
  let atISO: string | null = null;
  for (const [k, s] of Object.entries(stamps)) if (inRange(k) && (atISO === null || s.atISO > atISO)) atISO = s.atISO;
  const changed = outdatedDays(live, stamps).filter(inRange);
  // A day on record that this part never analysed (it appeared while the screen was closed) is also new data.
  for (const k of live.keys()) if (inRange(k) && !stamps[k] && atISO !== null) changed.push(k);
  return { atISO, outdated: changed.length > 0, changed: [...new Set(changed)].sort() };
}

/** The seven days of the week starting on `weekStart`. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
}

/** dd/mm hh:mm of an ISO time, in local time. */
export function stampText(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
