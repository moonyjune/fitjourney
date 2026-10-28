import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { ProofPhoto, ProofTaskType } from '../types';
import { toDateKey } from '../utils/date';
import { deletePersistedPhoto } from '../utils/photoStorage';
import { deleteProofPhoto, pushProofPhoto } from '../sync/cloudSync';

interface ProofState {
  photos: ProofPhoto[];
  addProof: (input: { taskType: ProofTaskType; taskRefId: string; photoUri: string; note: string; dateISO?: string }) => ProofPhoto;
  /** Deletes the photo on this device and, unless `cloud` is false (the caller already removed it there), in the cloud. */
  removeProof: (id: string, options?: { cloud?: boolean }) => void;
  /** Returns a new array each call — filter `photos` in a component's own useMemo instead of using this as a hook selector. */
  proofsForDateKey: (dateKey: string) => ProofPhoto[];
  proofFor: (dateKey: string, taskType: ProofTaskType, taskRefId: string) => ProofPhoto | undefined;
}

export const useProofStore = create<ProofState>()(
  persist(
    (set, get) => ({
      photos: [],
      addProof: ({ taskType, taskRefId, photoUri, note, dateISO }) => {
        // Several photos of one meal are added in the same millisecond: each still needs its own id (it names the file in the cloud).
        const base = `${Date.now()}`;
        const taken = new Set(get().photos.map((p) => p.id));
        let id = base;
        for (let n = 1; taken.has(id); n += 1) id = `${base}-${n}`;
        const proof: ProofPhoto = {
          id,
          dateISO: dateISO ?? new Date().toISOString(),
          taskType,
          taskRefId,
          photoUri,
          note,
          createdAtISO: new Date().toISOString(),
        };
        set((state) => ({ photos: [...state.photos, proof] }));
        pushProofPhoto(proof);
        return proof;
      },
      removeProof: (id, options) => {
        const target = get().photos.find((p) => p.id === id);
        if (target) {
          deletePersistedPhoto(target.photoUri).catch(() => {});
          if (options?.cloud !== false) deleteProofPhoto(id).catch(() => {});
        }
        set((state) => ({ photos: state.photos.filter((p) => p.id !== id) }));
      },
      proofsForDateKey: (dateKey) => get().photos.filter((p) => toDateKey(new Date(p.dateISO)) === dateKey),
      proofFor: (dateKey, taskType, taskRefId) =>
        get().photos.find(
          (p) => toDateKey(new Date(p.dateISO)) === dateKey && p.taskType === taskType && p.taskRefId === taskRefId
        ),
    }),
    {
      name: 'proof-store',
      storage: createJSONStorage(() => appStorage),
    }
  )
);
