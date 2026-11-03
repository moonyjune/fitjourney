import { useState } from 'react';
import { Platform } from 'react-native';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { SettingsGroup, SettingsGroupTitle, SettingsSwitchRow } from '../../src/components/quest/SettingsRows';
import { TemptationSettings } from '../../src/components/quest/TemptationSettings';
import { useGameText } from '../../src/game/strings';
import { cancelAllReminders, requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { disableWebPush, enableWebPush, refreshPushPlan } from '../../src/notifications/webPush';
import { usePlanStore } from '../../src/store/usePlanStore';
import { usePushStore } from '../../src/store/usePushStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { quest } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { backToProfile } from '../../src/utils/backToProfile';

/** Hồ sơ › Nhắc nhở & cám dỗ (dialogs 36): reminders, the separate water pop-up switch (decision 9), notifications while the app is
 *  closed (web) with their states, and the temptation challenge. A refused permission is a red line under the switch, not an alert. */
export default function RemindersSettingsScreen() {
  const g = useGameText();
  useLightStatusBar();
  const plan = usePlanStore((s) => s.plan);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const waterPopupEnabled = useSettingsStore((s) => s.waterPopupEnabled ?? s.remindersEnabled);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const pushEnabled = usePushStore((s) => s.enabled);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function toggleReminders(value: boolean) {
    setDenied(false);
    try {
      if (value) {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          // Leave the switch off: claiming reminders are on when the OS refused them would be a lie.
          setDenied(true);
          return;
        }
        await scheduleAllReminders(plan);
      } else {
        await cancelAllReminders();
      }
    } catch (error) {
      // expo-notifications is unavailable in Expo Go / on web; still let the preference save.
      console.warn('[notifications] unavailable in this runtime:', error);
    }
    updateSettings({ remindersEnabled: value });
    // The server sends nothing while reminders are off: save the (empty) plan now rather than after the debounce.
    refreshPushPlan().catch(() => undefined);
  }

  // Web Push for this device. Called straight from the tap: the permission prompt (iPhone) only opens from a user gesture.
  async function togglePush(value: boolean) {
    setPushNote(null);
    if (!value) {
      setPushBusy(true);
      await disableWebPush().catch(() => undefined);
      setPushBusy(false);
      return;
    }
    if (!remindersEnabled) {
      setPushNote(g('push.remindersOff'));
      return;
    }
    setPushBusy(true);
    const result = await enableWebPush();
    setPushBusy(false);
    if (!result.ok) {
      const key = result.reason === 'needsHomeScreen' ? 'push.needsHomeScreen' : result.reason === 'unsupported' ? 'push.unsupported' : result.reason === 'denied' ? 'push.denied' : 'push.failed';
      setPushNote(g(key));
    }
  }

  return (
    <ScreenTemplate title={g('rd6.set.reminders')} eyebrow={g('profile.title')} onBack={backToProfile}>
      <SettingsGroupTitle>{g('profile.reminders')}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsSwitchRow
          first
          icon="bell"
          label={g('profile.reminders')}
          hint={g('profile.remindersHint')}
          value={remindersEnabled}
          onChange={toggleReminders}
          note={denied ? g('rd6.rem.denied') : null}
          noteColor={quest.hpText}
        />
        {Platform.OS === 'web' && (
          <SettingsSwitchRow
            icon="bell"
            color={quest.goldLight}
            label={g('push.title')}
            hint={g('push.hint')}
            value={pushEnabled}
            disabled={pushBusy}
            onChange={togglePush}
            note={pushNote ?? (pushEnabled ? g('push.on') : null)}
            noteColor={pushNote ? quest.gold : quest.textSecondary}
          />
        )}
        {/* The in-app water pop-up has its own switch (dialogs.md decision 9): reminders can stay on without it. */}
        <SettingsSwitchRow
          icon="drop"
          color={quest.mana}
          label={g('profile.waterPopup')}
          hint={g('profile.waterPopupHint')}
          value={waterPopupEnabled}
          onChange={(value) => updateSettings({ waterPopupEnabled: value })}
        />
      </SettingsGroup>

      <TemptationSettings />
    </ScreenTemplate>
  );
}
