import { describe, expect, it } from '@jest/globals';
import {
  ACTIVITY_MULTIPLIER,
  actualDailyDeficitKcal,
  computeBmrKcal,
  estimateTdeeFromPlanTarget,
  resolveTdeeKcal,
  TARGET_DAILY_DEFICIT_KCAL,
} from '../tdee';

describe('TARGET_DAILY_DEFICIT_KCAL', () => {
  it('matches the average of WEEKLY_FAT_LOSS_TARGET_KG (0.9-1.1kg) converted to a daily kcal deficit', () => {
    // avg 1.0kg/week * 7700 kcal/kg / 7 days ≈ 1100 kcal/day
    expect(TARGET_DAILY_DEFICIT_KCAL).toBe(1100);
  });
});

describe('computeBmrKcal (Mifflin-St Jeor)', () => {
  it('matches the textbook formula for a man', () => {
    // 10*90 + 6.25*175 - 5*35 + 5 = 900 + 1093.75 - 175 + 5 = 1823.75
    expect(computeBmrKcal('male', 90, 175, 35)).toBeCloseTo(1823.75, 5);
  });

  it('matches the textbook formula for a woman', () => {
    // 10*70 + 6.25*160 - 5*30 - 161 = 700 + 1000 - 150 - 161 = 1389
    expect(computeBmrKcal('female', 70, 160, 30)).toBeCloseTo(1389, 5);
  });

  it('gives a man a higher BMR than a woman with identical weight/height/age', () => {
    expect(computeBmrKcal('male', 80, 170, 40)).toBeGreaterThan(computeBmrKcal('female', 80, 170, 40));
  });

  it('decreases with age, all else equal', () => {
    expect(computeBmrKcal('male', 80, 170, 50)).toBeLessThan(computeBmrKcal('male', 80, 170, 25));
  });
});

describe('ACTIVITY_MULTIPLIER', () => {
  it('increases monotonically from sedentary to very_active', () => {
    const order: Array<keyof typeof ACTIVITY_MULTIPLIER> = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
    for (let i = 1; i < order.length; i++) {
      expect(ACTIVITY_MULTIPLIER[order[i]]).toBeGreaterThan(ACTIVITY_MULTIPLIER[order[i - 1]]);
    }
  });
});

describe('resolveTdeeKcal', () => {
  const fullProfile = { gender: 'male' as const, age: 35, heightCm: 175, activityLevel: 'moderate' as const, weightKg: 90, calorieTargetKcal: 1950 };

  it('uses the real BMR-based formula when gender/age/height/activity are all present', () => {
    const result = resolveTdeeKcal(fullProfile);
    expect(result.source).toBe('profile');
    expect(result.tdeeKcal).toBeCloseTo(computeBmrKcal('male', 90, 175, 35) * ACTIVITY_MULTIPLIER.moderate, 5);
  });

  it('falls back to a pure plan-target estimate only when activityLevel is also missing', () => {
    const result = resolveTdeeKcal({ ...fullProfile, activityLevel: null });
    expect(result.source).toBe('planTarget');
    expect(result.tdeeKcal).toBe(estimateTdeeFromPlanTarget(fullProfile.calorieTargetKcal));
  });

  it('scales the plan-target estimate by the chosen activity tier when age/gender/height are missing', () => {
    // moderate is the plan-target's implicit baseline, so it's unscaled (ratio 1).
    const moderate = resolveTdeeKcal({ ...fullProfile, gender: null, age: null, heightCm: null, activityLevel: 'moderate' });
    expect(moderate.source).toBe('planTargetWithActivity');
    expect(moderate.tdeeKcal).toBeCloseTo(estimateTdeeFromPlanTarget(fullProfile.calorieTargetKcal), 5);

    // A lower tier scales the number down proportionally, instead of being ignored entirely.
    const sedentary = resolveTdeeKcal({ ...fullProfile, gender: null, age: null, heightCm: null, activityLevel: 'sedentary' });
    expect(sedentary.source).toBe('planTargetWithActivity');
    const expected = estimateTdeeFromPlanTarget(fullProfile.calorieTargetKcal) * (ACTIVITY_MULTIPLIER.sedentary / ACTIVITY_MULTIPLIER.moderate);
    expect(sedentary.tdeeKcal).toBeCloseTo(expected, 5);
    expect(sedentary.tdeeKcal).toBeLessThan(moderate.tdeeKcal);
  });

  it('missing any single one of gender/age/height (with activity present) still uses the activity-scaled fallback, not the full profile formula', () => {
    for (const missing of ['gender', 'age', 'heightCm'] as const) {
      const result = resolveTdeeKcal({ ...fullProfile, [missing]: null });
      expect(result.source).toBe('planTargetWithActivity');
    }
  });

  it('gives a different TDEE for a more sedentary person at the same weight/height/age', () => {
    const active = resolveTdeeKcal({ ...fullProfile, activityLevel: 'very_active' });
    const sedentary = resolveTdeeKcal({ ...fullProfile, activityLevel: 'sedentary' });
    expect(active.tdeeKcal).toBeGreaterThan(sedentary.tdeeKcal);
  });

  it('gives an older person in the same activity tier a lower TDEE than a younger one', () => {
    const younger = resolveTdeeKcal({ ...fullProfile, age: 22 });
    const older = resolveTdeeKcal({ ...fullProfile, age: 60 });
    expect(older.tdeeKcal).toBeLessThan(younger.tdeeKcal);
  });
});

describe('actualDailyDeficitKcal', () => {
  const tdee = estimateTdeeFromPlanTarget(1950); // 3050

  it('is positive (a real deficit) when intake stays under TDEE', () => {
    expect(actualDailyDeficitKcal(tdee, 0, 1800)).toBe(tdee - 1800);
    expect(actualDailyDeficitKcal(tdee, 0, 1800)).toBeGreaterThan(0);
  });

  it('is negative (a surplus) when intake exceeds TDEE', () => {
    expect(actualDailyDeficitKcal(tdee, 0, 3500)).toBeLessThan(0);
  });

  it('adds logged exercise burn on top of TDEE, widening the deficit', () => {
    const withoutExercise = actualDailyDeficitKcal(tdee, 0, 2000);
    const withExercise = actualDailyDeficitKcal(tdee, 400, 2000);
    expect(withExercise).toBe(withoutExercise + 400);
  });
});
