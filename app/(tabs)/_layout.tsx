import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { useTranslation } from '../../src/i18n/useTranslation';
import { useAccentColors } from '../../src/theme/useAccentColors';
import { useGameText } from '../../src/game/strings';
import { QuestTabBar } from '../../src/components/quest/QuestTabBar';

export default function TabsLayout() {
  const clientSetupDone = useSettingsStore((s) => s.clientSetupDone);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const role = useSettingsStore((s) => s.role);
  const isCoach = role === 'coach';
  const { t } = useTranslation();
  const g = useGameText();
  const colors = useAccentColors();
  const plan = usePlanStore((s) => s.plan);
  const syncPlanFromRemote = usePlanStore((s) => s.syncFromRemote);
  const coachCode = useSettingsStore((s) => s.coachCode);
  const ensureOwnCoachCode = useSettingsStore((s) => s.ensureOwnCoachCode);

  // Client mode always needs the weight/goal onboarding done at least once, even if this
  // account switched here from Coach mode (a dual-role account may not have done it yet).
  useEffect(() => {
    if (!isCoach && !clientSetupDone) {
      router.replace('/onboarding');
    }
  }, [isCoach, clientSetupDone]);

  // A Coach account always has its code: create/fetch it as soon as Coach mode is on and nothing is stored locally.
  useEffect(() => {
    if (isCoach && !coachCode) ensureOwnCoachCode();
  }, [isCoach, coachCode, ensureOwnCoachCode]);

  useEffect(() => {
    if (!isCoach && clientSetupDone) syncPlanFromRemote();
  }, [isCoach, clientSetupDone, syncPlanFromRemote]);

  useEffect(() => {
    if (isCoach || !clientSetupDone || !remindersEnabled) return;
    (async () => {
      try {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleAllReminders(plan);
        }
      } catch (error) {
        // expo-notifications isn't available in Expo Go (SDK 53+); local dev-client/production
        // builds still get reminders. Never let this block the rest of the app from loading.
        console.warn('[notifications] unavailable in this runtime:', error);
      }
    })();
  }, [isCoach, clientSetupDone, remindersEnabled, plan]);

  // Five slots: Camp · Train · (+) · Journey · Profile (the + is drawn by QuestTabBar). Coach mode shows Clients · Account.
  // Weight, Nutrition, History, Plan and the free-form workout log are stack screens (app/*.tsx), not tabs.
  // Icons and labels come from QuestTabBar, so the screens only declare their title and visibility.
  const client = isCoach ? null : undefined;
  const coach = isCoach ? undefined : null;
  return (
    <Tabs
      initialRouteName={isCoach ? 'clients' : 'index'}
      tabBar={(props) => <QuestTabBar {...props} coach={isCoach} />}
      screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}
    >
      <Tabs.Screen name="index" options={{ title: g('tab.camp'), href: client }} />
      <Tabs.Screen name="workout" options={{ title: g('tab.train'), href: client }} />
      <Tabs.Screen name="map" options={{ title: g('tab.map'), href: client }} />
      <Tabs.Screen name="profile" options={{ title: g('tab.profile'), href: client }} />
      <Tabs.Screen name="clients" options={{ title: t('tab.clients'), href: coach }} />
      <Tabs.Screen name="coach-account" options={{ title: t('tab.account'), href: coach }} />
    </Tabs>
  );
}
