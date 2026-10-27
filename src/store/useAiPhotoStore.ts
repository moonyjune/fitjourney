import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';

interface AiPhotoState {
  /** Send photos to the AI at Full HD (1920 px) instead of the smaller default (1280 px). */
  fullHd: boolean;
  setFullHd: (value: boolean) => void;
  /** Master switch for every AI feature on this device (on by default). Off: nothing is sent to the server. */
  aiEnabled: boolean;
  setAiEnabled: (value: boolean) => void;
}

/** Device preference for how photos are sent to the AI. Local only; it is not tied to an account. */
export const useAiPhotoStore = create<AiPhotoState>()(
  persist(
    (set) => ({
      fullHd: false,
      setFullHd: (fullHd) => set({ fullHd }),
      aiEnabled: true,
      setAiEnabled: (aiEnabled) => set({ aiEnabled }),
    }),
    { name: 'ai-photo-store', storage: createJSONStorage(() => appStorage) }
  )
);
