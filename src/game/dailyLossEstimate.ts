import { KCAL_PER_KG_FAT } from '../utils/tdee';
import type { DayEvaluation } from './missions';

/**
 * A ROUGH estimate of what one day did to the body and to tomorrow morning's scale, from the day's own numbers (TDEE, food, exercise,
 * free sugar, salt, water, protein). It is a motivation aid ("ước tính"), not a measurement and not medical advice: real fat loss and
 * water shifts vary a lot from person to person and day to day. Every constant below is a round figure from general physiology
 * textbooks and widely cited reviews, chosen to stay in the middle of the published ranges.
 *
 * Sign convention: `fatG`, `glycogenG` and `glycogenWaterG` are amounts the body LOST (positive = lost, negative = gained/refilled);
 * `saltWaterG` is water HELD (positive = held, the scale goes up); `scaleChangeG` is the change on the scale (negative = lighter).
 *   scaleChangeG = −fatG − glycogenG − glycogenWaterG + saltWaterG
 *
 * Order of burning (what the bullets explain): blood glucose and stored glycogen (liver, muscle) are used first, each gram of
 * glycogen releasing ~3 g of water with it; as glycogen runs low fat becomes the main fuel; protein is mostly spared while protein
 * intake is adequate (low protein in a big deficit lets some muscle be used).
 */

/** ~7,700 kcal per kg of body fat (Wishnofsky 1958 rule of thumb, the same constant the rest of the app uses). */
export { KCAL_PER_KG_FAT };
/** Glycogen yields ~4 kcal per gram (it is stored carbohydrate). */
export const KCAL_PER_G_GLYCOGEN = 4;
/** Each gram of glycogen is stored with ~3 g of water (Olsson & Saltin 1970 measured ~3–4 g; Fernández-Elías 2015 ~3 g). */
export const GLYCOGEN_WATER_PER_G = 3;
/** The share of glycogen that a diet can run down before it is "empty enough": liver ~100 g + part of muscle ~300 g. Draws slow down
 *  as this pool empties (so several low-carb days in a row lose less water each day). */
export const GLYCOGEN_POOL_G = 400;
/** At most this much glycogen is drawn (net) in one day, even on a very big deficit (early-diet days typically lose ~100–150 g). */
export const GLYCOGEN_MAX_DAILY_G = 150;
/** The share of a day's deficit covered from glycogen (the rest from fat), by how much sugar/carbohydrate came in. */
export const GLYCOGEN_DEFICIT_SHARE = { low: 0.35, normal: 0.25, high: 0.1 } as const;
/** A deficit under this is treated as maintenance for glycogen: normal meals top the stores back up a little. */
export const GLYCOGEN_MAINTENANCE_DEFICIT_KCAL = 300;
/** On a maintenance day this share of the glycogen debt is refilled by ordinary carbohydrate meals. */
export const GLYCOGEN_MAINTENANCE_REFILL_SHARE = 0.25;
/** Of a surplus, this share goes to refilling glycogen first (while it is not full); the rest is stored as fat. */
export const GLYCOGEN_SURPLUS_SHARE = 0.5;
/** Grams of free sugar that refill ~this many grams of glycogen above the sugar limit (most sugar is stored as glycogen when it is low). */
export const GLYCOGEN_PER_G_EXCESS_SUGAR = 0.8;
/** At most this much glycogen is refilled in one day (a big carbohydrate day refills ~200–300 g). */
export const GLYCOGEN_MAX_DAILY_REFILL_G = 300;
/** Free sugar (g) at or under which a day counts as "low sugar"; with total carbohydrate known, the low-carb bar instead. */
export const LOW_SUGAR_G = 10;
/** Free sugar above this is a "high sugar" day (about twice WHO's 25 g suggestion). */
export const HIGH_SUGAR_G = 50;
/** Total carbohydrate (g) under which a day is low-carb (common definition: under ~100–130 g/day). */
export const LOW_CARB_G = 100;
/** Total carbohydrate (g) over which a day refills glycogen like a high-sugar day. */
export const HIGH_CARB_G = 250;
/** Salt (g of table salt, not sodium) the body treats as its usual level: WHO's 5 g/day. */
export const SALT_BASELINE_G = 5;
/** Extra water held per gram of salt above the baseline, short-term (~+0.5–1 L for ~3–4 g extra salt; ~1 g salt binds ~0.1–0.2 L
 *  of extracellular fluid while the kidneys catch up over 1–3 days). Mid estimate. */
