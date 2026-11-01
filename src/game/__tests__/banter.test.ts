import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({ pushUserData: (...a: unknown[]) => mockPush(...a), pushNutritionLog: jest.fn(), pushWorkoutEntry: jest.fn(), pushWeightEntry: jest.fn(), pushProfile: jest.fn() }));

import { banterPrompt, cleanBanterAnswer, cleanBanterSummary, type BanterDaySummary } from '../../../supabase/functions/_shared/banter';
import { DAILY_QUOTA } from '../../../supabase/functions/_shared/usage';
import { autoBanterDay, BANTER_DAYS, buildBanterShown, buildBanterSummary, type BanterBuildInput } from '../../banter/days';
import { cleanBossTalkData, mergeBossTalk, TALK_KEEP, type BossTalk } from '../../banter/talks';
import { templateBanter } from '../../banter/templates';
import { useBossTalkStore } from '../../store/useBossTalkStore';
import { USER_DATA_KEYS } from '../../sync/userDataKeys';
import type { DamageDay } from '../bossDamage';
import type { DayEvaluation } from '../missions';
import { buildStageJourney } from '../stageBosses';
import type { DailyNutritionLog, ExtraFoodItem, WorkoutLogEntry } from '../../types';

const TODAY = '2026-10-31';
const { bosses } = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 108, entries: [], startDateISO: '2026-10-01T08:00:00' });
const boss = bosses[0];

const summary = (over: Partial<BanterDaySummary> = {}): BanterDaySummary => ({
  date: '2026-10-30',
  live: false,
  boss: { name: 'Quỷ Bánh Kem', skills: ['Dụ dỗ đồ ngọt'], tier: 1, hpLeftKg: 1.2, hpKg: 2, fell: false },
  deficitKcal: 1000,
  targetKcal: 1000,
  level: 'met',
  estG: 130,
  cheatDay: false,
  eatenKcal: 1500,
  proteinG: 90,
  proteinTargetG: 150,
  workouts: [],
  foods: [{ name: 'Phở bò', kcal: 600 }],
  ...over,
});

const alternates = (lines: { speaker: string }[]) => lines.every((l, i) => i === 0 || l.speaker !== lines[i - 1].speaker);

describe('template exchange (no AI)', () => {
  it('a deficit day: the player opens with a move named from the real kcal, the boss takes the real damage', () => {
    const t = templateBanter(summary());
    expect(t.moveName).toMatch(/ 1,000 kcal$/);
    expect(t.lines[0]).toMatchObject({ speaker: 'player' });
    expect(t.lines[0].text).toContain(t.moveName);
    expect(t.lines[1].speaker).toBe('boss');
    expect(t.lines[1].text).toContain('130 g');
    expect(t.lines.length).toBeGreaterThanOrEqual(3);
    expect(t.lines.length).toBeLessThanOrEqual(6);
    expect(alternates(t.lines)).toBe(true);
    expect(t.mood).toBe('hurt');
    expect(templateBanter(summary())).toEqual(t); // same day, same words
  });

  it('only mentions what happened: a logged workout, a weigh-in drop as a critical hit, and the boss falling', () => {
    const t = templateBanter(summary({ workouts: [{ name: 'Chạy bộ', minutes: 30, kcal: 250 }], weighIn: { kg: 107.9, lostKg: 0.4 }, boss: { ...summary().boss, fell: true } }));
    const text = t.lines.map((l) => l.text).join(' ');
    expect(text).toContain('Chạy bộ 30 phút');
    expect(text).toContain('−0.4 kg');
    expect(t.lines[t.lines.length - 1].speaker).toBe('boss');
    expect(t.mood).toBe('defeated');
    expect(t.lines).toHaveLength(6);
    expect(alternates(t.lines)).toBe(true);
    // No workout logged: none is named.
    expect(templateBanter(summary()).lines.map((l) => l.text).join(' ')).not.toContain('cú đá');
  });

  it('a small deficit is a scratch the boss laughs off', () => {
    const t = templateBanter(summary({ deficitKcal: 300, level: 'low', estG: 39, foods: [{ name: 'Trà sữa', kcal: 500, junk: true }] }));
    expect(t.lines[1].text).toContain('39 g');
    expect(t.mood).toBe('smug');
  });

  it('a surplus day: the boss heals and taunts, ends with a challenge for tomorrow, never about the body', () => {
    const t = templateBanter(summary({ deficitKcal: -400, level: 'over', estG: -52, foods: [{ name: 'Lẩu thái', kcal: 1800 }, { name: 'Trà sữa', kcal: 500, junk: true }] }));
    expect(t.lines[0].speaker).toBe('boss');
    expect(t.lines[0].text).toContain('400 kcal');
    expect(t.moveName).toContain('Trà sữa'); // the junk food, a real one
    const last = t.lines[t.lines.length - 1];
    expect(last.speaker).toBe('boss');
    expect(last.text).toContain('1,000 kcal');
    expect(alternates(t.lines)).toBe(true);
    expect(t.lines.map((l) => l.text).join(' ')).not.toMatch(/béo|mập|xấu/i);
    // No food logged off-plan: no food is named.
    expect(templateBanter(summary({ deficitKcal: -400, level: 'over', estG: -52, foods: [] })).lines.map((l) => l.text).join(' ')).not.toContain('ngon chứ');
  });

  it('a planned cheat day is lighter', () => {
    const t = templateBanter(summary({ deficitKcal: -800, level: 'cheat', estG: -104, cheatDay: true }));
    expect(t.moveName).toBe('Tiệc Xả Có Kế Hoạch');
    expect(t.mood).toBe('chill');
    expect(t.lines[0].text).toContain('104 g');
  });
});

