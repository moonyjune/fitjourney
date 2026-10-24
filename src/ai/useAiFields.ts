import { useCallback, useRef } from 'react';

/** Tracks which form fields currently hold a value filled in by the AI, so a later analysis can refresh those (or empty
 *  fields) but never overwrite something the user typed. Typing in a field makes it the user's again. */
export function useAiFields<K extends string>() {
  const filled = useRef<Partial<Record<K, string>>>({});

  /** Wraps a field's setter for user edits. */
  const typed = useCallback(
    (key: K, set: (value: string) => void) => (value: string) => {
      delete filled.current[key];
      set(value);
    },
    []
  );

  /** Puts `value` into the field if it is empty or still AI-filled. Returns 'kept' when the user's own text was left
   *  alone, 'filled' when the value went in, 'none' when the AI gave nothing for this field. */
  const fill = useCallback((key: K, current: string, value: string | undefined, set: (value: string) => void): 'filled' | 'kept' | 'none' => {
    if (value === undefined) return 'none';
    if (current.trim() === '' || filled.current[key] !== undefined) {
      set(value);
      filled.current[key] = value;
      return 'filled';
    }
    return 'kept';
  }, []);

  const clear = useCallback(() => {
    filled.current = {};
  }, []);

  return { typed, fill, clear };
}

/** The AI's number as text for an input (whole numbers, or one decimal); undefined when it gave none / nonsense. */
export function aiNumberText(value: number | undefined, decimals: 0 | 1 = 0): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const factor = decimals === 1 ? 10 : 1;
  return String(Math.round(value * factor) / factor);
}
