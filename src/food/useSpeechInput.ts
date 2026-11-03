import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** The browser's speech recognition (Chrome, Edge, Safari: `webkitSpeechRecognition`); there is no Expo module for it, and on a
 *  phone app the keyboard's own dictation does the same job. Kept to the few members used here. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Can the "Nói" button work here (a browser with speech recognition)? */
export function speechInputAvailable(): boolean {
  return recognitionCtor() !== null;
}

/** Dictation into a text box: `start` listens and calls `onText` with what was there before plus what is being said (live);
 *  `stop` (or silence) ends it. Does nothing where speech recognition is missing. */
export function useSpeechInput(language: 'vi' | 'en', onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(
    (before: string) => {
      const Ctor = recognitionCtor();
      if (!Ctor || rec.current) return;
      const r = new Ctor();
      r.lang = language === 'vi' ? 'vi-VN' : 'en-US';
      r.interimResults = true;
      r.continuous = false;
      const head = before.trim();
      r.onresult = (e) => {
        let said = '';
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0]?.transcript ?? '';
        said = said.trim();
        if (said) onTextRef.current(head ? `${head} ${said}` : said);
      };
      const done = () => {
        rec.current = null;
        setListening(false);
      };
      r.onend = done;
      r.onerror = done;
      try {
        r.start();
        rec.current = r;
        setListening(true);
      } catch {
        done();
      }
    },
    [language]
  );

  useEffect(() => () => rec.current?.stop(), []);

  return { available: speechInputAvailable(), listening, start, stop };
}