const item = (date: string, name: string, calories: number, extra: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: `${date}-${name}`, name, calories, proteinG: 20, loggedAtISO: `${date}T05:00:00.000Z`, mealTime: 'lunch', ...extra,
});
const log = (date: string, items: ExtraFoodItem[]): DailyNutritionLog => ({
  dateISO: `${date}T00:00:00`, mealsEaten: {}, extraCalories: items.reduce((s, x) => s + x.calories, 0), extraProteinG: 0, extraItems: items, waterMl: 0,
});
const day = (dateKey: string, deficitKcal: number | null, extra: Partial<DamageDay> = {}): DamageDay => ({
  dateKey, deficitKcal, cheat: false, estKg: deficitKcal == null ? null : deficitKcal / 7700, weightKg: null, realKg: null, estTotalKg: 0, realTotalKg: null, bossIndex: 0, felled: [], ...extra,
});
const evaluation = (dateKey: string): DayEvaluation => ({ dateKey, eatenKcal: 1500, proteinG: 160 } as DayEvaluation);
const workout = (date: string, label: string, min: number): WorkoutLogEntry => ({ id: `wo-${date}`, dateISO: `${date}T17:00:00`, templateId: null, label, durationMin: min, caloriesBurned: 200 });

describe('day summary', () => {
  it('takes the day’s real figures: level, damage in grams, the biggest foods and junk, workouts, the weigh-in', () => {
    const items = [item('2026-10-30', 'Cơm gà', 600), item('2026-10-30', 'Phở', 500), item('2026-10-30', 'Bánh mì', 400), item('2026-10-30', 'Sữa chua', 100), item('2026-10-30', 'Kẹo', 80, { junk: true })];
    const s = buildBanterSummary({
      day: day('2026-10-30', 770, { weightKg: 107.84, realKg: 0.36, felled: [0] }),
      boss,
      evaluation: evaluation('2026-10-30'),
      log: log('2026-10-30', items),
      workouts: [workout('2026-10-30', 'Bơi', 45)],
      targetKcal: 1000,
      proteinTargetG: 150,
      cheat: false,
      todayKey: TODAY,
      bossName: 'Quỷ Bánh Kem',
      skillNames: ['Dụ dỗ đồ ngọt', 'Ăn vặt vô thức'],
    })!;
    expect(s).toMatchObject({ date: '2026-10-30', live: false, deficitKcal: 770, level: 'ok', estG: 100, proteinG: 160, eatenKcal: 1500 });
    expect(s.foods.map((f) => f.name)).toEqual(['Cơm gà', 'Phở', 'Bánh mì', 'Sữa chua', 'Kẹo']);
    expect(s.foods[4]).toEqual({ name: 'Kẹo', kcal: 80, junk: true });
    expect(s.workouts).toEqual([{ name: 'Bơi', minutes: 45, kcal: 200 }]);
    expect(s.weighIn).toEqual({ kg: 107.8, lostKg: 0.36 });
    expect(s.boss).toMatchObject({ name: 'Quỷ Bánh Kem', fell: true });
  });

  it('a day without food or a cheat day (its kcal are not counted) has no exchange', () => {
    const base = { boss, evaluation: undefined, log: undefined, workouts: [], targetKcal: 1000, proteinTargetG: 150, todayKey: TODAY, bossName: 'X', skillNames: [] };
    expect(buildBanterSummary({ ...base, day: day('2026-10-30', null), cheat: false })).toBeNull();
    expect(buildBanterSummary({ ...base, day: day('2026-10-30', -500), cheat: true })).toBeNull();
    expect(buildBanterSummary({ ...base, day: day('2026-10-30', null, { cheat: true }), cheat: false })).toBeNull();
    expect(buildBanterSummary({ ...base, day: day(TODAY, 400), cheat: false })?.live).toBe(true);
  });
});

