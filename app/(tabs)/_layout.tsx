import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 20 }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const role = useSettingsStore((s) => s.role);
  const isCoach = role === 'coach';
  const plan = usePlanStore((s) => s.plan);
  const syncPlanFromRemote = usePlanStore((s) => s.syncFromRemote);

  useEffect(() => {
    if (!onboardingDone) {
      router.replace('/onboarding');
    }
  }, [onboardingDone]);

  useEffect(() => {
    if (onboardingDone && !isCoach) syncPlanFromRemote();
  }, [onboardingDone, isCoach, syncPlanFromRemote]);

  useEffect(() => {
    if (!onboardingDone || !remindersEnabled || isCoach) return;
    (async () => {
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleAllReminders(plan);
      }
    })();
  }, [onboardingDone, remindersEnabled, isCoach, plan]);

  return (
    <Tabs
      initialRouteName={isCoach ? 'clients' : 'index'}
      screenOptions={{ headerShown: false, tabBarActiveTintColor: '#4F8EF7' }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Hôm nay', tabBarIcon: () => <TabIcon symbol="🏠" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="weight"
        options={{ title: 'Cân nặng', tabBarIcon: () => <TabIcon symbol="⚖️" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Dinh dưỡng', tabBarIcon: () => <TabIcon symbol="🍽️" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="workout"
        options={{ title: 'Tập luyện', tabBarIcon: () => <TabIcon symbol="🏊" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Lịch sử', tabBarIcon: () => <TabIcon symbol="📊" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: 'Kế hoạch', tabBarIcon: () => <TabIcon symbol="📋" />, href: isCoach ? null : undefined }}
      />
      <Tabs.Screen
        name="clients"
        options={{ title: 'Học viên', tabBarIcon: () => <TabIcon symbol="🧑‍🤝‍🧑" />, href: isCoach ? undefined : null }}
      />
      <Tabs.Screen
        name="coach-account"
        options={{ title: 'Tài khoản', tabBarIcon: () => <TabIcon symbol="⚙️" />, href: isCoach ? undefined : null }}
      />
    </Tabs>
  );
}
