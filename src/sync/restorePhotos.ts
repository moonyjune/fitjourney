import { supabase } from '../lib/supabase';
import { useNutritionStore } from '../store/useNutritionStore';
import { useProofStore } from '../store/useProofStore';
import type { ProofPhoto, ProofTaskType } from '../types';
import { downloadPhoto } from '../utils/photoStorage';
import { extraProofRef } from '../types';
import { currentUserId } from './cloudSync';
import { sortedPhotos } from '../utils/photoOrder';

/** Photos brought back per run: the newest first; the rest follow on the next start. */
const MAX_PER_RUN = 30;

type Row = { entry_date: string; task_type: string; task_ref_id: string; photo_path: string; note: string | null; created_at: string | null };

/** The photo id in a storage path "<user>/<id>.<ext>". Older web builds wrote "<user>/<id>.app/<uuid>" (the extension was cut from a blob: URL), so the id is
 *  whatever stands before the first dot of the part after the user folder. */
const idOfPath = (path: string): string => (path.split('/')[1] ?? '').split('.')[0];

/** A photo on this device that cannot be shown any more: web kept photos as blob: URLs, which are gone once the page is reloaded. */
const isDead = (p: ProofPhoto): boolean => p.photoUri.startsWith('blob:');

/** Brings the signed-in user's own meal and workout photos back from the cloud onto this device (a new device, or after signing out wipes it).
 *  What is already here wins: a photo is only added when the device has none with that id and none for the same meal or workout.
 *  Returns how many were added. Never throws. */
export async function restoreProofPhotos(): Promise<number> {
  const userId = currentUserId();
  if (!userId) return 0;
  try {
    const { data, error } = await supabase
      .from('proof_photos')
      .select('entry_date, task_type, task_ref_id, photo_path, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const have = useProofStore.getState().photos.filter((p) => !isDead(p));
    const haveIds = new Set(have.map((p) => p.id));
    // A meal can have several photos: one is missing here only while the device has fewer photos of it than the cloud.
    const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const haveFor = new Map<string, number>();
    for (const p of have) count(haveFor, `${p.taskType}|${p.taskRefId}|${p.dateISO.slice(0, 10)}`);
    const cloudFor = new Map<string, number>();
    for (const r of (data ?? []) as Row[]) count(cloudFor, `${r.task_type}|${r.task_ref_id}|${r.entry_date}`);
    const missing = ((data ?? []) as Row[]).filter((r) => {
      const id = idOfPath(r.photo_path);
      const key = `${r.task_type}|${r.task_ref_id}|${r.entry_date}`;
      return id && !haveIds.has(id) && (haveFor.get(key) ?? 0) < (cloudFor.get(key) ?? 0);
    });
    const added: ProofPhoto[] = [];
    for (const row of missing.slice(0, MAX_PER_RUN)) {
      const id = idOfPath(row.photo_path);
      const { data: signed } = await supabase.storage.from('proofs').createSignedUrl(row.photo_path, 600);
      if (!signed?.signedUrl) continue;
      try {
        const photoUri = await downloadPhoto(signed.signedUrl, `cloud-${id}`);
        added.push({
          id,
          dateISO: `${row.entry_date}T05:00:00.000Z`,
          taskType: (row.task_type === 'workout' ? 'workout' : 'meal') as ProofTaskType,
          taskRefId: row.task_ref_id,
          photoUri,
          note: row.note ?? '',
          createdAtISO: row.created_at ?? new Date().toISOString(),
        });
      } catch (error) {
        console.warn('[restore] photo not downloaded:', error);
      }
    }
    // Signed out or switched account while downloading: do not put someone else's photos on this device.
    if (added.length === 0 || currentUserId() !== userId) return 0;
    useProofStore.setState((s) => {
      // A photo that was only a dead link is replaced by the one just downloaded.
      const replaced = new Set(added.map((p) => p.id));
      const kept = s.photos.filter((p) => !(isDead(p) && replaced.has(p.id)));
      const known = new Set(kept.map((p) => p.id));
      return { photos: [...kept, ...added.filter((p) => !known.has(p.id))] };
    });
    // A food logged on another device points at that device's file; show the photo that is here.
    // A meal can have several photos: its own photo is the first one added.
    const byRef = new Map<string, string>();
    for (const p of sortedPhotos(added)) if (!byRef.has(p.taskRefId)) byRef.set(p.taskRefId, p.photoUri);
    useNutritionStore.setState((s) => {
      let changed = false;
      const logs = { ...s.logs };
      for (const [key, log] of Object.entries(s.logs)) {
        const items = (log.extraItems ?? []).map((i) => {
          const uri = byRef.get(extraProofRef(i.id));
          if (!uri || i.photoUri === uri) return i;
          changed = true;
          return { ...i, photoUri: uri };
        });
        if (items !== log.extraItems) logs[key] = { ...log, extraItems: items };
      }
      return changed ? { logs } : s;
    });
    return added.length;
  } catch (error) {
    console.warn('[restore] photos not restored:', error);
    return 0;
  }
}
