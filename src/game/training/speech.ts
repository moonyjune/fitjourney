import * as Speech from 'expo-speech';
import type { SpeechLang } from './voice';

export type VoiceGender = 'female' | 'male';

/** What the user picked for the training voice: its language and whether it sounds male or female. */
export interface VoicePrefs {
  lang: SpeechLang;
  gender: VoiceGender;
}

export const DEFAULT_VOICE: VoicePrefs = { lang: 'en', gender: 'female' };

/** The locale asked of the engine for each voice language. */
export const SPEECH_LOCALE: Record<SpeechLang, string> = { vi: 'vi-VN', en: 'en-US' };
/** Kept for callers that only need the default (English) locale. */
export const SPEECH_LANGUAGE = SPEECH_LOCALE.en;

/** Pitch used when no voice of the wanted gender exists, so female / male still sound different. */
export const FALLBACK_PITCH: Record<VoiceGender, number> = { female: 1.4, male: 0.6 };

/** The fields of an engine voice the selection needs (expo-speech `Voice`, web voices included). */
export interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
}

// Voice names whose gender is known. Engines rarely report gender, so it is guessed from the name (and the
// identifier, which on iOS / Android carries the name or a code). Matched as whole words, lower case.
const FEMALE_NAMES = new Set([
  'female', 'woman', 'samantha', 'karen', 'moira', 'tessa', 'victoria', 'allison', 'ava', 'susan', 'zoe', 'kate',
  'serena', 'fiona', 'veena', 'nicky', 'joanna', 'salli', 'kimberly', 'kendra', 'ivy', 'emma', 'amy', 'jenny', 'aria',
  'libby', 'sonia', 'natasha', 'zira', 'hazel', 'heera', 'catherine', 'michelle', 'sara', 'clara', 'linda',
  'jessa', 'ana', 'nova', 'shelley', 'sandy', 'grandma', 'flo', 'martha', 'agnes', 'kathy', 'princess', 'vicki',
  // Vietnamese
  'linh', 'hoaimy', 'mai', 'lan', 'thu', 'my',
  // Android / Google codes: en-us-x-sfg etc.
  'sfg', 'tpc', 'tpf', 'iob', 'iog', 'gft',
]);
const MALE_NAMES = new Set([
  'male', 'man', 'daniel', 'alex', 'fred', 'tom', 'aaron', 'arthur', 'oliver', 'gordon', 'lee', 'rishi', 'ralph',
  'albert', 'bruce', 'junior', 'matthew', 'joey', 'justin', 'brian', 'guy', 'ryan', 'christopher', 'eric', 'roger',
  'steffan', 'william', 'david', 'mark', 'george', 'james', 'thomas', 'reed', 'rocko', 'eddy', 'grandpa', 'jacques',
  'andrew', 'davis', 'tony', 'liam', 'brandon',
  // Vietnamese
  // ("nam" is left out: "Việt Nam" is in the name of most Vietnamese voices, whatever their gender.)
  'an', 'namminh', 'minh', 'khang', 'quang',
  // Android / Google codes
  'iol', 'iom', 'tpd', 'gfm',
]);

/** The gender a voice is known to have from its name / identifier, or null when the name gives no hint. */
export function voiceGenderOf(voice: Pick<VoiceInfo, 'name' | 'identifier'>): VoiceGender | null {
  // Accents are dropped first so "Tiếng Việt" splits into whole words instead of fragments.
  const plain = `${voice.name} ${voice.identifier}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd');
  const words = plain.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  // "female" contains "male": test the explicit word first, then the name lists.
  if (words.includes('female')) return 'female';
  if (words.includes('male')) return 'male';
  if (words.some((w) => FEMALE_NAMES.has(w))) return 'female';
  if (words.some((w) => MALE_NAMES.has(w))) return 'male';
  return null;
}

function langOf(voice: VoiceInfo): string {
  return (voice.language || '').replace('_', '-').toLowerCase();
}

export interface VoiceChoice {
  /** Engine voice identifier, absent when the device has no voice for the language (the engine then picks). */
  voice?: string;
  language: string;
  pitch: number;
}

/** Picks the voice for the user's choice: a voice of the language whose name says it is of the wanted gender (the
 *  main locale first, e.g. en-US before en-GB). Without one, any voice of the language (one of unknown gender before
 *  one of the other gender) with the pitch moved up for female / down for male, so the choice is still audible. */
export function pickVoice(voices: readonly VoiceInfo[], prefs: VoicePrefs): VoiceChoice {
  const locale = SPEECH_LOCALE[prefs.lang];
  const ofLang = voices.filter((v) => langOf(v).startsWith(prefs.lang));
  const mainLocaleFirst = (list: VoiceInfo[]) =>
    [...list].sort((a, b) => Number(langOf(b) === locale.toLowerCase()) - Number(langOf(a) === locale.toLowerCase()));
  const matched = mainLocaleFirst(ofLang.filter((v) => voiceGenderOf(v) === prefs.gender))[0];
  if (matched) return { voice: matched.identifier, language: matched.language || locale, pitch: 1.0 };
  const fallback =
    mainLocaleFirst(ofLang.filter((v) => voiceGenderOf(v) === null))[0] ?? mainLocaleFirst(ofLang)[0];
  return { voice: fallback?.identifier, language: fallback?.language || locale, pitch: FALLBACK_PITCH[prefs.gender] };
}

export interface VoiceInUse {
  /** The device voice's name, or null when the device has no voice for the language. */
  name: string | null;
  /** false: no voice of the chosen gender, the pitch is moved to make up for it. */
  exact: boolean;
}

/** Which device voice the current choice uses (for the hint under the picker). Null until the voices are loaded. */
export function voiceInUse(prefs: VoicePrefs): VoiceInUse | null {
  if (voices.length === 0) return null;
  const choice = pickVoice(voices, prefs);
  const voice = voices.find((v) => v.identifier === choice.voice);
  return { name: voice ? voice.name : null, exact: choice.pitch === 1 };
}

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

// The device's voices, loaded once. Browsers fill the list late (after `voiceschanged`), so an empty answer is not
// cached and the list is asked for again.
let voices: VoiceInfo[] = [];
let loading: Promise<void> | null = null;
let listening = false;

/** Loads the device's voices in the background; speech before they arrive uses the engine default plus pitch. */
export function preloadVoices(): Promise<void> {
  if (voices.length > 0 || !supported() || typeof Speech.getAvailableVoicesAsync !== 'function') return Promise.resolve();
  if (!listening && typeof window !== 'undefined' && window.speechSynthesis?.addEventListener) {
    listening = true;
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      voices = [];
      void preloadVoices();
    });
  }
  loading ??= Promise.resolve()
    .then(() => Speech.getAvailableVoicesAsync())
    .then((list) => {
      voices = (list ?? []).map((v) => ({ identifier: v.identifier, name: v.name, language: v.language }));
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** For tests: forget the loaded voices. */
export function resetVoicesForTest(): void {
  voices = [];
  loading = null;
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
  /** The voice language and gender. The text must already be in that language. Default: English, female. */
  voice?: VoicePrefs;
}

export function speak(text: string, { queue = false, voice = DEFAULT_VOICE }: SpeakOptions = {}): void {
  if (!text || !supported()) return;
  try {
    if (!queue) stopSpeaking();
    if (voices.length === 0) void preloadVoices();
    const choice = pickVoice(voices, voice);
    Speech.speak(text, { language: choice.language, pitch: choice.pitch, rate: 1.0, ...(choice.voice ? { voice: choice.voice } : {}) });
  } catch {
    // ignore
  }
}
