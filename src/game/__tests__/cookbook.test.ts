import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockPushUserData = jest.fn();
jest.mock('../../sync/cloudSync', () => ({ pushUserData: (...a: unknown[]) => mockPushUserData(...a) }));

import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { cleanCookbook, cleanRecipeDetails, cookbookForCloud, ideaFromRecipe, mergeRecipe, recipeFromIdea, recipesFitting, stepIcon } from '../../cookbook/recipes';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useMealIdeasStore } from '../../store/useMealIdeasStore';

const idea = (over: Partial<DinnerIdea> = {}): DinnerIdea => ({ name: 'Cá hấp gừng', calories: 450, proteinG: 35, purineMg: 100, saltG: 1, sugarG: 2, source: 'ai', ...over });
const brief: DinnerBrief = { hour: 18, budgetKcal: 500, proteinLeftG: 40, headroom: { purine: 400, salt: 4, sugar: 10 }, limits: { purine: 1200, salt: 7, sugar: 25 } };

beforeEach(() => {
  mockPushUserData.mockClear();
  useCookbookStore.setState({ recipes: [] });
  useMealIdeasStore.setState({ byDay: {} });
});

describe('recipe details', () => {
  it('keeps what is usable and bounds the rest', () => {
    const d = cleanRecipeDetails({ emoji: '🐟', minutes: 25.4, difficulty: 9, ingredients: [{ name: 'Cá', quantity: '200g' }, { name: '' }, 5], steps: ['  Rửa cá ', '', 'Hấp'], equipment: ['nồi'] });
    expect(d).toEqual({ emoji: '🐟', minutes: 25, difficulty: 5, ingredients: [{ name: 'Cá', quantity: '200g' }], steps: ['Rửa cá', 'Hấp'], equipment: ['nồi'] });
    expect(cleanRecipeDetails({ minutes: -3, difficulty: 'x', steps: 'no' })).toEqual({});
    expect(cleanRecipeDetails({ steps: Array.from({ length: 30 }, (_, i) => `b${i}`) }).steps).toHaveLength(20);
  });

  it('a step gets an icon from its verb', () => {
    expect(stepIcon('Thái hành')).toBe('🔪');
    expect(stepIcon('Hấp cá 10 phút')).toBe('🍲');
    expect(stepIcon('Áp chảo hai mặt')).toBe('🍳');
    expect(stepIcon('Làm gì đó')).toBe('👩‍🍳');
  });
});

describe('cook book entries', () => {
  it('an idea becomes an entry and back', () => {
    const r = recipeFromIdea(idea({ amount: '1 phần', how: 'Dễ', recipe: { steps: ['a'], minutes: 10 } }), new Date('2026-10-27T00:00:00Z'));
    expect(r).toMatchObject({ id: 'ca hap gung', source: 'ai', amount: '1 phần', how: 'Dễ', steps: ['a'], minutes: 10, createdAtISO: '2026-10-27T00:00:00.000Z' });
    expect(ideaFromRecipe(r)).toMatchObject({ name: 'Cá hấp gừng', source: 'book', recipe: { steps: ['a'], minutes: 10 } });
  });

  it('merging keeps the user\'s rating and photo and what was already known, and fills what was missing', () => {
    const old = { ...recipeFromIdea(idea({ recipe: { steps: ['cũ'] } })), rating: 5, photoUri: 'file:///p.jpg', cookedCount: 2 };
    const merged = mergeRecipe(old, recipeFromIdea(idea({ recipe: { steps: ['mới'], minutes: 15, emoji: '🐟' } })));
    expect(merged).toMatchObject({ rating: 5, photoUri: 'file:///p.jpg', cookedCount: 2, steps: ['cũ'], minutes: 15, emoji: '🐟' });
  });

  it('lists the dishes that fit the meal, best rated first', () => {
    const a = { ...recipeFromIdea(idea({ name: 'Món A' })), rating: 3 };
    const b = { ...recipeFromIdea(idea({ name: 'Món B' })), rating: 5 };
    const tooBig = recipeFromIdea(idea({ name: 'Món to', calories: 900 }));
    expect(recipesFitting([a, tooBig, b], brief).map((r) => r.name)).toEqual(['Món B', 'Món A']);
  });

  it('reads the cloud copy defensively and never takes a photo path from it', () => {
    const raw = { recipes: [{ name: 'Gà luộc', calories: 300, proteinG: 40, rating: 4, photoUri: 'file:///x', steps: ['a'] }, { name: '', calories: 1, proteinG: 1 }, { name: 'Lỗi', calories: -5, proteinG: 1 }, { name: 'gà luộc', calories: 1, proteinG: 1 }] };
    const book = cleanCookbook(raw);
    expect(book).toHaveLength(1);
    expect(book[0]).toMatchObject({ id: 'ga luoc', rating: 4, steps: ['a'] });
    expect('photoUri' in book[0]).toBe(false);
    expect(cleanCookbook(null)).toEqual([]);
    expect(JSON.stringify(cookbookForCloud([{ ...book[0], photoUri: 'file:///x' }]))).not.toContain('file:///x');
  });
});

describe('cook book store', () => {
  it('saves once per dish, rates, counts, removes, and saves each change to the cloud without the photo', () => {
    const s = useCookbookStore.getState();
    s.save(recipeFromIdea(idea()));
    s.save(recipeFromIdea(idea({ calories: 460 }))); // same dish
    expect(useCookbookStore.getState().recipes).toHaveLength(1);
    s.rate('ca hap gung', 4);
    s.markCooked('ca hap gung');
    s.setPhoto('ca hap gung', 'file:///me.jpg');
    s.setDetails('ca hap gung', { steps: ['x'], minutes: 12 });
    expect(useCookbookStore.getState().recipes[0]).toMatchObject({ rating: 4, cookedCount: 1, steps: ['x'], minutes: 12 });
    const last = mockPushUserData.mock.calls.at(-1) as [string, { recipes: Record<string, unknown>[] }];
    expect(last[0]).toBe('cookbook');
    expect(last[1].recipes[0].rating).toBe(4);
    expect('photoUri' in last[1].recipes[0]).toBe(false);
    s.rate('ca hap gung', 0);
    expect(useCookbookStore.getState().recipes[0].rating).toBeUndefined();
    s.remove('ca hap gung');
    expect(useCookbookStore.getState().recipes).toEqual([]);
  });

  it('merging the cloud copy adds only dishes the device lacks and does not push', () => {
    useCookbookStore.getState().save(recipeFromIdea(idea()));
    mockPushUserData.mockClear();
    const added = useCookbookStore.getState().merge(cleanCookbook({ recipes: [{ name: 'Cá hấp gừng', calories: 1, proteinG: 1 }, { name: 'Gà luộc', calories: 300, proteinG: 40 }] }));
    expect(added).toBe(1);
    expect(useCookbookStore.getState().recipes.find((r) => r.name === 'Cá hấp gừng')!.calories).toBe(450);
    expect(mockPushUserData).not.toHaveBeenCalled();
  });
});

describe('kept meal ideas', () => {
  it('keeps three days and forgets older ones', () => {
    const s = useMealIdeasStore.getState();
    for (const d of ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']) s.set(d, 'dinner', [idea()]);
    expect(Object.keys(useMealIdeasStore.getState().byDay)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(s.get('2026-10-26', 'dinner')).toHaveLength(1);
    expect(s.get('2026-10-26', 'lunch')).toBeUndefined();
    s.set('2026-10-26', 'lunch', []);
    expect(useMealIdeasStore.getState().get('2026-10-26', 'lunch')).toEqual([]); // asked, nothing fit
  });
});
