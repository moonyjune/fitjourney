import { describe, expect, it } from '@jest/globals';
import { DEFAULT_MEAL_TEMPLATES } from '../../constants/plan';
import type { DailyNutritionLog, MealTemplate, WorkoutLogEntry } from '../../types';
import { BOSS_MAX_HP, DAILY_DAMAGE_CAP_KCAL } from '../constants';
import { bossForWeek, damageForDeficit } from '../boss';
import { levelProgress, titleKeyForLevel, xpToNextLevel } from '../level';
import { evaluateDay } from '../missions';
import { estimateItemNutrients, sumItemNutrients } from '../nutrients';
import { computeGameState } from '../state';

// Mon 19 Oct 2026 … Fri 23 Oct … Sun 25 Oct.
const FRIDAY_16_10 = new Date('2026-10-23T16:10:00');
const FRIDAY_20_30 = new Date('2026-10-23T20:30:00');

function log(dateKey: string, meals: DailyNutritionLog['mealsEaten'] = {}, patch: Partial<DailyNutritionLog> = {}): DailyNutritionLog {
  return { dateISO: dateKey, mealsEaten: meals, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0, ...patch };
}

function workout(dateKey: string, durationMin: number, caloriesBurned: number): WorkoutLogEntry {
  return { id: `${dateKey}-w`, dateISO: `${dateKey}T17:00:00`, templateId: null, label: 'Ngày A', durationMin, caloriesBurned };
}

describe('level formula', () => {
  it('matches the design table 150 × n^1.5 rounded to 10', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(xpToNextLevel)).toEqual([150, 420, 780, 1200, 1680, 2200, 2780, 3390, 4050, 4740]);
  });

  it('converts lifetime XP to level + progress', () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 150 });
    expect(levelProgress(149).level).toBe(1);
    expect(levelProgress(150)).toMatchObject({ level: 2, xpIntoLevel: 0 });
    // 150+420+780+1200+1680+2200+2780 = 9,210 XP is exactly the start of level 8.
    expect(levelProgress(9210)).toMatchObject({ level: 8, xpIntoLevel: 0 });
    const mid = levelProgress(6430 + 1720); // level 7 with 1,720 XP in, as in the design
    expect(mid).toMatchObject({ level: 7, xpIntoLevel: 1720, xpForNext: 2780 });
    expect(mid.ratio).toBeCloseTo(0.619, 2);
  });

  it('ignores negative or fractional XP and maps titles', () => {
    expect(levelProgress(-50).level).toBe(1);
    expect(levelProgress(150.9).level).toBe(2);
    expect([1, 4, 5, 9, 10, 14, 15, 19, 20, 40].map(titleKeyForLevel)).toEqual([
      'recruit', 'recruit', 'ifWarrior', 'ifWarrior', 'bossHunter', 'bossHunter', 'disciplineKnight', 'disciplineKnight', 'legend', 'legend',
    ]);
  });
});

describe('boss', () => {
  it('is worth 7,700 HP = kcal in 1 kg of fat', () => {
    expect(BOSS_MAX_HP).toBe(7700);
  });

  it('caps a day at 1,500 damage and ignores deficits <= 0 or missing data', () => {
    expect(damageForDeficit(1873)).toEqual({ damage: DAILY_DAMAGE_CAP_KCAL, capped: true });
    expect(damageForDeficit(980)).toEqual({ damage: 980, capped: false });
    expect(damageForDeficit(-200)).toEqual({ damage: 0, capped: false });
    expect(damageForDeficit(null)).toEqual({ damage: 0, capped: false });
  });

  it("reproduces the design's Friday: 1,650 HP left, 825/day needed, resets in 3 days", () => {
    const deficits: Record<string, number> = {
      '2026-10-19': 1050,
      '2026-10-20': 1200,
      '2026-10-21': 980,
      '2026-10-22': 1320,
      '2026-10-23': 1873,
    };
    const boss = bossForWeek(FRIDAY_16_10, (k) => deficits[k] ?? null);
    expect(boss.weekKey).toBe('2026-10-19');
    expect(boss.days.map((d) => d.damage)).toEqual([1050, 1200, 980, 1320, 1500]);
    expect(boss.totalDamage).toBe(6050);
    expect(boss.hpLeft).toBe(1650);
    expect(boss.defeated).toBe(false);
    expect(boss.daysUntilReset).toBe(3);
    expect(boss.neededPerRemainingDay).toBe(825);
  });

  it('only counts days up to today, and defeats at 0 HP', () => {
    const boss = bossForWeek(new Date('2026-10-24T09:00:00'), () => 1500); // Saturday
    expect(boss.days).toHaveLength(6);
    expect(boss.totalDamage).toBe(9000);
    expect(boss.hpLeft).toBe(0);
    expect(boss.defeated).toBe(true);
    expect(boss.neededPerRemainingDay).toBe(0);
  });

  it('treats Sunday as part of the week that started the previous Monday', () => {
    const boss = bossForWeek(new Date('2026-10-25T10:00:00'), () => null);
    expect(boss.weekKey).toBe('2026-10-19');
    expect(boss.days).toHaveLength(7);
    expect(boss.daysUntilReset).toBe(1);
    expect(boss.neededPerRemainingDay).toBe(7700); // whole boss has to fall today
  });
});

