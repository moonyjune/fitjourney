import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

interface PushState {
  /** This device has a Web Push subscription saved to the cloud ("Notifications when the app is closed" on). */
  enabled: boolean;
  endpoint: string | null;
  /** The reminder plan last saved with the subscription (JSON), so it is only sent again when it changed. */
  savedPlanJson: string | null;
  /** The account the subscription is saved for (null: saved by an older version, taken as the signed-in account). */
  userId: string | null;
  /** Push was on for this account when a session ended on its own (idle time-out, expired session): turned back on when the same
   *  account signs in again on this device (src/notifications/pushAccount.ts). Not after the Sign out button. */
  resumeUserId: string | null;
  set: (patch: Partial<Pick<PushState, 'enabled' | 'endpoint' | 'savedPlanJson' | 'userId' | 'resumeUserId'>>) => void;
  reset: () => void;
}

/** Per device, not synced: each browser / Home Screen app has its own subscription. */
export const usePushStore = create<PushState>()(
  persist(
    (set) => ({
      enabled: false,
      endpoint: null,
      savedPlanJson: null,
      userId: null,
      resumeUserId: null,
      set: (patch) => set(patch),
      reset: () => set({ enabled: false, endpoint: null, savedPlanJson: null, userId: null }),
    }),
    {
      name: 'push-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ enabled: s.enabled, endpoint: s.endpoint, savedPlanJson: s.savedPlanJson, userId: s.userId, resumeUserId: s.resumeUserId }),
    }
  )
);
