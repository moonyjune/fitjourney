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

/** Re-sends the plan (debounced) whenever something it is built from changes: the water target and drinking window, the reminders
 *  switch and language, the meal mode, the plan's meal / workout times, and today's own water target (its log). refreshPushPlan
 *  sends nothing when the plan came out the same. Also on every return to the foreground. Returns the stop function. */
export function watchPushPlan(refresh: () => Promise<void> = () => refreshPushPlan()): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    refresh().catch((e) => console.warn('[webPush] refresh failed:', e));
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, PUSH_PLAN_DEBOUNCE_MS);
  };
  const unsubs = [
    useSettingsStore.subscribe((s, p) => {
      if (s.waterTargetMl !== p.waterTargetMl || s.remindersEnabled !== p.remindersEnabled || s.language !== p.language) schedule();
    }),
    useWaterWindowStore.subscribe(schedule),
    useMealModeStore.subscribe(schedule),
    usePlanStore.subscribe((s, p) => {
      if (s.plan !== p.plan) schedule();
    }),
    useNutritionStore.subscribe((s, p) => {
      if (s.logs !== p.logs) schedule();
    }),
  ];
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') schedule();
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach((u) => u());
    app.remove();
  };
}

/** Mounted once in the root layout (client role, web): keeps this device's Web Push reminder plan in step with the settings it is
 *  built from, and re-saves the subscription each time the app opens (time zone, renewed endpoint, a row the server dropped).
 *  Renders nothing. */
export function WebPushHost({ enabled }: { enabled: boolean }) {
  const pushOn = usePushStore((s) => s.enabled);
  useEffect(() => {
    if (!enabled || !pushOn || Platform.OS !== 'web') return;
    refreshPushPlan(undefined, true).catch((e) => console.warn('[webPush] refresh failed:', e));
    return watchPushPlan();
  }, [enabled, pushOn]);
  return null;
}
