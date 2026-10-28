import { extraProofRef, type ExtraFoodItem, type ProofPhoto } from '../types';
import { toDateKey } from './date';

/** How many photos one meal can keep. */
export const MAX_MEAL_PHOTOS = 3;

/** One photo of a meal: where it is, and the proof entry it belongs to (none for an item's own copy without a proof). */
export interface MealPhotoRef {
  uri: string;
  proofId?: string;
}

/** Photos in the order they were added (ids break a tie: several photos saved at once get "…", "…-1", "…-2"). */
export function sortedPhotos<T extends Pick<ProofPhoto, 'id' | 'createdAtISO'>>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.createdAtISO.localeCompare(b.createdAtISO) || a.id.length - b.id.length || a.id.localeCompare(b.id));
}

/** Every photo of a logged off-plan food, first one first. Its own `photoUri` leads (it is the one chosen first) and stands in alone when
 *  the proof entries are missing (e.g. a coach's view without them). */
export function extraPhotoRefs(photos: ProofPhoto[], item: Pick<ExtraFoodItem, 'id' | 'photoUri'>): MealPhotoRef[] {
  const ref = extraProofRef(item.id);
  const linked = sortedPhotos(photos.filter((p) => p.taskType === 'meal' && p.taskRefId === ref));
  const main = item.photoUri ? linked.find((p) => p.photoUri === item.photoUri) : undefined;
  const rest = linked.filter((p) => p !== main).map((p) => ({ uri: p.photoUri, proofId: p.id }));
  if (main) return [{ uri: main.photoUri, proofId: main.id }, ...rest];
  return item.photoUri && linked.length === 0 ? [{ uri: item.photoUri }] : rest;
}

/** Every photo of a plan meal (breakfast / lunch / dinner slot) on a given day, first one first. */
export function slotPhotoRefs(photos: ProofPhoto[], dateKey: string, slot: string): MealPhotoRef[] {
  return sortedPhotos(photos.filter((p) => p.taskType === 'meal' && p.taskRefId === slot && toDateKey(new Date(p.dateISO)) === dateKey)).map((p) => ({ uri: p.photoUri, proofId: p.id }));
}
