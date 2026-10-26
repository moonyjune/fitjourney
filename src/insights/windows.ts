import { addDaysToKey, avg, dayNumber } from './dateMath';
import type { DayRow } from './days';

export interface WindowStats {
  /** null = the whole record. */
  days: number | null;
  fromKey: string;
  toKey: string;
  daysWithData: number;
  completeDays: number;
  avgKcal: number;
  avgProteinG: number;
  avgPurineMg: number;
  avgSodiumMg: number;
  avgSugarG: number;
  /** Average deficit over every logged day. */
  avgDeficitAll: number;
  /** Average over complete days only (falls back to all days when there are none). */
  avgDeficit: number;
}

/** Averages over the last `days` calendar days ending at the latest logged day (or the whole record). */
export function windowStats(rows: DayRow[], days: number | null): WindowStats | null {
  if (rows.length === 0) return null;
  const toKey = rows[rows.length - 1].dateKey;
  const fromKey = days === null ? rows[0].dateKey : addDaysToKey(toKey, -(days - 1));
  const inside = rows.filter((r) => r.dateKey >= fromKey && r.dateKey <= toKey);
  if (inside.length === 0) return null;
  const full = inside.filter((r) => r.complete);
  return {
    days,
    fromKey: inside[0].dateKey,
    toKey,
    daysWithData: inside.length,
    completeDays: full.length,
    avgKcal: avg(inside.map((r) => r.kcal)),
    avgProteinG: avg(inside.map((r) => r.proteinG)),
    avgPurineMg: avg(inside.map((r) => r.purineMg)),
    avgSodiumMg: avg(inside.map((r) => r.sodiumMg)),
    avgSugarG: avg(inside.map((r) => r.sugarG)),
    avgDeficitAll: avg(inside.map((r) => r.deficit)),
    avgDeficit: avg((full.length > 0 ? full : inside).map((r) => r.deficit)),
  };
}

export const OVERVIEW_WINDOWS: (number | null)[] = [7, 14, 30, null];

/** Days between two keys, inclusive. */
export const spanDays = (fromKey: string, toKey: string): number => dayNumber(toKey) - dayNumber(fromKey) + 1;
