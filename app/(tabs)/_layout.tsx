import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { useTranslation } from '../../src/i18n/useTranslation';
import { colors } from '../../src/theme/tokens';

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 20 }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const clientSetupDone = useSettingsStore((s) => s.clientSetupDone);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const role = useSettingsStore((s) => s.role);
  const isCoach = role === 'coach';
  const { t } = useTranslation();
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
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleAllReminders(plan);
      }
    })();
  }, [isCoach, clientSetupDone, remindersEnabled, plan]);

  return (
    <Tabs
      initialRouteName={isCoach ? 'clients' : 'index'}
      screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tab.today'), tabBarIcon: () => <TabIcon symbol="🏠" />, href: isCoach ? null : undefined }}
      />
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
        options={{ title: t('tab.workout'), tabBarIcon: () => <TabIcon symbol="🏊" />, href: isCoach ? null : undefined }}
      />
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
