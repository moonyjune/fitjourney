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

interface SettingsState extends UserSettings {
  updateSettings: (patch: Partial<UserSettings>) => void;
  completeOnboarding: (startWeightKg: number, goalWeightKg: number, heightCm: number | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      startWeightKg: DEFAULT_START_WEIGHT_KG,
      goalWeightKg: DEFAULT_START_WEIGHT_KG - 15,
      heightCm: null,
      calorieTargetKcal: DEFAULT_CALORIE_TARGET,
      proteinTargetG: DEFAULT_PROTEIN_TARGET_G,
      waterTargetMl: DEFAULT_WATER_TARGET_ML,
      onboardingDone: false,
      updateSettings: (patch) => set((state) => ({ ...state, ...patch })),
      completeOnboarding: (startWeightKg, goalWeightKg, heightCm) =>
        set((state) => ({ ...state, startWeightKg, goalWeightKg, heightCm, onboardingDone: true })),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
