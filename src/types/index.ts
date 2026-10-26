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

/** One phase of a workout template (warm-up, main set, cooldown, ...). */
export interface WorkoutStep {
  label: string;
  instruction: string;
  durationMin: number;
  caloriesBurned: number;
}

export interface WorkoutTemplate {
  id: string;
  label: string;
  timeRange: string;
  durationMin: number;
  caloriesBurned: number;
  description: string;
  /** Step-by-step breakdown; durationMin/caloriesBurned above should equal the sum of these.
   *  Optional so plans saved before this field existed still render (as a single implicit step). */
  steps?: WorkoutStep[];
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

/** Which meal-time an off-plan item belongs to — finer-grained than the plan's own 3 meal slots,
 *  since off-plan food (snacks especially) doesn't map cleanly onto meal1/meal2/meal3. */
export type ExtraMealTime =
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'late_afternoon_snack'
  | 'dinner'
  | 'evening_snack';

export interface ExtraFoodItem {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  loggedAtISO: string;
  /** Null for older entries logged before this field existed. */
  mealTime: ExtraMealTime | null;
  /** Optional hand-entered nutrients for the FitQuest "stay under the line" missions. Absent on
   *  older entries (treated as 0). Stored inside the existing extra_items jsonb column. */
  purineMg?: number;
  saltG?: number;
  sugarG?: number;
  /** User-flagged junk food; any flagged item fails that day's "no junk food" mission. */
  junk?: boolean;
  /** Photo of the food, as a file persisted on this device. The same photo is also saved as a meal proof
   *  (`taskRefId` = `extraProofRef(item.id)`) so it syncs and the coach can see it. Absent on older items. */
  photoUri?: string;
}

/** `ProofPhoto.taskRefId` of the photo attached to an off-plan food item. The prefix can never be a plan meal slot. */
export const EXTRA_PROOF_PREFIX = 'extra:';
export const extraProofRef = (itemId: string): string => `${EXTRA_PROOF_PREFIX}${itemId}`;

export interface DailyNutritionLog {
  dateISO: string;
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraCalories: number;
  extraProteinG: number;
  /** Itemized off-plan food entries — extraCalories/extraProteinG above are their running sum,
   *  kept in lockstep for any existing consumer that only needs the totals. */
  extraItems: ExtraFoodItem[];
  waterMl: number;
  /** Default (plan-template) meal slots explicitly deleted from this specific day's diary — e.g.
   *  skipped entirely (distinct from merely "not eaten yet"). Doesn't touch the plan template
   *  itself or any other day. */
  removedMealSlots?: MealSlot[];
}

export type UserRole = 'coach' | 'client';

/** For the Mifflin-St Jeor BMR formula, which branches on sex — inherent to the formula itself,
 *  not a simplification we chose. */
export type Gender = 'male' | 'female';

/** Standard activity-multiplier tiers (sedentary through extra-active) used to scale BMR into
 *  TDEE — same tiers most fitness calculators use. */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface UserSettings {
  startWeightKg: number;
  goalWeightKg: number;
  heightCm: number | null;
  /** All optional/nullable — filled in during onboarding or later in Plan, used to compute a real
   *  BMR-based TDEE (see src/utils/tdee.ts) instead of the cruder plan-target-derived fallback. */
  age: number | null;
  gender: Gender | null;
  activityLevel: ActivityLevel | null;
  calorieTargetKcal: number;
  /** Editable in Plan > Mục tiêu cá nhân; defaults to DEFAULT_TARGET_DAILY_DEFICIT_KCAL. Used by
   *  the TDEE card's plan-target fallback whenever a real BMR can't be computed. */
  targetDailyDeficitKcal: number;
  proteinTargetG: number;
  waterTargetMl: number;
  /** Whether the weight/goal onboarding has been completed — independent of `role`, since a
   *  Coach can later switch into Client mode and still needs to do this once. */
  clientSetupDone: boolean;
  startDateISO: string;
  remindersEnabled: boolean;
  /** Has the user picked an initial mode yet? Gates the role-select screen (first launch only). */
  roleChosen: boolean;
  /** Which tab set is currently shown. A single account can have both capabilities enabled
   *  (see coachEnabled/clientSetupDone) and switch between them at any time. */
  role: UserRole;
  /** True once this account has generated a coach code, i.e. activated Coach capabilities. */
  coachEnabled: boolean;
  /** Set once linked as a Client to a coach: that coach's user id. */
  coachId: string | null;
  /** Email, code and start date of that coach (a snapshot kept in the cloud's link history), for display. */
  linkedCoachEmail: string | null;
  linkedCoachCode: string | null;
  linkedCoachSinceISO: string | null;
  /** Set once Coach mode is activated: the short code clients enter to link to them. */
  coachCode: string | null;
  /** UI language. Defaults to Vietnamese; a bilingual toggle lives in Plan / Coach account. */
  language: 'vi' | 'en';
  /** The Supabase user id local data currently belongs to. Used to detect an account switch on
   *  the same device so cached data can be wiped before the new account's data is shown. */
  lastUserId: string | null;
}

export type FeedbackPeriodType = 'weekly' | 'monthly';

export interface CoachFeedback {
  id: string;
  userId: string;
  coachId: string;
  periodType: FeedbackPeriodType;
  periodLabel: string;
  feedbackText: string;
  createdAtISO: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAtISO: string;
}

export type ChatRole = 'user' | 'assistant';

export interface StoredChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  proposedPlan: PlanData | null;
  createdAtISO: string;
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

export type Mood = 'great' | 'good' | 'neutral' | 'stressed' | 'tired';
export type WorkoutCondition = 'energetic' | 'normal' | 'tired' | 'sore' | 'skipped';

/** A point-in-time log of craving/hunger/mood/workout-condition — input for the weekly AI suggestion. */
export interface FeelingRecord {
  id: string;
  loggedAtISO: string;
  cravingLevel: number;
  hungerLevel: number;
  mood: Mood;
  workoutCondition: WorkoutCondition | null;
  note: string;
}

export interface RecipeIngredient {
  name: string;
  quantity: string;
}

/** AI-suggested alternative dish for one meal slot — matches the plan's calorie/protein target
 *  for that slot but is a different dish, cached per (dayType, mealSlot) until refreshed. */
export interface MealRecipeSuggestion {
  dishName: string;
  emoji: string;
  durationMinutes: number;
  difficulty: number;
  caloriesKcal: number;
  proteinG: number;
  ingredients: RecipeIngredient[];
  /** Tools needed (at most 3, everyday ones). */
  equipment?: string[];
  /** Why the dish suits this user's taste, from their log. */
  tasteNote?: string;
  steps: string[];
}
