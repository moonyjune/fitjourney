import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserSettings } from '../types';
import {
  DEFAULT_CALORIE_TARGET,
  DEFAULT_PROTEIN_TARGET_G,
  DEFAULT_START_WEIGHT_KG,
  DEFAULT_WATER_TARGET_ML,
} from '../constants/plan';
import { ensureCoachCode, linkToCoach, pullProfile, pushProfile, type RemoteProfile } from '../sync/cloudSync';

interface SettingsState extends UserSettings {
  updateSettings: (patch: Partial<UserSettings>) => void;
  completeOnboarding: (startWeightKg: number, goalWeightKg: number, heightCm: number | null) => void;
  /** Adopts a profile pulled from Supabase (e.g. first login on a new device) without re-pushing it. */
  hydrateFromRemote: (profile: RemoteProfile) => void;
  /** Picks the Client role; still needs the weight/goal onboarding screen next. */
  chooseClientRole: () => void;
  /** Picks the Coach role, generates a shareable code, and skips weight onboarding (coach has no plan of their own). */
  chooseCoachRole: () => Promise<void>;
  /** Client enters a coach's code to link accounts. */
  submitCoachCode: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      startWeightKg: DEFAULT_START_WEIGHT_KG,
      goalWeightKg: DEFAULT_START_WEIGHT_KG - 15,
      heightCm: null,
      calorieTargetKcal: DEFAULT_CALORIE_TARGET,
      proteinTargetG: DEFAULT_PROTEIN_TARGET_G,
      waterTargetMl: DEFAULT_WATER_TARGET_ML,
      onboardingDone: false,
      startDateISO: new Date().toISOString(),
      remindersEnabled: true,
      roleChosen: false,
      role: 'client',
      coachId: null,
      coachCode: null,
      updateSettings: (patch) =>
        set((state) => {
          const updated = { ...state, ...patch };
          pushProfile(updated);
          return updated;
        }),
      completeOnboarding: (startWeightKg, goalWeightKg, heightCm) => {
        set((state) => ({
          ...state,
          startWeightKg,
          goalWeightKg,
          heightCm,
          onboardingDone: true,
          startDateISO: new Date().toISOString(),
        }));
        pushProfile(get());
      },
      hydrateFromRemote: (profile) =>
        set((state) => ({ ...state, ...profile, roleChosen: true, onboardingDone: true })),
      chooseClientRole: () => {
        set((state) => ({ ...state, role: 'client', roleChosen: true }));
        pushProfile(get());
      },
      chooseCoachRole: async () => {
        set((state) => ({ ...state, role: 'coach', roleChosen: true, onboardingDone: true }));
        const code = await ensureCoachCode();
        if (code) set((state) => ({ ...state, coachCode: code }));
      },
      submitCoachCode: async (code) => {
        const result = await linkToCoach(code);
        if (result.ok) {
          const refreshed = await pullProfile();
          if (refreshed) set((state) => ({ ...state, coachId: refreshed.coachId }));
        }
        return result;
      },
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
