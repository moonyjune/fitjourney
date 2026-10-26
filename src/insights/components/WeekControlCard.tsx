import { StyleSheet, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { quest } from '../../theme/quest';
import { fmtDayMonth, fmtInt } from '../format';
import type { InsightsKey } from '../strings';
import type { InsightsView } from '../useInsights';
import { Line, Panel, TONE_COLOR, type Tone } from './ui';

type T = (key: InsightsKey, params?: Record<string, string | number>) => string;
type Lang = 'vi' | 'en';

const pct = (v: number) => Math.round(v * 100);

/** The current week: how far the weekly deficit is, what the remaining days must deliver, and the 80/20 allowance. */
export function WeekControlCard({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const wc = view.weekControl;
  if (!wc) return null;
  const int = (v: number) => fmtInt(v, lang);
  const th = view.thresholds;

  const deficitTone: Record<typeof wc.deficitStatus, Tone> = { done: 'ok', ended: 'fair', risk: 'bad', push: 'fair', onTrack: 'ok' };
  const needed = int(wc.neededPerDay ?? 0);
  const deficitText = {
    done: t('ins.wcDone', { p: pct(wc.pctTarget) }),
    ended: t('ins.wcEnded', { p: pct(wc.pctTarget) }),
    risk: t('ins.wcRisk', { n: needed, d: wc.daysLeft, s: int(wc.safeMaxPerDay), min: int(th.minKcal), m: pct(wc.maxPossiblePct ?? 0) }),
    push: t('ins.wcPush', { n: needed, d: wc.daysLeft }),
    onTrack: t('ins.wcOnTrack', { n: needed, d: wc.daysLeft }),
  }[wc.deficitStatus];

  const quotaTone: Record<typeof wc.quotaStatus, Tone> = { over: 'bad', used: 'fair', ok: 'ok' };
  const quotaText = {
    over: t('ins.wcOver', { f: wc.flexible, q: wc.quota }),
    used: t('ins.wcUsed'),
    ok: t('ins.wcOk', { f: wc.flexible, q: wc.quota, r: wc.quotaLeft }),
  }[wc.quotaStatus];

  return (
    <Panel>
      <HudText size={15}>{t('ins.wcTitle')}</HudText>
      <Line size={12}>
        {wc.daysLeft > 0
          ? t('ins.wcRange', { from: fmtDayMonth(wc.weekStart), to: fmtDayMonth(wc.weekEnd), n: wc.daysLeft })
          : t('ins.wcRangeEnded', { from: fmtDayMonth(wc.weekStart), to: fmtDayMonth(wc.weekEnd) })}
      </Line>

      <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.max(0, pct(wc.pctTarget))) }}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct(wc.pctTarget)))}%`, backgroundColor: TONE_COLOR[deficitTone[wc.deficitStatus]] }]} />
      </View>
      <Line color={quest.text}>{t('ins.wcDeficit', { a: int(wc.achieved), t: int(wc.targetDeficit), p: pct(wc.pctTarget) })}</Line>
      <Line color={TONE_COLOR[deficitTone[wc.deficitStatus]]}>{deficitText}</Line>

      <View style={styles.block}>
        <Line color={quest.text}>
          {t('ins.wcMeals', { m: wc.mainMeals, f: wc.flexible, q: wc.quota, p: wc.pctOnPlan === null ? 0 : pct(wc.pctOnPlan) })}
        </Line>
        <Line color={TONE_COLOR[quotaTone[wc.quotaStatus]]}>{quotaText}</Line>
      </View>

      <View style={styles.block}>
        {wc.surplusDays > 1 && <Line color={quest.hpText}>{t('ins.wcSurplus', { n: wc.surplusDays })}</Line>}
        {wc.lowKcalDays > 0 && <Line color={quest.hpText}>{t('ins.wcLowKcal', { n: wc.lowKcalDays, min: int(th.minKcal) })}</Line>}
        {wc.skipped > 0 && <Line>{t('ins.wcSkipped', { n: wc.skipped })}</Line>}
        <Line color={wc.purineOverDays > 0 ? quest.hpText : quest.xp}>
          {wc.purineOverDays > 0 ? t('ins.wcPurineOver', { n: wc.purineOverDays }) : t('ins.wcPurineOk')}
        </Line>
        {wc.avgSodiumMg !== null && (
          <Line color={wc.avgSodiumMg > th.sodiumMax ? quest.hpText : quest.xp}>
            {wc.avgSodiumMg > th.sodiumMax ? t('ins.wcSodiumOver', { a: int(wc.avgSodiumMg) }) : t('ins.wcSodiumOk')}
          </Line>
        )}
      </View>
      <Line size={11}>{t('ins.wcRule')}</Line>
    </Panel>
  );
}

const styles = StyleSheet.create({
  bar: { height: 10, borderRadius: 5, backgroundColor: quest.raised2, overflow: 'hidden', marginVertical: 6 },
  fill: { height: 10, borderRadius: 5 },
  block: { marginTop: 8, gap: 3 },
});
