import { weekSourceFromStores } from '../ai/weeklyReport';
import { useCheatDayStore } from '../store/useCheatDayStore';
import { useHabitStore } from '../store/useHabitStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWeightStore } from '../store/useWeightStore';
import type { StorySource } from './summary';

/** The story source of the signed-in user, read from this device's stores (the same day rules as the weekly review). */
export function storySourceFromStores(now: Date = new Date()): StorySource {
  const settings = useSettingsStore.getState();
  const { habits, checks } = useHabitStore.getState();
  return {
    ...weekSourceFromStores(now),
    weights: useWeightStore.getState().entries,
    habits,
    checks,
    cheatDays: useCheatDayStore.getState().days,
    startWeightKg: settings.startWeightKg,
    goalWeightKg: settings.goalWeightKg,
    startDateISO: settings.startDateISO,
  };
}
