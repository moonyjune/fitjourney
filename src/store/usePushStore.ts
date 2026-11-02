import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

interface PushState {
  /** This device has a Web Push subscription saved to the cloud ("Notifications when the app is closed" on). */
  enabled: boolean;
  endpoint: string | null;
  /** The reminder plan last saved with the subscription (JSON), so it is only sent again when it changed. */
  savedPlanJson: string | null;
  set: (patch: Partial<Pick<PushState, 'enabled' | 'endpoint' | 'savedPlanJson'>>) => void;
  reset: () => void;
}

/** Per device, not synced: each browser / Home Screen app has its own subscription. */
export const usePushStore = create<PushState>()(
  persist(
    (set) => ({
      enabled: false,
      endpoint: null,
      savedPlanJson: null,
      set: (patch) => set(patch),
      reset: () => set({ enabled: false, endpoint: null, savedPlanJson: null }),
    }),
    { name: 'push-store', storage: createJSONStorage(() => appStorage), partialize: (s) => ({ enabled: s.enabled, endpoint: s.endpoint, savedPlanJson: s.savedPlanJson }) }
  )
);
