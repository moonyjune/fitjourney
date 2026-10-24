import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { resetAllLocalStores } from '../store/resetLocalStores';

/** Signs out of Supabase and immediately wipes local caches, so no account's data is ever visible after sign-out. */
export async function signOutAndReset(): Promise<void> {
  const wasDev = useAuthStore.getState().devMode;
  if (wasDev) useAuthStore.getState().leaveDevMode();
  else await supabase.auth.signOut();
  resetAllLocalStores();
}
