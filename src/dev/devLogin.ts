import type { Session } from '@supabase/supabase-js';
import { useAchievementStore } from '../store/useAchievementStore';
import { useAuthStore } from '../store/useAuthStore';
import { useFeelingStore } from '../store/useFeelingStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTrainingStore } from '../store/useTrainingStore';
import { useWeightStore } from '../store/useWeightStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { resetAllLocalStores } from '../store/resetLocalStores';
import type { DailyNutritionLog, ExtraFoodItem, FeelingRecord, WeightEntry, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';

// Development-only: an offline "account" with three weeks of believable dummy data, so every screen can be looked at
// without a Supabase login. Nothing here touches the backend (see `devMode` in useAuthStore / cloudSync).

export const DEV_USER_ID = 'dev-user-0000';
const DAYS = 21;
const DAY_MS = 86_400_000;

function daysAgo(n: number, hour = 12): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return new Date(d.getTime() - n * DAY_MS);
}

function buildWeights(): WeightEntry[] {
  const out: WeightEntry[] = [];
  // 110 → ~105.9 kg over three weeks, logged every other morning with a little noise.
  for (let n = DAYS; n >= 0; n -= 2) {
    const trend = 110 - ((DAYS - n) / DAYS) * 4.2;
    const noise = [0.2, -0.1, 0.3, -0.2, 0.1][n % 5];
    out.push({ id: `dev-w-${n}`, dateISO: daysAgo(n, 6).toISOString(), weightKg: Math.round((trend + noise) * 10) / 10 });
  }
  return out;
}

function extra(n: number, name: string, calories: number, proteinG: number, more: Partial<ExtraFoodItem> = {}): ExtraFoodItem {
  return { id: `dev-x-${n}-${name}`, name, calories, proteinG, loggedAtISO: daysAgo(n, 16).toISOString(), mealTime: 'morning_snack', ...more };
}

function buildNutrition(): Record<string, DailyNutritionLog> {
  const logs: Record<string, DailyNutritionLog> = {};
  for (let n = DAYS; n >= 0; n--) {
    const key = toDateKey(daysAgo(n));
    const today = n === 0;
    const slipDay = n % 6 === 4; // an occasional off-plan day
    const items: ExtraFoodItem[] = [];
    if (slipDay) items.push(extra(n, 'Bánh ngọt', 320, 4, { sugarG: 28, junk: true, mealTime: 'lunch' }));
    if (n % 5 === 2) items.push(extra(n, 'Sữa chua có đường', 110, 4, { sugarG: 14 }));
    if (n % 7 === 3) items.push(extra(n, 'Nội tạng xào', 240, 18, { purineMg: 350, saltG: 1.5 }));
    const calories = items.reduce((s, i) => s + i.calories, 0);
    const protein = items.reduce((s, i) => s + i.proteinG, 0);
    logs[key] = {
      dateISO: key,
      mealsEaten: today ? { meal1: true } : slipDay ? { meal1: true, meal2: true } : { meal1: true, meal2: true, meal3: true },
      extraCalories: calories,
      extraProteinG: protein,
      extraItems: items,
      waterMl: today ? 1500 : 3200 + (n % 4) * 400,
    };
  }
  return logs;
}

function buildWorkouts(): WorkoutLogEntry[] {
  const out: WorkoutLogEntry[] = [];
  const groups = ['A', 'B', 'C'];
  for (let n = DAYS; n >= 1; n--) {
    const weekday = daysAgo(n).getDay(); // 0 = Sunday
    if (weekday === 0 || n % 9 === 5) continue; // Sundays rest, plus a skipped day now and then
    const group = groups[(weekday + 2) % 3];
    const minutes = 14 + ((n * 7) % 26);
    out.push({
      id: `dev-t-${n}`,
      dateISO: daysAgo(n, 18).toISOString(),
      templateId: `home-${group}`,
      label: `Buổi tập ${group}`,
      durationMin: minutes,
      caloriesBurned: Math.round(minutes * 7.4),
    });
  }
  return out;
}

function buildFeelings(): FeelingRecord[] {
  const moods: FeelingRecord['mood'][] = ['good', 'great', 'neutral', 'tired', 'stressed', 'good'];
  return moods.map((mood, i) => ({
    id: `dev-f-${i}`,
    loggedAtISO: daysAgo(i * 2 + 1, 20).toISOString(),
    cravingLevel: 2 + (i % 4),
    hungerLevel: 3 + (i % 3),
    mood,
    workoutCondition: i % 3 === 0 ? 'energetic' : i % 3 === 1 ? 'normal' : 'tired',
    note: i === 0 ? 'Hôm nay thèm đồ ngọt nhưng vẫn giữ được.' : '',
  }));
}

function fakeSession(): Session {
  return {
    access_token: 'dev',
    refresh_token: 'dev',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: DEV_USER_ID,
      email: 'dev@fitjourney.local',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  } as Session;
}

/** Wipes local data, fills the stores with dummy data and signs in an offline dev user. Dev builds only. */
export function enterDevMode(): void {
  if (!__DEV__) return;
  // Start from a clean slate so leftovers from a real account never mix with the dummy data.
  resetAllLocalStores();
  useSettingsStore.setState({
    startWeightKg: 110,
    goalWeightKg: 95,
    heightCm: 172,
    age: 34,
    gender: 'male',
    activityLevel: 'light',
    startDateISO: daysAgo(DAYS).toISOString(),
    clientSetupDone: true,
    roleChosen: true,
    role: 'client',
    remindersEnabled: false, // no notification permission prompts while browsing
    // Same id as the session below, so the root layout does not treat this as an account switch and wipe the data.
    lastUserId: DEV_USER_ID,
  });
  useWeightStore.setState({ entries: buildWeights() });
  useNutritionStore.setState({ logs: buildNutrition() });
  useWorkoutStore.setState({ entries: buildWorkouts() });
  useFeelingStore.setState({ records: buildFeelings() });
  useTrainingStore.setState({
    progress: {
      chairSquat: { level: 2, lastChangeISO: daysAgo(9).toISOString(), ratings: [{ dateISO: daysAgo(9).toISOString(), rating: 'easy' }] },
      wallPushup: { level: 1, lastChangeISO: null, ratings: [{ dateISO: daysAgo(2).toISOString(), rating: 'easy' }] },
    },
  });
  useAchievementStore.setState({ equippedBannerId: null });
  useAuthStore.getState().enterDevMode(fakeSession());
}
