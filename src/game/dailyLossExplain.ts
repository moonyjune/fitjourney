import {
  GLYCOGEN_WATER_PER_G,
  KCAL_PER_G_GLYCOGEN,
  KCAL_PER_KG_FAT,
  SALT_BASELINE_G,
  WATER_LOW_ML,
  type DayLossEstimate,
  type DayLossVars,
  type WeighInComparison,
} from './dailyLossEstimate';
import type { GameKey } from './strings';

/** The "ước tính giảm mỡ" card and its ⓘ sheet as text lines (keys + already formatted numbers), so the content is testable
 *  without rendering. Numbers follow the language: vi "1.100" / "0,6", en "1,100" / "0.6"; signs use the real minus "−". */

export type Lang = 'vi' | 'en';

export interface LossLine {
  key: GameKey;
  params?: Record<string, string | number>;
}

export interface LossVarRow {
  label: GameKey;
  value: string;
  unit: string;
}

export interface LossExplanation {
  /** The one line on Camp / Journal › Ngày. */
  headline: LossLine;
  vars: LossVarRow[];
  why: LossLine[];
  order: LossLine[];
  tips: LossLine[];
  confidence: GameKey;
  week: LossLine | null;
  weighIn: LossLine | null;
}

export const MINUS = '−';

/** 1100 → "1.100" (vi) / "1,100" (en); decimals with "," (vi) / "." (en). */
export function fmtNum(n: number, lang: Lang, decimals = 0): string {
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const group = lang === 'vi' ? '.' : ',';
  const dec = lang === 'vi' ? ',' : '.';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const body = frac ? `${grouped}${dec}${frac}` : grouped;
  return n < 0 && Number(fixed) !== 0 ? `${MINUS}${body}` : body;
}

/** With an explicit sign: "−120", "+80", "0". */
export function fmtSigned(n: number, lang: Lang, decimals = 0): string {
  const s = fmtNum(n, lang, decimals);
  return n > 0 && Number(Math.abs(n).toFixed(decimals)) !== 0 ? `+${s}` : s;
}

/** A scale range "−300…−500" (smaller change first). */
export function fmtRange(aG: number, bG: number, lang: Lang): string {
  const [x, y] = Math.abs(aG) <= Math.abs(bG) ? [aG, bG] : [bG, aG];
  const rx = Math.round(x / 10) * 10;
  const ry = Math.round(y / 10) * 10;
  return rx === ry ? fmtSigned(rx, lang) : `${fmtSigned(rx, lang)}…${fmtSigned(ry, lang)}`;
}

/** Grams, switching to kg from 1,000 g: "850 g", "1,2 kg". */
export function fmtMass(g: number, lang: Lang): string {
  return Math.abs(g) >= 1000 ? `${fmtNum(g / 1000, lang, 1)} kg` : `${fmtNum(Math.round(g), lang)} g`;
}

export interface ExplainInput {
  vars: DayLossVars;
  estimate: DayLossEstimate;
  /** Today (the headline says "hôm nay") or another day (its label, e.g. "T4 12/11"). */
  isToday: boolean;
  dayLabel: string;
  /** Fat estimate of the week up to this day (g), when known. */
  weekFatG?: number | null;
  weighIn?: WeighInComparison | null;
  lang: Lang;
}

