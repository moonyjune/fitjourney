export interface UricReading {
  id: string;
  /** Day of the blood test, YYYY-MM-DD. */
  dateKey: string;
  /** Serum uric acid in micromoles per litre, the unit lab reports in Vietnam use. */
  valueUmol: number;
  note: string;
}

export type UricUnit = 'umol' | 'mgdl';

/** 1 mg/dL of uric acid is 59.48 micromoles per litre (molar mass 168.1 g/mol). */
export const UMOL_PER_MGDL = 59.48;
/** The treatment target usually given to people with gout: below 360 µmol/L (6 mg/dL). */
export const DEFAULT_TARGET_UMOL = 360;
/** Above this a reading counts as clearly high for an adult (420 µmol/L = 7 mg/dL). */
export const HIGH_UMOL = 420;
