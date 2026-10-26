/** Every number the analysis compares against. Built from the user's own targets and limits, so changing a target in
 *  the app changes every verdict; the rest are the fixed assumptions of the diary method. */
export interface Thresholds {
  deficitOk: number;
  deficitFair: number;
  proteinOk: number;
  proteinFair: number;
  purineMax: number;
  purineFair: number;
  sugarMax: number;
  sugarFair: number;
  sodiumMax: number;
  sodiumFair: number;
  /** Below this many kcal a day the deficit is not worth the gout risk (deep hunger lowers uric-acid clearance). */
  minKcal: number;
  kcalPerKgFat: number;
  /** TDEE moves by this many kcal per kg of body weight. */
  tdeePerKg: number;
  /** Weigh-ins needed before the measured efficiency is trusted completely. */
  trustWeighIns: number;
  efficiencyMin: number;
  efficiencyMax: number;
  /** Water/salt wobble on the scale (kg): above `waterFair` is "some retention", above `waterHigh` "a lot". */
  waterFair: number;
  waterHigh: number;
  waterBand: number;
  /** An evening weigh-in reads about this much above the morning one. */
  eveningOffsetKg: number;
  /** Days looked back to estimate the average deficit used by the forecast. */
  forecastDays: number;
}

/** 1 g of sodium is 2.5 g of salt. */
export const SODIUM_MG_PER_SALT_G = 400;

export interface ThresholdSource {
  targetDailyDeficitKcal: number;
  proteinTargetG: number;
  limits: { purineMg: number; saltG: number; sugarG: number };
}

export function thresholdsFrom(source: ThresholdSource): Thresholds {
  const { targetDailyDeficitKcal, proteinTargetG, limits } = source;
  const sodiumMax = limits.saltG * SODIUM_MG_PER_SALT_G;
  return {
    deficitOk: targetDailyDeficitKcal,
    deficitFair: Math.round(targetDailyDeficitKcal * 0.7),
    proteinOk: proteinTargetG,
    proteinFair: Math.round(proteinTargetG * 0.82),
    purineMax: limits.purineMg,
    purineFair: Math.round(limits.purineMg * 1.25),
    sugarMax: limits.sugarG,
    sugarFair: Math.round(limits.sugarG * 1.4),
    sodiumMax,
    sodiumFair: Math.round(sodiumMax * 1.5),
    minKcal: 1300,
    kcalPerKgFat: 7700,
    tdeePerKg: 13,
    trustWeighIns: 10,
    efficiencyMin: 0.4,
    efficiencyMax: 1.3,
    waterFair: 0.5,
    waterHigh: 1.5,
    waterBand: 1.5,
    eveningOffsetKg: 1.2,
    forecastDays: 14,
  };
}
