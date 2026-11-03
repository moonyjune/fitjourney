import { router } from 'expo-router';
import { create } from 'zustand';
import type { DinnerBrief, DinnerIdea } from '../ai/dinner';
import { recipeKey } from '../cookbook/recipes';

/** A dish opened on the recipe page (app/recipe/[id].tsx), with what it is checked against. Dishes of the cook book are read from it
 *  by id; a dish that is not in it (a shared cook book or AI idea) is handed over here, in memory only. */
export interface RecipeOpen {
  idea: DinnerIdea;
  /** What is left for the meal it is meant for (no limits shown without it; never on a cheat day). */
  brief?: DinnerBrief;
}

interface RecipeViewState {
  open: Record<string, RecipeOpen>;
  put: (entry: RecipeOpen) => string;
}

export const useRecipeViewStore = create<RecipeViewState>()((set) => ({
  open: {},
  put: (entry) => {
    const id = recipeKey(entry.idea.name);
    set((s) => ({ open: { ...s.open, [id]: entry } }));
    return id;
  },
}));

/** Opens a dish's recipe page (redesign decision 5: the recipe is a scroll page, not a dialog). */
export function openRecipe(idea: DinnerIdea, brief?: DinnerBrief): void {
  const id = useRecipeViewStore.getState().put({ idea, ...(brief && !idea.cheat ? { brief } : {}) });
  router.push({ pathname: '/recipe/[id]', params: { id } });
}
