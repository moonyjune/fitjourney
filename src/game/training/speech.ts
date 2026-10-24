import * as Speech from 'expo-speech';

/** The training voice is always English, independent of the app language. */
export const SPEECH_LANGUAGE = 'en-US';

/** Speech is a nicety: it must never throw, and silently does nothing where it is unavailable (some browsers and
 *  emulators have no speech engine). */
function supported(): boolean {
  try {
    if (typeof Speech?.speak !== 'function') return false;
    // On web there is no engine at all in some environments (e.g. server rendering, old browsers).
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && !('speechSynthesis' in window)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isSpeechAvailable(): boolean {
  return supported();
}

/** Cuts off whatever is being said and clears the queue. */
export function stopSpeaking(): void {
  if (!supported()) return;
  try {
    void Promise.resolve(Speech.stop()).catch(() => undefined);
  } catch {
    // ignore
  }
}

interface SpeakOptions {
  /** true: add behind what is already being said (a script of several sentences). false (default): drop everything
   *  queued and say this now — used for counting, so a number is never stuck behind stale speech. */
  queue?: boolean;
}

export function speak(text: string, { queue = false }: SpeakOptions = {}): void {
  if (!text || !supported()) return;
  try {
    if (!queue) stopSpeaking();
    Speech.speak(text, { language: SPEECH_LANGUAGE, rate: 1.0, pitch: 1.0 });
  } catch {
    // ignore
  }
}
