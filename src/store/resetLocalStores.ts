import {
  DEFAULT_CALORIE_TARGET,
  DEFAULT_PLAN,
  DEFAULT_PROTEIN_TARGET_G,
  DEFAULT_START_WEIGHT_KG,
  DEFAULT_WATER_TARGET_ML,
} from '../constants/plan';
import { useNutritionStore } from './useNutritionStore';
import { usePlanStore } from './usePlanStore';
import { useProofStore } from './useProofStore';
import { useSettingsStore } from './useSettingsStore';
import { useShoppingListStore } from './useShoppingListStore';
import { useWeightStore } from './useWeightStore';
import { useWorkoutStore } from './useWorkoutStore';
import { weekStartKey } from '../utils/weekKey';

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
    coachCode: null,
    lastUserId: null,
    language,
  });
  useWeightStore.setState({ entries: [] });
  useNutritionStore.setState({ logs: {} });
  useWorkoutStore.setState({ entries: [] });
  // Epoch timestamp guarantees the next syncFromRemote() treats any remote plan as newer.
  usePlanStore.setState({ plan: DEFAULT_PLAN, updatedAtISO: new Date(0).toISOString() });
  useProofStore.setState({ photos: [] });
  useShoppingListStore.setState({ weekKey: weekStartKey(new Date()), checkedItems: {}, actualPrices: {}, actualQuantities: {}, customItems: [] });
}