export const SALT_WATER_G_PER_G = 200;
/** Cap on the water held from salt in one day. */
export const SALT_WATER_MAX_G = 1000;
/** Water let go per gram of salt under the baseline (smaller than the gain: the body holds on to sodium when it is low). */
export const SALT_RELEASE_G_PER_G = 100;
/** Cap on the water let go from a low-salt day. */
export const SALT_RELEASE_MAX_G = 300;
/** Drinking under this (ml) makes the body hold on to the salt water a little more; over WATER_GOOD_ML a little less. */
export const WATER_LOW_ML = 1500;
export const WATER_GOOD_ML = 2500;
export const WATER_LOW_FACTOR = 1.25;
export const WATER_GOOD_FACTOR = 0.8;
/** Range: the TDEE is itself an estimate (±10%); glycogen water and salt water vary a lot (±40% / ±50%). */
export const TDEE_UNCERTAINTY = 0.1;
export const GLYCOGEN_UNCERTAINTY = 0.4;
export const SALT_UNCERTAINTY = 0.5;

/** The day's numbers the estimate is made from (the "Dữ liệu hôm nay" table). */
export interface DayLossVars {
  dateKey: string;
  tdeeKcal: number;
  eatenKcal: number;
  /** Exercise logged that day. */
  burnedKcal: number;
  /** TDEE + exercise − eaten (the end-of-day estimate while meals are still to come). */
  deficitKcal: number;
  /** Free sugar (g). */
  sugarG: number;
  /** Total carbohydrate (g) when known (the app's food data mostly does not have it); null: free sugar is used instead. */
  carbsG?: number | null;
  saltG: number;
  waterMl: number;
  proteinG: number;
  /** The protein goal; adequate protein spares muscle. */
  proteinTargetG: number;
  /** False while meals are still to come (the figures are then "dự kiến"). */
  settled: boolean;
  cheat: boolean;
  /** Settled with a meal not logged: the deficit is likely too high. */
  missingMeals?: number;
  /** Food lines whose salt was not recognised (salt is then low). */
  unknownItems?: number;
}

export type CarbLevel = 'low' | 'normal' | 'high';

export type DriverId = 'fat' | 'fatGain' | 'glycogen' | 'refill' | 'salt' | 'lowSalt' | 'water' | 'protein';

export interface LossDriver {
  id: DriverId;
  /** Its effect on the scale in g (negative = lighter); 0 for the drivers that only explain (water, protein). */
  scaleG: number;
}

export type LossConfidence = 'high' | 'medium' | 'low';

export interface DayLossEstimate {
  dateKey: string;
  /** Fat burned (g); negative = fat stored (a surplus). */
  fatG: number;
  /** Glycogen used (g); negative = refilled. */
  glycogenG: number;
  /** Water released with that glycogen (g); negative = water stored with refilled glycogen. */
  glycogenWaterG: number;
  /** Water held from salt (g); negative = let go (a low-salt day). */
  saltWaterG: number;
  /** Tomorrow's scale vs today (g): negative = lighter. */
  scaleChangeG: number;
  /** The range of the scale change: `lowG` is the smallest loss (or biggest gain), `highG` the biggest loss. lowG ≥ highG. */
  scaleLowG: number;
  scaleHighG: number;
  /** Fat range (g): least / most. */
  fatLowG: number;
  fatHighG: number;
  carbLevel: CarbLevel;
  proteinAdequate: boolean;
  /** Glycogen debt after this day (g), carried to the next day. */
  glycogenDebtG: number;
  /** Drivers sorted by impact on the scale (biggest first); explanation-only drivers last. */
  drivers: LossDriver[];
  confidence: LossConfidence;
  /** Meals still to come: an end-of-day forecast. */
  projected: boolean;
}

