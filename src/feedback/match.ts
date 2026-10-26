import { FOOD_RULES } from './rulesData';
import type { FoodRule } from './types';

interface Span {
  start: number;
  end: number;
}

function spansOf(lower: string, keyword: string): Span[] {
  const out: Span[] = [];
  for (let i = lower.indexOf(keyword); i !== -1; i = lower.indexOf(keyword, i + keyword.length)) out.push({ start: i, end: i + keyword.length });
  return out;
}

/** Rules that apply to a food description, in table order.
 *
 *  A rule fires when its keyword appears in the text (any case). Two refinements keep the list honest: a rule whose every
 *  occurrence sits inside the occurrence of a longer matching keyword is dropped ("mì tôm" must not also say "Tôm",
 *  "ức gà ăn liền" must not also say "Ức gà tốt"), and rules that share a name appear once ("mì tôm" and "mì indo" are both "Mì gói"). */
export function matchRules(text: string, rules: FoodRule[] = FOOD_RULES): FoodRule[] {
  const lower = text.toLowerCase();
  const hits = rules.map((rule) => ({ rule, spans: spansOf(lower, rule.keyword) })).filter((h) => h.spans.length > 0);
  const kept = hits.filter((h) =>
    h.spans.some((s) => !hits.some((o) => o !== h && o.rule.keyword.length > h.rule.keyword.length && o.spans.some((os) => os.start <= s.start && os.end >= s.end)))
  );
  const seen = new Set<string>();
  return kept
    .map((h) => h.rule)
    .filter((r) => {
      if (seen.has(r.short)) return false;
      seen.add(r.short);
      return true;
    });
}

/** A skipped meal is logged as "Không ăn" (or a note containing it). */
export const isSkippedMeal = (text: string): boolean => /không ăn/i.test(text);

/** Whether any of the day's food descriptions mentions alcohol: beer (but not a dish steamed in beer) or spirits. */
export function mentionsAlcohol(texts: string[]): boolean {
  const lower = texts.map((t) => t.toLowerCase());
  const beers = lower.filter((t) => t.includes('bia')).length - lower.filter((t) => t.includes('hấp bia')).length;
  return beers > 0 || lower.some((t) => t.includes('rượu'));
}
