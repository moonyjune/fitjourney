import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { Alert } from 'react-native';
import type { PlanData } from '../types';
import { DEFAULT_PLAN } from '../constants/plan';
import { pullPlan, pushPlan } from '../sync/cloudSync';

interface PlanState {
  plan: PlanData;
  updatedAtISO: string;
  /** Applies a confirmed AI (or manual) plan edit: saves locally and pushes to Supabase. */
  applyPlan: (plan: PlanData) => void;
  /** Pulls the remote plan on login/app-open if a newer one exists (e.g. a Coach updated it). */
  syncFromRemote: () => Promise<void>;
}

/** Backfills the step-by-step breakdown onto a plan saved before WorkoutTemplate.steps existed —
 *  matched by template id against DEFAULT_PLAN, so an account created early in this app's life
 *  (persisted plan predates the `steps` field entirely) gets the real multi-step breakdown
 *  instead of just the generic single-step fallback the UI otherwise synthesizes on the fly.
 *  Returns the same object reference when nothing needed backfilling. */
function backfillWorkoutSteps(plan: PlanData): PlanData {
  const defaultStepsById = new Map(DEFAULT_PLAN.workoutTemplates.map((wt) => [wt.id, wt.steps]));
  let changed = false;
  const workoutTemplates = plan.workoutTemplates.map((wt) => {
    const defaultSteps = defaultStepsById.get(wt.id);
    if ((!wt.steps || wt.steps.length === 0) && defaultSteps && defaultSteps.length > 0) {
      changed = true;
      return { ...wt, steps: defaultSteps };
    }
    return wt;
  });
  return changed ? { ...plan, workoutTemplates } : plan;
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
        const hadPlanBefore = get().plan !== DEFAULT_PLAN;
        const remote = await pullPlan();
        if (remote && remote.updatedAtISO > get().updatedAtISO) {
          set({ plan: remote.plan, updatedAtISO: remote.updatedAtISO });
          if (hadPlanBefore) {
            Alert.alert('Kế hoạch đã được cập nhật', 'Coach của bạn vừa cập nhật thực đơn/lịch tập mới.');
          }
        }
      },
    }),
    {
      name: 'plan-store',
      storage: createJSONStorage(() => appStorage),
    }
  )
);

usePlanStore.persist.onFinishHydration((state) => {
  const migrated = backfillWorkoutSteps(state.plan);
  if (migrated !== state.plan) {
    usePlanStore.getState().applyPlan(migrated);
  }
});
if (usePlanStore.persist.hasHydrated()) {
  const state = usePlanStore.getState();
  const migrated = backfillWorkoutSteps(state.plan);
  if (migrated !== state.plan) {
    state.applyPlan(migrated);
  }
}
