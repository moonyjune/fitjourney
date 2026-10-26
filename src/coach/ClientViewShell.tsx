import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../components/quest/HudText';
import { QuestButton } from '../components/quest/QuestButton';
import { useGameText } from '../game/strings';
import { quest } from '../theme/quest';
import { useLightStatusBar } from '../theme/useLightStatusBar';
import { useClientSnapshot, type ClientSnapshot } from './clientSnapshot';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/clients');
}

/** Loads a client's diary for a coach screen and renders `children` with it (or a loading / could-not-read message). */
export function ClientViewShell({ clientId, children }: { clientId: string | undefined; children: (client: ClientSnapshot) => ReactNode }) {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const { loading, snapshot } = useClientSnapshot(clientId);
  if (snapshot) return <>{children(snapshot)}</>;
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      {loading ? (
        <>
          <ActivityIndicator color={quest.gold} />
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.text}>
            {g('coachView.loading')}
          </HudText>
        </>
      ) : (
        <>
          <HudText size={13} weight="medium" color={quest.hpText} accessibilityRole="alert" style={styles.text}>
            {g('coachView.error')}
          </HudText>
          <QuestButton variant="ghost" title={g('common.back')} onPress={goBack} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg, paddingHorizontal: 16, gap: 12, alignItems: 'stretch', justifyContent: 'flex-start' },
  text: { textAlign: 'center' },
});
