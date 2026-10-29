import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../sync/cloudSync', () => ({
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { DailyMealBreakdownTable, type DailyLogDraft } from '../../components/DailyMealBreakdownTable';
import { DEFAULT_PLAN } from '../../constants/plan';
import { isSkippedMealItem, logSkippedMeal } from '../../food/skipMeal';
import { buildDayRows } from '../../insights/days';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { ExtraFoodItem } from '../../types';

const DAY = '2026-10-28';
const meals = DEFAULT_PLAN.mealTemplates.training;

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}
const textOf = (n: { children: unknown[] }): string => n.children.map((c) => (typeof c === 'string' ? c : textOf(c as { children: unknown[] }))).join('');
const button = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
const save = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n as never).includes('Lưu'))[0].props.onPress();
const food = (over: Partial<ExtraFoodItem>): ExtraFoodItem => ({ id: 'f1', name: 'Phở bò', calories: 450, proteinG: 25, mealTime: 'breakfast', loggedAtISO: new Date(2026, 9, 28, 7, 0).toISOString(), ...over });

describe('logSkippedMeal', () => {
  beforeEach(() => {
    useNutritionStore.setState({ logs: {} });
  });

  it('adds a 0 kcal "Không ăn" item at that meal, once', () => {
    expect(logSkippedMeal(DAY, 'dinner')).toBe(true);
    expect(logSkippedMeal(DAY, 'dinner')).toBe(false);
    const items = useNutritionStore.getState().getLog(DAY).extraItems;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Không ăn', calories: 0, proteinG: 0, mealTime: 'dinner' });
    expect(isSkippedMealItem(items[0])).toBe(true);
    expect(new Date(items[0].loggedAtISO).getDate()).toBe(28);
    // another meal of the same day is its own record
    expect(logSkippedMeal(DAY, 'lunch')).toBe(true);
    expect(useNutritionStore.getState().getLog(DAY).extraItems).toHaveLength(2);
  });

  it('a skipped meal counts as on record: the day is no longer missing it', () => {
    useNutritionStore.getState().addExtra(DAY, 'Phở bò', 450, 25, 'breakfast', { fromFoodDb: true });
    useNutritionStore.getState().addExtra(DAY, 'Cơm gà', 600, 35, 'lunch', { fromFoodDb: true });
    const rows = () => buildDayRows({ logs: useNutritionStore.getState().logs, mealTemplates: DEFAULT_PLAN.mealTemplates, workouts: [], tdeeFor: () => 2000 });
    expect(rows()[0].missing).toEqual(['dinner']);
    logSkippedMeal(DAY, 'dinner');
    expect(rows()[0]).toMatchObject({ complete: true, missing: [], kcal: 1050 });
  });
});

describe('History day table: marking a main meal as not eaten', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });
  useSettingsStore.setState({ language: 'vi' });
  const mount = (props: { items: ExtraFoodItem[]; mealsEaten?: Record<string, boolean>; editable?: boolean; onSave?: (d: DailyLogDraft) => void }) => {
    act(() => {
      renderer = create(<DailyMealBreakdownTable dark meals={meals} mealsEaten={props.mealsEaten ?? {}} extraItems={props.items} dateKey={DAY} editable={props.editable ?? true} onSave={props.onSave} />);
    });
    return renderer!;
  };

  it('offers "Không ăn" only for the main meals with nothing on record', () => {
    // breakfast has a food, lunch's plan meal (meal2 → lunch) is eaten: only dinner is unlogged
    const r = mount({ items: [food({})], mealsEaten: { meal2: true } });
    expect(button(r, 'Đánh dấu không ăn bữa sáng')).toHaveLength(0);
    expect(button(r, 'Đánh dấu không ăn bữa trưa')).toHaveLength(0);
    expect(button(r, 'Đánh dấu không ăn bữa tối').length).toBeGreaterThan(0);
    expect(allText(r)).toContain('Không ăn tối');
  });

  it('pressing it adds a muted "Không ăn" row at that meal, saved with the day; it can be removed again', () => {
    const saved: DailyLogDraft[] = [];
    const r = mount({ items: [food({})], onSave: (d) => saved.push(d) });
    act(() => button(r, 'Đánh dấu không ăn bữa tối')[0].props.onPress());
    expect(button(r, 'Đánh dấu không ăn bữa tối')).toHaveLength(0);
    expect(allText(r)).toContain('⊘ Không ăn');
    act(() => save(r));
    const skipped = saved[0].extraItems.find((i) => i.mealTime === 'dinner')!;
    expect(skipped).toMatchObject({ name: 'Không ăn', calories: 0, proteinG: 0 });
    expect(saved[0].extraItems.filter((i) => i.id === skipped.id)).toHaveLength(1);
    expect(new Set(saved[0].extraItems.map((i) => i.id)).size).toBe(saved[0].extraItems.length);

    // removed with its ✕ like any food (the first ✕ of the extras belongs to "Phở bò", the skipped row comes after it)
    const r2 = mount({ items: [food({}), skipped], onSave: (d) => saved.push(d) });
    expect(button(r2, 'Đánh dấu không ăn bữa tối')).toHaveLength(0);
    const crosses = r2.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === '✕');
    act(() => crosses[crosses.length - 1].props.onPress());
    expect(allText(r2)).not.toContain('⊘ Không ăn');
    act(() => save(r2));
    expect(saved[1].extraItems.map((i) => i.name)).toEqual(['Phở bò']);
  });

  it('a read-only day shows the skipped meal but offers no buttons', () => {
    const r = mount({ items: [food({ id: 's1', name: 'Không ăn', calories: 0, proteinG: 0, mealTime: 'lunch' })], editable: false });
    expect(allText(r)).toContain('⊘ Không ăn');
    expect(r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Đánh dấu không ăn'))).toHaveLength(0);
  });
});
