import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { weekStartKey } from '../utils/weekKey';

export interface ShoppingCustomItem {
  id: string;
  category: string;
  name: string;
  quantityToBuy: string;
  estimatedPriceVnd: number;
}

interface ShoppingListState {
  /** The week this purchase-tracking state belongs to — everything below resets when it rolls over. */
  weekKey: string;
  /** Keyed by base-plan item name (checkbox = "prepared/bought" this week). */
  checkedItems: Record<string, boolean>;
  /** Keyed by base-plan item name — the actual price paid, overriding the plan's estimate. */
  actualPrices: Record<string, number>;
  /** Keyed by base-plan item name — the actual quantity bought, overriding the plan's suggestion. */
  actualQuantities: Record<string, string>;
  customItems: ShoppingCustomItem[];
  ensureCurrentWeek: () => void;
  toggleChecked: (name: string) => void;
  setActualPrice: (name: string, vnd: number) => void;
  setActualQuantity: (name: string, qty: string) => void;
  addCustomItem: (item: Omit<ShoppingCustomItem, 'id'>) => void;
  removeCustomItem: (id: string) => void;
  toggleCustomChecked: (id: string) => void;
}

const emptyWeekState = () => ({
  checkedItems: {} as Record<string, boolean>,
  actualPrices: {} as Record<string, number>,
  actualQuantities: {} as Record<string, string>,
  customItems: [] as ShoppingCustomItem[],
});

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set, get) => ({
      weekKey: weekStartKey(new Date()),
      ...emptyWeekState(),
      // Custom items also track their own checked state, but reuse checkedItems keyed by their id
      // (ids are generated, so no collision with plan item names).
      ensureCurrentWeek: () => {
        const currentWeek = weekStartKey(new Date());
        if (get().weekKey !== currentWeek) {
          set({ weekKey: currentWeek, ...emptyWeekState() });
        }
      },
      toggleChecked: (name) => set((state) => ({ checkedItems: { ...state.checkedItems, [name]: !state.checkedItems[name] } })),
      setActualPrice: (name, vnd) => set((state) => ({ actualPrices: { ...state.actualPrices, [name]: vnd } })),
      setActualQuantity: (name, qty) => set((state) => ({ actualQuantities: { ...state.actualQuantities, [name]: qty } })),
      addCustomItem: (item) =>
        set((state) => ({ customItems: [...state.customItems, { ...item, id: `${Date.now()}` }] })),
      removeCustomItem: (id) =>
        set((state) => ({
          customItems: state.customItems.filter((i) => i.id !== id),
          checkedItems: Object.fromEntries(Object.entries(state.checkedItems).filter(([k]) => k !== id)),
        })),
      toggleCustomChecked: (id) => set((state) => ({ checkedItems: { ...state.checkedItems, [id]: !state.checkedItems[id] } })),
    }),
    {
      name: 'shopping-list-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
