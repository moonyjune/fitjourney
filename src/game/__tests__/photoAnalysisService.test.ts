import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Real cloudSync and real stores: only the Supabase client and the connectivity probe are faked.
const mockInvoke = jest.fn<(...a: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>();
const mockFrom = jest.fn();
const mockRpc = jest.fn<(...a: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>();
const mockNet = jest.fn<() => Promise<{ isConnected: boolean; isInternetReachable: boolean }>>();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => mockNet(), addEventListener: () => () => undefined },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) }, from: (...a: unknown[]) => mockFrom(...a), rpc: (...a: unknown[]) => mockRpc(...a), auth: { signOut: jest.fn() } },
}));

import { buildBodyProfile } from '../../ai/bodyProfile';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';
import { cleanAiDinner, type DinnerBrief } from '../../ai/dinner';
import { cleanDigest } from '../../ai/coachDigest';
import { DEFAULT_PLAN } from '../../constants/plan';
import { acceptSwap, cleanAiSwaps, type SwapContext, type SwapItem } from '../../food/swaps';
import { classifyAiError, fetchClientRows, requestDigest, requestDinner, requestSwaps, fetchWeeklyReport, requestWeeklyReport, requestNutritionLabel, fetchAiAdminByDay, fetchAiAdminByUser, fetchAiUsageToday, fetchIsAiAdmin, fetchMealRecipe, pushMealRecipe, requestMealRecipe, requestMealText, requestPhotoAnalysis } from '../../sync/cloudSync';
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

    it('passes the coach snapshot on to the function as its own field', async () => {
      mockInvoke.mockResolvedValue({ data: { result: { reasoning: 'ok' } } });
      const coach = { now: { date: '2026-10-23' } } as never;
      await requestPhotoAnalysis('meal', 'QUJD', 'image/png', context, { weightKg: 90 }, coach);
      expect(mockInvoke).toHaveBeenCalledWith('analyze-proof-photo', {
        body: { taskType: 'meal', imageBase64: 'QUJD', mediaType: 'image/png', context, profile: { weightKg: 90 }, coach },
      });
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

describe('requestMealText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the sentence, the body profile and the coach snapshot, and returns the result', async () => {
    const result = { items: [{ name: 'Phở', caloriesKcal: 450, proteinG: 25 }], reasoning: 'ok' };
    mockInvoke.mockResolvedValue({ data: { result } });
    const coach = { now: { date: '2026-10-23' } } as never;
    expect(await requestMealText('1 tô phở', { weightKg: 90 }, coach)).toEqual({ ok: true, result });
    expect(mockInvoke).toHaveBeenCalledWith('parse-meal-text', { body: { text: '1 tô phở', profile: { weightKg: 90 }, coach } });
    expect(JSON.stringify(mockInvoke.mock.calls[0])).not.toContain('secret@person.vn');
  });

  it('classifies failures like the photo analysis and does not try offline', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Server chưa cấu hình ANTHROPIC_API_KEY.' } });
    expect(await requestMealText('phở')).toMatchObject({ ok: false, kind: 'notConfigured' });
    mockInvoke.mockResolvedValueOnce({ error: new Error('Failed to send a request to the Edge Function') });
    expect(await requestMealText('phở')).toMatchObject({ ok: false, kind: 'offline' });
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockInvoke.mockClear();
    expect(await requestMealText('phở')).toMatchObject({ ok: false, kind: 'offline' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the offline dev account gets a labelled, deterministic answer split at commas and "và", with no network call', async () => {
    jest.useFakeTimers();
    signIn(true);
    const run = async () => {
      const pending = requestMealText('2 bát phở, trà đá và bánh mì + cà phê');
      await jest.advanceTimersByTimeAsync(700);
      return pending;
    };
    const first = await run();
    expect(first.ok && first.result.items.map((i) => i.name)).toEqual(['2 bát phở', 'trà đá', 'bánh mì', 'cà phê']);
    expect(first.ok && first.result.reasoning).toContain('Dữ liệu giả lập (chế độ Dev)');
    expect(await run()).toEqual(first);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('meal recipe suggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });

  it('requestMealRecipe sends the taste names as favorites and dislikes', async () => {
    mockInvoke.mockResolvedValue({ data: { recipe: { dishName: 'Trứng hấp' } } });
    await requestMealRecipe('Bữa 1', 'rest', 700, 50, ['Cũ'], { favorites: ['Phở'], dislikes: ['Bánh ngọt'] });
    expect(mockInvoke).toHaveBeenCalledWith('generate-meal-recipe', {
      body: { mealLabel: 'Bữa 1', dayType: 'rest', targetCalories: 700, targetProtein: 50, avoidDishNames: ['Cũ'], favorites: ['Phở'], dislikes: ['Bánh ngọt'] },
    });
  });

  it('stores and reads back the tools and the taste note', async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    const maybeSingle = jest.fn(async () => ({
      data: { dish_name: 'Trứng hấp', emoji: '🥚', duration_minutes: 15, difficulty: 1, calories_kcal: 300, protein_g: 25, ingredients: [], steps: ['a'], equipment: ['Nồi'], taste_note: 'Hợp gu ít dầu' },
      error: null,
    }));
    const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, maybeSingle };
    mockFrom.mockReturnValue({ upsert, ...chain });
    const recipe = { dishName: 'Trứng hấp', emoji: '🥚', durationMinutes: 15, difficulty: 1, caloriesKcal: 300, proteinG: 25, ingredients: [], equipment: ['Nồi'], tasteNote: 'Hợp gu ít dầu', steps: ['a'] };
    await pushMealRecipe('rest', 'meal1', recipe);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ equipment: ['Nồi'], taste_note: 'Hợp gu ít dầu' }), { onConflict: 'user_id,day_type,meal_slot' });
    expect(await fetchMealRecipe('rest', 'meal1')).toEqual(recipe);
    // A recipe without them (an older cached one) still round-trips.
    maybeSingle.mockResolvedValueOnce({ data: { dish_name: 'X', emoji: '🍽️', duration_minutes: 5, difficulty: 1, calories_kcal: 1, protein_g: 1, ingredients: [], steps: [], equipment: null, taste_note: null }, error: null } as never);
    expect(await fetchMealRecipe('rest', 'meal1')).toMatchObject({ equipment: [] });
  });
});

