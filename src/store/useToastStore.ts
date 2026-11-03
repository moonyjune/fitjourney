import { create } from 'zustand';

/** Colour of a toast: `mana` for water, `gold` for things logged / saved / removed, `danger` for an error, `neutral` for a tip. */
export type ToastTone = 'mana' | 'gold' | 'danger' | 'neutral';

export interface ToastInput {
  text: string;
  /** Puts a "Hoàn tác" button on the toast; pressing it runs this and closes the toast. */
  undo?: () => void;
  /** Another button instead of undo ("Xem", "Thử lại"); ignored when `undo` is given. */
  action?: { label: string; onPress: () => void };
  /** Runs once when the toast goes away without its undo being pressed (timed out, closed, or replaced by a newer toast): e.g. the
   *  photos of a deleted meal are thrown away only then, so "Hoàn tác" can bring the meal back with them. */
  onExpire?: () => void;
  /** Gold by default. */
  tone?: ToastTone;
  /** How long it stays up (5 s by default). */
  durationMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
  tone: ToastTone;
  durationMs: number;
}

export const TOAST_DEFAULT_MS = 5000;

interface ToastState {
  /** The toast on screen: only one at a time, a new one replaces it. */
  toast: Toast | null;
  show: (input: ToastInput) => number;
  /** Closes the toast (only that one when an id is given, so a late timer never closes a newer toast). */
  hide: (id?: number) => void;
  /** Runs the shown toast's undo (once) and closes it. */
  undo: () => void;
}

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Runs a toast's `onExpire` (a throwing callback must not break the toast itself). */
function expire(toast: Toast | null) {
  if (!toast?.onExpire) return;
  try {
    toast.onExpire();
  } catch {
    // nothing to do: the toast is gone either way
  }
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toast: null,
  show: (input) => {
    clearTimer();
    expire(get().toast);
    const id = nextId++;
    const durationMs = input.durationMs ?? TOAST_DEFAULT_MS;
    set({ toast: { ...input, id, tone: input.tone ?? 'gold', durationMs } });
    if (durationMs > 0 && Number.isFinite(durationMs)) timer = setTimeout(() => get().hide(id), durationMs);
    return id;
  },
  hide: (id) => {
    const current = get().toast;
    if (!current || (id != null && current.id !== id)) return;
    clearTimer();
    set({ toast: null });
    expire(current);
  },
  undo: () => {
    const current = get().toast;
    if (!current?.undo) return;
    clearTimer();
    set({ toast: null });
    current.undo();
  },
}));

/** Shows a short message at the bottom of the screen, e.g. `showToast({ text: 'Đã thêm 250 ml', undo: () => … })`. Returns its id. */
export function showToast(input: ToastInput): number {
  return useToastStore.getState().show(input);
}

export function hideToast(id?: number): void {
  useToastStore.getState().hide(id);
}
