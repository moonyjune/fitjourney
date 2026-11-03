import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { SettingsGroup, SettingsGroupTitle, SettingsLinkRow } from '../../src/components/quest/SettingsRows';
import { SignOutButton } from '../../src/components/quest/SignOutButton';
import { showToast } from '../../src/store/useToastStore';
import { useGameText } from '../../src/game/strings';
import { useTranslation } from '../../src/i18n/useTranslation';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useSyncQueueStore } from '../../src/sync/syncQueue';
import { quest, questFonts, questRadius } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { backToProfile } from '../../src/utils/backToProfile';
import { APP_VERSION, BUILD_ID } from '../../src/utils/buildInfo';
import { formatDateVi } from '../../src/utils/date';

type Lang = 'vi' | 'en';

/** Hồ sơ › Coach & tài khoản (dialogs 37): language, the coach (link with a code, or who it is), Coach mode, importing a diary, the
 *  account with its unsynced changes, signing out (with the confirm box) and the version. The only copy of these: the plan page no
 *  longer repeats them. */
export default function AccountSettingsScreen() {
  const g = useGameText();
  const { t } = useTranslation();
  useLightStatusBar();
  const address = useAuthStore((s) => s.session?.user.email);
  const pendingSyncCount = useSyncQueueStore((s) => s.pending.length);
  const language = useSettingsStore((s) => s.language);
  const coachEnabled = useSettingsStore((s) => s.coachEnabled);
  const coachId = useSettingsStore((s) => s.coachId);
  const linkedCoachEmail = useSettingsStore((s) => s.linkedCoachEmail);
  const linkedCoachCode = useSettingsStore((s) => s.linkedCoachCode);
  const linkedCoachSinceISO = useSettingsStore((s) => s.linkedCoachSinceISO);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const submitCoachCode = useSettingsStore((s) => s.submitCoachCode);
  const switchToCoachMode = useSettingsStore((s) => s.switchToCoachMode);

  const [coachCode, setCoachCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  async function connectCoach() {
    if (!coachCode.trim()) return;
    setLinking(true);
    setCoachError(null);
    const result = await submitCoachCode(coachCode);
    setLinking(false);
    if (result.ok) {
      setCoachCode('');
      showToast({ text: t('plan.linkedMessage') });
    } else setCoachError(result.message || g('profile.coachError'));
  }

  async function switchToCoach() {
    setSwitching(true);
    await switchToCoachMode();
    setSwitching(false);
    router.replace('/(tabs)/clients');
  }

  return (
    <ScreenTemplate title={g('rd6.set.account')} eyebrow={g('profile.title')} onBack={backToProfile}>
      <SettingsGroupTitle>{g('profile.language')}</SettingsGroupTitle>
      <QuestSegment<Lang>
        accessibilityLabel={g('profile.language')}
        value={language}
        onChange={(value) => updateSettings({ language: value })}
        options={[
          { value: 'vi', label: g('profile.languageVi') },
          { value: 'en', label: g('profile.languageEn') },
        ]}
      />

      <SettingsGroupTitle>{g('rd6.acc.coach')}</SettingsGroupTitle>
      <View style={styles.panel}>
        {coachId ? (
          <>
            <HudText size={14} color={quest.manaText}>
              {t('plan.linkedToCoach')}
            </HudText>
            <View style={styles.info}>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t('plan.coachEmailLabel')}
              </HudText>
              <HudText size={14} selectable>
                {linkedCoachEmail ?? t('plan.coachUnknown')}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t('plan.coachCodeLabel')}
              </HudText>
              <HudText size={14} selectable>
                {linkedCoachCode ?? t('plan.coachUnknown')}
              </HudText>
              {linkedCoachSinceISO && (
                <>
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {t('plan.coachSinceLabel')}
                  </HudText>
                  <HudText size={14}>{formatDateVi(linkedCoachSinceISO.slice(0, 10))}</HudText>
                </>
              )}
            </View>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {t('plan.coachOneOnly')}
            </HudText>
          </>
        ) : (
          <>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('profile.coachLinkHint')}
            </HudText>
            <View style={styles.coachRow}>
              <TextInput
                accessibilityLabel={g('profile.coachCodeLabel')}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={t('plan.coachCodePlaceholder')}
                placeholderTextColor={quest.textSecondary}
                value={coachCode}
                onChangeText={(v) => {
                  setCoachCode(v);
                  setCoachError(null);
                }}
                style={[styles.input, coachError ? styles.inputError : null]}
              />
              <View style={styles.coachBtn}>
                <QuestButton variant="mana" title={g('profile.coachConnect')} onPress={connectCoach} loading={linking} disabled={!coachCode.trim()} />
              </View>
            </View>
            {coachError && (
              <HudText size={12} weight="medium" color={quest.hpText} accessibilityLiveRegion="polite">
                {coachError}
              </HudText>
            )}
          </>
        )}
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {coachEnabled ? t('plan.coachFieldEnabled') : t('plan.coachFieldDisabled')}
        </HudText>
        <QuestButton variant="ghost" icon="swap" title={g('profile.coachOn')} onPress={switchToCoach} loading={switching} />
      </View>

      <SettingsGroupTitle>{g('rd6.acc.data')}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsLinkRow first icon="plus" color={quest.mana} label={g('profile.import')} onPress={() => router.push('/import-diary')} />
      </SettingsGroup>

      <SettingsGroupTitle>{t('tab.account')}</SettingsGroupTitle>
      <View style={styles.panel}>
        <HudText size={14} numberOfLines={1}>
          {address ?? t('common.notSignedIn')}
        </HudText>
        {pendingSyncCount > 0 && (
          <HudText size={12} color={quest.gold}>
            {t('sync.pendingCount', { n: pendingSyncCount })}
          </HudText>
        )}
        <SignOutButton />
      </View>

      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.build}>
        {g('profile.build', { version: APP_VERSION, id: BUILD_ID })}
      </HudText>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  info: { gap: 2 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 14, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, fontSize: 16, fontFamily: questFonts.semibold },
  inputError: { borderColor: quest.hp },
  coachBtn: { width: 120 },
  build: { marginTop: 18, textAlign: 'center' },
});
