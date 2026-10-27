import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import type { ExerciseId } from '../game/training/exercises';
import { applyRating, progressFor, type ExerciseProgress, type Rating } from '../game/training/progress';

interface TrainingState {
  /** Spoken guidance during a session (steps, counting, rest). On by default. Local to this device. */
  voiceOn: boolean;
  setVoiceOn: (on: boolean) => void;
  progress: Partial<Record<ExerciseId, ExerciseProgress>>;
  /** Records how each exercise felt in a session and moves levels per the progression rules.
   *  Returns the exercises that levelled up. Local to this device (not synced to the cloud). */
  commitRatings: (ratings: Partial<Record<ExerciseId, Rating>>, now?: Date) => ExerciseId[];
}

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      voiceOn: true,
      setVoiceOn: (on) => set({ voiceOn: on }),
      progress: {},
      commitRatings: (ratings, now = new Date()) => {
        const next = { ...get().progress };
        const leveledUp: ExerciseId[] = [];
        for (const [id, rating] of Object.entries(ratings) as [ExerciseId, Rating][]) {
          const outcome = applyRating(progressFor(next, id), rating, now);
          next[id] = outcome.progress;
          if (outcome.change === 'up') leveledUp.push(id);
        }
        set({ progress: next });
        return leveledUp;
      },
    }),
    { name: 'training-store', storage: createJSONStorage(() => appStorage) }
  )
);
