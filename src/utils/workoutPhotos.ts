import type { ProofPhoto, WorkoutLogEntry } from '../types';
import { useProofStore } from '../store/useProofStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { deletePersistedPhoto, persistPickedPhoto } from './photoStorage';

// The photo of a workout result is a normal workout proof (taskType 'workout', taskRefId = the entry id), so it syncs
// through the existing proof pipeline and the coach screen already shows it next to the entry.

export function workoutProofFor(photos: ProofPhoto[], entryId: string): ProofPhoto | undefined {
  return photos.find((p) => p.taskType === 'workout' && p.taskRefId === entryId);
}

/** Copies the picker's temporary file into our own storage. Throws if that fails; nothing else has happened yet. */
export function persistWorkoutPhoto(tempUri: string): Promise<string> {
  return persistPickedPhoto(tempUri, `workout-${Date.now()}`);
}

/** Attaches an already persisted photo to an entry. If the proof can't be created the file is deleted again. */
export function linkWorkoutPhoto(entry: Pick<WorkoutLogEntry, 'id' | 'dateISO'>, persistedUri: string): ProofPhoto {
  try {
    return useProofStore.getState().addProof({ taskType: 'workout', taskRefId: entry.id, photoUri: persistedUri, note: '', dateISO: entry.dateISO });
  } catch (error) {
    deletePersistedPhoto(persistedUri).catch(() => {});
    throw error;
  }
}

/** Removes the photo(s) of an entry: the proof entries, which also delete their files. */
export function detachWorkoutPhoto(entryId: string): void {
  const proofs = useProofStore.getState();
  for (const p of proofs.photos.filter((x) => x.taskType === 'workout' && x.taskRefId === entryId)) proofs.removeProof(p.id);
}

/** Puts a new photo on an existing entry, replacing the old one. The new file is copied first, so a failure leaves the
 *  old photo untouched. */
export async function replaceWorkoutPhoto(entry: Pick<WorkoutLogEntry, 'id' | 'dateISO'>, tempUri: string): Promise<ProofPhoto> {
  const persisted = await persistWorkoutPhoto(tempUri);
  detachWorkoutPhoto(entry.id);
  return linkWorkoutPhoto(entry, persisted);
}

/** Logs a workout together with its photo, or neither: if the photo can't be saved no entry is created. */
export async function addWorkoutWithPhoto(
  entry: Omit<WorkoutLogEntry, 'id' | 'dateISO'>,
  dateISO: string,
  tempPhotoUri: string | null
): Promise<WorkoutLogEntry> {
  const persisted = tempPhotoUri ? await persistWorkoutPhoto(tempPhotoUri) : null;
  const created = useWorkoutStore.getState().addEntry(entry, dateISO);
  if (persisted) {
    try {
      linkWorkoutPhoto(created, persisted);
    } catch (error) {
      useWorkoutStore.getState().removeEntry(created.id);
      throw error;
    }
  }
  return created;
}
