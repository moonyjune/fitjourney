export type DayType = 'training' | 'rest';

export type MealSlot = 'meal1' | 'meal2' | 'meal3';

export interface MealTemplate {
  slot: MealSlot;
  label: string;
  timeRange: string;
  startHour: number;
  startMinute: number;
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
  /** Only templates with a reminder slot get a scheduled daily notification. */
  reminderSlot?: 'morning' | 'evening';
  startHour?: number;
  startMinute?: number;
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
  startDateISO: string;
  remindersEnabled: boolean;
}

/** What a proof photo is attached to. */
export type ProofTaskType = 'meal' | 'workout';

export interface ProofPhoto {
  id: string;
  dateISO: string;
  taskType: ProofTaskType;
  /** MealSlot for meals, WorkoutLogEntry id for workouts. */
  taskRefId: string;
  photoUri: string;
  note: string;
  createdAtISO: string;
}

export interface MilestoneDef {
  key: '1m' | '3m' | '6m';
  label: string;
  monthsFromStart: number;
}
