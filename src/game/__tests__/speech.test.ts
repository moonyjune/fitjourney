import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock('expo-speech', () => ({ speak: (...a: unknown[]) => mockSpeak(...a), stop: () => mockStop() }));

import { SPEECH_LANGUAGE, speak, stopSpeaking } from '../training/speech';
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

  it('always asks the engine for an English (en-US) voice, even when the app is set to Vietnamese', () => {
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

  it('ignores empty text and stopSpeaking never throws', () => {
    speak('');
    expect(mockSpeak).not.toHaveBeenCalled();
    mockStop.mockImplementation(() => {
      throw new Error('engine gone');
    });
    expect(() => stopSpeaking()).not.toThrow();
  });
});
