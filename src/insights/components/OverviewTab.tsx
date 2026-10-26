import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { HudText } from '../../components/quest/HudText';
import { quest, questRadius } from '../../theme/quest';
import { chartWidthFor } from '../../theme/responsive';
import { thinLabels } from '../../utils/chartLabels';
import { efficiencyBand } from '../efficiency';
import { fmtDayMonth, fmtDec, fmtInt } from '../format';
import { addDaysToKey } from '../dateMath';
import type { InsightsKey } from '../strings';
import type { InsightsView } from '../useInsights';
import { Line, Panel, Section, TONE_COLOR, toneHigh, toneLow, type Tone } from './ui';

type T = (key: InsightsKey, params?: Record<string, string | number>) => string;
type Lang = 'vi' | 'en';

const chartConfig = {
  backgroundColor: quest.panel,
  backgroundGradientFrom: quest.panel,
  backgroundGradientTo: quest.panel,
  decimalPlaces: 1,
  color: (opacity = 1) => `rgba(255, 200, 61, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(179, 170, 207, ${opacity})`,
  propsForDots: { r: '3' },
};

const WINDOW_LABEL: Record<string, InsightsKey> = { '7': 'ins.win7', '14': 'ins.win14', '30': 'ins.win30', all: 'ins.winAll' };
const HORIZON_LABEL: Record<number, InsightsKey> = { 7: 'ins.h7', 14: 'ins.h14', 30: 'ins.h30', 60: 'ins.h60', 90: 'ins.h90' };

function FatWaterSection({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const { insights } = view;
  const { fatWater, weighs } = insights;
  const width = chartWidthFor(useWindowDimensions().width) - 16;
  const dec1 = (v: number) => fmtDec(v, 1, lang);

  const chart = useMemo(() => {
    const pts = fatWater.points;
    if (pts.length < 2) return null;
    return {
      labels: thinLabels(pts.map((p) => fmtDayMonth(p.dateKey))),
      datasets: [
        { data: pts.map((p) => p.morningKg), color: () => quest.gold, strokeWidth: 3 },
        { data: pts.map((p) => p.fatLineKg), color: () => quest.mana, strokeWidth: 2 },
      ],
    };
  }, [fatWater.points]);

  if (weighs.length < 2) {
    return (
      <Panel>
        <Line>{t('ins.fwNoWeights')}</Line>
      </Panel>
    );
  }
  const { scaleLostKg, fatLostKg, fatPerWeekKg, latest } = fatWater;
  const water = Math.max(0, scaleLostKg - fatLostKg);
  const rateKey: InsightsKey = fatPerWeekKg > 1 ? 'ins.fwRateFast' : fatPerWeekKg >= 0.5 ? 'ins.fwRateSafe' : 'ins.fwRateSlow';
  const levelKey = { high: 'ins.waterHigh', mild: 'ins.waterMild', normal: 'ins.waterNormal', releasing: 'ins.waterReleasing' } as const;
  const levelTone: Record<string, Tone> = { high: 'bad', mild: 'fair', normal: 'ok', releasing: 'ok' };
  return (
    <Panel>
      <Line color={quest.text}>
        {scaleLostKg > 0.05
          ? t('ins.fwSummary', { kg: dec1(scaleLostKg), fat: dec1(fatLostKg), pct: Math.max(0, Math.min(100, Math.round((fatLostKg / scaleLostKg) * 100))), water: dec1(water) })
          : t('ins.fwSummaryFlat', { fat: dec1(fatLostKg) })}
      </Line>
      <Line>
        {t('ins.fwRate', { rate: fmtDec(fatPerWeekKg, 2, lang) })} {t(rateKey)}
      </Line>
      {latest && <Line color={TONE_COLOR[levelTone[latest.level]]}>{t(levelKey[latest.level], { kg: dec1(Math.abs(latest.waterKg)) })}</Line>}
      {latest?.evening && <Line>{t('ins.eveningNote', { kg: dec1(latest.morningKg) })}</Line>}
      {chart && (
        <View style={styles.chartBox}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {t('ins.chartTitle')}
          </HudText>
          <LineChart data={chart} width={width} height={180} chartConfig={chartConfig} bezier fromZero={false} withShadow={false} style={styles.chart} />
          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: quest.gold }]} />
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {t('ins.legendActual')}
            </HudText>
            <View style={[styles.dot, { backgroundColor: quest.mana }]} />
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {t('ins.legendFat')}
            </HudText>
          </View>
        </View>
      )}
    </Panel>
  );
}

