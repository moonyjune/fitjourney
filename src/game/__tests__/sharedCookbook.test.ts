import { describe, expect, it } from '@jest/globals';
import type { DinnerBrief } from '../../ai/dinner';
import { cleanSearch, ideaFromSharedRow, pickShared } from '../../cookbook/shared';
import { recipeFromIdea } from '../../cookbook/recipes';
import { cookbookNameKey, cookbookRow, cookbookRows } from '../../../supabase/functions/_shared/cookbook';

const BRIEF: DinnerBrief = { hour: 7, meal: 'breakfast', budgetKcal: 600, proteinLeftG: 40, headroom: { purine: 300, salt: 2, sugar: 6 }, limits: { purine: 1200, salt: 7, sugar: 25 } };
const row = (name: string, over: Record<string, unknown> = {}) => ({ name, description: 'Dễ làm.', meal: 'breakfast', calories: 550, protein_g: '30', purine_mg: 100, salt_g: 1, sugar_g: 2, emoji: '🍳', minutes: 10, difficulty: 1, equipment: ['chảo'], ingredients: [{ name: 'Trứng', quantity: '2 quả' }], steps: ['Chiên'], ...over });

describe('shared cookbook rows (server and app)', () => {
  it('turns an AI option or an idea of the app into a bounded row, and skips unusable ones', () => {
    const r = cookbookRow({ name: '  Cá  hấp <b> ', calories: 480.6, proteinG: 35.26, purineMg: 150, saltG: 1.25, how: 'Hấp 10 phút.', emoji: '🐟', minutes: 20, difficulty: 9, steps: ['Rửa', 'Hấp'], ingredients: [{ name: 'Cá', quantity: '200g' }, { quantity: 'x' }] }, 'dinner', 'u1');
    expect(r).toMatchObject({ name: 'Cá hấp b', calories: 481, protein_g: 35.3, purine_mg: 150, salt_g: 1.3, sugar_g: 0, description: 'Hấp 10 phút.', meal: 'dinner', emoji: '🐟', minutes: 20, difficulty: null, steps: ['Rửa', 'Hấp'], ingredients: [{ name: 'Cá', quantity: '200g' }], created_by: 'u1' });
    // The app's idea keeps its recipe under `recipe`.
    const idea = { name: 'Trứng ốp', calories: 300, proteinG: 20, purineMg: 0, saltG: 0, sugarG: 0, source: 'ai', recipe: { minutes: 5, steps: ['Chiên'] } };
    expect(cookbookRow(idea, 'brunch', 'u1')).toMatchObject({ minutes: 5, steps: ['Chiên'], meal: null });
    expect(cookbookRow({ name: '', calories: 100 }, 'dinner', 'u1')).toBeNull();
    expect(cookbookRow({ name: 'X', calories: -1 }, 'dinner', 'u1')).toBeNull();
  });

  it('keeps one row per normalised name', () => {
    const rows = cookbookRows([{ name: 'Phở Gà', calories: 400 }, { name: 'phở  gà ', calories: 420 }, { name: 'Bún', calories: 380 }], 'lunch', 'u1');
    expect(rows.map((x) => x.name)).toEqual(['Phở Gà', 'Bún']);
    expect(cookbookNameKey(' Phở   Gà ')).toBe('phở gà');
    expect(cookbookRows('nope', 'lunch', 'u1')).toEqual([]);
  });
});

describe('suggesting from the shared cookbook', () => {
  it('reads a row back as an idea marked as shared, with its recipe', () => {
    const idea = ideaFromSharedRow(row('Trứng chiên'))!;
    expect(idea).toMatchObject({ name: 'Trứng chiên', calories: 550, proteinG: 30, source: 'shared', how: 'Dễ làm.', recipe: { emoji: '🍳', minutes: 10, steps: ['Chiên'] } });
    expect(ideaFromSharedRow({ name: 'X' })).toBeNull();
    expect(recipeFromIdea(idea).source).toBe('ai'); // saved to the user's own cook book as an AI dish
  });

  it('picks at most 3 that fit the meal, not the ones on screen, the same kind of meal first', () => {
    const rows = [
      row('Bữa tối 1', { meal: 'dinner' }),
      row('Quá nhiều kcal', { calories: 1500 }),
      row('Đang hiện'),
      row('Sáng 1'),
      row('Sáng 2'),
      row('sáng  1'),
      row('Sáng 3'),
    ];
    const picked = pickShared(rows, BRIEF, ['Đang hiện']);
    expect(picked.map((i) => i.name)).toEqual(['Sáng 1', 'Sáng 2', 'Sáng 3']);
    expect(pickShared(rows, BRIEF, [], 10).map((i) => i.name)).toEqual(['Đang hiện', 'Sáng 1', 'Sáng 2', 'Sáng 3', 'Bữa tối 1']);
  });

  it('cleans the search text for the ilike filter', () => {
    expect(cleanSearch('  gà, (luộc)% *  ')).toBe('gà luộc');
    expect(cleanSearch('a'.repeat(100))).toHaveLength(60);
  });
});
