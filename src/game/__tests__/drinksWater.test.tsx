import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { editExtraWhen, logExtraAgain } from '../../food/mealActions';
import { useNutritionStore } from '../../store/useNutritionStore';
import { dayWaterMl, drinkMlOf, suggestedDrinkMl } from '../../water/drinks';
import { rowWaterMl } from '../../../supabase/functions/_shared/pushPlan';
import { MealWhenForm } from '../../components/quest/MealWhenForm';

const DAY = '2026-11-08';

describe('drinks counted as water', () => {
  beforeEach(() => {
    useNutritionStore.setState({ logs: {} });
  });

  it('reads the millilitres of a drink from its name, a glass when none is written, nothing for food', () => {
    expect(drinkMlOf('Sữa đậu nành 250ml')).toBe(250);
    expect(drinkMlOf('0,5 l nước cam')).toBe(500);
    expect(drinkMlOf('Cà phê sữa')).toBe(250);
    expect(drinkMlOf('2 ly trà đá')).toBe(500);
    expect(drinkMlOf('Coffee latte 350 ml')).toBe(350);
    expect(drinkMlOf('Sữa chua 100g')).toBe(0);
    expect(drinkMlOf('Sữa chua uống 180ml')).toBe(180);
    expect(drinkMlOf('Cá tra kho')).toBe(0);
    expect(drinkMlOf('Bia 330ml')).toBe(0);
    expect(drinkMlOf('Cơm 150g')).toBe(0);
    expect(drinkMlOf('Sữa tươi 25000 ml')).toBe(3000);
    expect(suggestedDrinkMl([{ name: 'Bánh mì trứng' }, { name: 'Sữa đậu nành 300ml' }])).toBe(300);
  });

  it('adds the drinks logged as food to the water of the day, and "Ăn lại" counts them again', () => {
    const store = useNutritionStore.getState();
    store.addWater(DAY, 1000);
    const id = store.addExtra(DAY, 'Sữa đậu nành 250ml', 80, 6, 'breakfast', { waterMl: 250, fromFoodDb: true });
    store.addExtra(DAY, 'Phở bò', 450, 25, 'lunch', { fromFoodDb: true });
    expect(dayWaterMl(useNutritionStore.getState().logs[DAY])).toBe(1250);
    const item = useNutritionStore.getState().logs[DAY].extraItems.find((i) => i.id === id)!;
    logExtraAgain(DAY, item, 'afternoon_snack', 'x');
    expect(dayWaterMl(useNutritionStore.getState().logs[DAY])).toBe(1500);
    // The water logged as water is still kept apart (what −250 / reset change).
    expect(useNutritionStore.getState().logs[DAY].waterMl).toBe(1000);
  });

  it('the push server counts the same water from the synced row', () => {
    expect(rowWaterMl({ water_ml: 1000, extra_items: [{ waterMl: 250 }, { name: 'Phở' }, { waterMl: 'x' }] })).toBe(1250);
    expect(rowWaterMl(null)).toBeNull();
  });
});

describe('Sửa bữa & giờ of a logged food', () => {
  beforeEach(() => {
    useNutritionStore.setState({ logs: {} });
  });

  it('moves it to another meal at that meal\'s usual time, or the time typed, and sets the water counted', () => {
    const store = useNutritionStore.getState();
    const id = store.addExtra(DAY, 'Cà phê sữa', 120, 2, 'breakfast', { fromFoodDb: true, clock: [7, 15] });
    const at = () => new Date(useNutritionStore.getState().logs[DAY].extraItems[0].loggedAtISO);

    // Same meal, no time: keeps its own time.
    editExtraWhen(DAY, id, { mealTime: 'breakfast', clock: null });
    expect([at().getHours(), at().getMinutes()]).toEqual([7, 15]);

    editExtraWhen(DAY, id, { mealTime: 'afternoon_snack', clock: null, waterMl: 250 });
    let item = useNutritionStore.getState().logs[DAY].extraItems[0];
    expect(item.mealTime).toBe('afternoon_snack');
    expect([at().getHours(), at().getMinutes()]).toEqual([14, 0]);
    expect(item.waterMl).toBe(250);
    expect(dayWaterMl(useNutritionStore.getState().logs[DAY])).toBe(250);

    editExtraWhen(DAY, id, { mealTime: 'afternoon_snack', clock: [15, 40], waterMl: 0 });
    item = useNutritionStore.getState().logs[DAY].extraItems[0];
    expect([at().getHours(), at().getMinutes()]).toEqual([15, 40]);
    expect(item.waterMl).toBeUndefined();
    expect(at().toISOString().slice(0, 10) <= DAY).toBe(true);
  });

  it('the form moves the time with the meal picked, offers the drink amount, and saves', () => {
    const onSave = jest.fn();
    let r: ReturnType<typeof create> | undefined;
    act(() => {
      r = create(<MealWhenForm mealTime="breakfast" time="07:15" withWater suggestedWaterMl={250} onSave={onSave} onCancel={() => {}} />);
    });
    const textOf = (n: ReactTestInstance): string => n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
    const press = (label: string) => {
      const n = r!.root.findAll((x) => typeof x.props.onPress === 'function' && textOf(x).includes(label))[0];
      act(() => n.props.onPress());
    };
    press('Tối');
    expect(r!.root.findAll((x) => x.props.value === '19:00').length).toBeGreaterThan(0);
    press('Tính 250 ml vào nước');
    press('Lưu');
    expect(onSave).toHaveBeenCalledWith({ mealTime: 'dinner', clock: [19, 0], waterMl: 250 });
    act(() => r!.unmount());
  });
});
