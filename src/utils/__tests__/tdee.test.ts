import { describe, expect, it } from '@jest/globals';
import { actualDailyDeficitKcal, estimateTdeeKcal, TARGET_DAILY_DEFICIT_KCAL } from '../tdee';

describe('TARGET_DAILY_DEFICIT_KCAL', () => {
  it('matches the average of WEEKLY_FAT_LOSS_TARGET_KG (0.9-1.1kg) converted to a daily kcal deficit', () => {
    // avg 1.0kg/week * 7700 kcal/kg / 7 days ≈ 1100 kcal/day
    expect(TARGET_DAILY_DEFICIT_KCAL).toBe(1100);
  });
});

describe('estimateTdeeKcal', () => {
  it('adds the plan-implied daily deficit back onto the intake target', () => {
    expect(estimateTdeeKcal(1950)).toBe(1950 + TARGET_DAILY_DEFICIT_KCAL);
  });

  it('scales with the intake target (a higher target implies a higher TDEE)', () => {
    expect(estimateTdeeKcal(2200)).toBeGreaterThan(estimateTdeeKcal(1950));
  });
});

describe('actualDailyDeficitKcal', () => {
  const tdee = estimateTdeeKcal(1950); // 3050

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
