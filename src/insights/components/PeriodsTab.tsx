import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { QuestSegment } from '../../components/quest/QuestSegment';
import { quest, questRadius } from '../../theme/quest';
import { useFeedbackText } from '../../feedback/strings';
import { frequentFoods } from '../../feedback/repeats';
import { toDateKey } from '../../utils/date';
import { restoreOwnData } from '../../sync/restore';
import type { MainMeal } from '../days';
import { missingInPeriod } from '../missing';
import { logSkippedMeal } from '../../food/skipMeal';
import { fmtDayMonth, fmtDec, fmtInt, fmtSigned } from '../format';
import { periodIsOpen, type Finding, type Kaizen, type PeriodKind, type PeriodSummary } from '../periods';
import type { InsightsKey } from '../strings';
import type { InsightsView } from '../useInsights';
import { WeekControlCard } from './WeekControlCard';
import { Line, Panel, TONE_COLOR, toneHigh, toneLow, type Tone } from './ui';

type T = (key: InsightsKey, params?: Record<string, string | number>) => string;
type Lang = 'vi' | 'en';

const FINDING_NUM = (f: Finding, lang: Lang) => ({
  v: f.key === 'purineDays' || f.key === 'missing' || f.key === 'logged' ? f.value : fmtInt(f.value, lang),
  e: f.extra === undefined ? '' : f.key === 'sodium' || f.key === 'missing' ? f.extra : fmtInt(f.extra, lang),
  t: f.total ?? '',
});

const QUOTA_TONE: Record<'ok' | 'fair' | 'bad', Tone> = { ok: 'ok', fair: 'fair', bad: 'bad' };

function label(p: PeriodSummary, t: T): string {
  if (p.kind === 'week') return t('ins.periodWeek', { from: fmtDayMonth(p.fromKey), to: fmtDayMonth(p.toKey) });
  const [y, m] = p.key.split('-');
  return t('ins.periodMonth', { m: Number(m), y });
}

function kaizenText(k: Kaizen, t: T, lang: Lang): string {
  const keys = { data: 'ins.k.data', steady: 'ins.k.steady', deficit: 'ins.k.deficit', protein: 'ins.k.protein', purine: 'ins.k.purine', sugar: 'ins.k.sugar', sodium: 'ins.k.sodium' } as const;
  return t(keys[k.kind], { v: k.kind === 'data' ? k.value : fmtInt(k.value, lang) });
}

type Refresh = { key: string; state: 'busy' | 'done' | 'local'; time: string };

const clock = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

