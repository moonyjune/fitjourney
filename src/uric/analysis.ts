import type { DiaryItem } from '../feedback/items';
import { mentionsAlcohol } from '../feedback/match';
import { addDaysToKey, avg, dayNumber } from '../insights/dateMath';
import type { DayRow } from '../insights/days';
import type { Thresholds } from '../insights/thresholds';
import { validWeighs, type Weigh } from '../insights/weights';
import { HIGH_UMOL, UMOL_PER_MGDL, type UricReading, type UricUnit } from './types';

export const toUmol = (value: number, unit: UricUnit): number => (unit === 'mgdl' ? value * UMOL_PER_MGDL : value);
export const fromUmol = (valueUmol: number, unit: UricUnit): number => (unit === 'mgdl' ? valueUmol / UMOL_PER_MGDL : valueUmol);

/** Values a blood test can plausibly give: 100 to 1,000 µmol/L (about 1.7 to 16.8 mg/dL). */
export const isPlausibleUmol = (valueUmol: number): boolean => Number.isFinite(valueUmol) && valueUmol >= 100 && valueUmol <= 1000;

export type UricStatus = 'onTarget' | 'above' | 'high';

/** At or under the target is on target; above it is "above"; over 420 µmol/L is "high". */
export function uricStatus(valueUmol: number, targetUmol: number): UricStatus {
  if (valueUmol <= targetUmol) return 'onTarget';
  return valueUmol > HIGH_UMOL ? 'high' : 'above';
}

/** Readings oldest first. */
export const sortReadings = (readings: UricReading[]): UricReading[] =>
  [...readings].sort((a, b) => (a.dateKey === b.dateKey ? a.id.localeCompare(b.id) : a.dateKey < b.dateKey ? -1 : 1));

export interface UricSummary {
  latest: UricReading;
  previous: UricReading | null;
  /** Latest minus the one before (µmol/L); negative = improving. */
  deltaVsPrevious: number | null;
  /** Latest minus the first on record (µmol/L). */
  deltaVsFirst: number | null;
  /** Days between the latest test and `todayKey`. */
  daysSince: number;
  /** How far above the target the latest reading is (µmol/L, 0 when on target). */
  aboveTarget: number;
  status: UricStatus;
}

export function summarizeReadings(readings: UricReading[], targetUmol: number, todayKey: string): UricSummary | null {
  const sorted = sortReadings(readings);
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const previous = sorted[sorted.length - 2] ?? null;
  return {
    latest,
    previous,
    deltaVsPrevious: previous ? latest.valueUmol - previous.valueUmol : null,
    deltaVsFirst: sorted.length > 1 ? latest.valueUmol - sorted[0].valueUmol : null,
    daysSince: Math.max(0, dayNumber(todayKey) - dayNumber(latest.dateKey)),
    aboveTarget: Math.max(0, latest.valueUmol - targetUmol),
    status: uricStatus(latest.valueUmol, targetUmol),
  };
}

export const CONTEXT_DAYS = 14;

/** What the diary says about the 14 days up to and including a blood test. */
export interface UricContext {
  /** Days with meals logged in the window. */
  daysWithData: number;
  avgPurineMg: number | null;
  /** Days over the daily purine limit. */
  purineOverDays: number;
  /** Days with beer or spirits in the diary. */
  alcoholDays: number;
  avgDeficit: number | null;
  /** Morning-equivalent weight on or just before the test day. */
  weightKg: number | null;
  /** Weight change since the previous test (kg, negative = lost), when both are known. */
  weightChangeKg: number | null;
}

function weightOn(weighs: Weigh[], dateKey: string): number | null {
  const before = validWeighs(weighs).filter((w) => w.dateKey <= dateKey);
  return before.length > 0 ? before[before.length - 1].morningKg : null;
}

export function contextFor(
  reading: UricReading,
  previous: UricReading | null,
  data: { rows: DayRow[]; items: DiaryItem[]; weighs: Weigh[]; thresholds: Thresholds }
): UricContext {
  const from = addDaysToKey(reading.dateKey, -(CONTEXT_DAYS - 1));
  const rows = data.rows.filter((r) => r.dateKey >= from && r.dateKey <= reading.dateKey);
  const itemsByDay = new Map<string, string[]>();
  for (const i of data.items) {
    if (i.dateKey < from || i.dateKey > reading.dateKey) continue;
    const list = itemsByDay.get(i.dateKey);
    if (list) list.push(i.text);
    else itemsByDay.set(i.dateKey, [i.text]);
  }
  const weightKg = weightOn(data.weighs, reading.dateKey);
  const previousKg = previous ? weightOn(data.weighs, previous.dateKey) : null;
  return {
    daysWithData: rows.length,
    avgPurineMg: rows.length > 0 ? avg(rows.map((r) => r.purineMg)) : null,
    purineOverDays: rows.filter((r) => r.purineMg > data.thresholds.purineMax).length,
    alcoholDays: [...itemsByDay.values()].filter((texts) => mentionsAlcohol(texts)).length,
    avgDeficit: rows.length > 0 ? avg(rows.map((r) => r.deficit)) : null,
    weightKg,
    weightChangeKg: weightKg !== null && previousKg !== null ? weightKg - previousKg : null,
  };
}

/** Accepts 2026-10-16 or 16/10/2026 (also 16-10-2026 and 16.10.2026); returns the date key, or null when it is not a real date. */
export function parseDateInput(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const vn = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (vn) [d, m, y] = [Number(vn[1]), Number(vn[2]), Number(vn[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
