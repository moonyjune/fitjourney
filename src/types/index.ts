export type DayType = 'training' | 'rest';

export type MealSlot = 'meal1' | 'meal2' | 'meal3';

export interface MealFoodItem {
  name: string;
  calories: number;
}

export interface MealTemplate {
  slot: MealSlot;
  label: string;
  timeRange: string;
  startHour: number;
  startMinute: number;
  /** Individual food line items; `calories` below must equal their sum. */
  items: MealFoodItem[];
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

export type UserRole = 'coach' | 'client';

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
  /** Has the user picked Coach vs Client yet? Gates the role-select screen. */
  roleChosen: boolean;
  role: UserRole;
  /** Set only for role 'client' once linked: the coach's user id. */
  coachId: string | null;
  /** Set only for role 'coach': the short code clients enter to link to them. */
  coachCode: string | null;
}

/** Summary row for a coach's client list. */
export interface CoachClientSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  startWeightKg: number | null;
  goalWeightKg: number | null;
  latestWeightKg: number | null;
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
  key: string;
  label: string;
  daysFromStart: number;
}

/** A point in the day's water-drinking schedule, targeting a cumulative amount by that time. */
export interface WaterCheckpoint {
  hour: number;
  minute: number;
  label: string;
  cumulativeTargetMl: number;
}

export interface ShoppingListItem {
  category: string;
  name: string;
  amountPerWeek: string;
  quantityToBuy: string;
  estimatedPriceVnd: number;
}

/**
 * The editable content of the plan: meal menus, workout templates, and shopping list.
 * Seeded from src/constants/plan.ts defaults, then stored per-user in Supabase (table `plans`)
 * once a user (or an AI-assisted edit) customizes it, so it round-trips through the
 * plan-update AI prompt as a single JSON document.
 */
export interface PlanData {
  mealTemplates: Record<DayType, MealTemplate[]>;
  workoutTemplates: WorkoutTemplate[];
  shoppingList: ShoppingListItem[];
  waterSchedule: WaterCheckpoint[];
}