const talk = (date: string, over: Partial<BossTalk> = {}): BossTalk => ({
  date, moveName: 'Chưởng AI', mood: 'hurt', lines: [{ speaker: 'player', text: 'AI một' }, { speaker: 'boss', text: 'AI hai' }], source: 'ai', deficitKcal: 800, madeAtISO: '2026-10-30T20:00:00.000Z', ...over,
});

describe('which days talk', () => {
  const input = (over: Partial<BanterBuildInput> = {}): BanterBuildInput => {
    const days: DamageDay[] = [];
    for (let d = 1; d <= 31; d++) days.push(day(`2026-10-${String(d).padStart(2, '0')}`, d === 29 ? null : 800));
    return {
      days, bosses, evaluations: new Map(), logs: {}, workoutEntries: [], targetKcal: 1000, proteinTargetG: 150, cheatDays: [], talks: [], todayKey: TODAY,
      bossName: () => 'Quỷ Bánh Kem', skillName: (s) => s, ...over,
    };
  };

  it('the last two weeks with food, newest first, today live; an AI exchange replaces the template, marked stale when the day changed', () => {
    const shown = buildBanterShown(input({ talks: [talk('2026-10-30'), talk('2026-10-28', { deficitKcal: 300 })] }));
    expect(shown[0]).toMatchObject({ date: TODAY, live: true, source: 'template' });
    expect(shown.map((d) => d.date)).not.toContain('2026-10-29');
    expect(shown[shown.length - 1].date).toBe('2026-10-18');
    expect(shown).toHaveLength(BANTER_DAYS - 1);
    expect(shown.find((d) => d.date === '2026-10-30')).toMatchObject({ source: 'ai', stale: false, text: { moveName: 'Chưởng AI' } });
    expect(shown.find((d) => d.date === '2026-10-28')).toMatchObject({ source: 'ai', stale: true });
  });

  it('skips a cheat day', () => {
    const shown = buildBanterShown(input({ cheatDays: ['2026-10-27'] }));
    expect(shown.map((d) => d.date)).not.toContain('2026-10-27');
    expect(shown).toHaveLength(BANTER_DAYS - 2);
  });

  it('yesterday is asked of the AI once on its own: not when written, tried already, or without food', () => {
    expect(autoBanterDay(buildBanterShown(input()), TODAY, null)).toBe('2026-10-30');
    expect(autoBanterDay(buildBanterShown(input()), TODAY, '2026-10-30')).toBeNull();
    expect(autoBanterDay(buildBanterShown(input({ talks: [talk('2026-10-30')] })), TODAY, '2026-10-29')).toBeNull();
    expect(autoBanterDay(buildBanterShown(input({ todayKey: '2026-10-30' })), '2026-10-30', null)).toBeNull(); // 29/10 has no food
  });
});

