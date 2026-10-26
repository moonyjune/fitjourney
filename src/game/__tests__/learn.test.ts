import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { DEFAULT_MEAL_TEMPLATES } from '../../constants/plan';
import { computeInsights } from '../../insights';
import { thresholdsFrom } from '../../insights/thresholds';
import { applyDiaryImport, parseDiaryImport } from '../../import/diaryImport';
import { buildLiveFacts, FACT_TOPICS } from '../../learn/liveFacts';
import { kcalBand, searchSnacks, searchTopics } from '../../learn/search';
import { SNACK_SWAPS } from '../../learn/snackData';
import { EVIDENCE_KEY, formatLearnText, SECTION_KEY } from '../../learn/strings';
import { LEARN_SECTIONS } from '../../learn/types';
import { LEARN_TOPICS } from '../../learn/topicsData';
import { resetAllLocalStores } from '../../store/resetLocalStores';
import { useLearnStore } from '../../store/useLearnStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

describe('reading content', () => {
  it('has the 26 topics, numbered in order, each with text, a section and an evidence level', () => {
    expect(LEARN_TOPICS.map((t) => t.id)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(new Set(LEARN_TOPICS.map((t) => t.title)).size).toBe(26);
    for (const t of LEARN_TOPICS) {
      expect(LEARN_SECTIONS).toContain(t.section);
      expect(['strong', 'medium', 'limited']).toContain(t.evidence);
      expect(t.points.length).toBeGreaterThan(0);
      for (const p of t.points) expect(p.trim().length).toBeGreaterThan(10);
    }
    const count = (s: string) => LEARN_TOPICS.filter((t) => t.section === s).length;
    expect([count('basics'), count('food'), count('habit'), count('gout')]).toEqual([3, 11, 10, 2]);
  });

  it('keeps the workbook’s wording and levels', () => {
    expect(LEARN_TOPICS[0]).toMatchObject({ title: 'Nguyên lý giảm mỡ: cân bằng năng lượng', section: 'basics', evidence: 'strong' });
    expect(LEARN_TOPICS[0].points[0]).toContain('Mỡ chỉ giảm khi năng lượng ăn vào thấp hơn');
    expect(LEARN_TOPICS.find((t) => t.id === 12)).toMatchObject({ evidence: 'limited' }); // apple cider vinegar
    expect(LEARN_TOPICS.find((t) => t.id === 8)).toMatchObject({ evidence: 'medium' });
  });

  it('never points at a worksheet that does not exist in the app', () => {
    const all = LEARN_TOPICS.flatMap((t) => [t.title, ...t.points]).concat(SNACK_SWAPS.flatMap((s) => [s.craving, s.swap, s.portion, s.note ?? '']));
    for (const text of all) {
      expect(text).not.toMatch(/\bsheet\b/i);
      expect(text).not.toMatch(/[A-Za-z]+_[A-Za-z_]+/);
    }
    expect(LEARN_TOPICS.find((t) => t.id === 21)!.points.join(' ')).toContain('Phân tích → Tổng quan');
  });

  it('has the 18 craving swaps with a portion and a kcal figure', () => {
    expect(SNACK_SWAPS).toHaveLength(18);
    expect(new Set(SNACK_SWAPS.map((s) => s.id)).size).toBe(18);
    for (const s of SNACK_SWAPS) {
      expect(s.craving.length).toBeGreaterThan(2);
      expect(s.swap.length).toBeGreaterThan(2);
      expect(s.portion.length).toBeGreaterThan(0);
      expect(Number.isInteger(s.kcal)).toBe(true);
      expect(s.kcal).toBeGreaterThan(0);
    }
    expect(SNACK_SWAPS[0]).toMatchObject({ craving: 'Snack khoai tây, đồ giòn mặn', kcal: 80 });
  });

  it('has a label for every section and evidence level in both languages', () => {
    for (const lang of ['vi', 'en'] as const) {
      for (const k of Object.values(SECTION_KEY)) expect(formatLearnText(lang, k).length).toBeGreaterThan(2);
      for (const k of Object.values(EVIDENCE_KEY)) expect(formatLearnText(lang, k).length).toBeGreaterThan(2);
    }
  });
});

describe('searching', () => {
  it('finds topics by accent-insensitive words in the title or text, and narrows to a section', () => {
    const salt = searchTopics('muoi');
    expect(salt.map((t) => t.id)).toContain(6);
    expect(searchTopics('Giấc ngủ').map((t) => t.id)).toContain(18);
    expect(searchTopics('giac ngu')).toEqual(searchTopics('GIẤC NGỦ'));
    expect(searchTopics('zzzz')).toEqual([]);
    expect(searchTopics('', 'gout').map((t) => t.id)).toEqual([25, 26]);
    expect(searchTopics('', null)).toHaveLength(26);
    expect(searchTopics('natri', 'gout').every((t) => t.section === 'gout')).toBe(true);
  });

  it('needs every word of the query', () => {
    expect(searchTopics('giac ngu cortisol').map((t) => t.id)).toContain(18);
    expect(searchTopics('giac ngu zzzz')).toEqual([]);
  });

  it('finds swaps by craving, replacement or note', () => {
    expect(searchSnacks(SNACK_SWAPS, 'tra sua').map((s) => s.id)).toContain(6);
    expect(searchSnacks(SNACK_SWAPS, 'bong ngo').map((s) => s.id)).toContain(2);
    expect(searchSnacks(SNACK_SWAPS, 'fructose').length).toBeGreaterThan(0); // found in the notes
    expect(searchSnacks(SNACK_SWAPS, '')).toHaveLength(18);
    expect(searchSnacks(SNACK_SWAPS, 'zzzz')).toEqual([]);
  });

  it('colours kcal: up to 100 free, up to 200 once a day, above that a snack meal', () => {
    expect(kcalBand(5)).toBe('free');
    expect(kcalBand(100)).toBe('free');
    expect(kcalBand(101)).toBe('once');
    expect(kcalBand(200)).toBe('once');
    expect(kcalBand(201)).toBe('meal');
    expect(kcalBand(400)).toBe('meal');
  });
});

const th = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 600, saltG: 5, sugarG: 35 } });
let seq = 0;
const food = (name: string, mealTime: ExtraFoodItem['mealTime'], over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: `f${++seq}`,
  name,
  calories: 500,
  proteinG: 40,
  loggedAtISO: '2026-10-05T05:00:00.000Z',
  mealTime,
  ...over,
});
function insightsFor(days: number, perDay: (i: number) => ExtraFoodItem[], weights = true) {
  const logs: Record<string, DailyNutritionLog> = {};
  for (let i = 0; i < days; i++) {
    const key = `2026-10-${String(1 + i).padStart(2, '0')}`;
    const items = perDay(i);
    logs[key] = { dateISO: key, mealsEaten: {}, extraCalories: items.reduce((s, x) => s + x.calories, 0), extraProteinG: items.reduce((s, x) => s + x.proteinG, 0), extraItems: items, waterMl: 0 };
  }
  return computeInsights({
    logs,
    mealTemplates: DEFAULT_MEAL_TEMPLATES,
    workouts: [],
    weights: weights && days > 0
      ? [
          { id: 'a', dateISO: '2026-10-01T12:00:00', weightKg: 110 },
          { id: 'b', dateISO: '2026-10-08T12:00:00', weightKg: 108.5 },
          { id: 'c', dateISO: `2026-10-${String(days).padStart(2, '0')}T12:00:00`, weightKg: 107 },
        ]
      : [],
    tdeeNowKcal: 2500,
    startWeightKg: 110,
    goalWeightKg: 95,
    thresholds: th,
  });
}
const day = (i: number) => [
  food('a', 'breakfast', { calories: 400, proteinG: 30, purineMg: 100, saltG: 2, sugarG: 10 }),
  food('b', 'lunch', { calories: 600, proteinG: 40, purineMg: 700, saltG: 3, sugarG: 10 }),
  food('c', 'dinner', { calories: 500, proteinG: 50, purineMg: 100, saltG: 1, sugarG: 20 }),
];

