import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { QuestSegment } from '../src/components/quest/QuestSegment';
import { FeedbackTab } from '../src/feedback/components/FeedbackTab';
import { useFeedbackText } from '../src/feedback/strings';
import { MoveTab } from '../src/insights/components/MoveTab';
import { OverviewTab } from '../src/insights/components/OverviewTab';
import { PeriodsTab } from '../src/insights/components/PeriodsTab';
import { AnalysisStamp } from '../src/insights/components/AnalysisStamp';
import { Line, Panel } from '../src/insights/components/ui';
import { HudText } from '../src/components/quest/HudText';
import { ANALYSIS_MODES, ANALYSIS_SCOPES, rangeStatus, stampText, type AnalysisMode, type AnalysisScope } from '../src/insights/snapshot';
import { useInsightsText, type InsightsKey } from '../src/insights/strings';
import { useAnalysisSync, useReanalyse } from '../src/insights/useAnalysisRefresh';
import { useInsights } from '../src/insights/useInsights';
import { useAnalysisStore } from '../src/store/useAnalysisStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

type Tab = AnalysisScope;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

/** Automatic or manual updates of the analysis, as a pair of radio buttons with what each means. */
function ModePicker({ t }: { t: ReturnType<typeof useInsightsText> }) {
  const mode = useAnalysisStore((s) => s.mode);
  const setMode = useAnalysisStore((s) => s.setMode);
  const name: Record<AnalysisMode, InsightsKey> = { auto: 'ins.modeAuto', manual: 'ins.modeManual' };
  return (
    <View>
      <HudText size={13}>{t('ins.modeTitle')}</HudText>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('ins.modeTitle')} style={styles.radios}>
        {ANALYSIS_MODES.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityLabel={t(name[m])}
            accessibilityState={{ checked: mode === m }}
            onPress={() => mode !== m && setMode(m)}
            style={({ pressed }) => [styles.radio, mode === m && styles.radioOn, pressed && styles.pressed]}
          >
            <HudText size={13} color={mode === m ? quest.manaText : quest.textSecondary}>
              {`${mode === m ? '◉' : '○'} ${t(name[m])}`}
            </HudText>
          </Pressable>
        ))}
      </View>
      <Line size={11}>{t(mode === 'auto' ? 'ins.modeAutoHint' : 'ins.modeManualHint')}</Line>
    </View>
  );
}

/** Profile > Analysis: deficit and fat-versus-water, forecast, weekly / monthly summaries and exercise suggestions. Each tab keeps its
 *  own analysis with the time it was made; it follows the diary at once (auto) or when asked again (manual). */
export default function InsightsScreen() {
  const t = useInsightsText();
  const tf = useFeedbackText();
  const lang = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  useAnalysisSync();
  const [tab, setTab] = useState<Tab>('overview');
  const view = useInsights(tab);
  const hasData = view.insights.rows.length > 0;
  const allScopes = useAnalysisStore((s) => s.scopes);
  const all = useReanalyse();
  const tabRun = useReanalyse();
  const tabName: Record<Tab, string> = { overview: t('ins.tabOverview'), periods: t('ins.tabPeriods'), move: t('ins.tabMove'), feedback: tf('fb.tab') };
  const statuses = ANALYSIS_SCOPES.map((sc) => ({ scope: sc, status: rangeStatus(view.live, allScopes[sc] ?? {}) }));
  const latest = statuses.reduce<string | null>((m, x) => (x.status.atISO && (!m || x.status.atISO > m) ? x.status.atISO : m), null);
  const outdatedTabs = statuses.filter((x) => x.status.outdated).map((x) => tabName[x.scope]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={t('ins.title')} onBack={goBack} backLabel={t('ins.back')} />
        <Panel style={styles.refreshPanel}>
          <ModePicker t={t} />
          <View style={styles.allRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ins.refreshAll')}
              accessibilityState={{ busy: all.result?.state === 'busy', disabled: all.result?.state === 'busy' }}
              disabled={all.result?.state === 'busy'}
              onPress={() => all.run(ANALYSIS_SCOPES)}
              style={({ pressed }) => [styles.allButton, outdatedTabs.length > 0 && styles.allButtonOutdated, pressed && styles.pressed]}
            >
              <HudText size={13} color={quest.manaText}>
                {all.result?.state === 'busy' ? t('ins.reanalyzing') : `↻ ${t('ins.refreshAll')}`}
              </HudText>
            </Pressable>
            <Line size={11} style={styles.allAt}>
              {latest ? t('ins.analysedAt', { at: stampText(latest) }) : t('ins.analysedNever')}
            </Line>
          </View>
          {hasData && (
            <Line size={11} color={outdatedTabs.length > 0 ? quest.gold : quest.xp}>
              {outdatedTabs.length > 0 ? t('ins.outdatedTabs', { tabs: outdatedTabs.join(', ') }) : t('ins.allFresh')}
            </Line>
          )}
          {all.result && all.result.state !== 'busy' && (
            <Line size={11} color={all.result.state === 'done' ? quest.xp : quest.gold}>
              {t(all.result.state === 'done' ? 'ins.reanalyzed' : 'ins.reanalyzeLocal', { time: stampText(all.result.atISO).slice(6) })}
            </Line>
          )}
        </Panel>
        <View style={styles.segment}>
          <QuestSegment<Tab>
            accessibilityLabel={t('ins.title')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: t('ins.tabOverview') },
              { value: 'periods', label: t('ins.tabPeriods') },
              { value: 'move', label: t('ins.tabMove') },
              { value: 'feedback', label: tf('fb.tab') },
            ]}
          />
        </View>
        {hasData && (
          <AnalysisStamp
            status={view.status}
            t={t}
            title={t('ins.refreshTab')}
            label={t('ins.refreshTabLabel', { tab: tabName[tab] })}
            onRefresh={() => tabRun.run([tab])}
            result={tabRun.result ?? undefined}
          />
        )}
        {!hasData ? (
          <Panel style={styles.empty}>
            <Line color={quest.textSecondary}>{t('ins.empty')}</Line>
          </Panel>
        ) : tab === 'overview' ? (
          <OverviewTab view={view} t={t} lang={lang} />
        ) : tab === 'periods' ? (
          <PeriodsTab view={view} t={t} lang={lang} />
        ) : tab === 'move' ? (
          <MoveTab view={view} t={t} lang={lang} />
        ) : (
          <FeedbackTab view={view} lang={lang} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  segment: { marginTop: 4 },
  empty: { marginTop: 16 },
  refreshPanel: { marginTop: 14, gap: 6 },
  radios: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 2 },
  radio: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised2 },
  radioOn: { borderColor: quest.mana },
  pressed: { opacity: 0.7 },
  allRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  allButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.mana, backgroundColor: quest.raised2 },
  allButtonOutdated: { borderColor: quest.gold },
  allAt: { flexShrink: 1 },
});
