export type DayType = 'training' | 'rest';

export type MealSlot = 'meal1' | 'meal2' | 'meal3';

export interface MealTemplate {
  slot: MealSlot;
  label: string;
  timeRange: string;
  description: string;
  calories: number;
  proteinG: number;
}

export interface WorkoutTemplate {
  id: string;
  label: string;
  timeRange: string;
  durationMin: number;
  caloriesBurned: number;
  description: string;
}

export interface WeightEntry {
  id: string;
  dateISO: string;
  weightKg: number;
  note?: string;
}

export interface WorkoutLogEntry {
  id: string;
  dateISO: string;
  templateId: string | null;
  label: string;
  durationMin: number;
  caloriesBurned: number;
}

export interface DailyNutritionLog {
  dateISO: string;
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraCalories: number;
  extraProteinG: number;
  waterMl: number;
}

export interface UserSettings {
  startWeightKg: number;
  goalWeightKg: number;
  heightCm: number | null;
  calorieTargetKcal: number;
  proteinTargetG: number;
  waterTargetMl: number;
  onboardingDone: boolean;
}