describe('live facts', () => {
  const base = { thresholds: th, waterByDay: {}, waterTargetMl: 3000, language: 'vi' as const };

  it('turns the last 14 days into one line per topic it bears on', () => {
    const facts = buildLiveFacts({ ...base, insights: insightsFor(15, day) });
    // 1,500 kcal a day against TDEE 2,500 (+13 kcal per kg of body weight difference) => about 1,000+ deficit
    expect(facts[1].key).toBe('learn.f.deficit');
    expect(Number(String(facts[1].params.d).replace('.', ''))).toBeGreaterThan(900);
    expect(facts[4]).toMatchObject({ key: 'learn.f.sugar', params: { g: '40', max: '35' } }); // 10 + 10 + 20
    expect(facts[6]).toMatchObject({ key: 'learn.f.sodium', params: { mg: '2.400', max: '2.000', n: 14, d: 14 } }); // 6 g salt = 2,400 mg; the first day is outside the window
    expect(facts[7]).toMatchObject({ key: 'learn.f.protein', params: { g: '120', t: '110' } });
    expect(facts[25]).toMatchObject({ key: 'learn.f.purine', params: { mg: '900', max: '600', n: 14 } });
    expect(FACT_TOPICS.sodium).toEqual([6]);
  });

  it('adds the water line for both topics about water, and the efficiency from the weigh-ins', () => {
    const facts = buildLiveFacts({ ...base, insights: insightsFor(15, day) });
    expect(facts[3]).toEqual(facts[21]);
    expect(facts[3].key).toBe('learn.f.water');
    expect(String(facts[3].params.lvl).length).toBeGreaterThan(3);
    expect(facts[15].key).toBe('learn.f.eff');
    expect(Number(String(facts[15].params.e).replace(',', '.'))).toBeGreaterThan(0.3);
  });

  it('leaves out what has no data: no weigh-ins, no water, no days', () => {
    const noWeights = buildLiveFacts({ ...base, insights: insightsFor(15, day, false) });
    expect(noWeights[3]).toBeUndefined();
    expect(noWeights[21]).toBeUndefined();
    expect(noWeights[15]).toBeUndefined();
    expect(noWeights[14]).toBeUndefined();
    expect(noWeights[6]).toBeDefined();
    expect(buildLiveFacts({ ...base, insights: insightsFor(0, day) })).toEqual({});
    // weigh-ins without any meal on record say nothing about fat versus water either
    const onlyWeights = computeInsights({ logs: {}, mealTemplates: DEFAULT_MEAL_TEMPLATES, workouts: [], weights: [{ id: 'a', dateISO: '2026-10-01T12:00:00', weightKg: 110 }, { id: 'b', dateISO: '2026-10-08T12:00:00', weightKg: 108 }], tdeeNowKcal: 2500, startWeightKg: 110, goalWeightKg: 95, thresholds: th });
    expect(buildLiveFacts({ ...base, insights: onlyWeights })).toEqual({});
  });

  it('averages the water of the last 7 days that have a log, ignoring empty days', () => {
    const waterByDay: Record<string, number> = { '2026-10-15': 3500, '2026-10-14': 2500, '2026-10-13': 0, '2026-10-01': 9000 };
    const facts = buildLiveFacts({ ...base, waterByDay, insights: insightsFor(15, day) });
    expect(facts[14]).toMatchObject({ key: 'learn.f.water7', params: { l: '3,0', t: '3,0' } });
  });

  it('formats the figures for the reader', () => {
    const en = buildLiveFacts({ ...base, language: 'en', insights: insightsFor(15, day) });
    expect(en[6].params.mg).toBe('2,400');
    expect(formatLearnText('en', en[6].key, en[6].params)).toContain('Average sodium 2,400 mg/day');
    expect(formatLearnText('vi', 'learn.f.sodium', { mg: '2.400', max: '2.000', n: 14, d: 14 })).toContain('14/14 ngày vượt');
  });
});

