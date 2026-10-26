import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

import { DEFAULT_MEAL_TEMPLATES } from '../../constants/plan';
import { adviceFor, buildDayFeedback, type AdviceKey } from '../../feedback/day';
import { buildDiaryItems, isMainMeal, type DiaryItem } from '../../feedback/items';
import { isSkippedMeal, matchRules } from '../../feedback/match';
import { commentMeal, mealWarnings } from '../../feedback/meal';
import { frequentFoods, repeatsForDraft, repeatsOnDay } from '../../feedback/repeats';
import { FOOD_RULES } from '../../feedback/rulesData';
import { formatFeedbackText } from '../../feedback/strings';
import { addDaysToKey } from '../../insights/dateMath';
import type { DayRow } from '../../insights/days';
import { thresholdsFrom } from '../../insights/thresholds';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

const th = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 600, saltG: 5, sugarG: 35 } });
const shorts = (text: string) => matchRules(text).map((r) => r.short);

describe('rule table', () => {
  it('has unique keywords and a reason for every rule, and a replacement for every rule that is not "good"', () => {
    expect(FOOD_RULES.length).toBe(71);
    expect(new Set(FOOD_RULES.map((r) => r.keyword)).size).toBe(FOOD_RULES.length);
    for (const r of FOOD_RULES) {
      expect(r.keyword).toBe(r.keyword.toLowerCase());
      expect(r.why.length).toBeGreaterThan(2);
      expect(['replace', 'note', 'good']).toContain(r.kind);
      if (r.kind !== 'good') {
        expect(r.replaceWith.length).toBeGreaterThan(2);
        expect(r.shortReplace.length).toBeGreaterThan(2);
      }
      expect(r.repeatAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the values of the diary workbook', () => {
    const rule = (k: string) => FOOD_RULES.find((r) => r.keyword === k)!;
    expect(rule('mì tôm')).toMatchObject({ short: 'Mì gói', kind: 'replace', repeatAt: 2, shortReplace: 'miến/mì gạo lứt + lòng trắng' });
    expect(rule('lòng trắng')).toMatchObject({ short: 'Lòng trắng trứng', kind: 'good', repeatAt: 0 });
    expect(rule('snack')).toMatchObject({ kind: 'note', repeatAt: 3 });
    expect(rule('pate').repeatAt).toBe(1);
  });
});

describe('matching a food description', () => {
  it('finds rules by keyword anywhere in the text, in any case', () => {
    expect(shorts('Ăn 1 Xúc Xích và 2 trứng')).toEqual(['Xúc xích']);
    expect(shorts('lòng trắng rán; yến mạch; sữa chua')).toEqual(['Lòng trắng trứng', 'Sữa chua', 'Yến mạch']);
    expect(shorts('cơm với canh rau')).toEqual(['Rau']);
    expect(shorts('')).toEqual([]);
    expect(shorts('một món không có từ khóa')).toEqual([]);
  });

  it('does not let a short keyword fire inside a longer one that also matched', () => {
    expect(shorts('1 bát mì tôm cải thảo')).toEqual(['Mì gói']); // not "Tôm"
    expect(shorts('chả cá lăng + bún (mắm tôm, lạc)')).toEqual(['Mắm tôm']);
    expect(shorts('50g ức gà ăn liền')).toEqual(['Ức gà ăn liền']); // not the "good" Ức gà
    expect(shorts('một gói phở ăn liền')).toEqual(['Phở ăn liền']); // not "Phở"
    // a keyword that also stands alone elsewhere in the text still fires
    expect(shorts('mì tôm và 150g tôm luộc')).toEqual(['Mì gói', 'Tôm']);
    expect(shorts('ức gà áp chảo; 30g ức gà ăn liền')).toEqual(expect.arrayContaining(['Ức gà', 'Ức gà ăn liền']));
  });

  it('names a food once even when several of its keywords appear', () => {
    expect(shorts('mì tôm và mì indo')).toEqual(['Mì gói']);
    expect(shorts('bún thang rồi miến thang')).toEqual(['Bún / miến nước']);
  });

  it('puts the good choices first and the things to change after them', () => {
    const lines = commentMeal('xúc xích; lòng trắng; chiên');
    expect(lines.map((l) => `${l.kind}:${l.short}`)).toEqual(['good:Lòng trắng trứng', 'replace:Xúc xích', 'note:Đồ chiên']);
    expect(lines[1]).toMatchObject({ why: expect.stringContaining('chế biến sẵn'), replaceWith: expect.stringContaining('trứng luộc') });
  });

  it('recognises a skipped meal', () => {
    expect(isSkippedMeal('Không ăn')).toBe(true);
    expect(isSkippedMeal('Dậy muộn – không ăn')).toBe(true);
    expect(isSkippedMeal('ăn nhiều')).toBe(false);
    expect(shorts('Không ăn')).toEqual(['Bỏ bữa']);
  });
});

describe('warnings from a meal’s numbers', () => {
  const n = (over: Partial<Parameters<typeof mealWarnings>[0]> = {}) => ({ kcal: 500, proteinG: 30, purineMg: 100, sugarG: 5, sodiumMg: 800, main: true, ...over });
  const keys = (x: ReturnType<typeof mealWarnings>) => x.map((w) => w.key);

  it('is quiet for an ordinary meal', () => {
    expect(mealWarnings(n(), th)).toEqual([]);
  });

  it('flags a meal over 75% of the daily sodium, 50% of the purine, 15 g sugar, 1,000 kcal', () => {
    expect(keys(mealWarnings(n({ sodiumMg: 1500 }), th))).toEqual([]); // exactly 75% of 2,000 is allowed
    expect(keys(mealWarnings(n({ sodiumMg: 1501 }), th))).toEqual(['sodium']);
    expect(keys(mealWarnings(n({ purineMg: 300 }), th))).toEqual([]);
    expect(keys(mealWarnings(n({ purineMg: 301 }), th))).toEqual(['purine']);
    expect(keys(mealWarnings(n({ sugarG: 15 }), th))).toEqual([]);
    expect(keys(mealWarnings(n({ sugarG: 16 }), th))).toEqual(['sugar']);
    expect(keys(mealWarnings(n({ kcal: 1000 }), th))).toEqual([]);
    expect(keys(mealWarnings(n({ kcal: 1001 }), th))).toEqual(['heavy']);
  });

  it('scales to the user’s own limits', () => {
    const strict = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 400, saltG: 3, sugarG: 20 } });
    expect(keys(mealWarnings(n({ sodiumMg: 1000, purineMg: 250, sugarG: 10 }), strict))).toEqual(['sodium', 'purine', 'sugar']);
  });

  it('asks a main meal for protein, but not a snack or a small meal', () => {
    expect(keys(mealWarnings(n({ kcal: 300, proteinG: 14 }), th))).toEqual(['lowProtein']);
    expect(keys(mealWarnings(n({ kcal: 300, proteinG: 15 }), th))).toEqual([]);
    expect(keys(mealWarnings(n({ kcal: 250, proteinG: 5 }), th))).toEqual([]);
    expect(keys(mealWarnings(n({ kcal: 300, proteinG: 5, main: false }), th))).toEqual([]);
  });
});

