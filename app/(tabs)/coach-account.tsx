import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useSyncQueueStore } from '../../src/sync/syncQueue';
import { signOutAndReset } from '../../src/auth/signOut';
import { useGameText } from '../../src/game/strings';
import { useTranslation } from '../../src/i18n/useTranslation';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

type Lang = 'vi' | 'en';

export default function CoachAccountScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const session = useAuthStore((s) => s.session);
  const pendingSyncCount = useSyncQueueStore((s) => s.pending.length);
  const coachCode = useSettingsStore((s) => s.coachCode);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const clientSetupDone = useSettingsStore((s) => s.clientSetupDone);
  const language = useSettingsStore((s) => s.language);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const switchToClientMode = useSettingsStore((s) => s.switchToClientMode);
  const ensureOwnCoachCode = useSettingsStore((s) => s.ensureOwnCoachCode);
  const [codeState, setCodeState] = useState<'idle' | 'loading' | 'failed'>('idle');

  // The code belongs to the account and is created automatically; this just makes sure it has been fetched/created.
  const loadCode = useCallback(async () => {
    setCodeState('loading');
    const code = await ensureOwnCoachCode();
    setCodeState(code ? 'idle' : 'failed');
  }, [ensureOwnCoachCode]);
  useEffect(() => {
    if (!coachCode) loadCode();
  }, [coachCode, loadCode]);

  function handleSwitchToClient() {
    switchToClientMode();
    router.replace('/(tabs)');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}>
      <View>
        <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
          {g('coach.eyebrow').toUpperCase()}
        </HudText>
        <HudText size={28} accessibilityRole="header">
          {g('coach.accountTitle')}
        </HudText>
      </View>

      <View style={styles.codeCard} accessible accessibilityLabel={`${t('coachAccount.codeTitle')}: ${coachCode ?? ''}`}>
        <HudText size={11} color={quest.manaText} style={styles.eyebrow}>
          {t('coachAccount.codeTitle').toUpperCase()}
        </HudText>
        {coachCode ? (
          <HudText size={30} selectable style={styles.code}>
            {coachCode}
          </HudText>
        ) : codeState === 'failed' ? (
          <>
            <HudText size={13} weight="medium" color={quest.hpText}>
              {g('coach.codeFailed')}
            </HudText>
            <QuestButton title={g('coach.codeRetry')} variant="mana" onPress={loadCode} />
          </>
        ) : (
          <HudText size={16} weight="medium" color={quest.textSecondary}>
            {g('coach.codeLoading')}
          </HudText>
        )}
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {t('coachAccount.codeHint')}
        </HudText>
      </View>

      <View style={styles.card}>
        <HudText size={15}>{t('mode.title')}</HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {clientSetupDone ? t('mode.clientAlreadyTracking') : t('mode.clientNotSetUp')}
        </HudText>
        <QuestButton
          title={clientSetupDone ? t('mode.switchToClient') : t('mode.startPersonalTracking')}
          variant="mana"
          onPress={handleSwitchToClient}
        />
      </View>

      <View style={styles.card}>
        <HudText size={15}>{t('mode.language')}</HudText>
        <QuestSegment<Lang>
          accessibilityLabel={t('mode.language')}
          value={language}
          onChange={(value) => updateSettings({ language: value })}
          options={[
            { value: 'vi', label: 'Tiếng Việt' },
            { value: 'en', label: 'English' },
          ]}
        />
      </View>

      <View style={[styles.card, styles.switchRow]}>
        <View style={styles.flex}>
          <HudText size={15}>{t('coachAccount.remindersTitle')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {t('coachAccount.deviceReminders')}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={t('coachAccount.deviceReminders')}
          value={remindersEnabled}
          onValueChange={(v) => updateSettings({ remindersEnabled: v })}
          trackColor={{ false: quest.raised2, true: quest.mana }}
          thumbColor={quest.text}
        />
      </View>

      <View style={styles.card}>
        <HudText size={15}>{t('tab.account')}</HudText>
        <HudText size={13} weight="medium" color={quest.textTertiary}>
          {session?.user.email ?? t('common.notSignedIn')}
        </HudText>
        {pendingSyncCount > 0 && (
          <HudText size={12} color={quest.gold}>
            {t('sync.pendingCount', { n: pendingSyncCount })}
          </HudText>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.signOut')} onPress={() => signOutAndReset()} style={styles.signOut}>
          <HudText size={15} color={quest.hpText}>
            {t('common.signOut')}
          </HudText>
        </Pressable>
      </View>

      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('coach.sharedOnly')}
      </HudText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6 },
  codeCard: { gap: 4, padding: 16, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  code: { letterSpacing: 4, color: quest.manaText },
  card: { gap: 10, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signOut: { minHeight: 48, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel, alignItems: 'center', justifyContent: 'center' },
});
