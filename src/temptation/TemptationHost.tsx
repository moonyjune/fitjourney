import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, useSegments } from 'expo-router';
import { TemptationDialog } from '../components/quest/TemptationDialog';
import { useMealModeStore } from '../store/useMealModeStore';
import { useTemptationStore } from '../store/useTemptationStore';
import { isTemptationDue } from './schedule';
import { bossReply, summonTemptation } from './summon';

/** How often the schedule is checked while the app is open. */
export const CHECK_EVERY_MS = 60_000;
/** The app must have been in the foreground this long (not right at launch or on coming back). */
export const SETTLE_MS = 20_000;

/** In the foreground: 'active' (or a state not reported yet); 'background' and 'inactive' (iOS switcher, a system sheet) are not. */
const isForeground = (state: string | null | undefined) => state !== 'background' && state !== 'inactive';

/** Mounted once in the root layout (client role): checks the temptation schedule every minute while the app is in the foreground on
 *  a tab screen (not inside another screen, sheet or dialog), opens the pop-up when one is due, and shows it. */
export function TemptationHost({ enabled }: { enabled: boolean }) {
  const open = useTemptationStore((s) => s.open);
  const streak = useTemptationStore((s) => s.stats.streak);
  const segments = useSegments();
  const onTabs = segments[0] === '(tabs)';
  const onTabsRef = useRef(onTabs);
  onTabsRef.current = onTabs;
  const activeSince = useRef<number | null>(isForeground(AppState.currentState) ? Date.now() : null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!isForeground(state)) activeSince.current = null;
      else if (activeSince.current === null) activeSince.current = Date.now();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const store = useTemptationStore.getState();
      if (!store.settings.enabled || store.open || store.busy || !onTabsRef.current) return;
      if (activeSince.current === null || Date.now() - activeSince.current < SETTLE_MS) return;
      const now = new Date();
      if (!isTemptationDue({ now, settings: store.settings, fasting: useMealModeStore.getState().fasting, salt: store.salt, shownAt: store.shownAt })) return;
      store.markShown(now.getTime());
      void summonTemptation(now);
    };
    const id = setInterval(tick, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [enabled]);

  const store = useTemptationStore.getState();
  return (
    <TemptationDialog
      open={enabled ? open : null}
      streak={streak}
      // A chat may have moved on to another item: the answer is recorded for the one on the table at the end.
      onAnswer={(outcome, bonusXp, item) => useTemptationStore.getState().answer(outcome, undefined, bonusXp, item)}
      onTalk={(talk) => bossReply(talk)}
      onClose={() => useTemptationStore.getState().close()}
      onLog={(item) => {
        useTemptationStore.getState().close();
        router.push({
          pathname: '/add-food',
          params: { name: item.name, calories: String(item.kcal), purine: String(item.purineMg), sugar: String(item.sugarG) },
        });
      }}
    />
  );
}
