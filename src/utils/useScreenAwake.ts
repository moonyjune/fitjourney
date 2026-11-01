import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { Platform } from 'react-native';

type Sentinel = { released: boolean; release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

const wakeLockApi = (): WakeLockApi | null =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator ? ((navigator as unknown as { wakeLock: WakeLockApi }).wakeLock ?? null) : null;

/**
 * Keeps the screen on while `active` (a workout session: the voice coach talks while the phone lies on the floor, and the screen
 * going dark after 30 s stopped it). Native: expo-keep-awake. Web: the Screen Wake Lock API, asked again whenever the page comes
 * back into view (the browser drops the lock when the tab is hidden) and on the next tap if the browser refused it at first.
 * Browsers without the API (older iOS) simply keep their normal timeout.
 */
export function useScreenAwake(active: boolean, tag = 'workout'): void {
  useEffect(() => {
    if (!active) return;
    if (Platform.OS !== 'web') {
      void activateKeepAwakeAsync(tag).catch(() => {});
      return () => {
        void deactivateKeepAwake(tag).catch(() => {});
      };
    }
    const api = wakeLockApi();
    if (!api || typeof document === 'undefined') return;
    let sentinel: Sentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await api.request('screen');
        if (stopped) void lock.release().catch(() => {});
        else sentinel = lock;
      } catch {
        // Refused (e.g. no user gesture yet, battery saver): the next tap or return to the page tries again.
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [active, tag]);
}
