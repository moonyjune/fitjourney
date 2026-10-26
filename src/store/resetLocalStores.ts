import {
  DEFAULT_CALORIE_TARGET,
  DEFAULT_PLAN,
  DEFAULT_PROTEIN_TARGET_G,
  DEFAULT_START_WEIGHT_KG,
  DEFAULT_WATER_TARGET_ML,
} from '../constants/plan';
import { useAchievementStore } from './useAchievementStore';
import { useCelebrationStore } from './useCelebrationStore';
import { useFeelingStore } from './useFeelingStore';
import { useFoodDbStore } from './useFoodDbStore';
import { useHabitStore } from './useHabitStore';
import { useLearnStore } from './useLearnStore';
import { useLimitsStore } from './useLimitsStore';
import { useTrainingStore } from './useTrainingStore';
import { useAiDigestStore } from './useAiDigestStore';
import { useAiReportStore } from './useAiReportStore';
import { useMealModeStore } from './useMealModeStore';
import { useNutritionStore } from './useNutritionStore';
import { usePlanStore } from './usePlanStore';
import { useProofStore } from './useProofStore';
import { useSettingsStore } from './useSettingsStore';
import { useShoppingListStore } from './useShoppingListStore';
import { useUricStore } from './useUricStore';
import { useWeightStore } from './useWeightStore';
import { useWorkoutStore } from './useWorkoutStore';
import { DEFAULT_TARGET_UMOL } from '../uric/types';
import { weekStartKey } from '../utils/weekKey';
import { useSyncQueueStore } from '../sync/syncQueue';

/**
 * Every persisted store is keyed by store name in device AsyncStorage, not by account.
 * Without this, signing out of account A and into account B on the same device shows B
 * account A's cached role/weight/nutrition/workout/plan/proof data until a remote pull
 * happens to overwrite it (and the plan store never overwrites unless the remote copy is
 * newer, so a stale local plan can linger forever). Call this whenever the signed-in
 * Supabase user id changes, and on sign-out, so the DB is always the source of truth.
 */
export function resetAllLocalStores() {
  const language = useSettingsStore.getState().language;
  useSettingsStore.setState({
    startWeightKg: DEFAULT_START_WEIGHT_KG,
    goalWeightKg: DEFAULT_START_WEIGHT_KG - 15,
    heightCm: null,
    calorieTargetKcal: DEFAULT_CALORIE_TARGET,
    proteinTargetG: DEFAULT_PROTEIN_TARGET_G,
    waterTargetMl: DEFAULT_WATER_TARGET_ML,
    clientSetupDone: false,
    startDateISO: new Date().toISOString(),
    remindersEnabled: true,
    roleChosen: false,
    role: 'client',
    coachEnabled: false,
    coachId: null,
    linkedCoachEmail: null,
    linkedCoachCode: null,
    linkedCoachSinceISO: null,
    coachCode: null,
    lastUserId: null,
    language,
  });
  useWeightStore.setState({ entries: [] });
  useNutritionStore.setState({ logs: {}, waterDefaultDone: false });
  useAiReportStore.setState({ weekly: {} });
  useMealModeStore.setState({ fasting: true });
  useAiDigestStore.setState({ weeks: {} });
  useWorkoutStore.setState({ entries: [] });
  // Epoch timestamp guarantees the next syncFromRemote() treats any remote plan as newer.
  usePlanStore.setState({ plan: DEFAULT_PLAN, updatedAtISO: new Date(0).toISOString() });
  useProofStore.setState({ photos: [] });
  useFeelingStore.setState({ records: [] });
  // Device-local game state belongs to the account too: another user must not inherit levels, banners or limits.
  useTrainingStore.setState({ progress: {} });
  useAchievementStore.setState({ equippedBannerId: null });
  useCelebrationStore.setState({ seenLevel: null });
  useLimitsStore.getState().reset();
  // The user's own foods and label edits belong to the account too.
  useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
  useHabitStore.setState({ habits: [], checks: {} });
  useLearnStore.setState({ notes: {} });
  useUricStore.setState({ readings: [], targetUmol: DEFAULT_TARGET_UMOL });
  useShoppingListStore.setState({ weekKey: weekStartKey(new Date()), checkedItems: {}, actualPrices: {}, actualQuantities: {}, customItems: [] });
  // Discard rather than misattribute: a queued offline write has no owner id of its own, so
  // replaying it after switching accounts would silently write to the wrong user.
  useSyncQueueStore.setState({ pending: [] });
}
