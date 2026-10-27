import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { setFastingState } from '../utils/mealMode';

interface MealModeState {
  /** Intermittent fasting (16:8) on: eat only in the 12:00-20:00 window. Off: a normal day of three meals. On by default. */
  fasting: boolean;
  /** The user's choice: saved to the cloud with their other settings. */
  setFasting: (value: boolean) => void;
}

export const useMealModeStore = create<MealModeState>()(
  persist(
    (set) => ({
      fasting: true,
      setFasting: (fasting) => {
        set({ fasting });
        pushUserData(USER_DATA_KEYS.mealMode, { fasting });
      },
    }),
    { name: 'meal-mode-store', storage: createJSONStorage(() => appStorage) }
  )
);

// Pure code (the day's rules, the AI snapshots) reads the mode from utils/mealMode; keep it in step with the store, however the store changed.
useMealModeStore.subscribe((s) => setFastingState(s.fasting));
setFastingState(useMealModeStore.getState().fasting);
