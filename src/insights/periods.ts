import { addDaysToKey, avg, dayNumber, mondayOf, monthOf } from './dateMath';
import { dayScore, type DayRow } from './days';
import type { Efficiency } from './efficiency';
import type { Thresholds } from './thresholds';
import type { Weigh } from './weights';

export type PeriodKind = 'week' | 'month';

export type FindingKey =
  | 'deficit'
  | 'protein'
  | 'purine'
  | 'purineDays'
  | 'sugar'
  | 'sodium'
  | 'logged'
  | 'missing'
  | 'deficitUp'
  | 'deficitDown';

/** One line of the strengths / to-improve lists: a kind plus the numbers to show. */
export interface Finding {
  key: FindingKey;
  /** Main figure (average, count or change). */
  value: number;
  /** Second figure: shortfall for deficit, days over for sodium, days in the period for missing. */
  extra?: number;
  /** Third figure: days in the period (sodium). */
  total?: number;
}

export type KaizenKind = 'data' | 'steady' | 'deficit' | 'protein' | 'purine' | 'sugar' | 'sodium';
export interface Kaizen {
  kind: KaizenKind;
  value: number;
  extra?: number;
}

export interface PeriodSummary {
  kind: PeriodKind;
  key: string;
  fromKey: string;
  toKey: string;
  days: number;
  missingDays: number;
  avgKcal: number;
  avgBurn: number;
  avgDeficitAll: number;
  /** Average over complete days, or null when none are complete. */
  avgDeficitFull: number | null;
  /** The figure judged against the target: complete-day average when there is one. */
  avgDeficit: number;
  daysMeetDeficit: number;
  totalDeficit: number;
  theoryFatKg: number;
  fatKg: number;
  avgProteinG: number;
  daysProteinOk: number;
  avgPurineMg: number;
  maxPurineMg: number;
  daysPurineOver: number;
  avgSugarG: number;
  avgSodiumMg: number;
  daysSodiumOver: number;
  avgWeightKg: number | null;
  minWeightKg: number | null;
  /** 0-10 over complete days, or null. */
  avgScore: number | null;
  /** Change in the judged deficit against the previous period (kcal), or null for the first period. */
  deltaDeficit: number | null;
  strengths: Finding[];
  improvements: Finding[];
  kaizen: Kaizen | null;
}