describe('saved exchanges (user_data bossTalk)', () => {
  it('cleans, keeps one per day (the later write), drops broken ones and keeps at most TALK_KEEP', () => {
    const data = cleanBossTalkData({
      talks: [talk('2026-10-30'), talk('2026-10-30', { moveName: 'Mới', madeAtISO: '2026-10-31T08:00:00.000Z' }), { date: 'x' }, talk('2026-10-20', { lines: [] }), null],
      autoTried: 'nope',
    });
    expect(data).toEqual({ talks: [talk('2026-10-30', { moveName: 'Mới', madeAtISO: '2026-10-31T08:00:00.000Z' })], autoTried: null });
    const many = Array.from({ length: TALK_KEEP + 5 }, (_, i) => talk(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)));
    const kept = cleanBossTalkData({ talks: many }).talks;
    expect(kept).toHaveLength(TALK_KEEP);
    expect(kept[0].date).toBe(many[5].date);
    expect(cleanBossTalkData(undefined)).toEqual({ talks: [], autoTried: null });
  });

  it('merges both sides and the later automatic try', () => {
    const merged = mergeBossTalk({ talks: [talk('2026-10-30')], autoTried: '2026-10-30' }, { talks: [talk('2026-10-29')], autoTried: '2026-10-28' });
    expect(merged.talks.map((t) => t.date)).toEqual(['2026-10-29', '2026-10-30']);
    expect(merged.autoTried).toBe('2026-10-30');
  });

  it('the store saves a day, replacing the one before, and syncs under bossTalk', () => {
    useBossTalkStore.setState({ talks: [talk('2026-10-30')], autoTried: null });
    useBossTalkStore.getState().saveTalk(talk('2026-10-30', { moveName: 'Lần hai', madeAtISO: '2026-10-31T09:00:00.000Z' }));
    useBossTalkStore.getState().markAutoTried('2026-10-30');
    const state = useBossTalkStore.getState();
    expect(state.talks.map((t) => t.moveName)).toEqual(['Lần hai']);
    expect(USER_DATA_KEYS.bossTalk).toBe('bossTalk');
    expect(mockPush).toHaveBeenLastCalledWith('bossTalk', { talks: state.talks, autoTried: '2026-10-30' });
  });
});

describe('boss-banter request and answer (server, pure)', () => {
  it('cleans the summary: user-typed names lose line breaks and angle brackets, bad input is refused', () => {
    const s = cleanBanterSummary({ ...summary(), foods: [{ name: '  Phở\n<b>bò</b>  ', kcal: 600 }], workouts: [{ name: 'Chạy\r\nbộ', minutes: 30, kcal: 9 }], extra: 'x' })!;
    expect(s.foods[0].name).toBe('Phở b bò /b');
    expect(s.workouts[0].name).toBe('Chạy bộ');
    expect(cleanBanterSummary({ ...summary(), level: 'epic' })).toBeNull();
    expect(cleanBanterSummary({ ...summary(), date: '30/10' })).toBeNull();
    expect(cleanBanterSummary(null)).toBeNull();
    expect(banterPrompt(s)).toContain('<day>');
    expect(banterPrompt(s)).toContain('130 g');
    expect(DAILY_QUOTA.banter).toBe(10);
  });

  it('keeps 2-6 lines from known speakers, a known mood', () => {
    const lines = Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? 'boss' : 'player', text: ` câu ${i} ` }));
    const t = cleanBanterAnswer({ moveName: ' Chưởng  X ', mood: 'weird', lines: [{ speaker: 'narrator', text: 'Ngày xưa' }, ...lines] })!;
    expect(t.moveName).toBe('Chưởng X');
    expect(t.mood).toBe('smug');
    expect(t.lines).toHaveLength(6);
    expect(t.lines[0]).toEqual({ speaker: 'player', text: 'câu 0' });
    expect(cleanBanterAnswer({ moveName: 'x', mood: 'hurt', lines: [{ speaker: 'boss', text: 'một câu' }] })).toBeNull();
  });
});
