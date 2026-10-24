import type { BodyProfile } from './bodyProfile';

// Offline stand-in for the vision API, used only by the Login Dev account so the photo-analysis UI can be tried without a
// backend. Deterministic (same input, same output) and always labelled as simulated.

export interface FakePhotoResult {
  foodName?: string;
  estimatedCaloriesKcal?: number;
  estimatedProteinG?: number;
  estimatedWaterMl?: number;
  activityName?: string;
  durationMin?: number;
  estimatedCaloriesBurned?: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export const DEV_ANALYSIS_DELAY_MS = 600;
const SIMULATED = 'Dữ liệu giả lập (chế độ Dev)';
const DEFAULT_WEIGHT_KG = 80;
/** MET of a moderate session (brisk incline walk / swim); calories = MET x kg x hours. */
const WORKOUT_MET = 6;
const WORKOUT_MINUTES = 45;

export function fakePhotoAnalysis(taskType: 'meal' | 'workout', profile?: BodyProfile): FakePhotoResult {
  if (taskType === 'meal') {
    return {
      foodName: 'Ức gà áp chảo với khoai lang',
      estimatedCaloriesKcal: 480,
      estimatedProteinG: 42,
      estimatedWaterMl: 250,
      confidence: 'medium',
      reasoning: `${SIMULATED}: món mẫu ~480 kcal, 42 g protein.`,
    };
  }
  const weightKg = profile?.weightKg ?? DEFAULT_WEIGHT_KG;
  const kcal = Math.round((WORKOUT_MET * weightKg * WORKOUT_MINUTES) / 60);
  return {
    activityName: 'Đi bộ dốc',
    durationMin: WORKOUT_MINUTES,
    estimatedCaloriesBurned: kcal,
    confidence: 'medium',
    reasoning: `${SIMULATED}: ${WORKOUT_MINUTES} phút, MET ${WORKOUT_MET} × ${weightKg} kg ≈ ${kcal} kcal.`,
  };
}
