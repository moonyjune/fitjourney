import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { useTranslation } from '../../src/i18n/useTranslation';
import { useAccentColors } from '../../src/theme/useAccentColors';
import { useGameText } from '../../src/game/strings';
import { QuestTabBar } from '../../src/components/quest/QuestTabBar';

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 20 }}>{symbol}</Text>;
}

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

  // Client mode always needs the weight/goal onboarding done at least once, even if this
  // account switched here from Coach mode (a dual-role account may not have done it yet).
  useEffect(() => {
    if (!isCoach && !clientSetupDone) {
      router.replace('/onboarding');
    }
  }, [isCoach, clientSetupDone]);

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

  return (
    <Tabs
      initialRouteName={isCoach ? 'clients' : 'index'}
      tabBar={(props) => <QuestTabBar {...props} coach={isCoach} />}
      screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: g('tab.camp'), tabBarIcon: () => <TabIcon symbol="🔥" />, href: isCoach ? null : undefined }}
      />
      {/* The previous Today screen, kept (hidden from the tab bar) until the FitQuest migration is finished. */}
      <Tabs.Screen name="today-classic" options={{ href: null }} />
      <Tabs.Screen name="map" options={{ title: g('tab.map'), tabBarIcon: () => <TabIcon symbol="🗺️" />, href: isCoach ? null : undefined }} />
      <Tabs.Screen name="profile" options={{ title: g('tab.profile'), tabBarIcon: () => <TabIcon symbol="👤" />, href: isCoach ? null : undefined }} />
      <Tabs.Screen
        name="weight"
        options={{ title: t('tab.weight'), tabBarIcon: () => <TabIcon symbol="⚖️" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: t('tab.nutrition'), tabBarIcon: () => <TabIcon symbol="🍽️" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="workout"
        options={{ title: g('tab.train'), tabBarIcon: () => <TabIcon symbol="🏊" />, href: isCoach ? null : undefined }}
      />
      {/* The previous workout screen, still reachable from the Train tab for logging free-form workouts. */}
      <Tabs.Screen name="workout-classic" options={{ href: null }} />
      <Tabs.Screen
        name="history"
        options={{ title: t('tab.history'), tabBarIcon: () => <TabIcon symbol="📊" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: t('tab.plan'), tabBarIcon: () => <TabIcon symbol="📋" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="clients"
        options={{ title: t('tab.clients'), tabBarIcon: () => <TabIcon symbol="🧑‍🤝‍🧑" />, href: isCoach ? undefined : null }}
      />
      <Tabs.Screen
        name="coach-account"
        options={{ title: t('tab.account'), tabBarIcon: () => <TabIcon symbol="⚙️" />, href: isCoach ? undefined : null }}
      />
    </Tabs>
  );
}