describe('nutrient estimates', () => {
  it('reads grams, counts and units from plan item names', () => {
    expect(estimateItemNutrients({ name: '200g ức gà áp chảo' })?.purineMg).toBeCloseTo(340, 5);
    expect(estimateItemNutrients({ name: '2 quả trứng luộc nguyên quả' })?.purineMg).toBeCloseTo(5, 5);
    expect(estimateItemNutrients({ name: '4 lòng trắng trứng luộc' })?.saltG).toBeCloseTo(0.528, 3);
    expect(estimateItemNutrients({ name: '120g xúc xích gà nạc áp chảo' })?.saltG).toBeCloseTo(2.4, 5);
  });

  it('does not mistake tomato for fish, or a vegetable-and-broth line for chicken', () => {
    expect(estimateItemNutrients({ name: '100g cà chua' })).toBeNull();
    const broth = estimateItemNutrients({ name: 'Rau cải, mộc nhĩ, nước dùng gà trong' });
    expect(broth?.purineMg).toBeLessThan(60); // vegetables, not 150 g of chicken
  });

  it('reports unrecognised items instead of silently guessing', () => {
    const { total, unknownItems } = sumItemNutrients([{ name: '200g ức gà áp chảo' }, { name: 'Món lạ không biết' }]);
    expect(unknownItems).toBe(1);
    expect(total.purineMg).toBeCloseTo(340, 5);
  });
});

describe('daily missions', () => {
  const plan = DEFAULT_MEAL_TEMPLATES;
  const base = { mealTemplatesByDayType: plan, tdeeKcal: 2694, proteinTargetG: 200 };
  const friday = '2026-10-23';

  it('Friday 16:10 after meals 1+2 and a workout: deficit 1,873, workout + deficit done, protein still open', () => {
    const day = evaluateDay({
      ...base,
      dateKey: friday,
      now: FRIDAY_16_10,
      log: log(friday, { meal1: true, meal2: true }),
      workouts: [workout(friday, 14, 420)],
    });
    expect(day.eatenKcal).toBe(1241);
    expect(day.proteinG).toBe(117);
    expect(day.deficitKcal).toBe(2694 + 420 - 1241);
    const status = Object.fromEntries(day.missions.map((m) => [m.id, m.status]));
    expect(status).toMatchObject({ workout: 'done', deficit: 'done', protein: 'open' });
    expect(day.eatingClosed).toBe(false);
    expect(day.earnedXp).toBeGreaterThanOrEqual(110); // workout 60 + deficit 50, plus any limits already earned
    expect(day.missions.find((m) => m.id === 'junk')?.status).toBe('holding'); // not earned until the window closes
  });

  it('limit missions are only earned once the eating window closes, and never on an empty day', () => {
    const empty = evaluateDay({ ...base, dateKey: friday, now: FRIDAY_20_30, log: undefined, workouts: [] });
    expect(empty.missions.find((m) => m.id === 'junk')?.status).toBe('missed');
    expect(empty.deficitKcal).toBeNull();

    const fed = evaluateDay({ ...base, dateKey: friday, now: FRIDAY_20_30, log: log(friday, { meal1: true }), workouts: [] });
    expect(fed.eatingClosed).toBe(true);
    expect(fed.missions.find((m) => m.id === 'junk')?.status).toBe('done');
    expect(fed.missions.find((m) => m.id === 'sugar')?.status).toBe('done');
  });

  it('flags junk, sugar and a custom purine ceiling the moment they are exceeded', () => {
    const extra = {
      id: 'x', name: 'Trà sữa', calories: 300, proteinG: 2, loggedAtISO: '2026-10-23T15:00:00', mealTime: 'afternoon_snack' as const,
      sugarG: 40, junk: true,
    };
    const day = evaluateDay({
      ...base,
      limits: { purineMg: 100 },
      dateKey: friday,
      now: FRIDAY_16_10,
      log: log(friday, { meal2: true }, { extraItems: [extra], extraCalories: 300, extraProteinG: 2 }),
      workouts: [],
    });
    const status = Object.fromEntries(day.missions.map((m) => [m.id, m.status]));
    expect(status.junk).toBe('missed');
    expect(status.sugar).toBe('missed');
    expect(status.purine).toBe('missed'); // 200 g chicken ≈ 340 mg > the 100 mg ceiling passed in
    expect(day.junkCount).toBe(1);
  });

  it('a perfect day earns every mission plus the 50 XP bonus', () => {
    const meals: MealTemplate[] = [
      { slot: 'meal1', label: 'm', timeRange: '', startHour: 12, startMinute: 0, items: [{ name: '2 quả trứng luộc', calories: 143 }], calories: 143, proteinG: 210 },
    ];
    const day = evaluateDay({
      mealTemplatesByDayType: { training: meals, rest: meals },
      tdeeKcal: 2694,
      proteinTargetG: 200,
      dateKey: '2026-10-22',
      now: FRIDAY_16_10, // a past day, so everything is final
      log: log('2026-10-22', { meal1: true }),
      workouts: [workout('2026-10-22', 15, 100)],
    });
    expect(day.perfect).toBe(true);
    expect(day.earnedXp).toBe(60 + 50 + 40 + 30 * 4 + 50);
  });
});