function WindowsSection({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const { insights, thresholds: th } = view;
  const wins = insights.windows;
  if (wins.length === 0) return null;
  const by = (days: number | null) => wins.find((w) => w.days === days);
  const w7 = by(7);
  const w14 = by(14);
  const w30 = by(30);

  const rows: { key: InsightsKey; value: (w: (typeof wins)[number]) => { text: string; tone: Tone } }[] = [
    { key: 'ins.kcal', value: (w) => ({ text: fmtInt(w.avgKcal, lang), tone: 'plain' }) },
    { key: 'ins.deficit', value: (w) => ({ text: fmtInt(w.avgDeficit, lang), tone: toneHigh(w.avgDeficit, th.deficitOk, th.deficitFair) }) },
    { key: 'ins.protein', value: (w) => ({ text: fmtInt(w.avgProteinG, lang), tone: toneHigh(w.avgProteinG, th.proteinOk, th.proteinFair) }) },
    { key: 'ins.purine', value: (w) => ({ text: fmtInt(w.avgPurineMg, lang), tone: toneLow(w.avgPurineMg, th.purineMax, th.purineFair) }) },
    { key: 'ins.sodium', value: (w) => ({ text: fmtInt(w.avgSodiumMg, lang), tone: toneLow(w.avgSodiumMg, th.sodiumMax, th.sodiumFair) }) },
    { key: 'ins.sugar', value: (w) => ({ text: fmtInt(w.avgSugarG, lang), tone: toneLow(w.avgSugarG, th.sugarMax, th.sugarFair) }) },
  ];

  const lastKey = insights.rows[insights.rows.length - 1].dateKey;
  const lowKcal = insights.rows.some((r) => r.complete && r.kcal < th.minKcal && r.dateKey > addDaysToKey(lastKey, -14));
  let trend = '';
  if (w7 && w14) {
    const diff = w7.avgDeficit - w14.avgDeficit;
    trend = diff > 0 ? t('ins.trendUp', { n: fmtInt(diff, lang) }) : t('ins.trendDown', { n: fmtInt(diff, lang) });
    if (w30) trend += w7.avgSodiumMg > w30.avgSodiumMg ? t('ins.sodiumUp') : t('ins.sodiumDown');
  }

  return (
    <Panel>
      <View style={styles.tableRow}>
        <View style={styles.labelCell} />
        {wins.map((w) => (
          <View key={String(w.days)} style={styles.cell}>
            <HudText size={12} color={quest.textSecondary}>
              {t(WINDOW_LABEL[w.days === null ? 'all' : String(w.days)])}
            </HudText>
            {w.days === null ? (
              <HudText size={10} weight="medium" color={quest.textSecondary}>
                {t('ins.winAllDays', { n: w.daysWithData })}
              </HudText>
            ) : (
              w.daysWithData < w.days && (
                <HudText size={10} weight="medium" color={quest.textSecondary}>
                  {t('ins.winPartial', { n: w.daysWithData, d: w.days })}
                </HudText>
              )
            )}
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.key} style={styles.tableRow}>
          <View style={styles.labelCell}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {t(row.key)}
            </HudText>
          </View>
          {wins.map((w) => {
            const v = row.value(w);
            return (
              <View key={String(w.days)} style={styles.cell}>
                <HudText size={14} color={TONE_COLOR[v.tone]}>
                  {v.text}
                </HudText>
              </View>
            );
          })}
        </View>
      ))}
      <Line size={12}>{t('ins.target', { t: fmtInt(th.deficitOk, lang) })}</Line>
      {trend !== '' && <Line>{trend}</Line>}
      {lowKcal && <Line color={quest.hpText}>{t('ins.lowKcal')}</Line>}
    </Panel>
  );
}

