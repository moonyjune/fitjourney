import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DinnerIdea } from '../ai/dinner';

/** Days kept: the ideas asked for today are not asked (and paid for) again after a reload. Older days are dropped. */
const KEEP_DAYS = 3;

interface MealIdeasState {
  /** day (YYYY-MM-DD) → meal id → the AI ideas that came back for it (an empty list means "asked, nothing fit"). */
  byDay: Record<string, Record<string, DinnerIdea[]>>;
  get: (day: string, mealId: string) => DinnerIdea[] | undefined;
  set: (day: string, mealId: string, ideas: DinnerIdea[]) => void;
  clearDay: (day: string) => void;
}

export const useMealIdeasStore = create<MealIdeasState>()(
  persist(
    (set, get) => ({
      byDay: {},
      get: (day, mealId) => get().byDay[day]?.[mealId],
      set: (day, mealId, ideas) =>
        set((s) => {
          const byDay = { ...s.byDay, [day]: { ...s.byDay[day], [mealId]: ideas } };
          const keep = Object.keys(byDay).sort().slice(-KEEP_DAYS);
          return { byDay: Object.fromEntries(keep.map((k) => [k, byDay[k]])) };
        }),
      clearDay: (day) =>
        set((s) => {
          const { [day]: _gone, ...rest } = s.byDay;
          return { byDay: rest };
        }),
    }),
    { name: 'meal-ideas-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