describe('AI switch, quota and kill switch', () => {
  const context = { label: 'Cơm' };
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    useAiPhotoStore.getState().setAiEnabled(true);
  });

  it('sends nothing at all while the device switch is off, for every kind of request (dev account included)', async () => {
    useAiPhotoStore.getState().setAiEnabled(false);
    const expected = { ok: false, kind: 'disabled' };
    expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/png', context)).toMatchObject(expected);
    expect(await requestMealText('phở')).toMatchObject(expected);
    expect(await requestMealRecipe('Bữa 1', 'rest', 700, 50)).toMatchObject({ ok: false });
    signIn(true);
    expect(await requestPhotoAnalysis('meal', 'QUJD', 'image/png', context)).toMatchObject(expected);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockNet).not.toHaveBeenCalled();
  });

  it('classifies the server\'s quota and kill-switch answers', () => {
    expect(classifyAiError('Bạn đã hết lượt AI hôm nay cho tính năng này (15 lượt/ngày).')).toBe('quota');
    expect(classifyAiError('whatever', 429)).toBe('quota');
    expect(classifyAiError('Tính năng AI đang tạm tắt.', 503)).toBe('disabled');
    expect(classifyAiError('Server chưa cấu hình ANTHROPIC_API_KEY.', 500)).toBe('notConfigured');
  });

  it('turns a 429 answer from the function into a quota failure', async () => {
    const quota = { name: 'FunctionsHttpError', message: 'non-2xx', context: new Response(JSON.stringify({ error: 'Bạn đã hết lượt AI hôm nay cho tính năng này (30 lượt/ngày).' }), { status: 429 }) };
    mockInvoke.mockResolvedValueOnce({ error: quota });
    expect(await requestMealText('phở')).toMatchObject({ ok: false, kind: 'quota' });
  });
});

