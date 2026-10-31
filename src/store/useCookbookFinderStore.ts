import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { DinnerIdea } from '../ai/dinner';
import { CHEAT_WHERE, cleanLocation, cleanQuery, recheckPlaces, type CheatPlacesAnswer, type CheatWhere } from '../cookbook/cheat';
import { cleanFilters, EMPTY_FILTERS, type CookbookFilters } from '../cookbook/filters';

/** The cook book finder, kept on this device only: the filters being edited, the filters of the last "Suggest" (the user's own dishes
 *  are ranked again from them on every visit), and the dishes the shared cook book and the AI returned, so a reload shows them
 *  again without asking (and paying) again. Cheat day keeps its own AI dishes, what was typed in "what do you want to eat", the
 *  address / position and the places found. */
interface CookbookFinderState {
  filters: CookbookFilters;
  /** The filters the last suggestion was made for; null before the first one. */
  searched: CookbookFilters | null;
  shared: DinnerIdea[];
  ai: DinnerIdea[];
  /** When the AI was last asked (ISO); null when never. */
  aiAtISO: string | null;
  /** The "Cheat day" box is ticked. */
  cheat: boolean;
  cheatWhere: CheatWhere;
  /** The address or area for places ("Quận 1, TP.HCM", or the address read from the device position; editable). */
  location: string;
  /** Device position chosen with "my location" (5 decimals, ~1 m), kept while the address is edited, until cleared. */
  coords: { lat: number; lon: number } | null;
  /** "What do you want to eat" as typed ("lẩu bò"). */
  query: string;
  cheatAi: DinnerIdea[];
  cheatAiAtISO: string | null;
  places: CheatPlacesAnswer | null;
  /** The area the places were searched around. */
  placesNear: string;
  setFilters: (f: CookbookFilters) => void;
  /** "Suggest" pressed: the filters are searched, the shared cook book's earlier dishes are cleared. */
  search: (f: CookbookFilters) => void;
  setShared: (ideas: DinnerIdea[]) => void;
  setAi: (ideas: DinnerIdea[], atISO: string) => void;
  setCheat: (on: boolean) => void;
  setCheatWhere: (w: CheatWhere) => void;
  /** The address text; `coords` replaces the position when given (null clears it), otherwise the position stays. */
  setLocation: (text: string, coords?: { lat: number; lon: number } | null) => void;
  setQuery: (text: string) => void;
  setCheatAi: (ideas: DinnerIdea[], atISO: string) => void;
  setPlaces: (answer: CheatPlacesAnswer, near: string) => void;
  reset: () => void;
}

const INITIAL = {
  filters: EMPTY_FILTERS,
  searched: null,
  shared: [],
  ai: [],
  aiAtISO: null,
  cheat: false,
  cheatWhere: 'both' as CheatWhere,
  location: '',
  coords: null,
  query: '',
  cheatAi: [],
  cheatAiAtISO: null,
  places: null,
  placesNear: '',
};

const cleanCoords = (v: unknown): { lat: number; lon: number } | null => {
  const c = v as { lat?: unknown; lon?: unknown } | null;
  return c && typeof c.lat === 'number' && typeof c.lon === 'number' && Number.isFinite(c.lat) && Number.isFinite(c.lon) && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180
    ? { lat: Math.round(c.lat * 100_000) / 100_000, lon: Math.round(c.lon * 100_000) / 100_000 }
    : null;
};

export const useCookbookFinderStore = create<CookbookFinderState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setFilters: (f) => set({ filters: cleanFilters(f) }),
      search: (f) => set({ searched: cleanFilters(f), shared: [] }),
      setShared: (ideas) => set({ shared: ideas }),
      setAi: (ideas, atISO) => set({ ai: ideas, aiAtISO: atISO }),
      setCheat: (on) => set({ cheat: on }),
      setCheatWhere: (w) => set({ cheatWhere: CHEAT_WHERE.includes(w) ? w : 'both' }),
      setLocation: (text, coords) => set(coords === undefined ? { location: cleanLocation(text) } : { location: cleanLocation(text), coords: cleanCoords(coords) }),
      setQuery: (text) => set({ query: typeof text === 'string' ? text.slice(0, 80) : '' }),
      setCheatAi: (ideas, atISO) => set({ cheatAi: ideas, cheatAiAtISO: atISO }),
      setPlaces: (answer, near) => set({ places: answer, placesNear: cleanLocation(near) }),
      reset: () => set({ ...INITIAL }),
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
          cheat: p.cheat === true,
          cheatWhere: CHEAT_WHERE.includes(p.cheatWhere as CheatWhere) ? (p.cheatWhere as CheatWhere) : 'both',
          location: cleanLocation(p.location),
          coords: cleanCoords(p.coords),
          query: cleanQuery(p.query),
          cheatAi: Array.isArray(p.cheatAi) ? p.cheatAi.filter((i) => i && i.cheat) : [],
          cheatAiAtISO: typeof p.cheatAiAtISO === 'string' ? p.cheatAiAtISO : null,
          places: recheckPlaces(p.places),
          placesNear: cleanLocation(p.placesNear),
        };
      },
    }
  )
);
