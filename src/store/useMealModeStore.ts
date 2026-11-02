import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { setFastingState, setSkipBreakfastState } from '../utils/mealMode';

interface MealModeState {
  /** Intermittent fasting (16:8) on: eat only in the 12:00-20:00 window. Off: a normal day of three meals. On by default. */
  fasting: boolean;
  /** Normal mode only: "Tôi không ăn sáng". Breakfast is then not an expected meal (never still to come, never missing); lunch and
   *  dinner share the day's intake instead. Off by default. */
  skipBreakfast: boolean;
  /** The user's choice: saved to the cloud with their other settings. */
  setFasting: (value: boolean) => void;
  setSkipBreakfast: (value: boolean) => void;
}

export const useMealModeStore = create<MealModeState>()(
  persist(
    (set, get) => ({
      fasting: true,
      skipBreakfast: false,
      setFasting: (fasting) => {
        set({ fasting });
        pushUserData(USER_DATA_KEYS.mealMode, get().skipBreakfast ? { fasting, skipBreakfast: true } : { fasting });
      },
      setSkipBreakfast: (skipBreakfast) => {
        set({ skipBreakfast });
        pushUserData(USER_DATA_KEYS.mealMode, { fasting: get().fasting, skipBreakfast });
      },
    }),
    { name: 'meal-mode-store', storage: createJSONStorage(() => appStorage) }
  )
);

// Pure code (the day's rules, the AI snapshots) reads the mode from utils/mealMode; keep it in step with the store, however the store changed.
useMealModeStore.subscribe((s) => {
  setFastingState(s.fasting);
  setSkipBreakfastState(!!s.skipBreakfast);
});
setFastingState(useMealModeStore.getState().fasting);
setSkipBreakfastState(!!useMealModeStore.getState().skipBreakfast);
