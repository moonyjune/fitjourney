import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { reportPictureKey } from '../../supabase/functions/_shared/photoReport';

/** Pictures kept hidden (the newest last). */
export const HIDDEN_PHOTOS_MAX = 300;

/** "Ảnh sai?" (1.5): the dish pictures this player reported wrong. They are never shown to them again (the dish's emoji instead),
 *  whatever the server answers later; a picture is known by its host and path (`reportPictureKey`). Saved to the cloud (user_data
 *  `hiddenPhotos`), so another device hides them too. */
interface HiddenPhotoState {
  keys: string[];
  hide: (url: string) => void;
  unhide: (url: string) => void;
}

/** Picture keys cleaned: strings, each once, at most HIDDEN_PHOTOS_MAX (the newest kept). */
export function cleanHiddenPhotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const keys = raw.filter((k): k is string => typeof k === 'string' && k.length > 3 && k.length < 500);
  const out: string[] = [];
  for (const k of keys) {
    const i = out.indexOf(k);
    if (i >= 0) out.splice(i, 1);
    out.push(k);
  }
  return out.slice(-HIDDEN_PHOTOS_MAX);
}

function save(keys: string[]): void {
  void pushUserData(USER_DATA_KEYS.hiddenPhotos, { keys });
}

export const useHiddenPhotoStore = create<HiddenPhotoState>()(
  persist(
    (set, get) => ({
      keys: [],
      hide: (url) => {
        const key = reportPictureKey(url);
        if (!key) return;
        const keys = cleanHiddenPhotos([...get().keys, key]);
        set({ keys });
        save(keys);
      },
      unhide: (url) => {
        const key = reportPictureKey(url);
        if (!key || !get().keys.includes(key)) return;
        const keys = get().keys.filter((k) => k !== key);
        set({ keys });
        save(keys);
      },
    }),
    { name: 'hidden-photo-store', storage: createJSONStorage(() => appStorage), partialize: (s) => ({ keys: s.keys }) }
  )
);

/** Whether this picture was reported wrong by the player (hidden for them). */
export function isPhotoHidden(keys: readonly string[], url: string | null | undefined): boolean {
  if (!url) return false;
  const key = reportPictureKey(url);
  return key !== '' && keys.includes(key);
}

/** A hook: whether this picture is hidden for the player. */
export function usePhotoHidden(url: string | null | undefined): boolean {
  return useHiddenPhotoStore((s) => isPhotoHidden(s.keys, url));
}
