import { describe, expect, it } from '@jest/globals';
import { acceptSwap, cleanAiSwaps, MAX_SWAPS, reductionsOf, swapsFromFoods, type SwapContext, type SwapItem } from '../../food/swaps';
import type { FoodEntry } from '../../food/types';

const ITEM: SwapItem = { name: 'Xúc xích chiên', calories: 400, proteinG: 20, purineMg: 1500, saltG: 3, sugarG: 2 };
// Purine and salt would be broken. Purine has 1000 mg of room, salt 4 g, sugar 20 g.
const CTX: SwapContext = { exceeded: ['purine'], headroom: { purine: 1000, salt: 4, sugar: 20 } };
const swap = (over: Partial<SwapItem> = {}): SwapItem => ({ name: 'Ức gà luộc', calories: 380, proteinG: 30, purineMg: 300, saltG: 1, sugarG: 0, ...over });

describe('acceptSwap', () => {
  it('accepts a swap of about the same size, enough protein, an exceeded limit that fits the room left', () => {
    expect(acceptSwap(ITEM, swap(), CTX)).toBe(true);
  });

  it('keeps the size: calories between 40% and 115% of the item', () => {
    expect(acceptSwap(ITEM, swap({ calories: 160 }), CTX)).toBe(true);
    expect(acceptSwap(ITEM, swap({ calories: 159 }), CTX)).toBe(false);
    expect(acceptSwap(ITEM, swap({ calories: 460 }), CTX)).toBe(true);
    expect(acceptSwap(ITEM, swap({ calories: 461 }), CTX)).toBe(false);
  });

  it('keeps at least 60% of the protein', () => {
    expect(acceptSwap(ITEM, swap({ proteinG: 12 }), CTX)).toBe(true);
    expect(acceptSwap(ITEM, swap({ proteinG: 11.9 }), CTX)).toBe(false);
  });

  it('an exceeded limit must fit the room left AND be at most half the item\'s own figure', () => {
    expect(acceptSwap(ITEM, swap({ purineMg: 750 }), CTX)).toBe(true); // ≤ half of 1500 and ≤ room 1000
    expect(acceptSwap(ITEM, swap({ purineMg: 751 }), CTX)).toBe(false); // more than half
    const tight: SwapContext = { exceeded: ['purine'], headroom: { purine: 200, salt: 4, sugar: 20 } };
    expect(acceptSwap(ITEM, swap({ purineMg: 200 }), tight)).toBe(true);
    expect(acceptSwap(ITEM, swap({ purineMg: 201 }), tight)).toBe(false); // half would allow it, the room does not
  });

  it('when the limit is already full (no room), only "at most half the item" is asked', () => {
    const full: SwapContext = { exceeded: ['purine'], headroom: { purine: -100, salt: 4, sugar: 20 } };
    expect(acceptSwap(ITEM, swap({ purineMg: 700 }), full)).toBe(true);
    expect(acceptSwap(ITEM, swap({ purineMg: 800 }), full)).toBe(false);
  });

  it('never newly breaks a limit the original did not: salt and sugar must fit their room', () => {
    expect(acceptSwap(ITEM, swap({ saltG: 4 }), CTX)).toBe(true);
    expect(acceptSwap(ITEM, swap({ saltG: 4.1 }), CTX)).toBe(false);
    expect(acceptSwap(ITEM, swap({ sugarG: 21 }), CTX)).toBe(false);
    // A limit with no room at all (exactly full) takes nothing more.
    expect(acceptSwap(ITEM, swap({ saltG: 0.1 }), { ...CTX, headroom: { ...CTX.headroom, salt: 0 } })).toBe(false);
    expect(acceptSwap(ITEM, swap({ saltG: 0 }), { ...CTX, headroom: { ...CTX.headroom, salt: 0 } })).toBe(true);
    // A limit that is already over (negative room) is not held against the swap.
    expect(acceptSwap(ITEM, swap({ saltG: 5 }), { ...CTX, headroom: { ...CTX.headroom, salt: -1 } })).toBe(true);
  });

  it('rejects negative, NaN or missing figures', () => {
    expect(acceptSwap(ITEM, swap({ purineMg: -1 }), CTX)).toBe(false);
    expect(acceptSwap(ITEM, swap({ calories: NaN }), CTX)).toBe(false);
    expect(acceptSwap(ITEM, { ...swap(), proteinG: undefined as never }, CTX)).toBe(false);
  });
});

describe('reductionsOf', () => {
  it('reports how far each exceeded limit goes down, in whole percent, never below 0', () => {
    expect(reductionsOf(ITEM, swap({ purineMg: 300 }), CTX)).toEqual([{ nutrient: 'purine', pct: 80 }]);
    expect(reductionsOf(ITEM, swap({ purineMg: 2000 }), CTX)).toEqual([{ nutrient: 'purine', pct: 0 }]);
    expect(reductionsOf({ ...ITEM, saltG: 0 }, swap(), { ...CTX, exceeded: ['purine', 'salt'] })).toEqual([{ nutrient: 'purine', pct: 80 }]); // no salt in the original: nothing to compare
  });
});

const food = (name: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: name, name, group: 'poultry', unit: 'g', unitG: 1, kcal: 165, proteinG: 31, purineMg: 100, sugarG: 0, sodiumMg: 70, confidence: 'high', ...over,
});