describe('game state replay', () => {
  it('derives XP from logs only, so removing a logged meal removes the XP it earned', () => {
    const plan = DEFAULT_MEAL_TEMPLATES;
    const common = {
      now: FRIDAY_20_30,
      startDateISO: '2026-10-19T08:00:00',
      workoutEntries: [] as WorkoutLogEntry[],
      mealTemplatesByDayType: plan,
      tdeeKcal: 2694,
      proteinTargetG: 200,
    };
    const withMeal = computeGameState({ ...common, logs: { '2026-10-23': log('2026-10-23', { meal1: true }) } });
    const without = computeGameState({ ...common, logs: {} });
    expect(withMeal.totalXp).toBeGreaterThan(without.totalXp);
    expect(without.totalXp).toBe(0);
    expect(without.level.level).toBe(1);
  });

  it('awards the boss-defeat bonus once per defeated week', () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (const d of ['19', '20', '21', '22', '23', '24', '25']) logs[`2026-10-${d}`] = log(`2026-10-${d}`, { meal1: true });
    const state = computeGameState({
      now: new Date('2026-10-25T21:00:00'),
      startDateISO: '2026-10-19T08:00:00',
      logs,
      workoutEntries: [],
      mealTemplatesByDayType: DEFAULT_MEAL_TEMPLATES,
      tdeeKcal: 4000, // huge TDEE ⇒ every logged day hits the 1,500 cap
      proteinTargetG: 200,
    });
    expect(state.boss.defeated).toBe(true);
    expect(state.bossesDefeated).toBe(1);
  });

  it('survives a start date in the future or garbage', () => {
    const now = new Date('2026-10-23T10:00:00');
    const args = { now, logs: {}, workoutEntries: [], mealTemplatesByDayType: DEFAULT_MEAL_TEMPLATES, tdeeKcal: 2694, proteinTargetG: 200 };
    expect(() => computeGameState({ ...args, startDateISO: '2030-01-01T00:00:00' })).not.toThrow();
    expect(() => computeGameState({ ...args, startDateISO: 'not a date' })).not.toThrow();
  });
});

describe('boss history', () => {
  it('lists every week since the start, newest first, with the live week on top', () => {
    const logs: Record<string, DailyNutritionLog> = {};
    for (const d of ['19', '20', '21']) logs[`2026-10-${d}`] = log(`2026-10-${d}`, { meal1: true });
    logs['2026-10-26'] = log('2026-10-26', { meal1: true });
    const state = computeGameState({
      now: new Date('2026-10-27T10:00:00'),
      startDateISO: '2026-10-19T08:00:00',
      logs,
      workoutEntries: [],
      mealTemplatesByDayType: DEFAULT_MEAL_TEMPLATES,
      tdeeKcal: 2694,
      proteinTargetG: 200,
    });
    expect(state.bossHistory.map((b) => b.weekKey)).toEqual(['2026-10-26', '2026-10-19']);
    expect(state.boss.weekKey).toBe(state.bossHistory[0].weekKey);
    // 2694 - 741 = 1,953 -> capped at 1,500 per logged day: 3 days last week.
    expect(state.bossHistory[1].totalDamage).toBe(4500);
    expect(state.bossHistory[1].defeated).toBe(false);
  });
});
