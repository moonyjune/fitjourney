/**
 * Every logged food should say how much it weighs (g) or holds (ml), even when it was named by a count: "1 hộp (≈250 g)",
 * "2 quả Trứng gà (≈100 g)", "Bún bò 1 bát (≈550 g)". The count stays for display; the "(≈N g)" note gives the standard amount.
 */

const NUM = '\\d+(?:[.,]\\d+)?';
/** A weight or volume written in a name: "250 g", "250g", "1,5 kg", "330ml", "0.5 l", "1 lít". */
const MEASURE = new RegExp(`${NUM}\\s*(?:g|gr|gram|grams|gam|kg|ml|l|lít|lit)(?![A-Za-zÀ-ỹđĐ])`, 'i');

/** Does the name already carry a weight or volume? */
export function hasMeasure(name: string): boolean {
  return MEASURE.test(name);
}

/** The name with "(≈N g)" / "(≈N ml)" added when it has no weight or volume yet and `amount` is a usable figure; otherwise as it is. */
export function withMeasure(name: string, amount: unknown, unit: unknown): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount <= 20000 ? Math.round(amount) : 0;
  if (!n || !name.trim() || hasMeasure(name)) return name;
  const u = unit === 'ml' ? 'ml' : 'g';
  return `${name.trim()} (≈${n} ${u})`;
}

/** An approximate amount written after "≈" or "~": "(≈250 g)", "(~900g)". */
const APPROX = new RegExp(`([≈~]\\s*)(${NUM})(\\s*(?:g|ml)(?![A-Za-zÀ-ỹđĐ]))`, 'g');

/** The name with every "≈N g" / "~N ml" note that starts after `from` multiplied by `ratio` (used when the count before it changes). */
export function scaleApprox(name: string, from: number, ratio: number): string {
  if (!(ratio > 0) || ratio === 1) return name;
  return name.replace(APPROX, (whole, pre: string, value: string, unit: string, offset: number) => {
    if (offset + pre.length <= from) return whole;
    const scaled = Math.round(parseFloat(value.replace(',', '.')) * ratio);
    return `${pre}${scaled}${unit}`;
  });
}
