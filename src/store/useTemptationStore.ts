import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import type { TemptItem } from '../temptation/item';
import { DEFAULT_TEMPT_SETTINGS, type TemptSettings } from '../temptation/schedule';
import { applyOutcome, cleanTemptHistory, cleanTemptSettings, NO_TEMPT_STATS, type TemptHistoryEntry, type TemptOutcome, type TemptStats } from '../temptation/stats';

/** Times shown kept for the schedule (only today's and the last one matter). */
const SHOWN_KEEP = 12;

export interface TemptationOpen {
  item: TemptItem;
  /** Opened with "Thử ngay" in Profile: a practice round that changes no record and gives no XP. */
  practice: boolean;
}

interface TemptationState {
  settings: TemptSettings;
  stats: TemptStats;
  history: TemptHistoryEntry[];
  /** When scheduled pop-ups were shown (ms). */
  shownAt: number[];
  /** Per-install seed of the daily random moments. */
  salt: string;
  /** The pop-up on screen (not saved). */
  open: TemptationOpen | null;
  /** A pop-up is being prepared (an AI request is running; not saved). */
  busy: boolean;
  setSettings: (patch: Partial<TemptSettings>) => void;
  markShown: (at: number) => void;
  show: (item: TemptItem, practice?: boolean) => void;
  setBusy: (busy: boolean) => void;
  /** Records the player's answer to the open pop-up (nothing for a practice round). */
  answer: (outcome: TemptOutcome, at?: Date) => void;
  close: () => void;
}

const syncUp = (s: Pick<TemptationState, 'settings' | 'stats' | 'history'>) =>
  void pushUserData(USER_DATA_KEYS.temptation, { settings: s.settings, stats: s.stats, history: s.history });

export const useTemptationStore = create<TemptationState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_TEMPT_SETTINGS,
      stats: NO_TEMPT_STATS,
      history: [],
      shownAt: [],
      salt: Math.random().toString(36).slice(2, 10),
      open: null,
      busy: false,
      setSettings: (patch) => {
        const settings = cleanTemptSettings({ ...get().settings, ...patch });
        set({ settings });
        syncUp({ ...get(), settings });
      },
      markShown: (at) => set({ shownAt: [...get().shownAt, at].slice(-SHOWN_KEEP) }),
      show: (item, practice = false) => set({ open: { item, practice }, busy: false }),
      setBusy: (busy) => set({ busy }),
      answer: (outcome, at = new Date()) => {
        const open = get().open;
        if (!open || open.practice) return;
        const stats = applyOutcome(get().stats, outcome);
        const entry: TemptHistoryEntry = { at: at.toISOString(), name: open.item.name, emoji: open.item.emoji, kcal: open.item.kcal, outcome, level: open.item.source === 'easy' ? 'easy' : 'hard' };
        const history = cleanTemptHistory([entry, ...get().history]);
        set({ stats, history });
        syncUp({ settings: get().settings, stats, history });
      },
      close: () => set({ open: null }),
    }),
    {
      name: 'temptation-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ settings: s.settings, stats: s.stats, history: s.history, shownAt: s.shownAt, salt: s.salt }),
    }
  )
);

/** Back to a fresh install (account switch). */
export function resetTemptationStore(): void {
  useTemptationStore.setState({ settings: DEFAULT_TEMPT_SETTINGS, stats: NO_TEMPT_STATS, history: [], shownAt: [], open: null, busy: false });
}
