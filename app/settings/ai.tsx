import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useIsAiAdmin } from '../../src/ai/useIsAiAdmin';
import { AiUsageCard } from '../../src/components/quest/AiUsageCard';
import { InfoButton } from '../../src/components/quest/InfoButton';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { SettingsGroup, SettingsGroupTitle, SettingsLinkRow, SettingsSwitchRow } from '../../src/components/quest/SettingsRows';
import { useGameText } from '../../src/game/strings';
import { useAiPhotoStore } from '../../src/store/useAiPhotoStore';
import { quest } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { backToProfile } from '../../src/utils/backToProfile';

/** Hồ sơ › AI (dialogs 37): the master AI switch (what is sent → ⓘ), Full HD photos, today's own AI use, and "AI & chi phí" for an
 *  account the server lists as an AI admin. */
export default function AiSettingsScreen() {
  const g = useGameText();
  useLightStatusBar();
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);
  const setAiEnabled = useAiPhotoStore((s) => s.setAiEnabled);
  const aiFullHd = useAiPhotoStore((s) => s.fullHd);
  const setAiFullHd = useAiPhotoStore((s) => s.setFullHd);
  const isAiAdmin = useIsAiAdmin();

  return (
    <ScreenTemplate title={g('rd6.set.ai')} eyebrow={g('profile.title')} onBack={backToProfile}>
      <SettingsGroupTitle>{g('profile.group.ai')}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsSwitchRow
          first
          icon="chart"
          color={quest.mana}
          label={g('profile.aiEnabled')}
          hint={g('profile.aiEnabledHint')}
          info={<InfoButton about={g('profile.aiEnabled')} body={[g('rd6.info.aiEnabled')]} />}
          value={aiEnabled}
          onChange={setAiEnabled}
        />
        <SettingsSwitchRow icon="camera" label={g('profile.aiFullHd')} hint={g('profile.aiFullHdHint')} value={aiFullHd} onChange={setAiFullHd} />
      </SettingsGroup>

      <View style={styles.usage}>
        <AiUsageCard />
      </View>

      {isAiAdmin && (
        <View style={styles.usage}>
          <SettingsGroup>
            <SettingsLinkRow first icon="chart" color={quest.gold} label={g('rd6.ai.admin')} onPress={() => router.push('/ai-admin')} />
          </SettingsGroup>
        </View>
      )}
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  usage: { marginTop: 16 },
});