describe('AI usage and admin reads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn(false);
  });

  it('the admin check is true only for a real boolean true, and fails closed on an error or when signed out', async () => {
    mockRpc.mockResolvedValueOnce({ data: true });
    expect(await fetchIsAiAdmin()).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('is_ai_admin');
    mockRpc.mockResolvedValueOnce({ data: 'true' });
    expect(await fetchIsAiAdmin()).toBe(false);
    mockRpc.mockResolvedValueOnce({ data: false });
    expect(await fetchIsAiAdmin()).toBe(false);
    mockRpc.mockResolvedValueOnce({ error: new Error('boom') });
    expect(await fetchIsAiAdmin()).toBe(false);
    useAuthStore.setState({ session: null });
    mockRpc.mockClear();
    expect(await fetchIsAiAdmin()).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps the app-wide day and per-user rows to numbers and returns null on an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ day: '2026-10-26', users: '3', calls: '40', tokens_in: '100', tokens_out: '20', cost_usd: '0.6' }] });
    expect(await fetchAiAdminByDay('2026-10-26', 7)).toEqual([{ day: '2026-10-26', users: 3, calls: 40, tokensIn: 100, tokensOut: 20, costUsd: 0.6 }]);
    expect(mockRpc).toHaveBeenCalledWith('ai_admin_by_day', { p_today: '2026-10-26', p_days: 7 });
    mockRpc.mockResolvedValueOnce({ data: [{ user_id: 'u9', email: null, calls: 1, tokens_in: 2, tokens_out: 3, cost_usd: 0.01 }] });
    expect(await fetchAiAdminByUser('2026-10-26')).toEqual([{ userId: 'u9', email: null, calls: 1, tokensIn: 2, tokensOut: 3, costUsd: 0.01 }]);
    mockRpc.mockResolvedValue({ error: new Error('Không có quyền xem.') });
    expect(await fetchAiAdminByDay('2026-10-26')).toBeNull();
    expect(await fetchAiAdminByUser('2026-10-26')).toBeNull();
  });

  it('reads the account\'s own usage for the day, and nothing without an account', async () => {
    const eq2 = jest.fn(async () => ({ data: [{ feature: 'photo', calls: 3, tokens_in: '9000', tokens_out: 2100, cost_usd: '0.06' }], error: null }));
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = jest.fn(() => ({ eq: eq2 }));
    mockFrom.mockReturnValue(chain);
    expect(await fetchAiUsageToday('2026-10-26')).toEqual([{ feature: 'photo', calls: 3, tokensIn: 9000, tokensOut: 2100, costUsd: 0.06 }]);
    expect(mockFrom).toHaveBeenCalledWith('ai_usage');
    expect(eq2).toHaveBeenCalledWith('day', '2026-10-26');
    useAuthStore.setState({ session: null });
    mockFrom.mockClear();
    expect(await fetchAiUsageToday('2026-10-26')).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('requestNutritionLabel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    useAiPhotoStore.getState().setAiEnabled(true);
  });

  it('sends only the photo and returns the raw reading', async () => {
    const result = { readable: true, per100: { energyKcal: 450 }, reasoning: 'ok' };
    mockInvoke.mockResolvedValue({ data: { result } });
    expect(await requestNutritionLabel('QUJD', 'image/png')).toEqual({ ok: true, label: result });
    expect(mockInvoke).toHaveBeenCalledWith('read-nutrition-label', { body: { imageBase64: 'QUJD', mediaType: 'image/png' } });
  });

  it('classifies failures, does not try offline, and sends nothing while the AI switch is off', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Bạn đã hết lượt AI hôm nay cho tính năng này (15 lượt/ngày).' } });
    expect(await requestNutritionLabel('QUJD', 'image/png')).toMatchObject({ ok: false, kind: 'quota' });
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockInvoke.mockClear();
    expect(await requestNutritionLabel('QUJD', 'image/png')).toMatchObject({ ok: false, kind: 'offline' });
    useAiPhotoStore.getState().setAiEnabled(false);
    expect(await requestNutritionLabel('QUJD', 'image/png')).toMatchObject({ ok: false, kind: 'disabled' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the offline dev account gets a labelled simulated panel, with no network call', async () => {
    jest.useFakeTimers();
    signIn(true);
    const pending = requestNutritionLabel('QUJD', 'image/png');
    await jest.advanceTimersByTimeAsync(700);
    const out = await pending;
    expect(out.ok && (out.label as { reasoning: string }).reasoning).toContain('Dữ liệu giả lập (chế độ Dev)');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('weekly report requests', () => {
  const week = { week: { start: '2026-10-19' } } as never;
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    useAiPhotoStore.getState().setAiEnabled(true);
  });

  it('sends the week, the period and the refresh flag, and tells a stored report from a new one', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { report: { headline: 'h' }, cached: true, generatedAt: '2026-10-21T08:00:00.000Z' } });
    expect(await requestWeeklyReport(week, '2026-10-19', false)).toEqual({ ok: true, report: { headline: 'h' }, cached: true, generatedAtISO: '2026-10-21T08:00:00.000Z' });
    expect(mockInvoke).toHaveBeenCalledWith('weekly-report', { body: { week, periodKey: '2026-10-19', refresh: false } });
    mockInvoke.mockResolvedValueOnce({ data: { report: { headline: 'new' } } });
    expect(await requestWeeklyReport(week, '2026-10-19', true)).toEqual({ ok: true, report: { headline: 'new' }, cached: false, generatedAtISO: undefined });
    expect(mockInvoke).toHaveBeenLastCalledWith('weekly-report', { body: { week, periodKey: '2026-10-19', refresh: true } });
  });

  it('classifies failures, does not try offline, and sends nothing while the AI switch is off', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Bạn đã hết lượt AI hôm nay cho tính năng này (3 lượt/ngày).' } });
    expect(await requestWeeklyReport(week, '2026-10-19', true)).toMatchObject({ ok: false, kind: 'quota' });
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockInvoke.mockClear();
    expect(await requestWeeklyReport(week, '2026-10-19', true)).toMatchObject({ ok: false, kind: 'offline' });
    useAiPhotoStore.getState().setAiEnabled(false);
    expect(await requestWeeklyReport(week, '2026-10-19', true)).toMatchObject({ ok: false, kind: 'disabled' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the offline dev account gets a labelled simulated review, with no network call', async () => {
    jest.useFakeTimers();
    signIn(true);
    const input = { week: { start: '2026-10-19', today: '2026-10-23', daysElapsed: 1, daysUntilReset: 3 }, boss: { maxHp: 7700, hpLeft: 7000, damageSoFar: 700, defeated: false, neededPerRemainingDay: 1750, status: 'far' }, targets: { dailyDeficitKcal: 1100 }, days: [{ date: '2026-10-23', logged: true, damage: 700, missed: [] }], patterns: { daysLogged: 1, lateMealDays: 0, proteinMissDays: 0, saltOverDays: 0, waterShortDays: 0 }, weight: {} } as never;
    const pending = requestWeeklyReport(input, '2026-10-19', false);
    await jest.advanceTimersByTimeAsync(700);
    const out = await pending;
    expect(out.ok && (out.report as { headline: string }).headline).toContain('[Giả lập]');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('reads the stored review of a week from ai_reports for this account only, and nothing without an account', async () => {
    const eq3 = jest.fn(() => ({ maybeSingle: async () => ({ data: { payload: { headline: 'h' }, created_at: '2026-10-21T08:00:00Z' }, error: null }) }));
    const eq2 = jest.fn(() => ({ eq: eq3 }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    mockFrom.mockReturnValue({ select: () => ({ eq: eq1 }) });
    expect(await fetchWeeklyReport('2026-10-19')).toEqual({ report: { headline: 'h' }, generatedAtISO: '2026-10-21T08:00:00.000Z' });
    expect(mockFrom).toHaveBeenCalledWith('ai_reports');
    expect(eq1).toHaveBeenCalledWith('user_id', 'user-123');
    expect(eq2).toHaveBeenCalledWith('kind', 'weekly');
    expect(eq3).toHaveBeenCalledWith('period_key', '2026-10-19');
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) });
    expect(await fetchWeeklyReport('2026-10-19')).toBeNull();
    useAuthStore.setState({ session: null });
    mockFrom.mockClear();
    expect(await fetchWeeklyReport('2026-10-19')).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('requestSwaps', () => {
  const item: SwapItem = { name: 'Xúc xích', calories: 400, proteinG: 20, purineMg: 1500, saltG: 3, sugarG: 2 };
  const context: SwapContext = { exceeded: ['purine'], headroom: { purine: 1000, salt: 4, sugar: 20 } };
  const input = { item, context, limits: { purine: 1200, salt: 7, sugar: 25 }, mealTime: 'dinner', favorites: ['Phở bò'] };
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    useAiPhotoStore.getState().setAiEnabled(true);
  });

  it('sends the item, the exceeded limits, the room left, the limits, the meal time and the usual foods', async () => {
    mockInvoke.mockResolvedValue({ data: { result: { swaps: [] } } });
    expect(await requestSwaps(input)).toEqual({ ok: true, result: { swaps: [] } });
    expect(mockInvoke).toHaveBeenCalledWith('suggest-swap', {
      body: { item, exceeded: ['purine'], headroom: context.headroom, limits: input.limits, mealTime: 'dinner', favorites: ['Phở bò'] },
    });
  });

  it('classifies failures, does not try offline, and sends nothing while the AI switch is off', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Bạn đã hết lượt AI hôm nay cho tính năng này (10 lượt/ngày).' } });
    expect(await requestSwaps(input)).toMatchObject({ ok: false, kind: 'quota' });
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockInvoke.mockClear();
    expect(await requestSwaps(input)).toMatchObject({ ok: false, kind: 'offline' });
    useAiPhotoStore.getState().setAiEnabled(false);
    expect(await requestSwaps(input)).toMatchObject({ ok: false, kind: 'disabled' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the offline dev account gets labelled swaps that pass the same checks as a real answer, with no network call', async () => {
    jest.useFakeTimers();
    signIn(true);
    const pending = requestSwaps(input);
    await jest.advanceTimersByTimeAsync(700);
    const out = await pending;
    expect(out.ok).toBe(true);
    const swaps = out.ok ? cleanAiSwaps(out.result, item, context) : [];
    expect(swaps).toHaveLength(2);
    expect(swaps.every((s) => acceptSwap(item, s, context))).toBe(true);
    expect(swaps[0].name).toContain('(giả lập)');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('requestDinner', () => {
  const brief: DinnerBrief = { hour: 17, budgetKcal: 600, proteinLeftG: 100, headroom: { purine: 800, salt: 5, sugar: 20 }, limits: { purine: 1200, salt: 7, sugar: 25 }, planMeal: { label: 'Bữa 3 secret', kcal: 713, proteinG: 86 } };
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    useAiPhotoStore.getState().setAiEnabled(true);
  });

  it('sends only what is left, the limits, the hour and the usual foods (not the plan meal)', async () => {
    mockInvoke.mockResolvedValue({ data: { result: { options: [] } } });
    expect(await requestDinner(brief, ['Phở bò'])).toEqual({ ok: true, result: { options: [] } });
    expect(mockInvoke).toHaveBeenCalledWith('suggest-dinner', {
      body: { budgetKcal: 600, proteinLeftG: 100, headroom: brief.headroom, limits: brief.limits, hour: 17, favorites: ['Phở bò'] },
    });
    expect(JSON.stringify(mockInvoke.mock.calls[0])).not.toContain('secret');
  });

  it('classifies failures, does not try offline, and sends nothing while the AI switch is off', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Bạn đã hết lượt AI hôm nay cho tính năng này (5 lượt/ngày).' } });
    expect(await requestDinner(brief, [])).toMatchObject({ ok: false, kind: 'quota' });
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockInvoke.mockClear();
    expect(await requestDinner(brief, [])).toMatchObject({ ok: false, kind: 'offline' });
    useAiPhotoStore.getState().setAiEnabled(false);
    expect(await requestDinner(brief, [])).toMatchObject({ ok: false, kind: 'disabled' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the offline dev account gets labelled dinners that pass the same checks as a real answer, with no network call', async () => {
    jest.useFakeTimers();
    signIn(true);
    const pending = requestDinner(brief, []);
    await jest.advanceTimersByTimeAsync(700);
    const out = await pending;
    expect(out.ok).toBe(true);
    const ideas = out.ok ? cleanAiDinner(out.result, brief) : [];
    expect(ideas).toHaveLength(2);
    expect(ideas[0].name).toContain('(giả lập)');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('coach digest requests', () => {
  const items = [{ key: 'c1', week: { week: { start: '2026-10-19' } } as never }];
  beforeEach(() => {
    jest.clearAllMocks();
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    signIn(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    useAiPhotoStore.getState().setAiEnabled(true);
  });

  it('sends the clients (opaque keys and week figures) and the period', async () => {
    mockInvoke.mockResolvedValue({ data: { result: { items: [] } } });
    expect(await requestDigest(items, '2026-10-19')).toEqual({ ok: true, result: { items: [] } });
    expect(mockInvoke).toHaveBeenCalledWith('coach-digest', { body: { clients: items, periodKey: '2026-10-19' } });
  });

  it('classifies failures, does not try offline, and sends nothing while the AI switch is off', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { error: 'Bạn đã hết lượt AI hôm nay cho tính năng này (5 lượt/ngày).' } });
    expect(await requestDigest(items, '2026-10-19')).toMatchObject({ ok: false, kind: 'quota' });
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockInvoke.mockClear();
    expect(await requestDigest(items, '2026-10-19')).toMatchObject({ ok: false, kind: 'offline' });
    useAiPhotoStore.getState().setAiEnabled(false);
    expect(await requestDigest(items, '2026-10-19')).toMatchObject({ ok: false, kind: 'disabled' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the offline dev account gets labelled lines for the keys asked, with no network call', async () => {
    jest.useFakeTimers();
    signIn(true);
    const withWeek = [{ key: 'c1', week: { patterns: { daysLogged: 2 }, week: { daysElapsed: 3 }, boss: { hpLeft: 4000, status: 'far' } } as never }];
    const pending = requestDigest(withWeek, '2026-10-19');
    await jest.advanceTimersByTimeAsync(700);
    const out = await pending;
    expect(out.ok).toBe(true);
    expect(out.ok ? Object.keys(cleanDigest(out.result, ['c1'])) : []).toEqual(['c1']);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('fetchClientRows (what a coach can read of a client)', () => {
  const ok = (data: unknown) => ({ data, error: null });
  const build = (tables: Record<string, unknown>, gte = jest.fn()) => {
    mockFrom.mockImplementation((table: unknown) => {
      const data = tables[String(table)];
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.gte = (...a: unknown[]) => {
        gte(String(table), ...a);
        return Promise.resolve(data instanceof Error ? { data: null, error: data } : ok(data));
      };
      c.maybeSingle = () => Promise.resolve(data instanceof Error ? { data: null, error: data } : ok(data));
      return c;
    });
    return gte;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    signIn(false);
  });

  it('reads the profile, the plan, and weights, meals and workouts from the given date on', async () => {
    const gte = build({ profiles: { start_weight_kg: '110' }, plans: { plan_json: { ...DEFAULT_PLAN, marker: 1 }, updated_at: '2026-10-01T00:00:00Z' }, weight_entries: [{ entry_date: '2026-10-20', weight_kg: '105' }], nutrition_logs: [{ entry_date: '2026-10-20' }], workout_entries: [{ id: 'w' }] });
    const rows = await fetchClientRows('client-1', '2026-10-05');
    expect(rows).toMatchObject({ profile: { start_weight_kg: '110' }, weights: [{ entry_date: '2026-10-20', weight_kg: '105' }], nutrition: [{ entry_date: '2026-10-20' }], workouts: [{ id: 'w' }] });
    expect((rows!.plan as unknown as { marker: number }).marker).toBe(1);
    expect(gte.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([['weight_entries', 'entry_date', '2026-10-05'], ['nutrition_logs', 'entry_date', '2026-10-05'], ['workout_entries', 'entry_date', '2026-10-05']]);
  });

  it('falls back to the default plan when the client has none, and to empty lists', async () => {
    build({ profiles: null, plans: null, weight_entries: null, nutrition_logs: null, workout_entries: null });
    expect(await fetchClientRows('client-1', '2026-10-05')).toEqual({ profile: null, plan: DEFAULT_PLAN, weights: [], nutrition: [], workouts: [] });
  });

  it('is null when any table cannot be read, so a half-loaded client is never summarised', async () => {
    for (const table of ['profiles', 'weight_entries', 'nutrition_logs', 'workout_entries']) {
      build({ profiles: {}, plans: null, weight_entries: [], nutrition_logs: [], workout_entries: [], [table]: new Error('denied') });
      expect(await fetchClientRows('client-1', '2026-10-05')).toBeNull();
    }
  });

  it('reads nothing without an account', async () => {
    build({});
    useAuthStore.setState({ session: null });
    mockFrom.mockClear();
    expect(await fetchClientRows('client-1', '2026-10-05')).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