/** The days of a week that lack a main meal, each with a "not eaten" button per missing meal, and the days with nothing logged. */
function MissingMeals({ p, view, t, today }: { p: PeriodSummary; view: InsightsView; t: T; today: string }) {
  const { partial, empty } = missingInPeriod(view.insights.rows, p.fromKey, p.toKey, today);
  if (partial.length === 0 && empty.length === 0) return null;
  const mealName = (m: MainMeal) => t(`ins.meal.${m}`);
  return (
    <View style={styles.block}>
      <HudText size={12} color={quest.hpText}>
        {t('ins.missingTitle')}
      </HudText>
      {partial.map((d) => (
        <View key={d.dateKey} style={styles.missingDay}>
          <Line color={quest.text}>{t('ins.missingDay', { date: fmtDayMonth(d.dateKey), meals: d.missing.map(mealName).join(', ') })}</Line>
          <View style={styles.chips}>
            {d.missing.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityLabel={t('ins.markSkippedLabel', { meal: mealName(m), date: fmtDayMonth(d.dateKey) })}
                onPress={() => logSkippedMeal(d.dateKey, m)}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <HudText size={12} color={quest.manaText}>
                  {t('ins.markSkipped', { meal: mealName(m) })}
                </HudText>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {empty.length > 0 && <Line>{t('ins.emptyDays', { dates: empty.map(fmtDayMonth).join(', ') })}</Line>}
      {partial.length > 0 && <Line size={11}>{t('ins.missingHint')}</Line>}
    </View>
  );
}

function PeriodCard({
  p,
  view,
  t,
  lang,
  open,
  refresh,
  onReanalyze,
}: {
  p: PeriodSummary;
  view: InsightsView;
  t: T;
  lang: Lang;
  open: boolean;
  refresh: Refresh | null;
  onReanalyze: (key: string) => void;
}) {
  const today = toDateKey(new Date());
  const mine = refresh?.key === `${p.kind}-${p.key}` ? refresh : null;
  const th = view.thresholds;
  const tf = useFeedbackText();
  const frequent = frequentFoods(view.items, p.fromKey, p.toKey);
  const quota = p.kind === 'week' ? view.quotas.find((q) => q.weekStart === p.key) : undefined;
  const int = (v: number) => fmtInt(v, lang);
  const sKey = { deficit: 'ins.s.deficit', protein: 'ins.s.protein', purine: 'ins.s.purine', sugar: 'ins.s.sugar', sodium: 'ins.s.sodium', logged: 'ins.s.logged', deficitUp: 'ins.s.deficitUp' } as const;
  const iKey = { deficit: 'ins.i.deficit', protein: 'ins.i.protein', purine: 'ins.i.purine', purineDays: 'ins.i.purineDays', sugar: 'ins.i.sugar', sodium: 'ins.i.sodium', missing: 'ins.i.missing', deficitDown: 'ins.i.deficitDown' } as const;
  return (
    <Panel>
      <View style={styles.head}>
        <HudText size={16}>{label(p, t)}</HudText>
        {open && (
          <View style={styles.pill}>
            <HudText size={10} color={quest.gold}>
              {t('ins.periodOpen')}
            </HudText>
          </View>
        )}
        {p.avgScore !== null && (
          <HudText size={12} color={quest.textSecondary} style={styles.score}>
            {t('ins.pScore', { s: fmtDec(p.avgScore, 1, lang) })}
          </HudText>
        )}
      </View>
      <Line size={12}>{t('ins.pDays', { n: p.days, m: p.missingDays })}</Line>
      {p.kind === 'week' && (
        <View style={styles.reanalyzeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('ins.reanalyze')} ${label(p, t)}`}
            accessibilityState={{ busy: refresh?.state === 'busy', disabled: refresh?.state === 'busy' }}
            disabled={refresh?.state === 'busy'}
            onPress={() => onReanalyze(`${p.kind}-${p.key}`)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <HudText size={12} color={quest.manaText}>
              {mine?.state === 'busy' ? t('ins.reanalyzing') : `↻ ${t('ins.reanalyze')}`}
            </HudText>
          </Pressable>
          {mine && mine.state !== 'busy' && (
            <Line size={11} color={mine.state === 'done' ? quest.xp : quest.gold} style={styles.reanalyzeNote}>
              {t(mine.state === 'done' ? 'ins.reanalyzed' : 'ins.reanalyzeLocal', { time: mine.time })}
            </Line>
          )}
        </View>
      )}
      {p.kind === 'week' && <MissingMeals p={p} view={view} t={t} today={today} />}
      <Line>{t('ins.pKcal', { k: int(p.avgKcal), b: int(p.avgBurn) })}</Line>
      <Line color={TONE_COLOR[toneHigh(p.avgDeficit, th.deficitOk, th.deficitFair)]}>
        {t('ins.pDeficit', { d: int(p.avgDeficit), diff: fmtSigned(p.avgDeficit - th.deficitOk, lang) })}
      </Line>
      <Line>{t('ins.pTotal', { t: int(p.totalDeficit), f: fmtDec(p.theoryFatKg, 2, lang), a: fmtDec(p.fatKg, 2, lang) })}</Line>
      <Line color={TONE_COLOR[toneHigh(p.avgProteinG, th.proteinOk, th.proteinFair)]}>{t('ins.pProtein', { p: int(p.avgProteinG), n: p.daysProteinOk, d: p.days })}</Line>
      <Line color={TONE_COLOR[toneLow(p.avgPurineMg, th.purineMax, th.purineFair)]}>
        {t('ins.pPurine', { a: int(p.avgPurineMg), m: int(p.maxPurineMg), n: p.daysPurineOver })}
      </Line>
      <Line color={TONE_COLOR[toneLow(p.avgSugarG, th.sugarMax, th.sugarFair)]}>{t('ins.pSugar', { g: int(p.avgSugarG) })}</Line>
      <Line color={TONE_COLOR[toneLow(p.avgSodiumMg, th.sodiumMax, th.sodiumFair)]}>{t('ins.pSodium', { a: int(p.avgSodiumMg), n: p.daysSodiumOver, d: p.days })}</Line>
      {p.avgWeightKg !== null && p.minWeightKg !== null && <Line>{t('ins.pWeight', { a: fmtDec(p.avgWeightKg, 1, lang), m: fmtDec(p.minWeightKg, 1, lang) })}</Line>}

      {p.strengths.length > 0 && (
        <View style={styles.block}>
          <HudText size={12} color={quest.xp}>
            {t('ins.strengths')}
          </HudText>
          {p.strengths.map((f) => (
            <Line key={f.key}>{t(sKey[f.key as keyof typeof sKey], FINDING_NUM(f, lang))}</Line>
          ))}
        </View>
      )}
      {p.improvements.length > 0 && (
        <View style={styles.block}>
          <HudText size={12} color={quest.hpText}>
            {t('ins.toImprove')}
          </HudText>
          {p.improvements.map((f) => (
            <Line key={f.key}>{t(iKey[f.key as keyof typeof iKey], FINDING_NUM(f, lang))}</Line>
          ))}
        </View>
      )}
      {quota && (
        <Line color={TONE_COLOR[QUOTA_TONE[quota.verdict]]}>
          {t('ins.pQuota', {
            f: quota.flexible,
            m: quota.mainMeals,
            p: quota.pctOnPlan === null ? 0 : Math.round(quota.pctOnPlan * 100),
            v:
              (quota.verdict === 'ok' ? t('ins.pQuotaOk') : quota.verdict === 'fair' ? t('ins.pQuotaFair', { o: quota.over }) : t('ins.pQuotaBad', { o: quota.over })) +
              (quota.pctTarget < 0.7 ? ` · ${t('ins.pQuotaLow', { p: Math.round(quota.pctTarget * 100) })}` : quota.pctTarget >= 1 ? ` · ${t('ins.pQuotaHigh')}` : ''),
          })}
        </Line>
      )}
      {frequent.length > 0 && (
        <View style={styles.block}>
          <HudText size={12} color={quest.gold}>
            {tf('fb.frequentTitle')}
          </HudText>
          {frequent.map((h) => (
            <Line key={h.rule.keyword}>{tf('fb.frequentRow', { short: h.rule.short, n: h.count, to: h.rule.shortReplace })}</Line>
          ))}
        </View>
      )}
      {p.kaizen && (
        <View style={styles.kaizen}>
          <HudText size={11} color={quest.gold} style={styles.kaizenTitle}>
            {t('ins.kaizen')}
          </HudText>
          <Line color={quest.text}>{kaizenText(p.kaizen, t, lang)}</Line>
        </View>
      )}
    </Panel>
  );
}

export function PeriodsTab({ view, t, lang }: { view: InsightsView; t: T; lang: Lang }) {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [refresh, setRefresh] = useState<Refresh | null>(null);
  // The analysis follows the logs as they change; "analyse again" first brings in what was added elsewhere (another device, the coach,
  // a fix in the cloud), then every figure, missing meal and comment is worked out again from it.
  const reanalyze = (key: string) => {
    setRefresh({ key, state: 'busy', time: '' });
    restoreOwnData().then((r) => setRefresh({ key, state: r.ok ? 'done' : 'local', time: clock() }));
  };
  const list = [...(kind === 'week' ? view.insights.weeks : view.insights.months)].reverse();
  const today = toDateKey(new Date());
  return (
    <View style={styles.wrap}>
      <QuestSegment<PeriodKind>
        accessibilityLabel={t('ins.tabPeriods')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'week', label: t('ins.week') },
          { value: 'month', label: t('ins.month') },
        ]}
      />
      {kind === 'week' && (
        <View style={styles.list}>
          <WeekControlCard view={view} t={t} lang={lang} />
        </View>
      )}
      <View style={styles.list}>
        {list.length === 0 ? (
          <Line>{t('ins.periodsEmpty')}</Line>
        ) : (
          list.map((p) => (
            <PeriodCard key={`${p.kind}-${p.key}`} p={p} view={view} t={t} lang={lang} open={periodIsOpen(p, today)} refresh={refresh} onReanalyze={reanalyze} />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  list: { marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: { borderWidth: 1.5, borderColor: quest.gold, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  score: { marginLeft: 'auto' },
  block: { marginTop: 8, gap: 2 },
  kaizen: { marginTop: 10, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised2, gap: 4 },
  kaizenTitle: { letterSpacing: 1.2 },
  reanalyzeRow: { marginTop: 6, gap: 4, alignItems: 'flex-start' },
  reanalyzeNote: { alignSelf: 'stretch' },
  missingDay: { gap: 4, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.mana, backgroundColor: quest.raised2 },
  chipPressed: { opacity: 0.7 },
});
