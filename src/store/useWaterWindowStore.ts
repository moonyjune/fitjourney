import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { clampWaterWindow, DEFAULT_WATER_END_MIN, DEFAULT_WATER_START_MIN } from '../water/schedule';

interface WaterWindowState {
  /** First drink of the day, minutes since midnight (default 06:00). */
  startMinutes: number;
  /** Last drink of the day, minutes since midnight (default 21:00, about an hour before bed). */
  endMinutes: number;
  /** Saves a new window (clamped to the allowed range) and sends it to the cloud with the user's other settings. */
  setWindow: (startMinutes: number, endMinutes: number) => void;
}

export const useWaterWindowStore = create<WaterWindowState>()(
  persist(
    (set) => ({
      startMinutes: DEFAULT_WATER_START_MIN,
      endMinutes: DEFAULT_WATER_END_MIN,
      setWindow: (startMinutes, endMinutes) => {
        const { start, end } = clampWaterWindow(startMinutes, endMinutes);
        set({ startMinutes: start, endMinutes: end });
        pushUserData(USER_DATA_KEYS.waterWindow, { startMinutes: start, endMinutes: end });
      },
    }),
    { name: 'water-window-store', storage: createJSONStorage(() => appStorage) }
  )
);
