import { useNutritionStore } from '../store/useNutritionStore';
import { useProofStore } from '../store/useProofStore';
import { extraProofRef, type MealSlot } from '../types';
import { toDateKey } from './date';
import { persistPickedPhoto } from './photoStorage';

/** Puts a new photo on a logged off-plan food, replacing the old one; `null` removes it. The photo is kept on the device first, then saved and
 *  uploaded through the usual proof pipeline. Returns false when the photo could not be kept (nothing changes then). */
export async function setExtraPhoto(dateKey: string, itemId: string, pickedUri: string | null): Promise<boolean> {
  try {
    const kept = pickedUri ? await persistPickedPhoto(pickedUri, `extra-${itemId}-${Date.now()}`) : null;
    useNutritionStore.getState().updateExtra(dateKey, itemId, { photoUri: kept });
    return true;
  } catch {
    return false;
  }
}

/** The same for a plan meal (breakfast / lunch / dinner slot) of a given day. */
export async function setSlotPhoto(dateKey: string, slot: MealSlot, pickedUri: string | null): Promise<boolean> {
  try {
    const kept = pickedUri ? await persistPickedPhoto(pickedUri, `meal-${slot}-${dateKey}-${Date.now()}`) : null;
    const proofs = useProofStore.getState();
    for (const p of proofs.photos.filter((x) => x.taskType === 'meal' && x.taskRefId === slot && toDateKey(new Date(x.dateISO)) === dateKey)) proofs.removeProof(p.id);
    if (kept) {
      const today = toDateKey(new Date()) === dateKey;
      proofs.addProof({ taskType: 'meal', taskRefId: slot, photoUri: kept, note: '', dateISO: today ? new Date().toISOString() : new Date(`${dateKey}T12:00:00`).toISOString() });
    }
    return true;
  } catch {
    return false;
  }
}

/** Adds one more photo to a logged off-plan food (the first one becomes its own photo). False when it could not be kept. */
export async function addExtraPhoto(dateKey: string, itemId: string, pickedUri: string): Promise<boolean> {
  const item = useNutritionStore.getState().logs[dateKey]?.extraItems?.find((i) => i.id === itemId);
  if (!item) return false;
  const hasPhotos = !!item.photoUri || useProofStore.getState().photos.some((p) => p.taskRefId === extraProofRef(itemId));
  if (!hasPhotos) return setExtraPhoto(dateKey, itemId, pickedUri);
  try {
    const kept = await persistPickedPhoto(pickedUri, `extra-${itemId}-${Date.now()}`);
    useProofStore.getState().addProof({ taskType: 'meal', taskRefId: extraProofRef(itemId), photoUri: kept, note: item.name, dateISO: item.loggedAtISO });
    return true;
  } catch {
    return false;
  }
}

/** Removes one photo of a logged off-plan food; the others stay. */
export function removeExtraPhoto(dateKey: string, itemId: string, photo: { uri: string; proofId?: string }): boolean {
  const item = useNutritionStore.getState().logs[dateKey]?.extraItems?.find((i) => i.id === itemId);
  if (!item) return false;
  // The item's own photo is dropped through the store (which also removes its proof entry); a further photo is just its proof entry.
  if (photo.uri === item.photoUri) useNutritionStore.getState().updateExtra(dateKey, itemId, { photoUri: null });
  else if (photo.proofId) useProofStore.getState().removeProof(photo.proofId);
  return true;
}

/** Adds one more photo to a plan meal of a given day. */
export async function addSlotPhoto(dateKey: string, slot: MealSlot, pickedUri: string): Promise<boolean> {
  try {
    const kept = await persistPickedPhoto(pickedUri, `meal-${slot}-${dateKey}-${Date.now()}`);
    const today = toDateKey(new Date()) === dateKey;
    useProofStore.getState().addProof({ taskType: 'meal', taskRefId: slot, photoUri: kept, note: '', dateISO: today ? new Date().toISOString() : new Date(`${dateKey}T12:00:00`).toISOString() });
    return true;
  } catch {
    return false;
  }
}
