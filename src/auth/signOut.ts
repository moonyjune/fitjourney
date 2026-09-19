import { supabase } from '../lib/supabase';
import { resetAllLocalStores } from '../store/resetLocalStores';

/** Signs out of Supabase and immediately wipes local caches, so no account's data is ever visible after sign-out. */
export async function signOutAndReset(): Promise<void> {
  await supabase.auth.signOut();
  resetAllLocalStores();
}
