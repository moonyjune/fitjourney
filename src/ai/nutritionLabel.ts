import { SODIUM_MG_PER_SALT_G } from '../insights/thresholds';

/** Figures printed in one column of a label. Every field is optional: the label may not print it. */
export interface LabelFigures {
  energyKcal?: number;
  proteinG?: number;
  sugarG?: number;
  saltG?: number;
  sodiumMg?: number;
}

/** What the vision model read from a nutrition facts panel. */
export interface NutritionLabel {
  readable: boolean;
  productName?: string;
  per100?: LabelFigures;
  per100Unit?: 'g' | 'ml';
  perServing?: LabelFigures;
  servingSize?: { amount: number; unit: 'g' | 'ml' };
  servingsPerPack?: number;
  accuracyPercent?: number;
  reasoning: string;
}

export interface EatenFigures {
  calories: number;
  proteinG: number;
  saltG: number;
  sugarG: number;
}

/** How much of the product was eaten: a number of servings, or an amount in g/ml. */
export type Eaten = { servings: number } | { amount: number };

const BOUNDS: Record<keyof LabelFigures, number> = { energyKcal: 950, proteinG: 100, sugarG: 100, saltG: 100, sodiumMg: 40000 };

function clean(raw: unknown, perServing: boolean): LabelFigures | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: LabelFigures = {};
  for (const key of Object.keys(BOUNDS) as (keyof LabelFigures)[]) {
    const v = (raw as Record<string, unknown>)[key];
    // A per-100 column cannot hold more than 100 g of anything or ~900 kcal; a per-serving one can hold a whole pack.
    const max = perServing ? BOUNDS[key] * 10 : BOUNDS[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const positive = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : undefined);

/** The model's answer with nonsense removed (out-of-range figures, wrong types). Null when it is not usable: nothing was
 *  readable or no column holds a figure. */
export function cleanLabel(raw: unknown): NutritionLabel | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.readable !== true) return null;
  const per100 = clean(r.per100, false);
  const perServing = clean(r.perServing, true);
  if (!per100 && !perServing) return null;
  const size = r.servingSize as { amount?: unknown; unit?: unknown } | undefined;
  const amount = positive(size?.amount, 5000);
  const label: NutritionLabel = { readable: true, reasoning: typeof r.reasoning === 'string' ? r.reasoning : '' };
  if (typeof r.productName === 'string' && r.productName.trim()) label.productName = r.productName.trim().slice(0, 80);
  if (per100) label.per100 = per100;
  if (r.per100Unit === 'g' || r.per100Unit === 'ml') label.per100Unit = r.per100Unit;
  if (perServing) label.perServing = perServing;
  if (amount && (size?.unit === 'g' || size?.unit === 'ml')) label.servingSize = { amount, unit: size.unit };
  const perPack = positive(r.servingsPerPack, 200);
  if (perPack) label.servingsPerPack = perPack;
  if (typeof r.accuracyPercent === 'number' && Number.isFinite(r.accuracyPercent)) label.accuracyPercent = r.accuracyPercent;
  return label;
}

/** Salt in grams from a column: the printed salt, else sodium (mg) / 400. */
function saltOf(f: LabelFigures): number {
  return f.saltG ?? (f.sodiumMg !== undefined ? f.sodiumMg / SODIUM_MG_PER_SALT_G : 0);
}

function scaled(f: LabelFigures, k: number): EatenFigures {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { calories: Math.round((f.energyKcal ?? 0) * k), proteinG: r1((f.proteinG ?? 0) * k), saltG: r1(saltOf(f) * k), sugarG: r1((f.sugarG ?? 0) * k) };
}

/** What the starting amount should be: one serving when the label has a serving column or size, else 100 g/ml. */
export function defaultEaten(label: NutritionLabel): Eaten {
  return label.perServing || label.servingSize ? { servings: 1 } : { amount: 100 };
}

/** The figures for what was eaten, computed here (the AI only read the label). A serving count uses the per-serving column
 *  when there is one, otherwise the serving size times the per-100 column; an amount uses the per-100 column, otherwise the
 *  per-serving column through the serving size. Null when the label cannot answer. */
export function labelToFigures(label: NutritionLabel, eaten: Eaten): EatenFigures | null {
  if ('servings' in eaten) {
    if (!(eaten.servings > 0)) return null;
    if (label.perServing) return scaled(label.perServing, eaten.servings);
    if (label.per100 && label.servingSize) return scaled(label.per100, (label.servingSize.amount * eaten.servings) / 100);
    return null;
  }
  if (!(eaten.amount > 0)) return null;
  if (label.per100) return scaled(label.per100, eaten.amount / 100);
  if (label.perServing && label.servingSize) return scaled(label.perServing, eaten.amount / label.servingSize.amount);
  return null;
}
