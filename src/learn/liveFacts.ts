import { addDaysToKey } from '../insights/dateMath';
import { fmtDec, fmtInt } from '../insights/format';
import type { Insights } from '../insights';
import type { Thresholds } from '../insights/thresholds';
import { formatLearnText, type LearnKey } from './strings';

/** One line of the user's own current numbers shown under a topic. */
export interface LiveFact {
  key: LearnKey;
  params: Record<string, string | number>;
}

/** Which topic shows which figure. */
export const FACT_TOPICS = { deficit: [1], water: [3, 21], sugar: [4], sodium: [6], protein: [7], water7: [14], eff: [15], purine: [25] } as const;

export interface LiveFactInput {
  insights: Insights;
  thresholds: Thresholds;
  /** Water logged (ml) by day, for the days that have a log. */
  waterByDay: Record<string, number>;
  waterTargetMl: number;
  language: 'vi' | 'en';
}

const WATER_DAYS = 7;

/** The user's current numbers for the topics they bear on, by topic number. A topic is left out when there is no data for it. */
export function buildLiveFacts(input: LiveFactInput): Record<number, LiveFact> {
  const { insights, thresholds: th, language: lang } = input;
  const out: Record<number, LiveFact> = {};
  const put = (topics: readonly number[], fact: LiveFact) => topics.forEach((t) => (out[t] = fact));
  const int = (v: number) => fmtInt(v, lang);
  const dec = (v: number, d = 1) => fmtDec(v, d, lang);

  const w14 = insights.windows.find((w) => w.days === 14);
  if (w14) {
    const inWindow = insights.rows.filter((r) => r.dateKey >= w14.fromKey && r.dateKey <= w14.toKey);
    put(FACT_TOPICS.deficit, { key: 'learn.f.deficit', params: { d: int(w14.avgDeficit), kg: dec((w14.avgDeficit * 7) / th.kcalPerKgFat) } });
    put(FACT_TOPICS.sugar, { key: 'learn.f.sugar', params: { g: int(w14.avgSugarG), max: int(th.sugarMax) } });
    put(FACT_TOPICS.sodium, {
      key: 'learn.f.sodium',
      params: { mg: int(w14.avgSodiumMg), max: int(th.sodiumMax), n: inWindow.filter((r) => r.sodiumMg > th.sodiumMax).length, d: inWindow.length },
    });
    put(FACT_TOPICS.protein, { key: 'learn.f.protein', params: { g: int(w14.avgProteinG), t: int(th.proteinOk) } });
    put(FACT_TOPICS.purine, {
      key: 'learn.f.purine',
      params: { mg: int(w14.avgPurineMg), max: int(th.purineMax), n: inWindow.filter((r) => r.purineMg > th.purineMax).length },
    });
  }

  // Fat versus water only means something once meals are on record to compare the scale with.
  const latest = insights.rows.length > 0 ? insights.fatWater.latest : null;
  if (latest) {
    const sign = latest.waterKg > 0 ? '+' : '';
    put(FACT_TOPICS.water, {
      key: 'learn.f.water',
      params: { kg: `${sign}${dec(latest.waterKg)}`, lvl: formatLearnText(lang, `learn.lvl.${latest.level}` as LearnKey) },
    });
  }

  if (insights.rows.length > 0 && insights.efficiency.count >= 2 && insights.efficiency.spanDays > 0) {
    put(FACT_TOPICS.eff, { key: 'learn.f.eff', params: { e: dec(insights.efficiency.applied, 2), kg: dec(insights.efficiency.kgPer1000, 2) } });
  }

  const lastDay = insights.rows[insights.rows.length - 1]?.dateKey;
  if (lastDay) {
    const from = addDaysToKey(lastDay, -(WATER_DAYS - 1));
    const days = Object.entries(input.waterByDay).filter(([d, ml]) => d >= from && d <= lastDay && ml > 0);
    if (days.length > 0) {
      const avgMl = days.reduce((s, [, ml]) => s + ml, 0) / days.length;
      put(FACT_TOPICS.water7, { key: 'learn.f.water7', params: { l: dec(avgMl / 1000), t: dec(input.waterTargetMl / 1000) } });
    }
  }
  return out;
}
