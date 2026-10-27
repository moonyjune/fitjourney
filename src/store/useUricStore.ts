import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { deleteUricReading, pushUricReading, pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { DEFAULT_TARGET_UMOL, type UricReading } from '../uric/types';

export type UricFields = Omit<UricReading, 'id'>;

/** The target can be set between these (µmol/L); outside is a typo. */
export const TARGET_RANGE = { min: 200, max: 480, step: 10 };

interface UricState {
  readings: UricReading[];
  /** The level the user wants to stay under (µmol/L), as their doctor set it. Saved to the cloud with the user's other settings. */
  targetUmol: number;
  addReading: (fields: UricFields) => UricReading;
  updateReading: (id: string, fields: UricFields) => void;
  removeReading: (id: string) => void;
  /** Adds the readings whose id this device does not have yet; returns how many were new. */
  importReadings: (readings: UricReading[]) => number;
  nudgeTarget: (direction: 1 | -1) => void;
}

export const useUricStore = create<UricState>()(
  persist(
    (set, get) => ({
      readings: [],
      targetUmol: DEFAULT_TARGET_UMOL,
      addReading: (fields) => {
        const reading: UricReading = { ...fields, note: fields.note.trim(), id: `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}` };
        set((s) => ({ readings: [...s.readings, reading] }));
        pushUricReading(reading);
        return reading;
      },
      updateReading: (id, fields) => {
        if (!get().readings.some((r) => r.id === id)) return;
        const updated: UricReading = { ...fields, note: fields.note.trim(), id };
        set((s) => ({ readings: s.readings.map((r) => (r.id === id ? updated : r)) }));
        pushUricReading(updated);
      },
      removeReading: (id) => {
        if (!get().readings.some((r) => r.id === id)) return;
        set((s) => ({ readings: s.readings.filter((r) => r.id !== id) }));
        deleteUricReading(id);
      },
      importReadings: (incoming) => {
        const have = new Set(get().readings.map((r) => r.id));
        const fresh = incoming.filter((r) => !have.has(r.id));
        if (fresh.length === 0) return 0;
        set((s) => ({ readings: [...s.readings, ...fresh] }));
        for (const r of fresh) pushUricReading(r);
        return fresh.length;
      },
      nudgeTarget: (direction) => {
        set((s) => ({ targetUmol: Math.min(TARGET_RANGE.max, Math.max(TARGET_RANGE.min, s.targetUmol + direction * TARGET_RANGE.step)) }));
        pushUserData(USER_DATA_KEYS.uricTarget, get().targetUmol);
      },
    }),
    { name: 'uric-store', storage: createJSONStorage(() => appStorage) }
  )
);