describe('swapsFromFoods', () => {
  it('scales a food by weight to the calories of the item and checks the result', () => {
    // 400 kcal of a 165 kcal / 100 g food = 242 g → rounded to 240 g: 396 kcal, 74.4 g protein, 240 mg purine.
    const [first] = swapsFromFoods(ITEM, CTX, [food('Ức gà')]);
    expect(first).toMatchObject({ name: 'Ức gà', source: 'db', amount: '240 g', calories: 396, proteinG: 74.4, purineMg: 240, reductions: [{ nutrient: 'purine', pct: 84 }] });
    expect(first.saltG).toBe(0.4); // 70 mg sodium per 100 g x 2.4 / 400
  });

  it('scales a countable food in halves of its unit, between 0.5 and 4', () => {
    const egg = food('Trứng luộc', { group: 'eggDairy', unit: 'quả', unitG: 50, kcal: 150, proteinG: 13, purineMg: 60, sodiumMg: 120 });
    // one egg = 75 kcal; 400 / 75 = 5.3 → capped at 4 eggs = 300 kcal (within 40%..115% of 400)
    const [first] = swapsFromFoods(ITEM, CTX, [egg]);
    expect(first).toMatchObject({ name: 'Trứng luộc', amount: '4 quả', calories: 300 });
  });

  it('leaves out the item itself (accents and case ignored), seasonings, drinks, sweets and snacks, and foods that fail the checks', () => {
    const foods = [
      food('xuc xich CHIEN', { group: 'processed' }),
      food('Nước mắm', { group: 'seasoning' }),
      food('Trà đá', { group: 'drink', kcal: 5, proteinG: 0 }),
      food('Bánh ngọt', { group: 'sweet', kcal: 400, proteinG: 10 }),
      food('Gan heo', { group: 'redMeat', purineMg: 600 }), // 240 g → 1440 mg purine: not under half
      food('Đậu hũ', { group: 'plantProtein', kcal: 80, proteinG: 8, purineMg: 30, sodiumMg: 10 }),
    ];
    expect(swapsFromFoods(ITEM, CTX, foods).map((o) => o.name)).toEqual(['Đậu hũ']);
  });

  it('ranks by how much the exceeded limits come down, a bonus for the item\'s own group, and gives at most 3 distinct names', () => {
    const foods = [
      food('B gà', { group: 'poultry', purineMg: 100 }),
      food('C cá', { group: 'seafood', purineMg: 100 }),
      food('D trứng', { group: 'eggDairy', purineMg: 100 }),
      food('b GÀ', { group: 'poultry', purineMg: 100 }),
      food('A thịt', { group: 'redMeat', purineMg: 100 }), // the only one of the item's own group, last in the list
    ];
    const out = swapsFromFoods({ ...ITEM, name: 'Thịt heo chiên' }, CTX, foods); // guessed group: redMeat
    expect(out).toHaveLength(MAX_SWAPS);
    expect(out[0].name).toBe('A thịt');
    expect(new Set(out.map((o) => o.name.toLowerCase())).size).toBe(MAX_SWAPS);
  });

  it('gives nothing without a limit to fix or without calories, and for an empty database', () => {
    expect(swapsFromFoods(ITEM, { ...CTX, exceeded: [] }, [food('Ức gà')])).toEqual([]);
    expect(swapsFromFoods({ ...ITEM, calories: 0 }, CTX, [food('Ức gà')])).toEqual([]);
    expect(swapsFromFoods(ITEM, CTX, [])).toEqual([]);
  });
});

describe('cleanAiSwaps', () => {
  const good = { name: 'Cá hấp gừng', calories: 380, proteinG: 32, purineMg: 400, saltG: 1.2, sugarG: 0, how: ' Hấp 10 phút ', accuracyPercent: 61.6 };

  it('keeps a swap that holds up, trimmed, with the accuracy rounded and reductions worked out here', () => {
    const [o] = cleanAiSwaps({ swaps: [good] }, ITEM, CTX);
    expect(o).toMatchObject({ name: 'Cá hấp gừng', source: 'ai', calories: 380, how: 'Hấp 10 phút', accuracy: 62, reductions: [{ nutrient: 'purine', pct: 73 }] });
  });

  it('drops what the AI got wrong: a swap that does not pass the rules, the item itself, duplicates, malformed entries', () => {
    const out = cleanAiSwaps(
      { swaps: [
        { ...good, name: 'Quá nhiều purine', purineMg: 1400 },
        { ...good, name: 'xuc xich chien' },
        good,
        { ...good, name: 'CÁ HẤP GỪNG' },
        { ...good, name: ' ' },
        { ...good, name: 'Thiếu calo', calories: 'a lot' },
        null,
        'x',
      ] },
      ITEM, CTX
    );
    expect(out.map((o) => o.name)).toEqual(['Cá hấp gừng']);
  });

  it('caps at 3, clamps accuracy, treats missing nutrients as 0, and ignores a non-list', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `Món ${i}`, calories: 380, proteinG: 30, accuracyPercent: 250 }));
    const out = cleanAiSwaps({ swaps: many }, ITEM, CTX);
    expect(out).toHaveLength(MAX_SWAPS);
    expect(out[0]).toMatchObject({ purineMg: 0, saltG: 0, sugarG: 0, accuracy: 100 });
    expect(cleanAiSwaps({ swaps: 'no' }, ITEM, CTX)).toEqual([]);
    expect(cleanAiSwaps(null, ITEM, CTX)).toEqual([]);
  });
});
