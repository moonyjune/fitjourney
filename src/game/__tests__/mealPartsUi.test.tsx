import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

import { DailyMealBreakdownTable, type DailyLogDraft } from '../../components/DailyMealBreakdownTable';
import { DEFAULT_PLAN } from '../../constants/plan';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { ExtraFoodItem } from '../../types';

const meals = DEFAULT_PLAN.mealTemplates.training;
const TITLE = 'Yến mạch 30g, Sữa chua không đường 100g, Sữa tươi không đường 50ml';
const meal = (over: Partial<ExtraFoodItem> = {}): ExtraFoodItem => ({
  id: 'm1', name: TITLE, calories: 200, proteinG: 9.7, loggedAtISO: new Date(2026, 9, 23, 8, 0).toISOString(), mealTime: 'breakfast', purineMg: 28, saltG: 0.15, sugarG: 7.4,
  parts: [
    { name: 'Yến mạch 30g', calories: 110, proteinG: 4 },
    { name: 'Sữa chua không đường 100g', calories: 60, proteinG: 4 },
    { name: 'Sữa tươi không đường 50ml', calories: 30, proteinG: 1.7 },
  ],
  ...over,
});

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
const save = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n as never).includes('Lưu'))[0].props.onPress();
const hhmm = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}`;

describe('Profile > Nutrition: a meal with its parts', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });
  useSettingsStore.setState({ language: 'vi' });
  const mount = (props: { editable?: boolean; items?: ExtraFoodItem[]; onSave?: (d: DailyLogDraft) => void }) => {
    act(() => {
      renderer = create(<DailyMealBreakdownTable meals={meals} mealsEaten={{}} extraItems={props.items ?? [meal()]} editable={props.editable} onSave={props.onSave} />);
    });
    return renderer!;
  };
  const input = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === label)[0];

  it('shows the one description as the meal and the parts under it as detail (read-only view)', () => {
    const text = allText(mount({}));
    expect(text).toContain(TITLE);
    expect(text).toContain('Chi tiết');
    expect(text).toContain('• Yến mạch 30g: 110 kcal · 4 g đạm');
    expect(text).toContain('• Sữa tươi không đường 50ml: 30 kcal · 1.7 g đạm');
    expect(text.replace(/\s+/g, '')).toContain('(08:00)');
  });

  it('shows no detail block for a meal without parts', () => {
    const text = allText(mount({ items: [meal({ parts: undefined, name: 'Phở bò' })] }));
    expect(text).toContain('Phở bò');
    expect(text).not.toContain('Chi tiết');
  });

  it('hides the detail once the meal\'s calories no longer match its parts (the parts would be untrue)', () => {
    expect(allText(mount({ items: [meal({ calories: 400 })] }))).not.toContain('Chi tiết');
  });

  it('editable: the time box shows the meal\'s time, and changing it moves the whole meal (its parts have no time of their own)', () => {
    const saved: DailyLogDraft[] = [];
    const r = mount({ editable: true, onSave: (d) => saved.push(d) });
    const box = input(r, 'Giờ ăn (đổi giờ, các món chi tiết đi theo)');
    expect(box.props.value).toBe('08:00');
    act(() => box.props.onChangeText('9h30'));
    expect(allText(r)).toContain('Chi tiết'); // still the same meal, details intact
    act(() => save(r));
    expect(saved).toHaveLength(1);
    const item = saved[0].extraItems[0];
    expect(hhmm(item.loggedAtISO)).toBe('09:30');
    expect(new Date(item.loggedAtISO).getSeconds()).toBe(0);
    expect(new Date(item.loggedAtISO).getDate()).toBe(23); // same day
    expect(item.parts).toHaveLength(3); // the parts travel with the meal
    expect(item.name).toBe(TITLE);
  });

  it('a time that is not a time is only shown as typed: the meal keeps its last good time', () => {
    const saved: DailyLogDraft[] = [];
    const r = mount({ editable: true, onSave: (d) => saved.push(d) });
    const box = input(r, 'Giờ ăn (đổi giờ, các món chi tiết đi theo)');
    act(() => box.props.onChangeText('25:99'));
    expect(input(r, 'Giờ ăn (đổi giờ, các món chi tiết đi theo)').props.value).toBe('25:99');
    act(() => box.props.onChangeText('10:15'));
    act(() => box.props.onChangeText('99'));
    act(() => save(r));
    expect(hhmm(saved[0].extraItems[0].loggedAtISO)).toBe('10:15');
  });
});
