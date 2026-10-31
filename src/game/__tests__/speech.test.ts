import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSpeak = jest.fn();
const mockStop = jest.fn();
let mockVoices: { identifier: string; name: string; language: string }[] = [];
jest.mock('expo-speech', () => ({
  speak: (...a: unknown[]) => mockSpeak(...a),
  stop: () => mockStop(),
  getAvailableVoicesAsync: () => Promise.resolve(mockVoices),
}));

import {
  FALLBACK_PITCH,
  SPEECH_LANGUAGE,
  pickVoice,
  preloadVoices,
  resetVoicesForTest,
  speak,
  stopSpeaking,
  voiceGenderOf,
  WEB_AFTER_STOP_MS,
  type VoiceInfo,
} from '../training/speech';
import { Platform } from 'react-native';
import { useSettingsStore } from '../../store/useSettingsStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({ pushProfile: jest.fn(), ensureCoachCode: jest.fn(), linkToCoach: jest.fn(), pullProfile: jest.fn() }));

describe('speech wrapper', () => {
  beforeEach(() => {
    mockSpeak.mockClear();
    mockStop.mockClear();
  });

  it('asks the engine for an English (en-US) voice by default, even when the app is set to Vietnamese', () => {
    useSettingsStore.setState({ language: 'vi' });
    speak('Chair squat', { queue: true });
    expect(SPEECH_LANGUAGE).toBe('en-US');
    expect(mockSpeak).toHaveBeenCalledWith('Chair squat', expect.objectContaining({ language: 'en-US' }));
    expect(mockSpeak.mock.calls.every(([, o]) => (o as { language: string }).language === 'en-US')).toBe(true);
  });

  it('counting (not queued) cuts stale speech first; queued sentences do not', () => {
    speak('1');
    expect(mockStop).toHaveBeenCalledTimes(1);
    mockStop.mockClear();
    speak('Next sentence', { queue: true });
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('on the web, a sentence that cuts speech off waits a moment so the browser does not drop it', () => {
    jest.useFakeTimers();
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      speak('1');
      expect(mockStop).toHaveBeenCalled();
      expect(mockSpeak).not.toHaveBeenCalled();
      jest.advanceTimersByTime(WEB_AFTER_STOP_MS);
      expect(mockSpeak).toHaveBeenCalledWith('1', expect.anything());
      mockSpeak.mockClear();
      speak('queued', { queue: true });
      expect(mockSpeak).toHaveBeenCalled(); // nothing was cut: no wait
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      jest.useRealTimers();
    }
  });

  it('ignores empty text and stopSpeaking never throws', () => {
    speak('');
    expect(mockSpeak).not.toHaveBeenCalled();
    mockStop.mockImplementation(() => {
      throw new Error('engine gone');
    });
    expect(() => stopSpeaking()).not.toThrow();
  });
});

const v = (identifier: string, name: string, language: string): VoiceInfo => ({ identifier, name, language });
// A mix like a desktop browser / iOS / Android would report.
const VOICES: VoiceInfo[] = [
  v('Google UK English Male', 'Google UK English Male', 'en-GB'),
  v('Google UK English Female', 'Google UK English Female', 'en-GB'),
  v('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'en-US'),
  v('com.apple.speech.synthesis.voice.Alex', 'Alex', 'en-US'),
  v('com.apple.voice.compact.en-AU.Karen', 'Karen', 'en-AU'),
  v('com.apple.voice.compact.vi-VN.Linh', 'Linh', 'vi-VN'),
  v('Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)', 'Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'),
  v('Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'),
  v('Google Tiếng Việt', 'Google Tiếng Việt', 'vi-VN'),
];

describe('voiceGenderOf', () => {
  it('reads the gender from the name or identifier, "Female" before "Male"', () => {
    expect(voiceGenderOf(v('x', 'Google UK English Female', 'en-GB'))).toBe('female');
    expect(voiceGenderOf(v('x', 'Google UK English Male', 'en-GB'))).toBe('male');
    expect(voiceGenderOf(v('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'en-US'))).toBe('female');
    expect(voiceGenderOf(v('x', 'Daniel', 'en-GB'))).toBe('male');
    expect(voiceGenderOf(v('x', 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'))).toBe('female');
    expect(voiceGenderOf(v('x', 'Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)', 'vi-VN'))).toBe('male');
    expect(voiceGenderOf(v('x', 'Microsoft An - Vietnamese (Vietnam)', 'vi-VN'))).toBe('male');
    expect(voiceGenderOf(v('en-us-x-sfg-local', 'en-us-x-sfg-local', 'en-US'))).toBe('female');
    expect(voiceGenderOf(v('en-us-x-iom-local', 'en-us-x-iom-local', 'en-US'))).toBe('male');
  });

  it('does not take "Việt Nam" in a voice name for a male name', () => {
    expect(voiceGenderOf(v('Tiếng Việt Việt Nam', 'Tiếng Việt Việt Nam', 'vi-VN'))).toBeNull();
    expect(voiceGenderOf(v('x', 'Microsoft NamMinh Online (Natural) - Tiếng Việt (Việt Nam)', 'vi-VN'))).toBe('male');
  });

  it('is null when the name gives no hint', () => {
    expect(voiceGenderOf(v('Google Tiếng Việt', 'Google Tiếng Việt', 'vi-VN'))).toBeNull();
    expect(voiceGenderOf(v('vi-vn-x-vic-local', 'vi-vn-x-vic-local', 'vi-VN'))).toBeNull();
  });
});

describe('pickVoice', () => {
  it('picks a voice of the chosen language and gender, the main locale first, at normal pitch', () => {
    expect(pickVoice(VOICES, { lang: 'en', gender: 'female' })).toEqual({ voice: 'com.apple.voice.compact.en-US.Samantha', language: 'en-US', pitch: 1 });
    expect(pickVoice(VOICES, { lang: 'en', gender: 'male' })).toEqual({ voice: 'com.apple.speech.synthesis.voice.Alex', language: 'en-US', pitch: 1 });
    expect(pickVoice(VOICES, { lang: 'vi', gender: 'female' }).voice).toBe('com.apple.voice.compact.vi-VN.Linh');
    expect(pickVoice(VOICES, { lang: 'vi', gender: 'male' }).voice).toMatch(/NamMinh/);
  });

  it('switching language switches the voice, never a voice of the other language', () => {
    for (const gender of ['female', 'male'] as const) {
      expect(pickVoice(VOICES, { lang: 'vi', gender }).language).toBe('vi-VN');
      expect(pickVoice(VOICES, { lang: 'en', gender }).language).toMatch(/^en/);
    }
  });

  it('without a voice of that gender, takes another voice of the language and moves the pitch', () => {
    const viOnlyGoogle = [VOICES[0], v('Google Tiếng Việt', 'Google Tiếng Việt', 'vi-VN'), VOICES[5]];
    // No male Vietnamese voice: the voice of unknown gender is preferred over the female one, pitched down.
    expect(pickVoice(viOnlyGoogle, { lang: 'vi', gender: 'male' })).toEqual({ voice: 'Google Tiếng Việt', language: 'vi-VN', pitch: FALLBACK_PITCH.male });
    // Only a male English voice: used for "female" at a higher pitch.
    expect(pickVoice(viOnlyGoogle, { lang: 'en', gender: 'female' })).toEqual({ voice: 'Google UK English Male', language: 'en-GB', pitch: FALLBACK_PITCH.female });
    expect(FALLBACK_PITCH.female).toBeGreaterThan(1);
    expect(FALLBACK_PITCH.male).toBeLessThan(1);
  });

  it('with no voice of the language at all, lets the engine choose by locale and still moves the pitch', () => {
    expect(pickVoice([VOICES[0]], { lang: 'vi', gender: 'female' })).toEqual({ voice: undefined, language: 'vi-VN', pitch: FALLBACK_PITCH.female });
    expect(pickVoice([], { lang: 'en', gender: 'male' })).toEqual({ voice: undefined, language: 'en-US', pitch: FALLBACK_PITCH.male });
  });

  it('accepts Android-style locales with an underscore', () => {
    expect(pickVoice([v('vi-vn-x-gft-local', 'vi-vn-x-gft-local', 'vi_VN')], { lang: 'vi', gender: 'female' }).voice).toBe('vi-vn-x-gft-local');
  });
});

describe('speak with a chosen voice', () => {
  beforeEach(() => {
    mockSpeak.mockClear();
    resetVoicesForTest();
  });

  it('uses the device voice matching the choice once the voices are loaded', async () => {
    mockVoices = VOICES;
    await preloadVoices();
    speak('Xin chào', { voice: { lang: 'vi', gender: 'male' } });
    expect(mockSpeak).toHaveBeenLastCalledWith('Xin chào', expect.objectContaining({ language: 'vi-VN', pitch: 1, voice: expect.stringMatching(/NamMinh/) }));
    speak('Hello', { voice: { lang: 'en', gender: 'female' } });
    expect(mockSpeak).toHaveBeenLastCalledWith('Hello', expect.objectContaining({ voice: 'com.apple.voice.compact.en-US.Samantha' }));
  });

  it('before the voices are known, asks by locale and pitch', () => {
    mockVoices = [];
    speak('Xin chào', { voice: { lang: 'vi', gender: 'female' } });
    const opts = mockSpeak.mock.calls[0][1] as { language: string; pitch: number; voice?: string };
    expect(opts.language).toBe('vi-VN');
    expect(opts.pitch).toBe(FALLBACK_PITCH.female);
    expect(opts.voice).toBeUndefined();
  });
});
