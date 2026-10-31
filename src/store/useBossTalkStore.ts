import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { cleanBossTalkData, type BossTalk, type BossTalkData } from '../banter/talks';

interface BossTalkState extends BossTalkData {
  /** Saves a day's AI exchange (replacing the one before) and syncs the exchanges to the cloud. */
  saveTalk: (talk: BossTalk) => void;
  /** Notes that a day's exchange was asked of the AI on its own, so it is never asked again automatically. */
  markAutoTried: (date: string) => void;
}

const syncUp = (s: BossTalkData) => void pushUserData(USER_DATA_KEYS.bossTalk, { talks: s.talks, autoTried: s.autoTried });

export const useBossTalkStore = create<BossTalkState>()(
  persist(
    (set, get) => ({
      talks: [],
      autoTried: null,
      saveTalk: (talk) => {
        const next = cleanBossTalkData({ talks: [...get().talks.filter((t) => t.date !== talk.date), talk], autoTried: get().autoTried });
        set(next);
        syncUp(next);
      },
      markAutoTried: (date) => {
        const next = { talks: get().talks, autoTried: date };
        set({ autoTried: date });
        syncUp(next);
      },
    }),
    { name: 'boss-talk-store', storage: createJSONStorage(() => appStorage), partialize: (s) => ({ talks: s.talks, autoTried: s.autoTried }) }
  )
);
