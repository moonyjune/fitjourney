import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildWeeklyReportInput, cleanReport, weekInputFingerprint, type WeekInput } from '../src/ai/weeklyReport';
import { useAiErrorText } from '../src/ai/usePhotoAnalysis';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { useGameText } from '../src/game/strings';
import { useNow } from '../src/game/useGameState';
import { useAiReportStore } from '../src/store/useAiReportStore';
import { useAnalysisStore } from '../src/store/useAnalysisStore';
import { useInsightsText } from '../src/insights/strings';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { useWorkoutStore } from '../src/store/useWorkoutStore';
import { fetchWeeklyReport, requestWeeklyReport, type AiErrorKind } from '../src/sync/cloudSync';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

const dd = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Boss > AI weekly review. The numbers are computed on the device from the logs and are always current; the AI writes the
 *  explanation from them (why the boss is or is not going down, repeated habits, weight against the deficit, next week's
 *  actions). The text is stored per week, so reopening it costs nothing; refreshing makes a new one. */
export default function WeeklyReportScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow(60_000);
  const aiErrorText = useAiErrorText();
  const logs = useNutritionStore((s) => s.logs);
  const workouts = useWorkoutStore((s) => s.entries);
  const weights = useWeightStore((s) => s.entries);
  const input: WeekInput = useMemo(() => buildWeeklyReportInput(now), [now, logs, workouts, weights]); // eslint-disable-line react-hooks/exhaustive-deps
  const period = input.week.start;
  const dataFp = useMemo(() => weekInputFingerprint(input), [input]);
  const mode = useAnalysisStore((s) => s.mode);
  const ti = useInsightsText();
  const stored = useAiReportStore((s) => s.weekly[period]);
  const saveWeekly = useAiReportStore((s) => s.saveWeekly);

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AiErrorKind | 'unusable' | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A review made on another device is on the server: fetch it once if this device has none for the week.
  useEffect(() => {
    if (useAiReportStore.getState().weekly[period]) return;
    fetchWeeklyReport(period).then((found) => {
      const clean = found ? cleanReport(found.report) : null;
      if (clean && found && alive.current && !useAiReportStore.getState().weekly[period]) saveWeekly(period, clean, found.generatedAtISO);
    });
  }, [period, saveWeekly]);

  const hasData = input.patterns.daysLogged > 0;

  async function analyze() {
    if (busy || !hasData) return;
    setBusy(true);
    setFailure(null);
    const outcome = await requestWeeklyReport(input, period, !!stored);
    if (!alive.current) return;
    setBusy(false);
    if (!outcome.ok) {
      setFailure(outcome.kind);
      return;
    }
    const clean = cleanReport(outcome.report);
    if (!clean) {
      setFailure('unusable');
      return;
    }
    // A review the server already had (not newly written) may come from older data: keep it without a fingerprint, so it shows as outdated.
    saveWeekly(period, clean, outcome.generatedAtISO, outcome.cached ? undefined : dataFp);
  }

  const { boss, patterns, weight, previousWeek, targets } = input;
  const report = stored?.report;
  const outdated = !!stored && stored.dataFp !== dataFp;
  const eyebrow = `${dd(input.week.start)} – ${dd(input.week.today)}`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={g('week.title')} eyebrow={eyebrow} onBack={goBack} backLabel={g('common.back')} />

        <View style={styles.card} accessible accessibilityLabel={g('week.statsTitle')}>
          <HudText size={13} color={quest.gold}>
            {g(`week.status.${boss.status}` as never)}
          </HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('week.boss', { hp: boss.hpLeft, max: boss.maxHp, dealt: boss.damageSoFar })}
          </HudText>
          {!boss.defeated && (
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('week.needed', { n: boss.neededPerRemainingDay, days: Math.max(1, 7 - input.week.daysElapsed) })}
            </HudText>
          )}
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('week.logged', { n: patterns.daysLogged, of: input.week.daysElapsed })}
            {patterns.avgDeficitKcal !== undefined ? ` · ${g('week.avgDeficit', { n: patterns.avgDeficitKcal, target: targets.dailyDeficitKcal })}` : ''}
          </HudText>
          {weight.changeKg !== undefined && weight.expectedChangeKg !== undefined && (
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('week.weight', { change: signed(weight.changeKg), expected: signed(weight.expectedChangeKg) })}
            </HudText>
          )}
          {previousWeek && (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('week.previous', { n: previousWeek.damage })}
            </HudText>
          )}
        </View>

        <QuestButton
          icon="chart"
          title={busy ? g('week.analyzing') : stored ? g('week.refresh') : g('week.analyze')}
          onPress={() => {
            void analyze();
          }}
          loading={busy}
          disabled={!hasData}
        />
        {!hasData && (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('week.needData')}
          </HudText>
        )}
        {failure && (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {failure === 'unusable' ? g('week.unusable') : aiErrorText(failure)}
          </HudText>
        )}

        {report && (
          <View style={styles.report} accessibilityLiveRegion="polite">
            <HudText size={16}>{report.headline}</HudText>
            {report.causes.length > 0 && (
              <View style={styles.block}>
                <HudText size={13} color={quest.manaText}>
                  {g('week.causes')}
                </HudText>
                {report.causes.map((c, i) => (
                  <HudText key={i} size={13} weight="medium" color={quest.textSecondary}>
                    {`• ${c.date ? `${dd(c.date)}: ` : ''}${c.text}`}
                  </HudText>
                ))}
              </View>
            )}
            {report.patterns.length > 0 && (
              <View style={styles.block}>
                <HudText size={13} color={quest.manaText}>
                  {g('week.patterns')}
                </HudText>
                {report.patterns.map((p, i) => (
                  <HudText key={i} size={13} weight="medium" color={quest.textSecondary}>
                    {`• ${p}`}
                  </HudText>
                ))}
              </View>
            )}
            {report.weightNote ? (
              <View style={styles.block}>
                <HudText size={13} color={quest.manaText}>
                  {g('week.weightTitle')}
                </HudText>
                <HudText size={13} weight="medium" color={quest.textSecondary}>
                  {report.weightNote}
                </HudText>
              </View>
            ) : null}
            {report.nextWeek.length > 0 && (
              <View style={styles.block}>
                <HudText size={13} color={quest.manaText}>
                  {g('week.next')}
                </HudText>
                {report.nextWeek.map((a, i) => (
                  <View key={i}>
                    <HudText size={13} color={quest.text}>{`${i + 1}. ${a.action}`}</HudText>
                    {a.why ? (
                      <HudText size={12} weight="medium" color={quest.textSecondary}>
                        {a.why}
                      </HudText>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
            {report.encouragement ? (
              <HudText size={13} weight="medium" color={quest.goldLight}>
                {report.encouragement}
              </HudText>
            ) : null}
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('week.stamp', { at: stamp(stored!.generatedAtISO) })}
            </HudText>
            {outdated && (
              <HudText size={11} weight="medium" color={quest.gold}>
                {ti(mode === 'auto' && hasData ? 'ins.aiAutoPending' : 'ins.aiOutdated')}
              </HudText>
            )}
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('ai.advice.disclaimer')}
            </HudText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  card: { gap: 4, padding: 12, marginTop: 14, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  report: { gap: 12, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  block: { gap: 4 },
});