const lastDayOfMonth = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return `${key.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

function groupKey(kind: PeriodKind, dateKey: string): string {
  return kind === 'week' ? mondayOf(dateKey) : monthOf(dateKey);
}

function rangeOf(kind: PeriodKind, key: string): { fromKey: string; toKey: string } {
  return kind === 'week' ? { fromKey: key, toKey: addDaysToKey(key, 6) } : { fromKey: `${key}-01`, toKey: lastDayOfMonth(`${key}-01`) };
}

function summarize(kind: PeriodKind, key: string, rows: DayRow[], weighs: Weigh[], eff: Efficiency, th: Thresholds): PeriodSummary {
  const { fromKey, toKey } = rangeOf(kind, key);
  const full = rows.filter((r) => r.complete);
  const avgDeficitAll = avg(rows.map((r) => r.deficit));
  const avgDeficitFull = full.length > 0 ? avg(full.map((r) => r.deficit)) : null;
  const totalDeficit = rows.reduce((s, r) => s + r.deficit, 0);
  const theoryFatKg = totalDeficit / th.kcalPerKgFat;
  const inPeriod = weighs.filter((w) => w.dateKey >= fromKey && w.dateKey <= toKey);
  const scores = rows.map((r) => dayScore(r, th)).filter((s): s is number => s !== null);
  return {
    kind,
    key,
    fromKey,
    toKey,
    days: rows.length,
    missingDays: rows.length - full.length,
    avgKcal: avg(rows.map((r) => r.kcal)),
    avgBurn: avg(rows.map((r) => r.tdee + r.exerciseKcal)),
    avgDeficitAll,
    avgDeficitFull,
    avgDeficit: avgDeficitFull ?? avgDeficitAll,
    daysMeetDeficit: rows.filter((r) => r.deficit >= th.deficitOk).length,
    totalDeficit,
    theoryFatKg,
    fatKg: theoryFatKg * eff.applied,
    avgProteinG: avg(rows.map((r) => r.proteinG)),
    daysProteinOk: rows.filter((r) => r.proteinG >= th.proteinOk).length,
    avgPurineMg: avg(rows.map((r) => r.purineMg)),
    maxPurineMg: Math.max(...rows.map((r) => r.purineMg)),
    daysPurineOver: rows.filter((r) => r.purineMg > th.purineMax).length,
    avgSugarG: avg(rows.map((r) => r.sugarG)),
    avgSodiumMg: avg(rows.map((r) => r.sodiumMg)),
    daysSodiumOver: rows.filter((r) => r.sodiumMg > th.sodiumMax).length,
    avgWeightKg: inPeriod.length > 0 ? avg(inPeriod.map((w) => w.morningKg)) : null,
    minWeightKg: inPeriod.length > 0 ? Math.min(...inPeriod.map((w) => w.morningKg)) : null,
    avgScore: scores.length > 0 ? avg(scores) : null,
    deltaDeficit: null,
    strengths: [],
    improvements: [],
    kaizen: null,
  };
}

function judge(p: PeriodSummary, th: Thresholds): void {
  const s: Finding[] = [];
  const i: Finding[] = [];
  if (p.avgDeficit >= th.deficitOk) s.push({ key: 'deficit', value: p.avgDeficit });
  else i.push({ key: 'deficit', value: p.avgDeficit, extra: th.deficitOk - p.avgDeficit });
  if (p.avgProteinG >= th.proteinOk) s.push({ key: 'protein', value: p.avgProteinG });
  else i.push({ key: 'protein', value: p.avgProteinG });
  if (p.avgPurineMg <= th.purineMax) s.push({ key: 'purine', value: p.avgPurineMg });
  else i.push({ key: 'purine', value: p.avgPurineMg });
  if (p.daysPurineOver > 0) i.push({ key: 'purineDays', value: p.daysPurineOver });
  if (p.avgSugarG <= th.sugarMax) s.push({ key: 'sugar', value: p.avgSugarG });
  else i.push({ key: 'sugar', value: p.avgSugarG });
  if (p.avgSodiumMg <= th.sodiumMax) s.push({ key: 'sodium', value: p.avgSodiumMg });
  else i.push({ key: 'sodium', value: p.avgSodiumMg, extra: p.daysSodiumOver, total: p.days });
  if (p.missingDays === 0) s.push({ key: 'logged', value: p.days });
  else i.push({ key: 'missing', value: p.missingDays, extra: p.days });
  if (p.deltaDeficit !== null && p.deltaDeficit > 0) s.push({ key: 'deficitUp', value: p.deltaDeficit });
  if (p.deltaDeficit !== null && p.deltaDeficit < 0) i.push({ key: 'deficitDown', value: -p.deltaDeficit });
  p.strengths = s;
  p.improvements = i;

  // The single thing to change next: missing data first, otherwise the indicator furthest from its target.
  if (p.days === 0) {
    p.kaizen = null;
    return;
  }
  if (p.missingDays / p.days >= 0.2) {
    p.kaizen = { kind: 'data', value: p.missingDays };
    return;
  }
  const gaps: [KaizenKind, number, number][] = [
    ['deficit', Math.max(0, (th.deficitOk - p.avgDeficit) / th.deficitOk), th.deficitOk - p.avgDeficit],
    ['protein', Math.max(0, (th.proteinOk - p.avgProteinG) / th.proteinOk), p.avgProteinG],
    ['purine', Math.max(0, (p.avgPurineMg - th.purineMax) / th.purineMax), p.avgPurineMg],
    ['sugar', Math.max(0, (p.avgSugarG - th.sugarMax) / th.sugarMax), p.avgSugarG],
    ['sodium', Math.max(0, (p.avgSodiumMg - th.sodiumMax) / th.sodiumMax), p.avgSodiumMg],
  ];
  const worst = gaps.reduce((a, b) => (b[1] > a[1] ? b : a));
  p.kaizen = worst[1] === 0 ? { kind: 'steady', value: 0 } : { kind: worst[0], value: worst[2] };
}

/** Week (Mon-Sun) or month summaries, oldest first, each with strengths, things to improve and one change to make. */
export function buildPeriods(kind: PeriodKind, rows: DayRow[], weighs: Weigh[], eff: Efficiency, th: Thresholds): PeriodSummary[] {
  const groups = new Map<string, DayRow[]>();
  for (const r of rows) {
    const k = groupKey(kind, r.dateKey);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const keys = [...groups.keys()].sort();
  const out: PeriodSummary[] = [];
  for (const k of keys) {
    const p = summarize(kind, k, groups.get(k)!, weighs, eff, th);
    const prev = out[out.length - 1];
    p.deltaDeficit = prev ? p.avgDeficit - prev.avgDeficit : null;
    judge(p, th);
    out.push(p);
  }
  return out;
}

/** Whole days a period covers up to `todayKey` — used to word "still running" periods. */
export const periodIsOpen = (p: PeriodSummary, todayKey: string): boolean => dayNumber(todayKey) <= dayNumber(p.toKey);
