import { useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/useAuthStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { resetAllLocalStores } from '../src/store/resetLocalStores';
import { pullProfile } from '../src/sync/cloudSync';
import { AppIntro } from '../src/components/AppIntro';

// Minimum time the branded intro stays on screen, so it isn't just a 1-frame flash on warm starts.
const MIN_INTRO_MS = 1200;

export default function RootLayout() {
  const init = useAuthStore((s) => s.init);
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const roleChosen = useSettingsStore((s) => s.roleChosen);
  const role = useSettingsStore((s) => s.role);
  const hydrateFromRemote = useSettingsStore((s) => s.hydrateFromRemote);
  const segments = useSegments();

  const [profileChecked, setProfileChecked] = useState(false);
  const [minIntroElapsed, setMinIntroElapsed] = useState(false);
  const checkedForUserId = useRef<string | null>(null);

  useEffect(() => {
    init();
    const timer = setTimeout(() => setMinIntroElapsed(true), MIN_INTRO_MS);
    return () => clearTimeout(timer);
  }, [init]);

  // Runs once per distinct signed-in user id (on cold start and on every account switch).
  // The DB profile is always the source of truth for role/setup state: local AsyncStorage is
  // per-device, not per-account, so if a different user just signed in on this device we wipe
  // every cached store first — otherwise account B would briefly (or permanently) see account
  // A's role, weight/nutrition/workout history, plan, and proof photos.
  useEffect(() => {
    if (!session) {
      setProfileChecked(false);
      checkedForUserId.current = null;
      return;
    }
    if (checkedForUserId.current === session.user.id) {
      setProfileChecked(true);
      return;
    }
    checkedForUserId.current = session.user.id;

    const lastUserId = useSettingsStore.getState().lastUserId;
    if (lastUserId && lastUserId !== session.user.id) {
      resetAllLocalStores();
    }
    useSettingsStore.setState({ lastUserId: session.user.id });

    pullProfile().then((remote) => {
      if (remote) hydrateFromRemote(remote);
      setProfileChecked(true);
    });
  }, [session, hydrateFromRemote]);

  const ready = initialized && (!session || profileChecked) && minIntroElapsed;

  useEffect(() => {
    if (!ready) return;
    const segment0 = segments[0];
    if (!session) {
      if (segment0 !== 'auth') router.replace('/auth');
      return;
    }
    if (!roleChosen) {
      if (segment0 !== 'role-select') router.replace('/role-select');
      return;
    }
    if (segment0 === 'auth' || segment0 === 'role-select') {
      router.replace(role === 'coach' ? '/(tabs)/clients' : '/(tabs)');
    }
  }, [ready, session, roleChosen, role, segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style={ready ? 'dark' : 'light'} />
      {!ready ? (
        <AppIntro />
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ presentation: 'modal' }} />
          <Stack.Screen name="role-select" options={{ presentation: 'modal' }} />
          <Stack.Screen name="client/[id]" />
          <Stack.Screen name="auth" />
        </Stack>
      )}
    </SafeAreaProvider>
  );
}
