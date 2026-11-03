import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { WaterReminder } from '../water/reminder';

/** "Nhắc sau 30′": how long a snoozed pop-up waits before it comes back. */
export const WATER_SNOOZE_MS = 30 * 60_000;

interface WaterReminderState {
  /** Drink times already shown (`<dateKey>@<HH:MM>`), today's only: kept across reloads so a time never pops up twice. */
  shown: string[];
  /** The pop-up on screen (not persisted). */
  open: WaterReminder | null;
  /** A snoozed pop-up comes back at this time (epoch ms), worked out again from the water drunk by then; null when none is snoozed. */
  snoozedUntil: number | null;
  show: (reminder: WaterReminder, dueKeys: string[]) => void;
  close: () => void;
  /** Closes the pop-up and lets its drink time pop up again after WATER_SNOOZE_MS. */
  snooze: (nowMs?: number) => void;
}

export const useWaterReminderStore = create<WaterReminderState>()(
  persist(
    (set, get) => ({
      shown: [],
      open: null,
      snoozedUntil: null,
      show: (reminder, dueKeys) =>
        set((state) => ({
          open: reminder,
          snoozedUntil: null,
          // Only today's keys are worth keeping.
          shown: [...state.shown.filter((k) => k.startsWith(`${reminder.dateKey}@`)), ...dueKeys.filter((k) => !state.shown.includes(k))],
        })),
      close: () => set({ open: null }),
      snooze: (nowMs = Date.now()) => {
        const open = get().open;
        if (!open) return;
        // Its drink time is forgotten as shown, so the check finds it again once the snooze is over.
        set((state) => ({ open: null, snoozedUntil: nowMs + WATER_SNOOZE_MS, shown: state.shown.filter((k) => k !== open.key) }));
      },
    }),
    {
      name: 'water-reminder-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (state) => ({ shown: state.shown, snoozedUntil: state.snoozedUntil }),
    }
  )
);
