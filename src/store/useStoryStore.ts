import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '../lib/appStorage';
import { pushUserData } from '../sync/cloudSync';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import { cleanStoryData, type StoryChapter } from '../story/chapters';

interface StoryState {
  /** Written chapters, oldest first. */
  chapters: StoryChapter[];
  /** Adds a chapter (replacing one with the same id) and saves the story to the cloud. */
  addChapter: (chapter: StoryChapter) => void;
}

export const useStoryStore = create<StoryState>()(
  persist(
    (set, get) => ({
      chapters: [],
      addChapter: (chapter) => {
        const { chapters } = cleanStoryData({ chapters: [chapter, ...get().chapters.filter((c) => c.id !== chapter.id)] });
        set({ chapters });
        void pushUserData(USER_DATA_KEYS.story, { chapters });
      },
    }),
    { name: 'story-store', storage: createJSONStorage(() => appStorage), partialize: (s) => ({ chapters: s.chapters }) }
  )
);
