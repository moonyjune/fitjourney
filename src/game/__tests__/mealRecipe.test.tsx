import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockRequest = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
  fetchMealRecipe: jest.fn(async () => null),
  pushMealRecipe: (...a: unknown[]) => mockPush(...a),
  requestMealRecipe: (...a: unknown[]) => mockRequest(...a),
}));

import { buildTasteProfile } from '../../ai/tasteProfile';
import { MealRecipeSuggestion } from '../../components/MealRecipeSuggestion';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { DailyNutritionLog, ExtraFoodItem } from '../../types';

const NOW = new Date('2026-10-23T16:10:00');
const item = (name: string, junk = false): ExtraFoodItem => ({ id: `${name}-${Math.random()}`, name, calories: 300, proteinG: 10, loggedAtISO: '2026-10-20T05:00:00.000Z', mealTime: 'lunch', ...(junk ? { junk: true } : {}) });
const log = (dateISO: string, items: ExtraFoodItem[]): DailyNutritionLog => ({ dateISO, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: items, waterMl: 0 });

describe('buildTasteProfile', () => {
  beforeEach(() => {
    useNutritionStore.setState({ logs: {} });
  });

  it('ranks the foods eaten most in the last 30 days (accents/case/brackets merged, most used spelling kept)', () => {
    useNutritionStore.setState({
      logs: {
        '2026-10-22': log('2026-10-22', [item('Phở bò'), item('Cơm gà'), item('pho bo (lớn)')]),
        '2026-10-21': log('2026-10-21', [item('Phở bò'), item('Cơm gà')]),
        '2026-10-20': log('2026-10-20', [item('Phở bò'), item('Trứng luộc')]),
      },
    });
    expect(buildTasteProfile(NOW).favorites).toEqual(['Phở bò', 'Cơm gà', 'Trứng luộc']);
  });

  it('ignores logs older than 30 days, caps favorites at 8 and dislikes at 5, and keeps junk out of the favorites', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`Món số ${String.fromCharCode(97 + i)}`));
    const junks = Array.from({ length: 8 }, (_, i) => item(`Vặt ${String.fromCharCode(97 + i)}`, true));
    useNutritionStore.setState({
      logs: {
        '2026-10-22': log('2026-10-22', [...many, ...junks]),
        '2026-09-01': log('2026-09-01', [item('Món cũ rích'), item('Món cũ rích'), item('Món cũ rích'), item('Vặt cũ', true)]),
      },
    });
    const taste = buildTasteProfile(NOW);
    expect(taste.favorites).toHaveLength(8);
    expect(taste.favorites).not.toContain('Món cũ rích');
    expect(taste.dislikes).toHaveLength(5);
    expect(taste.dislikes).not.toContain('Vặt cũ');
    expect(taste.favorites.some((n) => n.startsWith('Vặt'))).toBe(false);
  });

  it('is empty without a log and never carries amounts, dates or ids', () => {
    expect(buildTasteProfile(NOW)).toEqual({ favorites: [], dislikes: [] });
    useNutritionStore.setState({ logs: { '2026-10-22': log('2026-10-22', [item('Phở bò')]) } });
    expect(JSON.stringify(buildTasteProfile(NOW))).toBe('{"favorites":["Phở bò"],"dislikes":[]}');
  });
});

describe('MealRecipeSuggestion', () => {
  let renderer: ReactTestRenderer | undefined;
  const text = (r: ReactTestRenderer) => {
    const parts: string[] = [];
    const walk = (n: unknown) => {
      if (n == null) return;
      if (typeof n === 'string') parts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (typeof n === 'object') walk((n as { children?: unknown }).children);
    };
    walk(r.toJSON());
    return parts.join(' ');
  };
  const textOf = (n: { children: unknown[] }): string =>
    n.children.map((c) => (typeof c === 'string' ? c : textOf(c as { children: unknown[] }))).join('');
  const tap = async (r: ReactTestRenderer, includes: string) => {
    const hit = r.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n as never).includes(includes))[0];
    if (!hit) throw new Error(`nothing to tap with "${includes}"`);
    await act(async () => hit.props.onPress());
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi' });
    useNutritionStore.setState({ logs: { [new Date().toISOString().slice(0, 10)]: log('x', [item('Phở bò'), item('Bánh ngọt', true)]) } });
    mockRequest.mockResolvedValue({
      ok: true,
      recipe: { dishName: 'Cơm gà áp chảo', emoji: '🍗', durationMinutes: 25, difficulty: 2, caloriesKcal: 650, proteinG: 45, ingredients: [{ name: 'Ức gà', quantity: '200g' }], equipment: ['Chảo', 'Nồi cơm điện'], tasteNote: 'Cùng gu với phở bò, ít dầu hơn.', steps: ['Ướp gà.', 'Áp chảo.'] },
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('asks for a dish with the user\'s taste, then shows the taste note, the tools, ingredients and steps, and stores it all', async () => {
    await act(async () => {
      renderer = create(<MealRecipeSuggestion dayType="rest" mealSlot="meal1" mealLabel="Bữa 1" targetCalories={700} targetProtein={50} />);
    });
    const r = renderer!;
    const gen = r.root.findAll((n) => typeof n.props.onPress === 'function')[0];
    await act(async () => gen.props.onPress());
    const args = mockRequest.mock.calls[0];
    expect(args.slice(0, 5)).toEqual(['Bữa 1', 'rest', 700, 50, undefined]);
    expect(args[5]).toEqual({ favorites: ['Phở bò'], dislikes: ['Bánh ngọt'] });
    expect(text(r)).toContain('Cơm gà áp chảo');
    expect(text(r)).toContain('Cùng gu với phở bò, ít dầu hơn.');
    expect(mockPush).toHaveBeenCalledWith('rest', 'meal1', expect.objectContaining({ equipment: ['Chảo', 'Nồi cơm điện'], tasteNote: 'Cùng gu với phở bò, ít dầu hơn.' }));
    await tap(r, 'Cách làm');
    const full = text(r);
    expect(full).toContain('Dụng cụ cần dùng');
    expect(full).toContain('Chảo · Nồi cơm điện');
    expect(full).toContain('Ức gà');
    expect(full).toContain('200g');
    expect(full).toContain('Áp chảo.');
  });

  it('shows no tools section for a recipe without any (older cached ones)', async () => {
    mockRequest.mockResolvedValue({ ok: true, recipe: { dishName: 'Cũ', emoji: '🍽️', durationMinutes: 10, difficulty: 1, caloriesKcal: 100, proteinG: 5, ingredients: [], steps: ['x'] } });
    await act(async () => {
      renderer = create(<MealRecipeSuggestion dayType="rest" mealSlot="meal1" mealLabel="Bữa 1" targetCalories={700} targetProtein={50} />);
    });
    await act(async () => renderer!.root.findAll((n) => typeof n.props.onPress === 'function')[0].props.onPress());
    await tap(renderer!, 'Cách làm');
    expect(text(renderer!)).not.toContain('Dụng cụ cần dùng');
  });
});
