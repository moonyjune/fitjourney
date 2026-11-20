import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData, updateTemptOutcome } from '../sync/cloudSync';
import { outcomeOf } from '../../supabase/functions/_shared/temptLearn';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import type { TemptItem } from '../temptation/item';
import { DEFAULT_TEMPT_SETTINGS, type TemptSettings } from '../temptation/schedule';
import { applyOutcome, cleanTemptHistory, cleanTemptSettings, NO_TEMPT_STATS, type TemptHistoryEntry, type TemptOutcome, type TemptStats } from '../temptation/stats';

/** Times shown kept for the schedule (only today's and the last one matter). */
const SHOWN_KEEP = 12;

export interface PendingInteraction {
  id: string;
  shownAt: string;
  name: string;
  outcome: string;
}

/** Pending records kept (newest first). */
const PENDING_KEEP = 10;

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
  /** The open pop-up was answered (not saved): closing it then is not a "dismissed". */
  answered: boolean;
  /** 1.7: recorded temptations answered lately (id, when shown, name, category, outcome), kept a few hours so a matching food logged
   *  within ~2 h turns the record into "gave in" (src/temptation/learn.ts reconcileLogged). */
  pending: PendingInteraction[];
  setPending: (pending: PendingInteraction[]) => void;
  /** 1.7 "Xoá lịch sử cám dỗ": forgets the answers on this device (the record and XP stay). */
  clearHistory: () => void;
  setSettings: (patch: Partial<TemptSettings>) => void;
  markShown: (at: number) => void;
  show: (item: TemptItem, practice?: boolean) => void;
  setBusy: (busy: boolean) => void;

  /** Records the player's answer to the open pop-up (nothing for a practice round); `bonusXp` from a chat won against the AI boss, and
   *  `item` the one on the table at the end of that chat (the boss may have switched). */
  answer: (outcome: TemptOutcome, at?: Date, bonusXp?: number, item?: TemptItem) => void;
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
      answered: false,
      pending: [],
      setPending: (pending) => set({ pending: pending.slice(0, PENDING_KEEP) }),
      clearHistory: () => {
        set({ history: [], pending: [] });
        syncUp({ settings: get().settings, stats: get().stats, history: [] });
      },
      setSettings: (patch) => {
        const settings = cleanTemptSettings({ ...get().settings, ...patch });
        set({ settings });
        syncUp({ ...get(), settings });
      },
      markShown: (at) => set({ shownAt: [...get().shownAt, at].slice(-SHOWN_KEEP) }),
      show: (item, practice = false) => {
        // A practice round is never learned from.
        if (practice && item.interactionId) void updateTemptOutcome(item.interactionId, 'practice');
        set({ open: { item, practice }, busy: false, answered: false });
      },
      setBusy: (busy) => set({ busy }),

      answer: (outcome, at = new Date(), bonusXp = 0, item) => {
        const open = get().open;
        if (!open || open.practice) return;
        set({ answered: true });
        const recordId = open.item.interactionId;
        if (recordId) {
          void updateTemptOutcome(recordId, outcomeOf(outcome), bonusXp);
          const it0 = item ?? open.item;
          set({ pending: [{ id: recordId, shownAt: at.toISOString(), name: it0.name, outcome: outcomeOf(outcome) }, ...get().pending].slice(0, PENDING_KEEP) });
        }
        const stats = applyOutcome(get().stats, outcome, bonusXp);
        const it = item ?? open.item;
        const entry: TemptHistoryEntry = { at: at.toISOString(), name: it.name, emoji: it.emoji, kcal: it.kcal, outcome, level: it.source === 'easy' ? 'easy' : 'hard' };
        const history = cleanTemptHistory([entry, ...get().history]);
        set({ stats, history });
        syncUp({ settings: get().settings, stats, history });
      },
      close: () => {
        const { open, answered } = get();
        // Closed without an answer: "dismissed" for the boss's record (a practice round stays practice).
        if (open && !answered && !open.practice && open.item.interactionId) void updateTemptOutcome(open.item.interactionId, 'dismissed');
        set({ open: null });
      },
    }),
    {
      name: 'temptation-store',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ settings: s.settings, stats: s.stats, history: s.history, shownAt: s.shownAt, salt: s.salt, pending: s.pending }),
    }
  )
);

/** Back to a fresh install (account switch). */
export function resetTemptationStore(): void {
  useTemptationStore.setState({ settings: DEFAULT_TEMPT_SETTINGS, stats: NO_TEMPT_STATS, history: [], shownAt: [], open: null, busy: false, answered: false, pending: [] });
}
