import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClientStatus } from '../ai/coachDigest';

export interface DigestEntry {
  status: ClientStatus;
  /** The AI's summary; absent for a client with nothing logged (the screen says that itself). */
  summary?: string;
  /** A message the coach could send to the client. */
  nudge?: string;
  generatedAtISO: string;
}

/** How many weeks of digests are kept on the device. */
export const DIGEST_WEEKS_KEEP = 4;

interface DigestState {
  /** Digest entries by week start (Monday, YYYY-MM-DD), then by client id. */
  weeks: Record<string, Record<string, DigestEntry>>;
  save: (periodKey: string, entries: Record<string, DigestEntry>) => void;
}

/** The coach's weekly digests, kept on this device (the server stores nothing of them). Cleared on sign-out with the rest. */
export const useAiDigestStore = create<DigestState>()(
  persist(
    (set) => ({
      weeks: {},
      save: (periodKey, entries) =>
        set((s) => {
          const next = { ...s.weeks, [periodKey]: { ...(s.weeks[periodKey] ?? {}), ...entries } };
          const keys = Object.keys(next).sort();
          for (const old of keys.slice(0, Math.max(0, keys.length - DIGEST_WEEKS_KEEP))) delete next[old];
          return { weeks: next };
        }),
    }),
    { name: 'ai-digest-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
