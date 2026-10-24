import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AchievementState {
  /** Banner shown on the profile card; null = none. Local to this device. */
  equippedBannerId: string | null;
  equipBanner: (id: string | null) => void;
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set) => ({
      equippedBannerId: null,
      equipBanner: (id) => set({ equippedBannerId: id }),
    }),
    { name: 'achievement-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
