import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import type { PlacePhoto } from '../../supabase/functions/_shared/places';
import { placeNameKey } from '../../supabase/functions/_shared/places';
import { cleanCheatPlacesData, EMPTY_CHEAT_PLACES, type CheatPlacesData, type PlacesSearch, type SavedPlace } from '../cookbook/placesHistory';

/** Cheat day places kept by the user (see placesHistory.ts): the history of searches and the starred places. Every change is saved
 *  to the cloud (user_data `cheatPlaces`) and merged back on sign-in (restore.ts). */
interface CheatPlacesState extends CheatPlacesData {
  /** A new search, or a search shown again with more places ("suggest more"): replaces the entry with the same id. */
  putSearch: (search: PlacesSearch) => void;
  removeSearch: (id: string) => void;
  clearHistory: () => void;
  /** Stars a place, or un-stars it when it is saved already. */
  toggleSaved: (place: SavedPlace) => void;
  removeSaved: (key: string) => void;
  /** Real dish photos found later (dish-photo) kept with a search, so they show again without asking. */
  setDishPhotos: (id: string, photos: Record<string, PlacePhoto>) => void;
}

const dataOf = (s: CheatPlacesData): CheatPlacesData => ({ history: s.history, saved: s.saved, removed: s.removed, clearedAtISO: s.clearedAtISO });

export const useCheatPlacesStore = create<CheatPlacesState>()(
  persist(
    (set, get) => {
      /** Applies a change, cleans the result (order, caps, tombstones) and saves it to the cloud. */
      const commit = (next: CheatPlacesData) => {
        const clean = cleanCheatPlacesData(next);
        set(clean);
        void pushUserData(USER_DATA_KEYS.cheatPlaces, clean);
      };
      const now = () => new Date().toISOString();
      return {
        ...EMPTY_CHEAT_PLACES,
        putSearch: (search) => {
          const s = get();
          commit({ ...dataOf(s), history: [search, ...s.history.filter((x) => x.id !== search.id)] });
        },
        removeSearch: (id) => {
          const s = get();
          commit({ ...dataOf(s), history: s.history.filter((x) => x.id !== id), removed: [{ id: `s:${id}`, atISO: now() }, ...s.removed] });
        },
        clearHistory: () => {
          const s = get();
          commit({ ...dataOf(s), history: [], clearedAtISO: now() });
        },
        toggleSaved: (place) => {
          const s = get();
          if (s.saved.some((p) => p.key === place.key)) {
            commit({ ...dataOf(s), saved: s.saved.filter((p) => p.key !== place.key), removed: [{ id: `p:${place.key}`, atISO: now() }, ...s.removed] });
          } else {
            commit({ ...dataOf(s), saved: [{ ...place, atISO: now() }, ...s.saved] });
          }
        },
        removeSaved: (key) => {
          const s = get();
          commit({ ...dataOf(s), saved: s.saved.filter((p) => p.key !== key), removed: [{ id: `p:${key}`, atISO: now() }, ...s.removed] });
        },
        setDishPhotos: (id, photos) => {
          const s = get();
          const search = s.history.find((x) => x.id === id);
          if (!search) return;
          const byKey = new Map(Object.entries(photos).map(([name, photo]) => [placeNameKey(name), photo]));
          let changed = false;
          const dishes = search.dishes.map((d) => {
            const photo = byKey.get(placeNameKey(d.name));
            if (d.photo || !photo) return d;
            changed = true;
            return { ...d, photo };
          });
          if (changed) commit({ ...dataOf(s), history: s.history.map((x) => (x.id === id ? { ...x, dishes } : x)) });
        },
      };
    },
    {
      name: 'cheat-places-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => dataOf(s),
      merge: (persisted, current) => ({ ...current, ...cleanCheatPlacesData(persisted) }),
    }
  )
);

export function resetCheatPlacesStore(): void {
  useCheatPlacesStore.setState({ ...EMPTY_CHEAT_PLACES });
}