export function explainDailyLoss({ vars: v, estimate: e, isToday, dayLabel, weekFatG, weighIn, lang }: ExplainInput): LossExplanation {
  const n = (x: number, d = 0) => fmtNum(x, lang, d);
  /** One decimal, dropped when it is ",0": "9", "6,5". */
  const n1 = (x: number) => fmtNum(x, lang, Number.isInteger(Math.round(x * 10) / 10) ? 0 : 1);
  const approx = e.projected ? '~' : '';

  const headline: LossLine = {
    key: e.projected ? (isToday ? 'loss.headProjectedToday' : 'loss.headProjectedDay') : isToday ? 'loss.headToday' : 'loss.headDay',
    params: { day: dayLabel, fat: `${approx}${fmtSigned(-e.fatG, lang)}`, scale: `${approx}${fmtRange(e.scaleLowG, e.scaleHighG, lang)}` },
  };

  const vars: LossVarRow[] = [
    { label: 'loss.var.tdee', value: n(v.tdeeKcal), unit: 'kcal' },
    { label: 'loss.var.eaten', value: n(v.eatenKcal), unit: 'kcal' },
    { label: 'loss.var.burned', value: n(v.burnedKcal), unit: 'kcal' },
    v.deficitKcal >= 0
      ? { label: 'loss.var.deficit', value: `${approx}${n(v.deficitKcal)}`, unit: 'kcal' }
      : { label: 'loss.var.surplus', value: `${approx}${n(-v.deficitKcal)}`, unit: 'kcal' },
    { label: v.carbsG != null ? 'loss.var.carbs' : 'loss.var.sugar', value: n(v.carbsG ?? v.sugarG), unit: 'g' },
    { label: 'loss.var.salt', value: n1(v.saltG), unit: 'g' },
    { label: 'loss.var.water', value: n1(v.waterMl / 1000), unit: 'L' },
    { label: 'loss.var.protein', value: `${n(v.proteinG)} / ${n(v.proteinTargetG)}`, unit: 'g' },
  ];

  const why: LossLine[] = [];
  const glyKcal = Math.max(0, e.glycogenG) * KCAL_PER_G_GLYCOGEN;
  const perKg = n(KCAL_PER_KG_FAT);
  for (const d of e.drivers) {
    switch (d.id) {
      case 'fat':
        why.push(
          glyKcal > 0
            ? { key: 'loss.why.fatSplit', params: { kcal: n(v.deficitKcal), gly: n(glyKcal), g: n(e.fatG), per: perKg } }
            : { key: 'loss.why.fat', params: { kcal: n(v.deficitKcal), g: n(e.fatG), per: perKg } }
        );
        break;
      case 'fatGain':
        why.push({ key: 'loss.why.fatGain', params: { kcal: n(Math.abs(v.deficitKcal)), g: n(-e.fatG), per: perKg } });
        break;
      case 'glycogen':
        why.push({
          key: e.carbLevel === 'low' ? (v.carbsG != null ? 'loss.why.glyLowCarb' : 'loss.why.glyLowSugar') : 'loss.why.gly',
          params: { sugar: n(v.carbsG ?? v.sugarG), gly: n(e.glycogenG), water: n(e.glycogenWaterG), ratio: GLYCOGEN_WATER_PER_G },
        });
        if (e.glycogenDebtG - e.glycogenG >= 100) why.push({ key: 'loss.why.glyDepleted' });
        break;
      case 'refill':
        why.push({ key: 'loss.why.refill', params: { gly: n(-e.glycogenG), water: n(-e.glycogenWaterG), sugar: n(v.carbsG ?? v.sugarG) } });
        break;
      case 'salt':
        why.push({ key: 'loss.why.salt', params: { salt: n1(v.saltG), base: SALT_BASELINE_G, water: n(e.saltWaterG) } });
        break;
      case 'lowSalt':
        why.push({ key: 'loss.why.lowSalt', params: { salt: n1(v.saltG), base: SALT_BASELINE_G, water: n(-e.saltWaterG) } });
        break;
      case 'water':
        why.push({ key: v.waterMl < WATER_LOW_ML ? 'loss.why.waterLow' : 'loss.why.waterGood', params: { l: n1(v.waterMl / 1000) } });
        break;
      case 'protein':
        why.push({ key: e.proteinAdequate ? 'loss.why.proteinOk' : 'loss.why.proteinLow', params: { p: n(v.proteinG), t: n(v.proteinTargetG) } });
        break;
    }
  }
  if (v.cheat) why.push({ key: 'loss.why.cheat' });
  if (e.projected) why.push({ key: 'loss.why.projected' });
  if ((v.missingMeals ?? 0) > 0) why.push({ key: 'loss.why.missing' });

  const order: LossLine[] = [
    { key: 'loss.order.glycogen', params: { ratio: GLYCOGEN_WATER_PER_G } },
    { key: 'loss.order.fat', params: { per: perKg } },
    { key: e.proteinAdequate ? 'loss.order.proteinOk' : 'loss.order.proteinLow', params: { t: n(v.proteinTargetG) } },
  ];

  const tips: LossLine[] = [];
  const has = (id: string) => e.drivers.some((d) => d.id === id);
  if (has('salt')) tips.push({ key: 'loss.tip.salt', params: { base: SALT_BASELINE_G } });
  if (v.waterMl < WATER_LOW_ML) tips.push({ key: 'loss.tip.water' });
  if (!e.proteinAdequate) tips.push({ key: 'loss.tip.protein', params: { t: n(v.proteinTargetG) } });
  if (has('fatGain') || e.carbLevel === 'high') tips.push({ key: 'loss.tip.sugar' });
  if (tips.length < 3) tips.push({ key: 'loss.tip.trend' });
  if (tips.length < 2) tips.push({ key: 'loss.tip.keep' });

  const week: LossLine | null =
    weekFatG == null || Math.abs(weekFatG) < 1
      ? null
      : weekFatG > 0
        ? { key: 'loss.weekBurned', params: { mass: fmtMass(weekFatG, lang) } }
        : { key: 'loss.weekStored', params: { mass: fmtMass(-weekFatG, lang) } };

  const weighInLine: LossLine | null = weighIn
    ? { key: 'loss.weighIn', params: { actual: fmtSigned(weighIn.actualKg, lang, 1), days: weighIn.days, est: fmtSigned(weighIn.estimatedKg, lang, 1) } }
    : null;

  return {
    headline,
    vars,
    why,
    order,
    tips: tips.slice(0, 3),
    confidence: `loss.conf.${e.confidence}` as GameKey,
    week,
    weighIn: weighInLine,
  };
}
