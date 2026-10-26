import type { BodyProfile } from './bodyProfile';
import type { CoachContext } from './coachContext';
import type { MealTextResult, PhotoAdvice } from '../sync/cloudSync';
import type { NutritionLabel } from './nutritionLabel';
import type { WeekInput, WeeklyReport } from './weeklyReport';
import type { SwapContext, SwapItem } from '../food/swaps';
import type { DinnerBrief } from './dinner';

// Offline stand-in for the vision API, used only by the Login Dev account so the photo-analysis UI can be tried without a
// backend. Deterministic (same input, same output) and always labelled as simulated.

export interface FakePhotoResult {
  foodName?: string;
  estimatedCaloriesKcal?: number;
  estimatedProteinG?: number;
  estimatedWaterMl?: number;
  components?: unknown[];
  estimatedPurineMg?: number;
  estimatedSugarG?: number;
  estimatedSaltG?: number;
  advice?: PhotoAdvice;
  accuracyPercent?: number;
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

const FAKE_MEAL = { kcal: 480, proteinG: 42, purineMg: 160, saltG: 1.4, sugarG: 6 };

/** Simulated advice from the same snapshot the real model would get: plain arithmetic on the deficit target. */
function fakeAdvice(coach: CoachContext, addedKcal: number, addedProteinG: number, burnedKcal: number): PhotoAdvice {
  const { targets, today, week } = coach;
  const eaten = today.eatenKcal + addedKcal;
  const budget = Math.max(0, Math.round(targets.tdeeKcal + today.burnedKcal + burnedKcal - targets.dailyDeficitKcal - eaten));
  const proteinLeft = Math.max(0, Math.round(targets.proteinTargetG - today.proteinG - addedProteinG));
  const extraBurn = Math.max(0, Math.round(eaten - (targets.tdeeKcal + today.burnedKcal + burnedKcal - targets.dailyDeficitKcal)));
  const verdict = extraBurn > 0 ? 'over' : budget < 300 ? 'watch' : 'on_track';
  return {
    verdict,
    summary: `${SIMULATED}: sau món này hôm nay ăn ${eaten} kcal, còn ${budget} kcal để giữ thâm hụt ${targets.dailyDeficitKcal} kcal.`,
    nextSteps: [
      budget > 0 ? `Bữa còn lại giữ quanh ${budget} kcal.` : 'Hôm nay đã hết ngân sách kcal, chỉ nên uống nước hoặc ăn rau.',
      proteinLeft > 0 ? `Cần thêm khoảng ${proteinLeft} g đạm.` : 'Đã đủ đạm hôm nay.',
      extraBurn > 0 ? `Đốt thêm khoảng ${extraBurn} kcal (đi bộ nhanh) để giữ thâm hụt.` : 'Không cần tập thêm để giữ thâm hụt.',
    ],
    remainingKcalToEat: budget,
    remainingProteinG: proteinLeft,
    extraBurnKcal: extraBurn,
    bossNote: week.defeated ? 'Boss tuần này đã bị hạ.' : `Cần khoảng ${week.neededDamagePerRemainingDay} sát thương mỗi ngày còn lại để hạ boss.`,
  };
}

export function fakePhotoAnalysis(taskType: 'meal' | 'workout', profile?: BodyProfile, coach?: CoachContext): FakePhotoResult {
  if (taskType === 'meal') {
    return {
      accuracyPercent: 70,
      estimatedPurineMg: FAKE_MEAL.purineMg,
      estimatedSaltG: FAKE_MEAL.saltG,
      estimatedSugarG: FAKE_MEAL.sugarG,
      ...(coach ? { advice: fakeAdvice(coach, FAKE_MEAL.kcal, FAKE_MEAL.proteinG, 0) } : {}),
      foodName: 'Ức gà áp chảo 150g, khoai lang 120g',
      components: [
        { name: 'Ức gà áp chảo 150g', caloriesKcal: 330, proteinG: 36, purineMg: 150, saltG: 0.9, sugarG: 0 },
        { name: 'Khoai lang 120g', caloriesKcal: 150, proteinG: 6, purineMg: 10, saltG: 0.5, sugarG: 6 },
      ],
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
    ...(coach ? { advice: fakeAdvice(coach, 0, 0, kcal) } : {}),
    activityName: 'Đi bộ dốc',
    durationMin: WORKOUT_MINUTES,
    estimatedCaloriesBurned: kcal,
    confidence: 'medium',
    reasoning: `${SIMULATED}: ${WORKOUT_MINUTES} phút, MET ${WORKOUT_MET} × ${weightKg} kg ≈ ${kcal} kcal.`,
  };
}

const MAX_FAKE_ITEMS = 5;

/** Offline stand-in for the text parser: one line per comma/"và"/"+"-separated part, with figures derived only from the
 *  text, so the same sentence always gives the same answer. Always labelled as simulated. */
export function fakeMealText(text: string, coach?: CoachContext): MealTextResult {
  const parts = text
    .split(/,|;|\+|\s+và\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_FAKE_ITEMS);
  const items = parts.map((name) => {
    const caloriesKcal = 150 + ((name.length * 37) % 350);
    return { name, caloriesKcal, proteinG: Math.round(caloriesKcal / 12), purineMg: 60, sugarG: 3, saltG: 1, accuracyPercent: 55 };
  });
  const kcal = items.reduce((s, i) => s + i.caloriesKcal, 0);
  const protein = items.reduce((s, i) => s + i.proteinG, 0);
  return {
    items,
    accuracyPercent: 55,
    reasoning: `${SIMULATED}: số liệu mẫu cho ${items.length} món.`,
    ...(coach && items.length ? { advice: fakeAdvice(coach, kcal, protein, 0) } : {}),
  };
}

/** Offline stand-in for the label reader: one fixed, plausible panel (per 100 g and per 30 g serving). Labelled as simulated. */
export function fakeNutritionLabel(): NutritionLabel {
  return {
    readable: true,
    productName: 'Bánh quy yến mạch (giả lập)',
    per100: { energyKcal: 450, proteinG: 7, sugarG: 22, sodiumMg: 380 },
    per100Unit: 'g',
    perServing: { energyKcal: 135, proteinG: 2.1, sugarG: 6.6, sodiumMg: 114 },
    servingSize: { amount: 30, unit: 'g' },
    servingsPerPack: 6,
    accuracyPercent: 90,
    reasoning: `${SIMULATED}: bảng mẫu, không phải ảnh của bạn.`,
  };
}

const FAKE_PREFIX = '[Giả lập] ';

/** Offline stand-in for the weekly review: plain wording built from the numbers only (the worst days, the repeated habits).
 *  Labelled as simulated. */
export function fakeWeeklyReport(input: WeekInput): WeeklyReport {
  const dd = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const worst = [...input.days].sort((a, b) => a.damage - b.damage).slice(0, 3);
  const { patterns, boss } = input;
  const habits: string[] = [];
  if (patterns.lateMealDays > 0) habits.push(`Ăn sau ${20}h ở ${patterns.lateMealDays} ngày.`);
  if (patterns.proteinMissDays > 0) habits.push(`Thiếu đạm ${patterns.proteinMissDays} ngày.`);
  if (patterns.saltOverDays > 0) habits.push(`Vượt giới hạn muối ${patterns.saltOverDays} ngày.`);
  if (patterns.waterShortDays > 0) habits.push(`Uống thiếu nước ${patterns.waterShortDays} ngày.`);
  return {
    headline: `${FAKE_PREFIX}Đã gây ${boss.damageSoFar}/${boss.maxHp} sát thương, boss còn ${boss.hpLeft} máu.`,
    causes: worst.map((d) => ({ date: d.date, text: d.logged ? `Ngày ${dd(d.date)} chỉ gây ${d.damage} sát thương.` : `Ngày ${dd(d.date)} chưa ghi món ăn nên không có sát thương.` })),
    patterns: habits.slice(0, 3),
    ...(input.weight.changeKg !== undefined ? { weightNote: `${FAKE_PREFIX}Cân nặng đổi ${input.weight.changeKg} kg, dự kiến theo thâm hụt ${input.weight.expectedChangeKg} kg.` } : {}),
    nextWeek: [
      { action: `Giữ thâm hụt khoảng ${input.targets.dailyDeficitKcal} kcal mỗi ngày.`, why: `Cần ~${boss.neededPerRemainingDay} sát thương mỗi ngày còn lại.` },
      { action: 'Ghi đủ món ăn mỗi ngày.', why: `${patterns.daysLogged}/${input.week.daysElapsed} ngày đã ghi.` },
      { action: 'Ăn xong trước 20h.' },
    ],
    encouragement: `${FAKE_PREFIX}Dữ liệu mẫu, không phải nhận xét của AI.`,
  };
}

/** Offline stand-in for the swap suggestions: two lighter versions of the item (about 90% of its size and protein, a fifth of
 *  the exceeded limits, none of the others), so they hold up to the same checks the real answer goes through. */
export function fakeSwaps(item: SwapItem, ctx: SwapContext): { swaps: Record<string, unknown>[] } {
  const keep = (field: 'purineMg' | 'saltG' | 'sugarG', nutrient: 'purine' | 'salt' | 'sugar', k: number) => (ctx.exceeded.includes(nutrient) ? Math.round(item[field] * k * 10) / 10 : 0);
  const make = (suffix: string, k: number) => ({
    name: `${item.name.slice(0, 50)} — ${suffix} (giả lập)`,
    calories: Math.round(item.calories * 0.9),
    proteinG: Math.round(item.proteinG * 0.9 * 10) / 10,
    purineMg: keep('purineMg', 'purine', k),
    saltG: keep('saltG', 'salt', k),
    sugarG: keep('sugarG', 'sugar', k),
    how: `${SIMULATED}: bản nhẹ hơn của món gốc, không phải gợi ý của AI.`,
    accuracyPercent: 50,
  });
  return { swaps: [make('ít muối, ít đường', 0.2), make('nấu tại nhà', 0.3)] };
}

/** Offline stand-in for the dinner ideas: two dinners of about 80% of the calories left and the protein still missing, with
 *  almost no purine, salt or sugar, so they hold up to the same checks the real answer goes through. Labelled as simulated. */
export function fakeDinner(brief: DinnerBrief): { options: Record<string, unknown>[] } {
  const light = brief.budgetKcal < 150;
  const kcal = light ? 120 : Math.round(brief.budgetKcal * 0.8);
  const protein = Math.round(Math.min(brief.proteinLeftG, light ? 12 : 45) * 10) / 10;
  const make = (name: string, k: number) => ({
    name: `${name} (giả lập)`,
    calories: Math.round(kcal * k),
    proteinG: Math.round(protein * k * 10) / 10,
    purineMg: 0,
    saltG: 0,
    sugarG: 0,
    how: `${SIMULATED}: gợi ý mẫu theo phần còn lại trong ngày, không phải của AI.`,
    accuracyPercent: 50,
  });
  return { options: [make(light ? 'Rau luộc + đạm nạc' : 'Cá hấp + rau luộc', 1), make(light ? 'Canh rau' : 'Ức gà áp chảo + salad', 0.95)] };
}

/** Offline stand-in for the coach digest: one plain line per client built only from their numbers. Labelled as simulated. */
export function fakeDigest(items: { key: string; week: WeekInput }[]): { items: { key: string; summary: string; nudge?: string }[] } {
  return {
    items: items.map(({ key, week }) => ({
      key,
      summary: `${FAKE_PREFIX}Đã ghi ${week.patterns.daysLogged}/${week.week.daysElapsed} ngày, boss còn ${week.boss.hpLeft} máu.`,
      ...(week.boss.status === 'defeated' || week.boss.status === 'on_track' ? {} : { nudge: `${FAKE_PREFIX}Nhắn nhắc ghi đủ món và giữ thâm hụt mỗi ngày.` }),
    })),
  };
}