describe('notes from a diary file', () => {
  beforeEach(() => {
    useLearnStore.setState({ notes: {} });
  });
  const file = (learnNotes: unknown) => JSON.stringify({ format: 'fitjourney-diary', version: 1, weights: [], nutrition: [], workouts: [], learnNotes });

  it('loads the notes, keeps earlier ones for other topics, and counts what was set', () => {
    useLearnStore.setState({ notes: { '9': 'cũ' } });
    const parsed = parseDiaryImport(file({ '1': 'Ghi chú 1', '21': 'Ghi chú 21' }));
    if (!parsed.ok) throw new Error('parse');
    expect(applyDiaryImport(parsed.data).notesLoaded).toBe(2);
    expect(useLearnStore.getState().notes).toEqual({ '9': 'cũ', '1': 'Ghi chú 1', '21': 'Ghi chú 21' });
  });

  it('still accepts a file without notes', () => {
    const parsed = parseDiaryImport(JSON.stringify({ format: 'fitjourney-diary', version: 1, weights: [], nutrition: [], workouts: [] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(applyDiaryImport(parsed.data).notesLoaded).toBe(0);
  });

  it.each([
    ['a key that is not a topic number', { abc: 'x' }],
    ['topic zero', { '0': 'x' }],
    ['an empty note', { '1': '  ' }],
    ['a note that is not text', { '1': 5 }],
    ['an overlong note', { '1': 'x'.repeat(2001) }],
    ['notes that are a list', ['x']],
  ])('rejects the whole file on %s', (_name, notes) => {
    expect(parseDiaryImport(file(notes))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is cleared when the signed-in account changes', () => {
    useLearnStore.setState({ notes: { '1': 'x' } });
    resetAllLocalStores();
    expect(useLearnStore.getState().notes).toEqual({});
  });
});
