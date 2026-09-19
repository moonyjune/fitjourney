import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import { useSettingsStore } from '../../src/store/useSettingsStore';

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 20 }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);

  useEffect(() => {
    if (!onboardingDone) {
      router.replace('/onboarding');
    }
  }, [onboardingDone]);

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#4F8EF7' }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Hôm nay', tabBarIcon: () => <TabIcon symbol="🏠" /> }}
      />
      <Tabs.Screen
        name="weight"
        options={{ title: 'Cân nặng', tabBarIcon: () => <TabIcon symbol="⚖️" /> }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Dinh dưỡng', tabBarIcon: () => <TabIcon symbol="🍽️" /> }}
      />
      <Tabs.Screen
        name="workout"
        options={{ title: 'Tập luyện', tabBarIcon: () => <TabIcon symbol="🏊" /> }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: 'Kế hoạch', tabBarIcon: () => <TabIcon symbol="📋" /> }}
      />
    </Tabs>
  );
}
