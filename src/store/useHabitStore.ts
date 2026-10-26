import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CheckValue, Habit, HabitChecks } from '../habits/types';
import { pushHabit, pushHabitCheck } from '../sync/cloudSync';

export type HabitFields = Omit<Habit, 'id' | 'sort' | 'archived'>;

interface HabitState {
  habits: Habit[];
  checks: HabitChecks;
  addHabit: (fields: HabitFields) => Habit;
  updateHabit: (id: string, patch: Partial<HabitFields>) => void;
  /** Hides a habit everywhere; the ticks it already has stay on record. */
  archiveHabit: (id: string) => void;
  /** Ticks a habit on a day (`done` or `missed`), or clears the tick with null. */
  setCheck: (dateKey: string, habitId: string, value: CheckValue | null) => void;
  /** Adds the habits whose id this device does not have yet; returns how many were new. Existing habits are left as the user edited them. */
  importHabits: (habits: Habit[]) => number;
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set, get) => ({
      habits: [],
      checks: {},
      addHabit: (fields) => {
        const habit: Habit = {
          ...fields,
          name: fields.name.trim(),
          id: `h-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          sort: get().habits.reduce((m, h) => Math.max(m, h.sort), 0) + 1,
          archived: false,
        };
        set((s) => ({ habits: [...s.habits, habit] }));
        pushHabit(habit);
        return habit;
      },
      updateHabit: (id, patch) => {
        const current = get().habits.find((h) => h.id === id);
        if (!current) return;
        const updated: Habit = { ...current, ...patch, name: (patch.name ?? current.name).trim() };
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? updated : h)) }));
        pushHabit(updated);
      },
      archiveHabit: (id) => {
        const current = get().habits.find((h) => h.id === id);
        if (!current || current.archived) return;
        const updated = { ...current, archived: true };
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? updated : h)) }));
        pushHabit(updated);
      },
      setCheck: (dateKey, habitId, value) => {
        set((s) => {
          const day = { ...(s.checks[dateKey] ?? {}) };
          if (value === null) delete day[habitId];
          else day[habitId] = value;
          const checks = { ...s.checks };
          if (Object.keys(day).length === 0) delete checks[dateKey];
          else checks[dateKey] = day;
          return { checks };
        });
        pushHabitCheck(habitId, dateKey, value);
      },
      importHabits: (incoming) => {
        const have = new Set(get().habits.map((h) => h.id));
        const fresh = incoming.filter((h) => !have.has(h.id));
        if (fresh.length === 0) return 0;
        set((s) => ({ habits: [...s.habits, ...fresh] }));
        for (const h of fresh) pushHabit(h);
        return fresh.length;
      },
    }),
    { name: 'habit-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
