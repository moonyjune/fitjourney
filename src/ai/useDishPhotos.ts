import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { dishKey, MAX_DISHES } from '../../supabase/functions/_shared/dishPhoto';
import { useDishPhotoStore, type DishPhotoState } from '../store/useDishPhotoStore';
import { requestDishPhotos } from '../sync/cloudSync';

// Real dish photos for the screens: every card asks for its dish's photo, the asks of one render are gathered for a moment and sent
// together (up to MAX_DISHES names per request, each name once), and the answers are kept for the session (useDishPhotoStore), so a
// re-render or the same dish on another screen never asks again. A failed request (offline, quota, AI off) shows the emoji and is
// asked again after RETRY_AFTER_MS.

/** How long the asks are gathered before a request goes out. */
export const BATCH_WAIT_MS = 40;
/** A failed request's dishes are asked again after this long. */
export const RETRY_AFTER_MS = 5 * 60_000;

const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function fetchBatch(batch: [string, string][]): Promise<void> {
  let outcome: Awaited<ReturnType<typeof requestDishPhotos>> | null = null;
  try {
    outcome = await requestDishPhotos(batch.map(([, name]) => name));
  } catch {
    outcome = null;
  }
  const at = Date.now();
  const done: Record<string, DishPhotoState> = {};
  for (const [key] of batch) {
    if (!outcome || !outcome.ok) {
      done[key] = { status: 'done', photo: null, failed: true, at };
      continue;
    }
    const hit = outcome.dishes.find((d) => d.key === key);
    done[key] = { status: 'done', photo: hit?.photo ?? null, ...(outcome.sample ? { sample: true } : {}), at };
  }
  useDishPhotoStore.getState().put(done);
}

async function flush(): Promise<void> {
  timer = null;
  const batch = [...pending.entries()];
  pending.clear();
  const chunks: [string, string][][] = [];
  for (let i = 0; i < batch.length; i += MAX_DISHES) chunks.push(batch.slice(i, i + MAX_DISHES));
  await Promise.all(chunks.map(fetchBatch));
}

/** Asks for the photos of these dish names: each name not known yet (or whose request failed a while ago) once, gathered into one
 *  request with the other asks of the same moment. */
export function queueDishPhotos(names: string[]): void {
  const { byKey, put } = useDishPhotoStore.getState();
  const loading: Record<string, DishPhotoState> = {};
  const now = Date.now();
  for (const name of names) {
    const key = dishKey(name);
    if (!key || pending.has(key) || loading[key]) continue;
    const known = byKey[key];
    if (known && !(known.status === 'done' && known.failed && now - known.at >= RETRY_AFTER_MS)) continue;
    pending.set(key, name);
    loading[key] = { status: 'loading' };
  }
  if (Object.keys(loading).length === 0) return;
  put(loading);
  if (!timer) timer = setTimeout(() => void flush(), BATCH_WAIT_MS);
}

/** The photos of these dishes by name (undefined until asked). */
export function useDishPhotos(names: string[]): Record<string, DishPhotoState | undefined> {
  const signature = names.join('\n');
  useEffect(() => {
    if (names.length > 0) queueDishPhotos(names);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const states = useDishPhotoStore(useShallow((s) => names.map((n) => s.byKey[dishKey(n)])));
  const out: Record<string, DishPhotoState | undefined> = {};
  names.forEach((n, i) => (out[n] = states[i]));
  return out;
}

/** One dish's photo; null `name` asks for nothing. */
export function useDishPhoto(name: string | null): DishPhotoState | undefined {
  useEffect(() => {
    if (name) queueDishPhotos([name]);
  }, [name]);
  return useDishPhotoStore((s) => (name ? s.byKey[dishKey(name)] : undefined));
}

/** Marks a photo that did not load as none, so the emoji and no credit line show everywhere for that dish. */
export function dropDishPhoto(name: string): void {
  const key = dishKey(name);
  if (key) useDishPhotoStore.getState().put({ [key]: { status: 'done', photo: null, at: Date.now() } });
}
