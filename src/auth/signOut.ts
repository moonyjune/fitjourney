import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { resetAllLocalStores } from '../store/resetLocalStores';
import { flushSyncQueue } from '../sync/cloudSync';
import { useSyncQueueStore } from '../sync/syncQueue';

/** Signs out of Supabase and immediately wipes local caches, so no account's data is ever visible after sign-out.
 *  Writes still waiting to be sent are sent first (while still signed in): the wipe would otherwise lose them for good. */
export async function signOutAndReset(): Promise<void> {
  const wasDev = useAuthStore.getState().devMode;
  if (!wasDev && useSyncQueueStore.getState().pending.length > 0) await flushSyncQueue().catch(() => undefined);
  if (wasDev) useAuthStore.getState().leaveDevMode();
  else await supabase.auth.signOut();
  resetAllLocalStores();
}
