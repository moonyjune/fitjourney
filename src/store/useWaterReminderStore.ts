import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { WaterReminder } from '../water/reminder';

interface WaterReminderState {
  /** Drink times already shown (`<dateKey>@<HH:MM>`), today's only: kept across reloads so a time never pops up twice. */
  shown: string[];
  /** The pop-up on screen (not persisted). */
  open: WaterReminder | null;
  show: (reminder: WaterReminder, dueKeys: string[]) => void;
  close: () => void;
}

export const useWaterReminderStore = create<WaterReminderState>()(
  persist(
    (set) => ({
      shown: [],
      open: null,
      show: (reminder, dueKeys) =>
        set((state) => ({
          open: reminder,
          // Only today's keys are worth keeping.
          shown: [...state.shown.filter((k) => k.startsWith(`${reminder.dateKey}@`)), ...dueKeys.filter((k) => !state.shown.includes(k))],
        })),
      close: () => set({ open: null }),
    }),
    {
      name: 'water-reminder-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (state) => ({ shown: state.shown }),
    }
  )
);
