import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { WaterReminderDialog } from '../components/quest/WaterReminderDialog';
import { formatGameText, type GameKey } from '../game/strings';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePushStore } from '../store/usePushStore';
import { showToast } from '../store/useToastStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTemptationStore } from '../store/useTemptationStore';
import { useWaterReminderStore } from '../store/useWaterReminderStore';
import { toDateKey } from '../utils/date';
import { dueWaterReminder, waterCheerIndex, type WaterReminder } from './reminder';
import { currentWaterPlan } from './useWaterPlan';

/** How often the water plan is checked while the app is open. */
export const WATER_CHECK_EVERY_MS = 30_000;

/** The web page is in a background tab (a pop-up there is not seen, so the browser's own notification is shown as well). */
const pageHidden = () => Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** The browser's notification for a drink time, when the user allowed notifications for the site (best effort). */
function browserNotify(reminder: WaterReminder) {
  if (Platform.OS !== 'web' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  // Web Push is on for this device: the server's notification covers it (the in-app pop-up still shows).
  if (usePushStore.getState().enabled) return;
  try {
    const language = useSettingsStore.getState().language;
    new Notification(formatGameText(language, 'water.notifTitle'), {
      body: formatGameText(language, 'water.notifBody', { ml: reminder.ml, label: reminder.label, total: reminder.drunkMl + reminder.ml }),
      tag: reminder.key,
    });
  } catch {
    // Some browsers only notify through a service worker; the in-app pop-up still shows when the page is opened.
  }
}

/** The pop-up is on: its own switch (Profile > "Pop-up uống nước"), or, never set, the reminders switch that used to drive it. */
export function waterPopupOn(settings: { waterPopupEnabled?: boolean; remindersEnabled: boolean }): boolean {
  return settings.waterPopupEnabled ?? settings.remindersEnabled;
}

/** Sets the day's water to `reachMl` (adds only what is missing from it as it is now: it may have changed, e.g. synced from another
 *  device, since the pop-up opened), closes the pop-up and cheers in a toast whose "Hoàn tác" takes the added water back off. */
export function drinkFromPopup(reachMl: number): void {
  const reminder = useWaterReminderStore.getState().open;
  useWaterReminderStore.getState().close();
  if (!reminder) return;
  const nutrition = useNutritionStore.getState();
  const before = nutrition.logs[reminder.dateKey]?.waterMl ?? 0;
  const added = Math.max(0, reachMl - before);
  if (added > 0) nutrition.addWater(reminder.dateKey, added);
  const language = useSettingsStore.getState().language;
  const cheer = formatGameText(language, `water.cheer.${waterCheerIndex(reminder.key)}` as GameKey);
  const total = (before + added).toLocaleString('en-US');
  showToast({
    text: added > 0 ? formatGameText(language, 'water.pop.toast', { ml: added, total, cheer }) : cheer,
    tone: 'mana',
    durationMs: 6000,
    undo: added > 0 ? () => useNutritionStore.getState().addWater(reminder.dateKey, -added) : undefined,
  });
}

/** Mounted once in the root layout (client role): while the app is open and the water pop-up is on, checks the day's water plan and, at
 *  each drink time, shows a pop-up with how much to drink now (plus the browser's notification when the tab is in the background).
 *  The OS notifications scheduled on a phone cover the times the app is closed. */
export function WaterReminderHost({ enabled }: { enabled: boolean }) {
  const open = useWaterReminderStore((s) => s.open);
  const foreground = useRef(AppState.currentState !== 'background');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      foreground.current = state !== 'background';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const store = useWaterReminderStore.getState();
      if (!waterPopupOn(useSettingsStore.getState()) || store.open || useTemptationStore.getState().open) return;
      // "Nhắc sau 30′": nothing until the snooze is over.
      if (store.snoozedUntil != null && Date.now() < store.snoozedUntil) return;
      // On a phone with the app in the background the OS notification does the job; the web page keeps running in a hidden tab.
      if (!foreground.current && Platform.OS !== 'web') return;
      const now = new Date();
      const dateKey = toDateKey(now);
      const { targetMl, schedule } = currentWaterPlan(now);
      const waterMl = useNutritionStore.getState().logs[dateKey]?.waterMl ?? 0;
      const due = dueWaterReminder(schedule, waterMl, targetMl, now, dateKey, store.shown);
      if (!due) return;
      store.show(due.reminder, due.dueKeys);
      if (pageHidden()) browserNotify(due.reminder);
    };
    tick();
    const id = setInterval(tick, WATER_CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return (
    <WaterReminderDialog
      reminder={enabled ? open : null}
      onDrink={drinkFromPopup}
      onSnooze={() => useWaterReminderStore.getState().snooze()}
      onClose={() => useWaterReminderStore.getState().close()}
    />
  );
}
