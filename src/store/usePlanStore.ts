import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanData } from '../types';
import { DEFAULT_PLAN } from '../constants/plan';
import { pullPlan, pushPlan } from '../sync/cloudSync';

interface PlanState {
  plan: PlanData;
  updatedAtISO: string;
  /** Applies a confirmed AI (or manual) plan edit: saves locally and pushes to Supabase. */
  applyPlan: (plan: PlanData) => void;
  /** Pulls the remote plan on login if one exists; leaves the local/default plan untouched otherwise. */
  syncFromRemote: () => Promise<void>;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      plan: DEFAULT_PLAN,
      updatedAtISO: new Date().toISOString(),
      applyPlan: (plan) => {
        const updatedAtISO = new Date().toISOString();
        set({ plan, updatedAtISO });
        pushPlan(plan, updatedAtISO);
      },
      syncFromRemote: async () => {
        const remote = await pullPlan();
        if (remote && remote.updatedAtISO > get().updatedAtISO) {
          set({ plan: remote.plan, updatedAtISO: remote.updatedAtISO });
        }
      },
    }),
    {
      name: 'plan-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
