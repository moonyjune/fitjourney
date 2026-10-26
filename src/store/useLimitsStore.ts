import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIMITS } from '../game/constants';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

export type LimitKey = 'purineMg' | 'saltG' | 'sugarG';

/** Allowed range and step per limit, so a stepper can never reach a nonsensical value. */
export const LIMIT_RANGE: Record<LimitKey, { min: number; max: number; step: number }> = {
  purineMg: { min: 100, max: 2000, step: 50 },
  saltG: { min: 1, max: 15, step: 0.5 },
  sugarG: { min: 5, max: 100, step: 5 },
};

interface LimitsState {
  purineMg: number;
  saltG: number;
  sugarG: number;
  /** Moves a limit by `direction` steps, clamped to its range. */
  nudge: (key: LimitKey, direction: 1 | -1) => void;
  reset: () => void;
}

export const LIMIT_DEFAULTS = { purineMg: LIMITS.purineMg, saltG: LIMITS.saltG, sugarG: LIMITS.sugarG };

/** The user's own purine / salt / sugar ceilings. Saved to the cloud with the user's other settings. */
export const useLimitsStore = create<LimitsState>()(
  persist(
    (set, get) => ({
      ...LIMIT_DEFAULTS,
      nudge: (key, direction) => {
        const { min, max, step } = LIMIT_RANGE[key];
        const next = Math.round((get()[key] + direction * step) * 100) / 100;
        set({ [key]: Math.min(max, Math.max(min, next)) } as Pick<LimitsState, LimitKey>);
        const { purineMg, saltG, sugarG } = get();
        pushUserData(USER_DATA_KEYS.limits, { purineMg, saltG, sugarG });
      },
      reset: () => set(LIMIT_DEFAULTS),
    }),
    {
      name: 'limits-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // v0 shipped 400 mg / 5 g defaults that the built-in plan itself could not meet. Anyone still sitting exactly on
      // those old defaults never chose them, so move them to the new ones; anything else was a deliberate choice.
      migrate: (persisted, version) => {
        const old = persisted as Partial<Pick<LimitsState, LimitKey>>;
        if (version === 0 && old.purineMg === 400) old.purineMg = LIMIT_DEFAULTS.purineMg;
        if (version === 0 && old.saltG === 5) old.saltG = LIMIT_DEFAULTS.saltG;
        return old as LimitsState;
      },
    }
  )
);