let seq = 0;
const item = (dateKey: string, text: string, over: Partial<DiaryItem> = {}): DiaryItem => ({
  id: `i${++seq}`,
  dateKey,
  text,
  mealTime: null,
  kcal: 0,
  proteinG: 0,
  purineMg: 0,
  sugarG: 0,
  sodiumMg: 0,
  ...over,
});

describe('diary items', () => {
  const extra = (id: string, name: string, over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({ id, name, calories: 400, proteinG: 20, loggedAtISO: '2026-10-05T05:00:00.000Z', mealTime: 'lunch', ...over });

  it('flattens off-plan foods with salt as sodium, and ticked plan meals with their dishes', () => {
    const logs: Record<string, DailyNutritionLog> = {
      '2026-10-05': { dateISO: '2026-10-05', mealsEaten: { meal2: true }, extraCalories: 400, extraProteinG: 20, extraItems: [extra('x1', 'Phở bò', { saltG: 4, purineMg: 80, sugarG: 2 })], waterMl: 0 },
    };
    const items = buildDiaryItems(logs, DEFAULT_MEAL_TEMPLATES);
    expect(items).toHaveLength(2);
    const plan = items.find((i) => i.id === '2026-10-05:meal2')!;
    expect(plan.mealTime).toBe('lunch');
    expect(plan.text.length).toBeGreaterThan(3);
    const phở = items.find((i) => i.id === 'x1')!;
    expect(phở).toMatchObject({ text: 'Phở bò', kcal: 400, proteinG: 20, purineMg: 80, sugarG: 2, mealTime: 'lunch' });
    expect(phở.sodiumMg).toBeCloseTo(1600, 6); // 4 g salt = 1,600 mg sodium
    expect(isMainMeal('breakfast') && isMainMeal('dinner') && isMainMeal('lunch')).toBe(true);
    expect(isMainMeal('morning_snack') || isMainMeal(null)).toBe(false);
  });
});

describe('repeats within 3 days', () => {
  it('needs the rule’s own count (never fewer than two) inside the 3 days ending that day', () => {
    // "xúc xích" allows 2 in 3 days
    const items = [item('2026-10-03', '1 xúc xích'), item('2026-10-05', 'xúc xích nướng')];
    expect(repeatsOnDay('2026-10-05', items).map((h) => [h.rule.short, h.count])).toEqual([['Xúc xích', 2]]);
    // 4 days apart is not a repeat
    expect(repeatsOnDay('2026-10-07', [item('2026-10-03', 'xúc xích'), item('2026-10-07', 'xúc xích')])).toEqual([]);
    // "pate" allows 1, but a single item is never a repeat
    expect(repeatsOnDay('2026-10-05', [item('2026-10-05', 'bánh mì pate')])).toEqual([]);
    expect(repeatsOnDay('2026-10-05', [item('2026-10-04', 'bánh mì pate'), item('2026-10-05', 'bánh mì pate')]).map((h) => h.count)).toEqual([2]);
    // "snack" allows 3 in 3 days
    const snacks = [item('2026-10-03', 'snack'), item('2026-10-04', 'snack'), item('2026-10-05', 'snack')];
    expect(repeatsOnDay('2026-10-05', snacks.slice(1))).toEqual([]);
    expect(repeatsOnDay('2026-10-05', snacks).map((h) => h.count)).toEqual([3]);
    // "ức gà" is good with a threshold of 4: purine adds up
    const chicken = [2, 3, 4, 5].map((d) => item(`2026-10-0${d}`, 'ức gà áp chảo'));
    expect(repeatsOnDay('2026-10-05', chicken)).toEqual([]); // only 3 fall inside the window
    expect(repeatsOnDay('2026-10-05', [...chicken, item('2026-10-05', 'ức gà luộc')]).map((h) => h.count)).toEqual([4]);
  });

  it('reports only foods eaten on that day, and never counts a false keyword hit', () => {
    const items = [item('2026-10-03', 'xúc xích'), item('2026-10-04', 'xúc xích'), item('2026-10-05', 'cơm trắng')];
    expect(repeatsOnDay('2026-10-05', items)).toEqual([]);
    // "mì tôm" three times must not be counted as shrimp
    const noodles = ['2026-10-03', '2026-10-04', '2026-10-05'].map((d) => item(d, 'mì tôm'));
    const hits = repeatsOnDay('2026-10-05', noodles).map((h) => h.rule.short);
    expect(hits).toEqual(['Mì gói']);
  });

  it('counts different spellings of one food together', () => {
    const items = [item('2026-10-04', 'mì tôm'), item('2026-10-05', 'mì indo trộn')];
    expect(repeatsOnDay('2026-10-05', items).map((h) => [h.rule.short, h.count])).toEqual([['Mì gói', 2]]);
    expect(repeatsOnDay('2026-10-05', [item('2026-10-04', 'bún thang'), item('2026-10-05', 'miến thang')]).map((h) => h.rule.short)).toEqual(['Bún / miến nước']);
  });

  it('counts the food being typed as one more', () => {
    const history = [item('2026-10-04', 'xúc xích')];
    expect(repeatsForDraft('2 xúc xích', '2026-10-05', history).map((h) => [h.rule.short, h.count])).toEqual([['Xúc xích', 2]]);
    expect(repeatsForDraft('trứng luộc', '2026-10-05', history)).toEqual([]);
    expect(repeatsForDraft('xúc xích', '2026-10-05', [])).toEqual([]);
  });

  it('lists foods that came up at least three times in a period, most often first, without the good ones', () => {
    const items = [
      ...[1, 2, 3, 4].map((d) => item(`2026-10-0${d}`, 'tôm rang')),
      ...[1, 2, 3].map((d) => item(`2026-10-0${d}`, 'xúc xích')),
      ...[1, 2, 3, 4, 5].map((d) => item(`2026-10-0${d}`, 'lòng trắng')),
      item('2026-10-05', 'phở'),
      item('2026-10-20', 'tôm'), // outside the period
    ];
    const out = frequentFoods(items, '2026-10-01', '2026-10-07');
    expect(out.map((h) => [h.rule.short, h.count])).toEqual([['Tôm', 4], ['Xúc xích', 3]]);
    expect(frequentFoods(items, '2026-10-01', '2026-10-07', 5)).toEqual([]);
  });
});

describe('what to do tomorrow', () => {
  const row = (dateKey: string, over: Partial<DayRow> = {}): DayRow => ({
    dateKey,
    kcal: 1600,
    proteinG: 120,
    purineMg: 300,
    sugarG: 10,
    sodiumMg: 1800,
    exerciseKcal: 200,
    tdee: 2600,
    deficit: 1200,
    cumDeficit: 0,
    complete: true,
    missing: [],
    ...over,
  });
  const keys = (r: DayRow, rows: DayRow[] = [r], items: DiaryItem[] = []): AdviceKey[] => adviceFor(r, rows, items, th).map((a) => a.key);
  const D = '2026-10-10';

  it('calls an ordinary good day very good', () => {
    expect(keys(row(D))).toEqual(['veryGood']);
  });

  it('asks for missing meals and warns about eating too little', () => {
    expect(keys(row(D, { complete: false, missing: ['dinner'] }))).toEqual(['missing']);
    expect(keys(row(D, { kcal: 1200, deficit: 1400 }))).toEqual(['lowKcal']);
    expect(keys(row(D, { kcal: 1200, complete: false, missing: ['lunch'] }))).toEqual(['missing']); // not judged on an incomplete day
  });

  it('notices skipped meals and alcohol (but not beer-steamed dishes)', () => {
    expect(keys(row(D), [row(D)], [item(D, 'Không ăn')])).toContain('skipped');
    expect(keys(row(D), [row(D)], [item(D, '2 lon bia')])).toContain('alcohol');
    expect(keys(row(D), [row(D)], [item(D, 'ngao hấp bia')])).not.toContain('alcohol');
    expect(keys(row(D), [row(D)], [item(D, 'uống rượu vang')])).toContain('alcohol');
  });

  it('tells a salt streak from one salty day', () => {
    const [a, b, c] = ['2026-10-08', '2026-10-09', D].map((k) => row(k, { sodiumMg: 2500 }));
    expect(keys(c, [a, b, c])).toContain('sodiumStreak');
    expect(keys(c, [a, b, c])).not.toContain('sodiumHigh');
    const high = row(D, { sodiumMg: 3500 });
    expect(keys(high, [high])).toContain('sodiumHigh');
    expect(keys(high, [high])).not.toContain('sodiumStreak');
    expect(keys(row(D, { sodiumMg: 2500 }))).not.toContain('sodiumHigh'); // over the limit but under the "very high" line
  });

  it('tells a purine streak from one high day', () => {
    const y = row('2026-10-09', { purineMg: 700 });
    const t = row(D, { purineMg: 700 });
    expect(keys(t, [y, t])).toContain('purineStreak');
    expect(keys(t, [t])).toContain('purineOver');
    expect(keys(t, [t])).not.toContain('purineStreak');
  });

  it('warns about a calorie surplus and about two low-deficit days in a row', () => {
    expect(keys(row(D, { deficit: -100, kcal: 2800 }))).toContain('surplus');
    const y = row('2026-10-09', { deficit: 300 });
    const t = row(D, { deficit: 300 });
    expect(keys(t, [y, t])).toContain('lowDeficitStreak');
    expect(keys(t, [t])).not.toContain('lowDeficitStreak');
    expect(keys(row(D, { deficit: -100 }), [row(D, { deficit: -100 })])).not.toContain('lowDeficitStreak'); // surplus takes over
  });

  it('asks for protein on a complete day under target, and flags sugar over the limit', () => {
    expect(keys(row(D, { proteinG: 80 }))).toContain('lowProtein');
    expect(keys(row(D, { proteinG: 80, complete: false, missing: ['lunch'] }))).not.toContain('lowProtein');
    expect(keys(row(D, { sugarG: 40 }))).toContain('sugar');
  });

  it('nudges to move after a week without exercise, and says when only salt spoils a good day', () => {
    const none = (k: string) => row(k, { exerciseKcal: 0 });
    expect(keys(none(D), [none(D)])).toContain('noExercise');
    expect(keys(row(D, { exerciseKcal: 0 }), [row(addDaysToKey(D, -3), { exerciseKcal: 300 }), row(D, { exerciseKcal: 0 })])).not.toContain('noExercise');
    expect(keys(row(D, { sodiumMg: 2500 }))).toContain('goodSaltOnly');
    expect(keys(row(D, { sodiumMg: 2500 }))).not.toContain('veryGood');
    expect(keys(row(D, { deficit: 100, proteinG: 60, purineMg: 900, sugarG: 60, sodiumMg: 4000 }))).not.toEqual(expect.arrayContaining(['veryGood']));
  });
});

describe('a day’s feedback', () => {
  const rows: DayRow[] = [
    { dateKey: '2026-10-05', kcal: 1500, proteinG: 120, purineMg: 300, sugarG: 10, sodiumMg: 1800, exerciseKcal: 0, tdee: 2500, deficit: 1000, cumDeficit: 1000, complete: true, missing: [] },
  ];

  it('is null for a day with nothing on record', () => {
    expect(buildDayFeedback('2026-10-06', [], rows, th)).toBeNull();
  });

  it('gathers foods to swap once each, repeats, a comment per food, and tomorrow’s advice', () => {
    const items = [
      item('2026-10-04', 'mì tôm'),
      item('2026-10-05', 'mì indo + lòng trắng', { mealTime: 'lunch', kcal: 600, proteinG: 30, sodiumMg: 1700 }),
      item('2026-10-05', 'Không ăn', { mealTime: 'dinner' }),
    ];
    const fb = buildDayFeedback('2026-10-05', items, rows, th)!;
    expect(fb.replace.map((r) => r.short)).toEqual(['Mì gói', 'Bỏ bữa']); // one entry for the noodles although two keywords matched; the skipped meal is listed too
    expect(fb.repeats.map((r) => [r.rule.short, r.count])).toEqual([['Mì gói', 2]]); // "mì tôm" yesterday and "mì indo" today are the same food
    expect(fb.items).toHaveLength(2);
    expect(fb.items[0].lines.map((l) => l.short)).toEqual(['Lòng trắng trứng', 'Mì gói']);
    expect(fb.items[0].warnings.map((w) => w.key)).toEqual(['sodium']);
    expect(fb.items[1].lines.map((l) => l.short)).toEqual(['Bỏ bữa']);
    expect(fb.items[1].warnings).toEqual([]); // a skipped meal is not judged by its numbers
    expect(fb.advice.map((a) => a.key)).toContain('skipped');
    expect(fb.score).toBe(10);
  });
});

describe('copy', () => {
  it('fills placeholders in both languages', () => {
    expect(formatFeedbackText('vi', 'fb.score', { s: 8 })).toBe('Điểm 8/10');
    expect(formatFeedbackText('en', 'fb.score', { s: 8 })).toBe('Score 8/10');
    expect(formatFeedbackText('en', 'fb.a.veryGood')).toContain('very good day');
  });
});
