import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { DinnerIdea } from '../ai/dinner';
import { cleanFilters, EMPTY_FILTERS, type CookbookFilters } from '../cookbook/filters';

/** The cook book finder, kept on this device only: the filters being edited, the filters of the last "Suggest" (the user's own dishes
 *  are ranked again from them on every visit), and the dishes the shared cook book and the AI returned, so a reload shows them
 *  again without asking (and paying) again. */
interface CookbookFinderState {
  filters: CookbookFilters;
  /** The filters the last suggestion was made for; null before the first one. */
  searched: CookbookFilters | null;
  shared: DinnerIdea[];
  ai: DinnerIdea[];
  /** When the AI was last asked (ISO); null when never. */
  aiAtISO: string | null;
  setFilters: (f: CookbookFilters) => void;
  /** "Suggest" pressed: the filters are searched, the shared cook book's earlier dishes are cleared. */
  search: (f: CookbookFilters) => void;
  setShared: (ideas: DinnerIdea[]) => void;
  setAi: (ideas: DinnerIdea[], atISO: string) => void;
  reset: () => void;
}

export const useCookbookFinderStore = create<CookbookFinderState>()(
  persist(
    (set) => ({
      filters: EMPTY_FILTERS,
      searched: null,
      shared: [],
      ai: [],
      aiAtISO: null,
      setFilters: (f) => set({ filters: cleanFilters(f) }),
      search: (f) => set({ searched: cleanFilters(f), shared: [] }),
      setShared: (ideas) => set({ shared: ideas }),
      setAi: (ideas, atISO) => set({ ai: ideas, aiAtISO: atISO }),
      reset: () => set({ filters: EMPTY_FILTERS, searched: null, shared: [], ai: [], aiAtISO: null }),
    }),
    {
      name: 'cookbook-finder-store',
      storage: createJSONStorage(() => appStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CookbookFinderState>;
        return {
          ...current,
          filters: cleanFilters(p.filters),
          searched: p.searched ? cleanFilters(p.searched) : null,
          shared: Array.isArray(p.shared) ? p.shared : [],
          ai: Array.isArray(p.ai) ? p.ai : [],
          aiAtISO: typeof p.aiAtISO === 'string' ? p.aiAtISO : null,
        };
      },
    }
  )
);
