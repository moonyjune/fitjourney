import type { WeightEntry } from '../types';
import { toDateKey } from '../utils/date';
import { dayNumber } from './dateMath';
import type { Thresholds } from './thresholds';

export interface Weigh {
  dateKey: string;
  kg: number;
  /** Evening weigh-in: it already carries the day's food and water, so it is not used to measure fat loss. */
  evening: boolean;
  /** The reading converted to a morning equivalent. */
  morningKg: number;
}

/** A weigh-in is an evening one when its note says so ("Cân tối", "evening"). */
export function isEveningNote(note: string | undefined): boolean {
  return !!note && /(^|[^\p{L}])(tối|toi|evening|night)([^\p{L}]|$)/iu.test(note);
}

export function toWeighs(entries: WeightEntry[], th: Pick<Thresholds, 'eveningOffsetKg'>): Weigh[] {
  return [...entries]
    .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
    .map((e) => {
      const evening = isEveningNote(e.note);
      return {
        dateKey: toDateKey(new Date(e.dateISO)),
        kg: e.weightKg,
        evening,
        morningKg: evening ? e.weightKg - th.eveningOffsetKg : e.weightKg,
      };
    });
}

/** Weigh-ins that may be used to measure the trend (morning or unspecified). */
export const validWeighs = (weighs: Weigh[]): Weigh[] => weighs.filter((w) => !w.evening);

/** Body weight on a day, interpolated between morning-equivalent weigh-ins and held flat before the first / after the
 *  last. Null when there is no weigh-in at all. */
export function weightAtDay(weighs: Weigh[], dateKey: string): number | null {
  if (weighs.length === 0) return null;
  const n = dayNumber(dateKey);
  const pts = weighs.map((w) => ({ n: dayNumber(w.dateKey), kg: w.morningKg }));
  if (n <= pts[0].n) return pts[0].kg;
  const last = pts[pts.length - 1];
  if (n >= last.n) return last.kg;
  for (let i = 1; i < pts.length; i++) {
    if (n <= pts[i].n) {
      const a = pts[i - 1];
      const b = pts[i];
      return b.n === a.n ? b.kg : a.kg + ((b.kg - a.kg) * (n - a.n)) / (b.n - a.n);
    }
  }
  return last.kg;
}