export function carbLevelOf(v: Pick<DayLossVars, 'sugarG' | 'carbsG'>): CarbLevel {
  if (v.carbsG != null) return v.carbsG < LOW_CARB_G ? 'low' : v.carbsG > HIGH_CARB_G ? 'high' : 'normal';
  return v.sugarG <= LOW_SUGAR_G ? 'low' : v.sugarG > HIGH_SUGAR_G ? 'high' : 'normal';
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r = (n: number) => Math.round(n) || 0; // no "-0"

/** Water held (+) or let go (−) from the day's salt, adjusted for how much was drunk. */
export function saltWaterOf(saltG: number, waterMl: number): number {
  if (!(saltG > 0)) return 0; // no salt known: nothing to say
  const over = saltG - SALT_BASELINE_G;
  if (over > 0) {
    const factor = waterMl < WATER_LOW_ML ? WATER_LOW_FACTOR : waterMl >= WATER_GOOD_ML ? WATER_GOOD_FACTOR : 1;
    return Math.min(SALT_WATER_MAX_G, over * SALT_WATER_G_PER_G * factor);
  }
  return -Math.min(SALT_RELEASE_MAX_G, -over * SALT_RELEASE_G_PER_G);
}

/**
 * One day's estimate. `glycogenDebtG` is how far the glycogen stores were already run down before the day (from the days before it,
 * see `estimateDays`); 0 = full.
 */
export function estimateDayLoss(v: DayLossVars, glycogenDebtG = 0): DayLossEstimate {
  const debt = clamp(glycogenDebtG, 0, GLYCOGEN_POOL_G);
  const carbLevel = carbLevelOf(v);
  const deficit = v.deficitKcal;
  const excessSugarG = Math.max(0, v.sugarG - HIGH_SUGAR_G) + (v.carbsG != null ? Math.max(0, v.carbsG - HIGH_CARB_G) : 0);

  // Glycogen: drawn on a real deficit (less as the pool empties), refilled by a surplus, sugar or ordinary meals.
  let glycogenG = 0;
  if (deficit >= GLYCOGEN_MAINTENANCE_DEFICIT_KCAL && carbLevel !== 'high') {
    const wanted = (deficit * GLYCOGEN_DEFICIT_SHARE[carbLevel]) / KCAL_PER_G_GLYCOGEN;
    glycogenG = Math.min(GLYCOGEN_MAX_DAILY_G, wanted) * (1 - debt / GLYCOGEN_POOL_G);
  } else if (deficit >= GLYCOGEN_MAINTENANCE_DEFICIT_KCAL) {
    // A deficit on a high-sugar day: the sugar covers the draw, a little is still used.
    glycogenG = Math.min(GLYCOGEN_MAX_DAILY_G, (deficit * GLYCOGEN_DEFICIT_SHARE.high) / KCAL_PER_G_GLYCOGEN) * (1 - debt / GLYCOGEN_POOL_G);
    glycogenG -= Math.min(debt, excessSugarG * GLYCOGEN_PER_G_EXCESS_SUGAR);
  } else {
    const surplusKcal = Math.max(0, -deficit);
    const refill =
      debt * GLYCOGEN_MAINTENANCE_REFILL_SHARE + (surplusKcal * GLYCOGEN_SURPLUS_SHARE) / KCAL_PER_G_GLYCOGEN + excessSugarG * GLYCOGEN_PER_G_EXCESS_SUGAR;
    glycogenG = -Math.min(debt, GLYCOGEN_MAX_DAILY_REFILL_G, refill);
  }
  // The energy glycogen covered (or took) is not fat.
  const fatKcal = deficit - glycogenG * KCAL_PER_G_GLYCOGEN;
  const fatG = fatKcal / (KCAL_PER_KG_FAT / 1000);
  const glycogenWaterG = glycogenG * GLYCOGEN_WATER_PER_G;
  const saltWaterG = saltWaterOf(v.saltG, v.waterMl);
  const scaleChangeG = -fatG - glycogenG - glycogenWaterG + saltWaterG;

  // Range: the TDEE moves the fat figure, the water figures have their own spread.
  const fatSpread = (v.tdeeKcal * TDEE_UNCERTAINTY) / (KCAL_PER_KG_FAT / 1000);
  const glySpread = Math.abs(glycogenG + glycogenWaterG) * GLYCOGEN_UNCERTAINTY;
  const saltSpread = Math.abs(saltWaterG) * SALT_UNCERTAINTY;
  const spread = fatSpread + glySpread + saltSpread;

  const proteinAdequate = v.proteinTargetG <= 0 || v.proteinG >= v.proteinTargetG * 0.9;

  const drivers: LossDriver[] = [];
  if (Math.abs(fatG) >= 1) drivers.push({ id: fatG >= 0 ? 'fat' : 'fatGain', scaleG: r(-fatG) });
  if (Math.abs(glycogenG) >= 1) drivers.push({ id: glycogenG > 0 ? 'glycogen' : 'refill', scaleG: r(-(glycogenG + glycogenWaterG)) });
  if (Math.abs(saltWaterG) >= 1) drivers.push({ id: saltWaterG > 0 ? 'salt' : 'lowSalt', scaleG: r(saltWaterG) });
  drivers.sort((a, b) => Math.abs(b.scaleG) - Math.abs(a.scaleG));
  if (v.waterMl < WATER_LOW_ML || v.waterMl >= WATER_GOOD_ML) drivers.push({ id: 'water', scaleG: 0 });
  if (deficit >= GLYCOGEN_MAINTENANCE_DEFICIT_KCAL) drivers.push({ id: 'protein', scaleG: 0 });

  let confidence: LossConfidence = 'high';
  if (!v.settled || (v.missingMeals ?? 0) > 0 || (v.unknownItems ?? 0) > 0) confidence = 'medium';
  if (v.cheat || (v.missingMeals ?? 0) > 1) confidence = 'low';

  return {
    dateKey: v.dateKey,
    fatG: r(fatG),
    glycogenG: r(glycogenG),
    glycogenWaterG: r(glycogenWaterG),
    saltWaterG: r(saltWaterG),
    scaleChangeG: r(scaleChangeG),
    scaleLowG: r(scaleChangeG + spread),
    scaleHighG: r(scaleChangeG - spread),
    fatLowG: r(fatG - fatSpread),
    fatHighG: r(fatG + fatSpread),
    carbLevel,
    proteinAdequate,
    glycogenDebtG: r(clamp(debt + glycogenG, 0, GLYCOGEN_POOL_G)),
    drivers,
    confidence,
    projected: !v.settled,
  };
}

/** A day with nothing logged: no estimate, and the glycogen stores are assumed to refill a little (normal eating). */
export function restDayDebt(glycogenDebtG: number): number {
  return Math.round(glycogenDebtG * (1 - GLYCOGEN_MAINTENANCE_REFILL_SHARE));
}

/**
 * Days in date order (null = nothing logged that day), each estimated with the glycogen debt the days before it left. Start a week or
 * two early so the first shown day already carries a realistic debt.
 */
export function estimateDays(days: ReadonlyArray<DayLossVars | null>): Array<DayLossEstimate | null> {
  let debt = 0;
  return days.map((v) => {
    if (!v) {
      debt = restDayDebt(debt);
      return null;
    }
    const e = estimateDayLoss(v, debt);
    debt = e.glycogenDebtG;
    return e;
  });
}

/** The fat estimate of several days (g), e.g. "Tuần này đã đốt ~X g mỡ". */
export function sumFatG(days: ReadonlyArray<DayLossEstimate | null>): number {
  return days.reduce((s, d) => s + (d ? d.fatG : 0), 0);
}

export interface WeighInComparison {
  /** Real change between the first and last weigh-in (kg, negative = lighter). */
  actualKg: number;
  /** The estimated scale change over the same days (kg). */
  estimatedKg: number;
  /** Days between the two weigh-ins. */
  days: number;
}

/**
 * Real weigh-ins vs the estimate: with 2+ weigh-ins in the window, the change from the first to the last against the summed estimated
 * scale change of the days from the first weigh-in's day up to the day before the last one (a weigh-in is made in the morning, so it
 * shows the days before it). Null with fewer than 2 weigh-ins or no estimated day in between.
 */
export function compareWeighIns(
  weighIns: ReadonlyArray<{ dateKey: string; weightKg: number }>,
  estimates: ReadonlyArray<DayLossEstimate | null>
): WeighInComparison | null {
  if (weighIns.length < 2) return null;
  const sorted = [...weighIns].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.dateKey === last.dateKey) return null;
  const between = estimates.filter((e): e is DayLossEstimate => !!e && e.dateKey >= first.dateKey && e.dateKey < last.dateKey);
  if (between.length === 0) return null;
  const days = Math.round((Date.parse(`${last.dateKey}T12:00:00`) - Date.parse(`${first.dateKey}T12:00:00`)) / 86_400_000);
  return {
    actualKg: Math.round((last.weightKg - first.weightKg) * 10) / 10,
    estimatedKg: Math.round(between.reduce((s, e) => s + e.scaleChangeG, 0) / 100) / 10,
    days,
  };
}

