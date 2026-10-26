import { StyleSheet, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { quest } from '../../theme/quest';
import { EXERCISE_CATALOG, kcalPer10Min, kcalPerUnit, planExercises, type ExerciseUnit, type JointRating } from '../exercises';
import { fmtDec, fmtInt } from '../format';
import type { InsightsKey } from '../strings';
import type { InsightsView } from '../useInsights';
import { Line, Panel, Section } from './ui';

type T = (key: InsightsKey, params?: Record<string, string | number>) => string;
type Lang = 'vi' | 'en';

const UNIT_KEY: Record<ExerciseUnit, InsightsKey> = { steps: 'ins.unitSteps', min: 'ins.unitMin', rep: 'ins.unitRep' };
const JOINT_KEY: Record<JointRating, InsightsKey> = { friendly: 'ins.jointFriendly', careful: 'ins.jointCareful', avoid: 'ins.jointAvoid' };
const JOINT_COLOR: Record<JointRating, string> = { friendly: quest.xp, careful: quest.gold, avoid: quest.hpText };

export function MoveTab({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const { insights, thresholds: th } = view;
  const week = insights.windows.find((w) => w.days === 14) ?? insights.windows[insights.windows.length - 1];
  const weightKg = insights.currentWeightKg;
  const int = (v: number) => fmtInt(v, lang);
  const plan = week ? planExercises(th.deficitOk - week.avgDeficit, weightKg) : null;
  const name = (e: (typeof EXERCISE_CATALOG)[number]) => (lang === 'en' ? e.nameEn : e.nameVi);

  return (
    <View>
      <Section>{t('ins.mvTitle')}</Section>
      <Panel>
        {!week || !plan ? (
          <Line>{t('ins.mvNoData')}</Line>
        ) : (
          <>
            <Line color={quest.text}>
              {plan.gapKcal > 0
                ? t('ins.mvGap', { a: int(week.avgDeficit), t: int(th.deficitOk), g: int(plan.gapKcal) })
                : t('ins.mvNoGap', { a: int(week.avgDeficit) })}
            </Line>
            {plan.gapKcal > 0 && <Line>{t('ins.mvSteps', { n: int(Math.round(plan.stepsToCloseGap / 100) * 100) })}</Line>}
            <HudText size={14} color={quest.gold} style={styles.bundleTitle}>
              {t('ins.mvBundle', { k: int(plan.bundleKcal) })}
            </HudText>
            {plan.bundle.map((b) => (
              <Line key={b.exercise.id}>
                {t('ins.mvBundleRow', { qty: fmtDec(b.qty, b.qty % 1 === 0 ? 0 : 1, lang).replace(/(\d)(?=(\d{3})+$)/g, lang === 'vi' ? '$1.' : '$1,'), unit: t(UNIT_KEY[b.exercise.unit]), name: name(b.exercise), kcal: int(b.kcal) })}
              </Line>
            ))}
            {plan.gapKcal > 0 && (plan.leftForFoodKcal > 0 ? <Line color={quest.gold}>{t('ins.mvFood', { k: int(plan.leftForFoodKcal) })}</Line> : <Line color={quest.xp}>{t('ins.mvCovered')}</Line>)}
            <Line size={12}>{t('ins.mvWeight', { kg: fmtDec(weightKg, 1, lang) })}</Line>
            <Line size={12}>{t('ins.mvJointTip')}</Line>
          </>
        )}
      </Panel>

      <Section>{t('ins.catTitle')}</Section>
      {EXERCISE_CATALOG.map((e) => (
        <Panel key={e.id}>
          <View style={styles.row}>
            <HudText size={14} style={styles.rowName}>
              {name(e)}
            </HudText>
            <HudText size={11} color={JOINT_COLOR[e.joint]}>
              {t(JOINT_KEY[e.joint])}
            </HudText>
          </View>
          <Line color={quest.gold} size={12}>
            {t('ins.catRow', {
              k1: fmtDec(kcalPerUnit(e, weightKg), kcalPerUnit(e, weightKg) < 1 ? 2 : 1, lang),
              unit: t(UNIT_KEY[e.unit]),
              k10: int(kcalPer10Min(e, weightKg)),
            })}
          </Line>
          <Line size={12}>{lang === 'en' ? e.tipEn : e.tipVi}</Line>
        </Panel>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bundleTitle: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1 },
});