function EfficiencySection({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const { efficiency: e } = view.insights;
  if (e.count < 2 || e.spanDays <= 0) {
    return (
      <Panel>
        <Line>{t('ins.effNone')}</Line>
      </Panel>
    );
  }
  const band = efficiencyBand(e.applied);
  const tone: Tone = band === 'good' ? 'ok' : band === 'low' ? 'bad' : 'fair';
  const bandKey = { low: 'ins.effLow', slow: 'ins.effSlow', good: 'ins.effGood', fast: 'ins.effFast' } as const;
  return (
    <Panel>
      <HudText size={22} color={TONE_COLOR[tone]}>
        {t('ins.effValue', { v: fmtDec(e.applied, 2, lang) })}
      </HudText>
      <Line color={quest.text}>{t('ins.effPer1000', { kg: fmtDec(e.kgPer1000, 2, lang) })}</Line>
      <Line>{t(bandKey[band])}</Line>
      {band !== 'good' && <Line>{t('ins.effTip')}</Line>}
      <Line size={12}>{t('ins.effBasis', { n: e.count, m: view.thresholds.trustWeighIns })}</Line>
    </Panel>
  );
}

function ForecastSection({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const { forecast } = view.insights;
  if (!forecast) {
    return (
      <Panel>
        <Line>{t('ins.fcNone')}</Line>
      </Panel>
    );
  }
  const week = forecast.firstWeekKg;
  const paceKey: InsightsKey = week > 1 ? 'ins.fcPaceFast' : week >= 0.5 ? 'ins.fcPaceSafe' : 'ins.fcPaceSlow';
  const goal = fmtDec(view.goalWeightKg, 1, lang);
  const dateText = (key: string) => {
    const [y, m, d] = key.split('-');
    return `${d}/${m}/${y}`;
  };
  return (
    <Panel>
      <Line color={quest.text}>{t('ins.fcIntro', { d: fmtInt(forecast.avgDeficit, lang), e: fmtDec(forecast.efficiency, 2, lang), kg: fmtDec(forecast.startKg, 1, lang) })}</Line>
      {forecast.points.map((p) => (
        <View key={p.days} style={styles.fcRow}>
          <HudText size={13} color={quest.gold} style={styles.fcLabel}>
            {t(HORIZON_LABEL[p.days])}
          </HudText>
          <HudText size={12} weight="medium" color={quest.text} style={styles.fcText}>
            {t('ins.fcRow', {
              date: dateText(p.dateKey),
              kg: fmtDec(p.kg, 1, lang),
              low: fmtDec(p.low, 1, lang),
              high: fmtDec(p.high, 1, lang),
              rate: fmtDec(p.perWeekKg, 2, lang),
            })}
          </HudText>
        </View>
      ))}
      <Line color={forecast.daysToGoal !== null ? quest.xp : quest.textSecondary}>
        {forecast.daysToGoal !== null && forecast.goalDateKey
          ? t('ins.fcGoal', { goal, date: dateText(forecast.goalDateKey), n: forecast.daysToGoal })
          : t('ins.fcGoalNone', { goal })}
      </Line>
      <Line>{t(paceKey)}</Line>
      <Line size={12}>{t('ins.fcBand', { b: fmtDec(view.thresholds.waterBand, 1, lang) })}</Line>
    </Panel>
  );
}

export function OverviewTab({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  return (
    <View>
      <Section>{t('ins.fwTitle')}</Section>
      <FatWaterSection view={view} t={t} lang={lang} />
      <Section>{t('ins.winTitle')}</Section>
      <WindowsSection view={view} t={t} lang={lang} />
      <Section>{t('ins.effTitle')}</Section>
      <EfficiencySection view={view} t={t} lang={lang} />
      <Section>{t('ins.fcTitle')}</Section>
      <ForecastSection view={view} t={t} lang={lang} />
      <Line size={11} style={styles.note}>
        {t('ins.estimateNote')}
      </Line>
    </View>
  );
}

const styles = StyleSheet.create({
  chartBox: { marginTop: 10, gap: 6 },
  chart: { borderRadius: questRadius.row },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  labelCell: { width: 86 },
  cell: { flex: 1, alignItems: 'center' },
  fcRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 2 },
  fcLabel: { width: 64 },
  fcText: { flex: 1 },
  note: { textAlign: 'center', marginTop: 8 },
});
