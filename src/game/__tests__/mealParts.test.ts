import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({ pushNutritionLog: jest.fn(), pushUserData: jest.fn(), pushProofPhoto: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import { cleanParts, joinTitle, MAX_PARTS, partsFromComponents, partsMatchTotals, sumParts } from '../../food/mealParts';
import { buildTimeline } from '../../game/timeline';
import { DEFAULT_PLAN } from '../../constants/plan';
import { mergeNutrition } from '../../sync/restore';
import { useNutritionStore } from '../../store/useNutritionStore';

const OATS = { name: 'Yến mạch 30g', calories: 110, proteinG: 4, purineMg: 20, saltG: 0, sugarG: 1 };
const YOGURT = { name: 'Sữa chua không đường 100g', calories: 60, proteinG: 4, purineMg: 5, saltG: 0.1, sugarG: 4 };
const MILK = { name: 'Sữa tươi không đường 50ml', calories: 30, proteinG: 1.7, purineMg: 3, saltG: 0.05, sugarG: 2.4 };

describe('joinTitle', () => {
  it('is the one description: the names in order joined with ", ", tidied, blanks dropped', () => {
    expect(joinTitle(['Yến mạch 30g', ' Sữa chua  không đường 100g ', '', 'Sữa tươi không đường 50ml'])).toBe('Yến mạch 30g, Sữa chua không đường 100g, Sữa tươi không đường 50ml');
    expect(joinTitle([])).toBe('');
    expect(joinTitle(['  '])).toBe('');
  });
});

describe('cleanParts', () => {
  it('keeps well-formed parts with only the non-zero optional figures, rounded', () => {
    expect(cleanParts([OATS, YOGURT])).toEqual([
      { name: 'Yến mạch 30g', calories: 110, proteinG: 4, purineMg: 20, sugarG: 1 },
      { name: 'Sữa chua không đường 100g', calories: 60, proteinG: 4, purineMg: 5, saltG: 0.1, sugarG: 4 },
    ]);
  });

  it('is empty for fewer than 2 usable parts (one food is not a breakdown), a non-list, and junk', () => {
    expect(cleanParts([OATS])).toEqual([]);
    expect(cleanParts(undefined)).toEqual([]);
    expect(cleanParts('x')).toEqual([]);
    expect(cleanParts([OATS, { name: '  ', calories: 5, proteinG: 1 }])).toEqual([]);
  });

  it('drops parts with a bad name or out-of-range figures, and caps at 12', () => {
    expect(cleanParts([OATS, YOGURT, { name: 'x', calories: -5, proteinG: 1 }, { name: 'y', calories: 'a', proteinG: 1 }, { name: 'z', calories: 99999, proteinG: 1 }, null, 7])).toHaveLength(2);
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Món ${i}`, calories: 10, proteinG: 1 }));
    expect(cleanParts(many)).toHaveLength(MAX_PARTS);
    expect(cleanParts([OATS, { ...YOGURT, name: 'a'.repeat(300) }])[1].name).toHaveLength(120);
  });
});

describe('sumParts and partsMatchTotals', () => {
  it('adds the parts up (the example: oats 30g + yogurt 100g + milk 50ml)', () => {
    expect(sumParts([OATS, YOGURT, MILK])).toEqual({ calories: 200, proteinG: 9.7, purineMg: 28, saltG: 0.15, sugarG: 7.4 });
    expect(sumParts([])).toEqual({ calories: 0, proteinG: 0, purineMg: 0, saltG: 0, sugarG: 0 });
  });

  it('the parts describe the meal while their calories are within 5% (at least 10 kcal) of its own', () => {
    const parts = cleanParts([OATS, YOGURT, MILK]); // 200 kcal
    expect(partsMatchTotals({ calories: 200, parts })).toBe(true);
    expect(partsMatchTotals({ calories: 210, parts })).toBe(true); // 10 kcal slack
    expect(partsMatchTotals({ calories: 211, parts })).toBe(false);
    expect(partsMatchTotals({ calories: 190, parts })).toBe(true);
    expect(partsMatchTotals({ calories: 189, parts })).toBe(false);
    const big = cleanParts([{ name: 'a', calories: 1000, proteinG: 1 }, { name: 'b', calories: 1000, proteinG: 1 }]); // parts add up to 2000; 5% is taken of the meal's own calories
    expect(partsMatchTotals({ calories: 2105, parts: big })).toBe(true); // 105 apart, 5% of 2105 is 105.25
    expect(partsMatchTotals({ calories: 2106, parts: big })).toBe(false); // 106 apart, 5% of 2106 is 105.3
  });

  it('is false without parts or with only one', () => {
    expect(partsMatchTotals({ calories: 200 })).toBe(false);
    expect(partsMatchTotals({ calories: 110, parts: [{ name: 'a', calories: 110, proteinG: 1 }] })).toBe(false);
  });
});

describe('partsFromComponents (the AI\'s answer)', () => {
  it('reads caloriesKcal as calories and needs 2 or more usable components', () => {
    expect(partsFromComponents([{ name: 'Yến mạch 30g', caloriesKcal: 110, proteinG: 4 }, { name: 'Sữa tươi 50ml', caloriesKcal: 30, proteinG: 1.7, sugarG: 2.4 }])).toEqual([
      { name: 'Yến mạch 30g', calories: 110, proteinG: 4 },
      { name: 'Sữa tươi 50ml', calories: 30, proteinG: 1.7, sugarG: 2.4 },
    ]);
    expect(partsFromComponents([{ name: 'Một món', caloriesKcal: 110, proteinG: 4 }])).toEqual([]);
    expect(partsFromComponents(null)).toEqual([]);
    expect(partsFromComponents([{ name: 'a', caloriesKcal: 'x', proteinG: 1 }, null])).toEqual([]);
  });
});

describe('a meal with parts in the log', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 9, 23, 23, 5) });
    useNutritionStore.setState({ logs: {} });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('addExtra keeps well-formed parts on the one entry, and none for a single food or junk', () => {
    const { addExtra } = useNutritionStore.getState();
    addExtra('2026-10-23', 'Yến mạch 30g, Sữa chua không đường 100g, Sữa tươi không đường 50ml', 200, 9.7, 'breakfast', { parts: [OATS, YOGURT, MILK], purineMg: 28 });
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Một món', 100, 5, 'lunch', { parts: [OATS] });
    jest.advanceTimersByTime(5);
    addExtra('2026-10-23', 'Rác', 100, 5, 'lunch', { parts: 'x' as never });
    const items = useNutritionStore.getState().logs['2026-10-23'].extraItems;
    expect(items).toHaveLength(3);
    expect(items[0].parts?.map((p) => p.name)).toEqual(['Yến mạch 30g', 'Sữa chua không đường 100g', 'Sữa tươi không đường 50ml']);
    expect(items[1].parts).toBeUndefined();
    expect(items[2].parts).toBeUndefined();
    expect(useNutritionStore.getState().logs['2026-10-23'].extraCalories).toBe(400); // totals count each meal once
  });

  it('the journal timeline has ONE entry for the meal, with its totals, and never the parts', () => {
    useNutritionStore.getState().addExtra('2026-10-23', 'Yến mạch 30g, Sữa chua 100g, Sữa tươi 50ml', 200, 9.7, 'breakfast', { parts: [OATS, YOGURT, MILK], purineMg: 28, saltG: 0.15, sugarG: 7.4 });
    const timeline = buildTimeline({
      dateKey: '2026-10-23', now: new Date(2026, 9, 23, 23, 5), log: useNutritionStore.getState().logs['2026-10-23'], meals: DEFAULT_PLAN.mealTemplates.training,
      waterSchedule: [], workouts: [], feelings: [], photoSlots: new Set(),
    });
    const extras = timeline.filter((i) => i.kind === 'extra');
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatchObject({ name: 'Yến mạch 30g, Sữa chua 100g, Sữa tươi 50ml', kcal: 200, purineMg: 28, saltG: 0.15, sugarG: 7.4 });
    expect(JSON.stringify(timeline)).not.toContain('Sữa tươi không đường 50ml'); // the part names stay out
  });

  it('restoring from the cloud keeps the parts of a meal', () => {
    const rows = [{ entry_date: '2026-10-23', extra_calories: 200, extra_items: [{ id: 'i1', name: 'Bữa sáng', calories: 200, parts: cleanParts([OATS, YOGURT, MILK]) }] }];
    const added = mergeNutrition({}, rows as never);
    expect(added['2026-10-23'].extraItems[0].parts).toHaveLength(3);
  });
});
