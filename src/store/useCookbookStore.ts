import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { cookbookForCloud, mergeRecipe, recipeKey, type CookbookRecipe, type RecipeDetails } from '../cookbook/recipes';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';

interface CookbookState {
  recipes: CookbookRecipe[];
  /** Adds a dish, or fills in the one already there (the user's rating, photo and count are kept). */
  save: (recipe: CookbookRecipe) => void;
  saveMany: (recipes: CookbookRecipe[]) => void;
  remove: (id: string) => void;
  rate: (id: string, stars: number) => void;
  /** How to make a dish that was saved without a recipe (asked from the AI later). */
  setDetails: (id: string, details: RecipeDetails) => void;
  setPhoto: (id: string, uri: string | null) => void;
  markCooked: (id: string) => void;
  /** Cloud copy merged in: dishes only the cloud has are added, what is on the device wins. Not pushed back. */
  merge: (remote: CookbookRecipe[]) => number;
}

const push = (recipes: CookbookRecipe[]) => void pushUserData(USER_DATA_KEYS.cookbook, cookbookForCloud(recipes));

export const useCookbookStore = create<CookbookState>()(
  persist(
    (set, get) => {
      const commit = (recipes: CookbookRecipe[]) => {
        set({ recipes });
        push(recipes);
      };
      const change = (id: string, f: (r: CookbookRecipe) => CookbookRecipe) => {
        if (!get().recipes.some((r) => r.id === id)) return;
        commit(get().recipes.map((r) => (r.id === id ? f(r) : r)));
      };
      return {
        recipes: [],
        save: (recipe) => get().saveMany([recipe]),
        saveMany: (incoming) => {
          let next = get().recipes;
          for (const r of incoming) {
            const id = recipeKey(r.name);
            if (!id) continue;
            const existing = next.find((x) => x.id === id);
            const merged = mergeRecipe(existing, { ...r, id });
            next = existing ? next.map((x) => (x.id === id ? merged : x)) : [merged, ...next];
          }
          if (next !== get().recipes) commit(next.slice(0, 300));
        },
        remove: (id) => commit(get().recipes.filter((r) => r.id !== id)),
        rate: (id, stars) => change(id, (r) => ({ ...r, rating: stars >= 1 && stars <= 5 ? Math.round(stars) : undefined })),
        setDetails: (id, d) => change(id, (r) => ({ ...r, ...d })),
        setPhoto: (id, uri) => change(id, (r) => ({ ...r, photoUri: uri ?? undefined })),
        markCooked: (id) => change(id, (r) => ({ ...r, cookedCount: (r.cookedCount ?? 0) + 1 })),
        merge: (remote) => {
          const have = new Set(get().recipes.map((r) => r.id));
          const add = remote.filter((r) => !have.has(r.id));
          if (add.length > 0) set({ recipes: [...get().recipes, ...add].slice(0, 300) });
          return add.length;
        },
      };
    },
    { name: 'cookbook-store', storage: createJSONStorage(() => appStorage) }
  )
);
