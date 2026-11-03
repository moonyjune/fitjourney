import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { usePushStore } from '../store/usePushStore';
import { currentUserId } from '../sync/cloudSync';
import { browserPushEnv, disableWebPush, enableWebPush, type PushEnv } from './webPush';

/**
 * This device's Web Push subscription belongs to the account it was turned on for. Every way a session ends drops it the same way
 * (the Sign out button: src/auth/signOut.ts; the 24 h idle sign-out: app/_layout.tsx; an expired or revoked session, a sign-out in
 * another tab: the auth watch below): the browser subscription is cancelled (its endpoint then answers 410 and send-push deletes the
 * row) and the row is deleted while a session still allows it. A subscription still bound to another account when someone signs in
 * (a session that ended with the app closed) is dropped too; saving always claims the row by endpoint (push_claim_subscription), so
 * the new account can turn push on without first toggling the switch off.
 */

/** Drops this device's subscription for a session that is ending. `resume`: the session ended on its own (not the Sign out button),
 *  so push comes back on when the same account signs in again on this device. */
export async function releasePushSubscription(options: { resume?: boolean; env?: PushEnv | null } = {}): Promise<void> {
  const state = usePushStore.getState();
  if (!state.enabled && !state.endpoint) return;
  const owner = state.userId ?? currentUserId();
  const env = options.env === undefined ? browserPushEnv() : options.env;
  // The row can only be deleted with a session (owner-only RLS); the auth store may not have it yet on a cold start.
  let signedIn = !!currentUserId();
  if (!signedIn && !useAuthStore.getState().devMode) {
    try {
      signedIn = !!(await supabase.auth.getSession()).data.session;
    } catch {
      signedIn = false;
    }
  }
  await disableWebPush(env, signedIn).catch(() => usePushStore.getState().reset());
  usePushStore.getState().set({ resumeUserId: options.resume && owner ? owner : null });
}

/** After the signed-in account changed (null: signed out). */
export async function syncPushAccount(userId: string | null, env?: PushEnv | null): Promise<void> {
  const state = usePushStore.getState();
  if (!userId) {
    if (state.enabled || state.endpoint) await releasePushSubscription({ resume: true, env });
    return;
  }
  if (state.enabled) {
    if (state.userId && state.userId !== userId) await releasePushSubscription({ resume: false, env });
    else if (!state.userId) usePushStore.getState().set({ userId });
    return;
  }
  if (state.resumeUserId) {
    const same = state.resumeUserId === userId;
    usePushStore.getState().set({ resumeUserId: null });
    // Only with permission already granted: no prompt without a tap.
    const e = env === undefined ? browserPushEnv() : env;
    if (same && e?.Notification?.permission === 'granted') await enableWebPush(e).catch(() => undefined);
  }
}

let watching = false;

/** Follows the auth store (started once from the root layout): runs syncPushAccount on every change of the signed-in account once
 *  auth is known. Deferred a tick: auth events are delivered inside Supabase's own callback, where calling Supabase again would
 *  block. Returns the stop function. */
export function watchPushAccount(): () => void {
  if (watching) return () => undefined;
  watching = true;
  let last: string | null | undefined;
  const check = () => {
    const { initialized, devMode, session } = useAuthStore.getState();
    if (!initialized || devMode) return;
    const userId = session?.user.id ?? null;
    if (userId === last) return;
    last = userId;
    setTimeout(() => {
      syncPushAccount(userId).catch((e) => console.warn('[webPush] account change failed:', e));
    }, 0);
  };
  const stop = useAuthStore.subscribe(check);
  check();
  return () => {
    stop();
    watching = false;
  };
}
