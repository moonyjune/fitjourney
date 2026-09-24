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
  completeOnboarding: (
    startWeightKg: number,
    goalWeightKg: number,
    heightCm: number | null,
    demographics?: Pick<UserSettings, 'age' | 'gender' | 'activityLevel'>
  ) => void;
  /** Adopts a profile pulled from Supabase (e.g. first login on a new device) without re-pushing it. */
  hydrateFromRemote: (profile: RemoteProfile) => void;
  /** First-launch pick: start in Client mode; still needs the weight/goal onboarding screen next. */
  chooseClientRole: () => void;
  /** First-launch pick: start in Coach mode and generate a shareable code. */
  chooseCoachRole: () => Promise<void>;
  /** Client enters a coach's code to link accounts. */
  submitCoachCode: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Switches the visible tab set to Client mode (does not require Coach mode to be disabled). */
  switchToClientMode: () => void;
  /** Activates Coach capabilities if not already (generating a code) and switches to Coach mode. */
  switchToCoachMode: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      startWeightKg: DEFAULT_START_WEIGHT_KG,
      goalWeightKg: DEFAULT_START_WEIGHT_KG - 15,
      heightCm: null,
      age: null,
      gender: null,
      activityLevel: null,
      calorieTargetKcal: DEFAULT_CALORIE_TARGET,
      proteinTargetG: DEFAULT_PROTEIN_TARGET_G,
      waterTargetMl: DEFAULT_WATER_TARGET_ML,
      clientSetupDone: false,
      startDateISO: new Date().toISOString(),
      remindersEnabled: true,
      roleChosen: false,
      role: 'client',
      coachEnabled: false,
      coachId: null,
      coachCode: null,
      language: 'vi',
      lastUserId: null,
      updateSettings: (patch) =>
        set((state) => {
          const updated = { ...state, ...patch };
          pushProfile(updated);
          return updated;
        }),
      completeOnboarding: (startWeightKg, goalWeightKg, heightCm, demographics) => {
        set((state) => ({
          ...state,
          startWeightKg,
          goalWeightKg,
          heightCm,
          ...demographics,
          clientSetupDone: true,
          startDateISO: new Date().toISOString(),
        }));
        pushProfile(get());
      },
      hydrateFromRemote: (profile) => set((state) => ({ ...state, ...profile, roleChosen: true })),
      chooseClientRole: () => {
        set((state) => ({ ...state, role: 'client', roleChosen: true }));
        pushProfile(get());
      },
      chooseCoachRole: async () => {
        set((state) => ({ ...state, role: 'coach', roleChosen: true }));
        const code = await ensureCoachCode();
        if (code) set((state) => ({ ...state, coachCode: code, coachEnabled: true }));
      },
      submitCoachCode: async (code) => {
        const result = await linkToCoach(code);
        if (result.ok) {
          const refreshed = await pullProfile();
          if (refreshed) set((state) => ({ ...state, coachId: refreshed.coachId }));
        }
        return result;
      },
      switchToClientMode: () => {
        set((state) => ({ ...state, role: 'client' }));
        pushProfile(get());
      },
      switchToCoachMode: async () => {
        if (!get().coachEnabled) {
          const code = await ensureCoachCode();
          if (code) set((state) => ({ ...state, coachCode: code, coachEnabled: true }));
        }
        set((state) => ({ ...state, role: 'coach' }));
        pushProfile(get());
      },
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
