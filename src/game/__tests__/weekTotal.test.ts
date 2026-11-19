import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase');
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { bossForWeek } from '../boss';
import { bossHitTexts, cheatHitText, kcalNum, weekDeficitText, weekDeficitTotal, weeklyReportHref } from '../bossView';
import { formatGameText, type GameKey } from '../strings';

const vi = (key: GameKey, params?: Record<string, string | number>) => formatGameText('vi', key, params);
const en = (key: GameKey, params?: Record<string, string | number>) => formatGameText('en', key, params);

// Monday 16/11 … Sunday 22/11 2026; judged on Thursday 19 at 15:00 with dinner still to come.
const NOW = new Date('2026-11-19T15:00:00');
const DEFICITS: Record<string, number> = { '2026-11-16': 1200, '2026-11-17': -300, '2026-11-18': 4000, '2026-11-19': 900 };

describe("the week's total deficit (Journal › Tuần, the boss sheet and page)", () => {
  const boss = bossForWeek(
    NOW,
    (k) => DEFICITS[k] ?? null,
    undefined,
    (k) => k === '2026-11-18',
    () => 0,
    (k) => k !== '2026-11-19',
    1100
  );

  it('sums the settled days (a surplus counts against it), a cheat day as its hit, and keeps today\'s estimate apart', () => {
    expect(weekDeficitTotal(boss)).toEqual({ kcal: 1200 - 300 + 1100, pendingKcal: 900, cheatDays: 1, cheatKcal: 1100 });
  });

  it('reads with dots between thousands in Vietnamese and commas in English', () => {
    expect(kcalNum(6420)).toBe('6.420');
    expect(kcalNum(6420, 'en')).toBe('6,420');
    expect(kcalNum(-1234567)).toBe('−1.234.567');
    expect(kcalNum(950)).toBe('950');
    expect(weekDeficitText(boss, vi, 'vi')).toBe('Tổng thâm hụt: 2.000 kcal · dự kiến thêm ~900 hôm nay · gồm 1 ngày cheat (1.100)');
    expect(weekDeficitText({ days: boss.days.slice(0, 2) }, vi, 'vi')).toBe('Tổng thâm hụt: 900 kcal');
    expect(weekDeficitText(boss, en, 'en')).toBe('Total deficit: 2,000 kcal · ~900 more expected today · incl. 1 cheat day(s) (1,100)');
  });

  it('a cheat day in the day list and as today\'s hit: −target HP, one day excused', () => {
    const cheat = boss.days.find((d) => d.cheat)!;
    expect(cheat).toMatchObject({ damage: 1100, deficitKcal: null, pending: false });
    expect(cheatHitText(cheat, vi, 'vi')).toBe('🎉 Cheat day: −1.100 HP (miễn trừ 1 ngày)');
    expect(cheatHitText({ damage: 0 }, vi)).toBe('cheat day · không tính kcal');
    const todayCheat = bossForWeek(NOW, () => 500, undefined, (k) => k === '2026-11-19', () => 0, () => true, 1100);
    expect(bossHitTexts(todayCheat, { pendingMeals: [] }, vi).reason).toContain('boss vẫn mất 1,100 HP');
  });

  it('the AI weekly review of a given week is opened with that week in the route', () => {
    expect(weeklyReportHref('2026-11-09')).toEqual({ pathname: '/weekly-report', params: { week: '2026-11-09' } });
  });
});
