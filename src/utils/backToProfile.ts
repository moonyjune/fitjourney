import { router } from 'expo-router';

/** Back from a Profile page (settings, achievements, …): the previous screen, or Profile when the page was opened directly (a link). */
export function backToProfile(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}
