import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { QuestSegment } from '../src/components/quest/QuestSegment';
import { FeedbackTab } from '../src/feedback/components/FeedbackTab';
import { useFeedbackText } from '../src/feedback/strings';
import { MoveTab } from '../src/insights/components/MoveTab';
import { OverviewTab } from '../src/insights/components/OverviewTab';
import { PeriodsTab } from '../src/insights/components/PeriodsTab';
import { Line, Panel } from '../src/insights/components/ui';
import { useInsightsText } from '../src/insights/strings';
import { useInsights } from '../src/insights/useInsights';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

type Tab = 'overview' | 'periods' | 'move' | 'feedback';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

/** Profile > Analysis: deficit and fat-versus-water, forecast, weekly / monthly summaries and exercise suggestions. */
export default function InsightsScreen() {
  const t = useInsightsText();
  const tf = useFeedbackText();
  const lang = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const view = useInsights();
  const [tab, setTab] = useState<Tab>('overview');
  const hasData = view.insights.rows.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={t('ins.title')} onBack={goBack} backLabel={t('ins.back')} />
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
  segment: { marginTop: 14 },
  empty: { marginTop: 16 },
});
