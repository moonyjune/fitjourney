import { useNutritionStore } from '../store/useNutritionStore';
import { useProofStore } from '../store/useProofStore';
import type { MealSlot } from '../types';
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
