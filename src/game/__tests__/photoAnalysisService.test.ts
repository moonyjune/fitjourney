import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Real cloudSync and real stores: only the Supabase client and the connectivity probe are faked.
const mockInvoke = jest.fn<(...a: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>();
const mockFrom = jest.fn();
const mockNet = jest.fn<() => Promise<{ isConnected: boolean; isInternetReachable: boolean }>>();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => mockNet(), addEventListener: () => () => undefined },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) }, from: (...a: unknown[]) => mockFrom(...a), auth: { signOut: jest.fn() } },
}));

import { buildBodyProfile } from '../../ai/bodyProfile';
import { classifyAiError, requestPhotoAnalysis } from '../../sync/cloudSync';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';

const signIn = (devMode = false) =>
  useAuthStore.setState({ session: { user: { id: 'user-123', email: 'secret@person.vn' } } as never, devMode });

describe('buildBodyProfile', () => {
  beforeEach(() => {
    useSettingsStore.setState({ startWeightKg: 110, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({
      entries: [
        { id: 'a', dateISO: '2026-10-21T06:00:00', weightKg: 109 },
        { id: 'b', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 },
      ],
    });
    signIn();
  });

  it('uses the latest logged weight plus the saved height, age, gender and activity level', () => {
    expect(buildBodyProfile()).toEqual({ weightKg: 106.2, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
  });

  it('falls back to the plan starting weight when nothing has been logged', () => {
    useWeightStore.setState({ entries: [] });
    expect(buildBodyProfile().weightKg).toBe(110);
  });

  it('leaves out what is unknown instead of sending null or zero', () => {
    useWeightStore.setState({ entries: [] });
    useSettingsStore.setState({ heightCm: null, age: null, gender: null, activityLevel: null });
    expect(buildBodyProfile()).toEqual({ weightKg: 110 });
    useSettingsStore.setState({ startWeightKg: 0 });
    expect(buildBodyProfile()).toEqual({});
  });

  it('never carries an email or an id', () => {
    const json = JSON.stringify(buildBodyProfile());
    expect(json).not.toContain('secret@person.vn');
    expect(json).not.toContain('user-123');
    expect(Object.keys(buildBodyProfile()).sort()).toEqual(['activityLevel', 'age', 'gender', 'heightCm', 'weightKg']);
  });
});

describe('classifyAiError', () => {
  const cases: [message: string, status: number | undefined, kind: string][] = [
    ['Server chưa cấu hình ANTHROPIC_API_KEY.', 500, 'notConfigured'],
    ['anthropic_api_key missing', undefined, 'notConfigured'],
    ['Không xác thực được người dùng.', 401, 'auth'],
    ['Thiếu Authorization header.', 401, 'auth'],
    ['Failed to send a request to the Edge Function', undefined, 'offline'],
    ['TypeError: Failed to fetch', undefined, 'offline'],
    ['Network request failed', undefined, 'offline'],
    ['Claude API lỗi: overloaded', 502, 'generic'],
    ['Unknown error', undefined, 'generic'],
  ];
  it.each(cases)('%s (status %s) → %s', (message, status, kind) => {
    expect(classifyAiError(message, status)).toBe(kind);
  });
});

describe('requestPhotoAnalysis', () => {
  const context = { label: 'Bữa trưa', plannedCalories: 500 };
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('offline dev account', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      signIn(true);
    });

    it('answers with a labelled, simulated result after a short delay, without any network call', async () => {
      const pending = requestPhotoAnalysis('meal', 'QUJD', 'image/jpeg', context, { weightKg: 80 });
      await jest.advanceTimersByTimeAsync(700);
      const outcome = await pending;
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.reasoning).toContain('Dữ liệu giả lập (chế độ Dev)');
        expect(outcome.result.foodName).toBeTruthy();
        expect(outcome.result.estimatedCaloriesKcal).toBeGreaterThan(0);
        expect(outcome.result.estimatedProteinG).toBeGreaterThan(0);
      }
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(mockNet).not.toHaveBeenCalled();
    });

    it('scales a workout by the user’s weight (MET × kg × hours) and is deterministic', async () => {
      const run = async (weightKg?: number) => {
        const pending = requestPhotoAnalysis('workout', 'QUJD', 'image/jpeg', context, weightKg ? { weightKg } : undefined);
        await jest.advanceTimersByTimeAsync(700);
        const outcome = await pending;
        if (!outcome.ok) throw new Error('expected ok');
        return outcome.result;
      };
      const heavy = await run(100);
      const light = await run(50);
      expect(heavy.estimatedCaloriesBurned).toBe(450); // 6 × 100 kg × 0.75 h
      expect(light.estimatedCaloriesBurned).toBe(225);
      expect(heavy.durationMin).toBe(45);
      expect(heavy.activityName).toBeTruthy();
      expect(await run(100)).toEqual(heavy);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('with a real session', () => {
    it('sends the photo and the body profile (and nothing else about the user) to analyze-proof-photo', async () => {
      mockInvoke.mockResolvedValue({ data: { result: { reasoning: 'ok', estimatedCaloriesKcal: 310, foodName: 'Phở' } } });
      const profile = { weightKg: 106.2, heightCm: 172, age: 34, gender: 'male' as const, activityLevel: 'light' as const };
      const outcome = await requestPhotoAnalysis('meal', 'QUJD', 'image/png', context, profile);
      expect(outcome).toEqual({ ok: true, result: { reasoning: 'ok', estimatedCaloriesKcal: 310, foodName: 'Phở' } });
      expect(mockInvoke).toHaveBeenCalledWith('analyze-proof-photo', {
        body: { taskType: 'meal', imageBase64: 'QUJD', mediaType: 'image/png', context, profile },
      });
      expect(JSON.stringify(mockInvoke.mock.calls[0])).not.toContain('secret@person.vn');
    });

    it('reports "AI not configured" when the server answers with the missing-key message in the body', async () => {
      mockInvoke.mockResolvedValue({ data: { error: 'Server chưa cấu hình ANTHROPIC_API_KEY.' } });
      expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/jpeg', context)).toMatchObject({ ok: false, kind: 'notConfigured' });
    });

    it('unwraps a non-2xx FunctionsHttpError: key missing → notConfigured, 401 → auth', async () => {
      const httpError = (status: number, message: string) => ({
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: message }), { status }),
      });
      mockInvoke.mockResolvedValueOnce({ error: httpError(500, 'Server chưa cấu hình ANTHROPIC_API_KEY.') });
      expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/jpeg', context)).toMatchObject({ ok: false, kind: 'notConfigured', message: 'Server chưa cấu hình ANTHROPIC_API_KEY.' });
      mockInvoke.mockResolvedValueOnce({ error: httpError(401, 'Không xác thực được người dùng.') });
      expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/jpeg', context)).toMatchObject({ ok: false, kind: 'auth' });
      mockInvoke.mockResolvedValueOnce({ error: httpError(502, 'Claude API lỗi: overloaded') });
      expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/jpeg', context)).toMatchObject({ ok: false, kind: 'generic' });
    });

    it('reports a request that never reached the server as offline', async () => {
      mockInvoke.mockResolvedValue({ error: new Error('Failed to send a request to the Edge Function') });
      expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/jpeg', context)).toMatchObject({ ok: false, kind: 'offline' });
    });

    it('does not even try when the device is offline', async () => {
      mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
      expect(await requestPhotoAnalysis('workout', 'QUJD', 'image/jpeg', context)).toMatchObject({ ok: false, kind: 'offline' });
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });
});
