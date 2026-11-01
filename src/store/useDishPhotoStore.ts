import { create } from 'zustand';
import type { DishPhotoInfo } from '../../supabase/functions/_shared/dishPhoto';

/** A dish's photo as the app knows it this session: being asked for, or answered (a photo, or null: none found, AI off, offline,
 *  the picture did not load). `sample`: the dev account's labelled sample. `failed`: the request failed (asked again later). */
export type DishPhotoState = { status: 'loading' } | { status: 'done'; photo: DishPhotoInfo | null; sample?: boolean; failed?: boolean; at: number };

interface DishPhotoStoreState {
  /** By dishKey of the name. Memory only: the server keeps the long-lived cache (table dish_photos). */
  byKey: Record<string, DishPhotoState>;
  put: (entries: Record<string, DishPhotoState>) => void;
}

export const useDishPhotoStore = create<DishPhotoStoreState>()((set) => ({
  byKey: {},
  put: (entries) => set((s) => ({ byKey: { ...s.byKey, ...entries } })),
}));

export function resetDishPhotoStore(): void {
  useDishPhotoStore.setState({ byKey: {} });
}
