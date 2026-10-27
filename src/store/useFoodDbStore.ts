import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { BUILT_IN_FOODS } from '../food/foodData';
import { rememberableFood } from '../food/remember';
import type { FoodEntry } from '../food/types';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

/** The numbers and labels a user can change on a food. */
export type FoodFields = Omit<FoodEntry, 'id'>;

export type FoodValidation = 'name' | 'duplicate' | 'unit' | 'amount' | 'kcal' | null;

const MAX_KCAL_PER_100 = 900; // pure fat is about 900 kcal per 100 g; anything above is a typo

/** Checks a food before it is saved. `ignoreId` is the food being edited (it may keep its own name). */
export function validateFood(fields: FoodFields, all: FoodEntry[], ignoreId?: string): FoodValidation {
  const name = fields.name.trim();
  if (!name) return 'name';
  if (all.some((f) => f.id !== ignoreId && f.name.trim().toLowerCase() === name.toLowerCase())) return 'duplicate';
  if (!fields.unit.trim() || !(fields.unitG > 0)) return 'unit';
  const nums = [fields.kcal, fields.proteinG, fields.purineMg, fields.sugarG, fields.sodiumMg];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return 'amount';
  if (fields.kcal > MAX_KCAL_PER_100) return 'kcal';
  return null;
}

interface FoodDbState {
  /** Foods the user added. */
  custom: FoodEntry[];
  /** Edits to built-in foods, by built-in id (for example values copied from a product label). */
  overrides: Record<string, Partial<FoodFields>>;
  /** Most recently used food ids, newest first. */
  recent: string[];
  addCustom: (fields: FoodFields) => FoodEntry;
  /** A custom food is replaced; a built-in food gets an override. */
  updateFood: (id: string, fields: FoodFields) => void;
  removeCustom: (id: string) => void;
  /** Drops the user's edits to a built-in food. */
  resetOverride: (id: string) => void;
  touchRecent: (id: string) => void;
  /** Saves a meal the user logged as a food of their own, unless the database already has a food with that name. Returns the new food. */
  remember: (item: Parameters<typeof rememberableFood>[0]) => FoodEntry | null;
}

const MAX_RECENT = 8;

/** The user's own foods and label edits are saved to the cloud (the "recent" list stays on the device). */
function saveFoods({ custom, overrides }: Pick<FoodDbState, 'custom' | 'overrides'>): void {
  pushUserData(USER_DATA_KEYS.foodDb, { custom, overrides });
}

export const useFoodDbStore = create<FoodDbState>()(
  persist(
    (set, get) => ({
      custom: [],
      overrides: {},
      recent: [],
      addCustom: (fields) => {
        const entry: FoodEntry = { ...fields, name: fields.name.trim(), id: `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}` };
        set((s) => ({ custom: [...s.custom, entry] }));
        saveFoods(get());
        return entry;
      },
      updateFood: (id, fields) => {
        set((s) => {
          const clean = { ...fields, name: fields.name.trim() };
          if (s.custom.some((f) => f.id === id)) return { custom: s.custom.map((f) => (f.id === id ? { ...clean, id } : f)) };
          return { overrides: { ...s.overrides, [id]: clean } };
        });
        saveFoods(get());
      },
      removeCustom: (id) => {
        set((s) => ({ custom: s.custom.filter((f) => f.id !== id), recent: s.recent.filter((r) => r !== id) }));
        saveFoods(get());
      },
      resetOverride: (id) => {
        set((s) => {
          const { [id]: _removed, ...rest } = s.overrides;
          return { overrides: rest };
        });
        saveFoods(get());
      },
      remember: (item) => {
        const { custom, overrides } = get();
        const fields = rememberableFood(item, mergeFoods(custom, overrides));
        if (!fields) return null;
        const entry: FoodEntry = { ...fields, id: `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}` };
        set((s) => ({ custom: [...s.custom, entry] }));
        saveFoods(get());
        return entry;
      },
      touchRecent: (id) => set((s) => ({ recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, MAX_RECENT) })),
    }),
    { name: 'food-db-store', storage: createJSONStorage(() => appStorage) }
  )
);

/** Built-in foods with the user's edits applied, followed by the user's own foods. */
export function mergeFoods(custom: FoodEntry[], overrides: Record<string, Partial<FoodFields>>): FoodEntry[] {
  const builtIn = BUILT_IN_FOODS.map((f) => (overrides[f.id] ? ({ ...f, ...overrides[f.id], id: f.id } as FoodEntry) : f));
  return [...builtIn, ...custom];
}

export function useAllFoods(): FoodEntry[] {
  const custom = useFoodDbStore((s) => s.custom);
  const overrides = useFoodDbStore((s) => s.overrides);
  return useMemo(() => mergeFoods(custom, overrides), [custom, overrides]);
}
