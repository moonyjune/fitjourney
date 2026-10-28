import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

export type HistoryLayout = 'list' | 'calendar';

interface HistoryViewState {
  /** How the History diary shows the days: a list grouped by month, or a month calendar. Local to this device. */
  layout: HistoryLayout;
  setLayout: (layout: HistoryLayout) => void;
}

export const useHistoryViewStore = create<HistoryViewState>()(
  persist(
    (set) => ({
      layout: 'list',
      setLayout: (layout) => set({ layout }),
    }),
    { name: 'history-view-store', storage: createJSONStorage(() => appStorage) }
  )
);
