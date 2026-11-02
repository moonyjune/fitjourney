import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useMealModeStore } from '../store/useMealModeStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { usePushStore } from '../store/usePushStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWaterWindowStore } from '../store/useWaterWindowStore';
import { refreshPushPlan } from './webPush';

/** Wait after a change before sending the plan (a slider or several settings at once give one save). */
export const PUSH_PLAN_DEBOUNCE_MS = 3000;

/** Mounted once in the root layout (client role, web): keeps this device's Web Push reminder plan in step with the settings it is
 *  built from, and re-saves the subscription each time the app opens (time zone, renewed endpoint, a row the server dropped).
 *  Renders nothing. */
export function WebPushHost({ enabled }: { enabled: boolean }) {
  const pushOn = usePushStore((s) => s.enabled);
  useEffect(() => {
    if (!enabled || !pushOn || Platform.OS !== 'web') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refreshPushPlan().catch((e) => console.warn('[webPush] refresh failed:', e));
      }, PUSH_PLAN_DEBOUNCE_MS);
    };
    refreshPushPlan(undefined, true).catch((e) => console.warn('[webPush] refresh failed:', e));
    const unsubs = [
      useSettingsStore.subscribe(schedule),
      useWaterWindowStore.subscribe(schedule),
      useMealModeStore.subscribe(schedule),
      usePlanStore.subscribe(schedule),
      // Only today's water target matters; refreshPushPlan sends nothing when the plan is unchanged.
      useNutritionStore.subscribe(schedule),
    ];
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule();
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
      app.remove();
    };
  }, [enabled, pushOn]);
  return null;
}
