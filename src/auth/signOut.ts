import { supabase } from '../lib/supabase';
import { releasePushSubscription } from '../notifications/pushAccount';
import type { PushEnv } from '../notifications/webPush';
import { useAuthStore } from '../store/useAuthStore';
import { resetAllLocalStores } from '../store/resetLocalStores';
import { flushSyncQueue } from '../sync/cloudSync';
import { useSyncQueueStore } from '../sync/syncQueue';

/** Signs out of Supabase and immediately wipes local caches, so no account's data is ever visible after sign-out.
 *  Writes still waiting to be sent are sent first (while still signed in): the wipe would otherwise lose them for good. */
export async function signOutAndReset(pushEnv?: PushEnv | null): Promise<void> {
  const wasDev = useAuthStore.getState().devMode;
  if (!wasDev && useSyncQueueStore.getState().pending.length > 0) await flushSyncQueue().catch(() => undefined);
  // This device's Web Push subscription belongs to the account: drop it (and its row, while still signed in). Not turned back on.
  await releasePushSubscription({ resume: false, env: pushEnv }).catch(() => undefined);
  if (wasDev) useAuthStore.getState().leaveDevMode();
  else await supabase.auth.signOut();
  resetAllLocalStores();
}

/** The sign-out after too long without opening the app: the Web Push subscription is dropped first, while the session can still
 *  delete its row, and comes back on when the same account signs in again. Local data stays (the same person usually returns;
 *  another account signing in wipes it, app/_layout.tsx). */
export async function signOutIdle(pushEnv?: PushEnv | null): Promise<void> {
  await releasePushSubscription({ resume: true, env: pushEnv }).catch(() => undefined);
  await supabase.auth.signOut();
}