/** The model's variables from the day evaluator's reading of a day (null: nothing eaten logged, no estimate). A day still being eaten
 *  into uses the end-of-day forecast of the deficit; a cheat day (no deficit in the game) still has one here, from its own numbers. */
export function lossVarsOf(
  day: Pick<DayEvaluation, 'dateKey' | 'eatenKcal' | 'burnedKcal' | 'deficitKcal' | 'projectedDeficitKcal' | 'settled' | 'cheat' | 'nutrients' | 'proteinG' | 'missingMeals' | 'unknownItems'>,
  ctx: { tdeeKcal: number; waterMl: number; proteinTargetG: number }
): DayLossVars | null {
  let deficitKcal: number | null;
  if (day.cheat) deficitKcal = day.eatenKcal > 0 ? ctx.tdeeKcal + day.burnedKcal - day.eatenKcal : null;
  else deficitKcal = day.settled ? day.deficitKcal : (day.projectedDeficitKcal ?? day.deficitKcal);
  if (deficitKcal == null) return null;
  return {
    dateKey: day.dateKey,
    tdeeKcal: ctx.tdeeKcal,
    eatenKcal: day.eatenKcal,
    burnedKcal: day.burnedKcal,
    deficitKcal: Math.round(deficitKcal),
    sugarG: day.nutrients.sugarG,
    carbsG: null,
    saltG: day.nutrients.saltG,
    waterMl: ctx.waterMl,
    proteinG: day.proteinG,
    proteinTargetG: ctx.proteinTargetG,
    settled: day.settled,
    cheat: day.cheat,
    missingMeals: day.missingMeals.length,
    unknownItems: day.unknownItems,
  };
}
