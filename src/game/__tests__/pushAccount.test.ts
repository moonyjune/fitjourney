import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

type DbError = { code?: string; message?: string } | null;
const mockRpc = jest.fn(async (_fn: string, _args: Record<string, unknown>): Promise<{ error: DbError }> => ({ error: null }));
const mockUpsert = jest.fn(async (_row: unknown, _opts: unknown) => ({ error: null }));
const mockDeleteEq = jest.fn(async (_col: string, _val: string) => ({ error: null }));
const mockAuthSignOut = jest.fn(async () => ({ error: null }));
let mockSession: { user: { id: string } } | null = null;
let mockUserId: string | null = 'user-1';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: () => mockAuthSignOut(), getSession: async () => ({ data: { session: mockSession } }), onAuthStateChange: jest.fn() },
    rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
    from: () => ({ upsert: mockUpsert, delete: () => ({ eq: mockDeleteEq }) }),
  },
}));
jest.mock('../../sync/cloudSync', () => ({
  currentUserId: () => mockUserId,
  flushSyncQueue: jest.fn(async () => undefined),
  pushUserData: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
}));

import { signOutAndReset, signOutIdle } from '../../auth/signOut';
import { releasePushSubscription, syncPushAccount, watchPushAccount } from '../../notifications/pushAccount';
import { buildPushPlan, currentPushPlan, enableWebPush, refreshPushPlan, type PushEnv, type PushSubscriptionLike } from '../../notifications/webPush';
import { PUSH_PLAN_DEBOUNCE_MS, watchPushPlan } from '../../notifications/WebPushHost';
import { DEFAULT_PLAN } from '../../constants/plan';
import { useAuthStore } from '../../store/useAuthStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { usePushStore } from '../../store/usePushStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWaterWindowStore } from '../../store/useWaterWindowStore';
import { toDateKey } from '../../utils/date';
import { cleanPushPlan, duePushes } from '../../../supabase/functions/_shared/pushPlan';

const ENDPOINT = 'https://web.push.apple.com/dev1';
const KEYS = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };

function pushEnv(permission = 'granted') {
  let current: PushSubscriptionLike | null = null;
  const make = (): PushSubscriptionLike => ({
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: KEYS }),
    unsubscribe: jest.fn(async () => {
      current = null;
      return true;
    }),
  });
  const pushManager = {
    getSubscription: jest.fn(async () => current),
    subscribe: jest.fn(async () => (current = make())),
  };
  const reg = { pushManager };
  const env: PushEnv = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    hasPushManager: true,
    serviceWorker: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) },
    Notification: { permission, requestPermission: jest.fn(async () => 'granted') },
  };
  return { env, pushManager, subscription: () => current };
}

/** Push turned on for `owner` on this device. */
async function enabledFor(owner: string) {
  const e = pushEnv();
  mockUserId = owner;
  expect((await enableWebPush(e.env)).ok).toBe(true);
  mockRpc.mockClear();
  return e;
}

beforeEach(() => {
  mockRpc.mockClear();
  mockRpc.mockImplementation(async () => ({ error: null }));
  mockUpsert.mockClear();
  mockDeleteEq.mockClear();
  mockAuthSignOut.mockClear();
  mockSession = null;
  mockUserId = 'user-1';
  usePushStore.setState({ enabled: false, endpoint: null, savedPlanJson: null, userId: null, resumeUserId: null });
  useSettingsStore.setState({ remindersEnabled: true, language: 'vi', waterTargetMl: 3000 });
  useAuthStore.setState({ session: null, initialized: false, devMode: false });
});

describe('saving claims the subscription by endpoint', () => {
  it('saves through push_claim_subscription for the signed-in account, and remembers the account', async () => {
    const { env } = pushEnv();
    expect((await enableWebPush(env)).ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('push_claim_subscription', {
      p_endpoint: ENDPOINT,
      p_p256dh: KEYS.p256dh,
      p_auth: KEYS.auth,
      p_user_agent: env.userAgent,
      p_plan: expect.any(Object),
      p_tz: expect.any(String),
    });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(usePushStore.getState()).toMatchObject({ enabled: true, endpoint: ENDPOINT, userId: 'user-1' });
  });

  it('falls back to the plain upsert while the database does not have the function yet; another error is a failure', async () => {
    mockRpc.mockImplementation(async () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.push_claim_subscription' } }));
    expect((await enableWebPush(pushEnv().env)).ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1', endpoint: ENDPOINT }), { onConflict: 'endpoint' });

    usePushStore.getState().reset();
    mockUpsert.mockClear();
    mockRpc.mockImplementation(async () => ({ error: { code: '42501', message: 'permission denied' } }));
    expect(await enableWebPush(pushEnv().env)).toEqual({ ok: false, reason: 'failed' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('never re-saves a subscription still bound to another account', async () => {
    const { env } = await enabledFor('user-A');
    mockUserId = 'user-B';
    await refreshPushPlan(env, true);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('every sign-out path drops the subscription', () => {
  it('the Sign out button: unsubscribes, deletes the row while signed in, and does not turn push back on later', async () => {
    const e = await enabledFor('user-1');
    const unsubscribe = e.subscription()!.unsubscribe;
    await signOutAndReset(e.env);
    expect(unsubscribe).toHaveBeenCalled();
    expect(mockDeleteEq).toHaveBeenCalledWith('endpoint', ENDPOINT);
    expect(mockAuthSignOut).toHaveBeenCalled();
    expect(usePushStore.getState()).toMatchObject({ enabled: false, endpoint: null, userId: null, resumeUserId: null });
  });

  it('the idle sign-out: the row is deleted before the session ends (session read from Supabase on a cold start)', async () => {
    const e = await enabledFor('user-1');
    mockUserId = null; // the auth store has not loaded the session yet
    mockSession = { user: { id: 'user-1' } };
    const order: string[] = [];
    mockDeleteEq.mockImplementationOnce(async () => {
      order.push('delete');
      return { error: null };
    });
    mockAuthSignOut.mockImplementationOnce(async () => {
      order.push('signOut');
      return { error: null };
    });
    await signOutIdle(e.env);
    expect(order).toEqual(['delete', 'signOut']);
    expect(e.subscription()).toBeNull();
    expect(usePushStore.getState()).toMatchObject({ enabled: false, resumeUserId: 'user-1' });
  });

  it('a session that ended on its own (expired, revoked, another tab): unsubscribed here, no delete without a session', async () => {
    const e = await enabledFor('user-1');
    mockUserId = null;
    await syncPushAccount(null, e.env);
    expect(e.subscription()).toBeNull();
    expect(mockDeleteEq).not.toHaveBeenCalled();
    expect(usePushStore.getState()).toMatchObject({ enabled: false, endpoint: null, resumeUserId: 'user-1' });
  });

  it('the same account signing in again gets push back (permission already granted); another account does not', async () => {
    const e = await enabledFor('user-1');
    await releasePushSubscription({ resume: true, env: e.env });
    mockUserId = 'user-1';
    await syncPushAccount('user-1', e.env);
    expect(mockRpc).toHaveBeenCalledWith('push_claim_subscription', expect.objectContaining({ p_endpoint: ENDPOINT }));
    expect(usePushStore.getState()).toMatchObject({ enabled: true, userId: 'user-1', resumeUserId: null });

    await releasePushSubscription({ resume: true, env: e.env });
    mockRpc.mockClear();
    mockUserId = 'user-2';
    await syncPushAccount('user-2', e.env);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(usePushStore.getState()).toMatchObject({ enabled: false, resumeUserId: null });
  });

  it('no silent re-subscribe without permission granted', async () => {
    usePushStore.setState({ resumeUserId: 'user-1' });
    const e = pushEnv('default');
    await syncPushAccount('user-1', e.env);
    expect(e.pushManager.subscribe).not.toHaveBeenCalled();
    expect(e.env.Notification!.requestPermission).not.toHaveBeenCalled();
    expect(usePushStore.getState().resumeUserId).toBeNull();
  });

  it('another account signing in while the subscription is still bound to the old one: it is dropped, not re-saved', async () => {
    const e = await enabledFor('user-A');
    mockUserId = 'user-B';
    await syncPushAccount('user-B', e.env);
    expect(e.subscription()).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(usePushStore.getState()).toMatchObject({ enabled: false, userId: null, resumeUserId: null });
  });

  it('a subscription saved by an older version (no account) is taken as the signed-in account', async () => {
    usePushStore.setState({ enabled: true, endpoint: ENDPOINT, userId: null });
    await syncPushAccount('user-1', null);
    expect(usePushStore.getState()).toMatchObject({ enabled: true, userId: 'user-1' });
  });

  it('the auth watch acts once auth is known, on each change of account, deferred out of the auth callback', async () => {
    jest.useFakeTimers();
    try {
      usePushStore.setState({ enabled: true, endpoint: ENDPOINT, userId: 'user-1' });
      const stop = watchPushAccount();
      jest.runOnlyPendingTimers();
      expect(usePushStore.getState().enabled).toBe(true); // not initialized yet: nothing done
      useAuthStore.setState({ initialized: true, session: { user: { id: 'user-1' } } as never });
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      expect(usePushStore.getState().enabled).toBe(true);
      useAuthStore.setState({ session: null });
      expect(usePushStore.getState().enabled).toBe(true); // deferred
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      await new Promise((r) => setTimeout(r, 0));
      expect(usePushStore.getState()).toMatchObject({ enabled: false, resumeUserId: 'user-1' });
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the plan is re-saved when what it is built from changes', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('water target, drinking window, reminders switch and today log: one debounced save; other settings: none', () => {
    jest.useFakeTimers();
    const refresh = jest.fn(async () => undefined);
    const stop = watchPushPlan(refresh);
    useSettingsStore.setState({ waterTargetMl: 3500 });
    useSettingsStore.setState({ waterTargetMl: 3750 });
    jest.advanceTimersByTime(PUSH_PLAN_DEBOUNCE_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    useWaterWindowStore.setState({ startMinutes: 7 * 60 });
    jest.advanceTimersByTime(PUSH_PLAN_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(2);

    useSettingsStore.setState({ remindersEnabled: false });
    jest.advanceTimersByTime(PUSH_PLAN_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(3);

    const today = toDateKey(new Date());
    useNutritionStore.setState({ logs: { ...useNutritionStore.getState().logs, [today]: { dateISO: today, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0, waterTargetMl: 4000 } } });
    jest.advanceTimersByTime(PUSH_PLAN_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(4);

    useSettingsStore.setState({ heightCm: 181 });
    jest.advanceTimersByTime(PUSH_PLAN_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(4);

    stop();
    useSettingsStore.setState({ waterTargetMl: 3000 });
    jest.advanceTimersByTime(PUSH_PLAN_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('a new water target is in the very next save', async () => {
    const e = await enabledFor('user-1');
    useSettingsStore.setState({ waterTargetMl: 4200 });
    await refreshPushPlan(e.env);
    const plan = cleanPushPlan(mockRpc.mock.calls[0][1].p_plan)!;
    expect(plan.water.training[plan.water.training.length - 1].cum).toBe(4200);
    expect(plan.water.rest[plan.water.rest.length - 1].cum).toBe(4200);
    // Unchanged: nothing sent again.
    mockRpc.mockClear();
    await refreshPushPlan(e.env);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('today with its own water target', () => {
  const input = { plan: DEFAULT_PLAN, targetMl: 3000, startMinutes: 360, endMinutes: 1260, fasting: true, language: 'vi' as const, now: new Date(2026, 10, 2, 9) };

  it('the days ahead use the setting; today (its day type) its own target, on its date only', () => {
    const p = buildPushPlan({ ...input, todayTargetMl: 4000 });
    expect(p.water.training[p.water.training.length - 1].cum).toBe(3000);
    expect(p.water.rest[p.water.rest.length - 1].cum).toBe(3000);
    expect(p.today?.date).toBe('2026-11-02');
    expect(p.today!.water[p.today!.water.length - 1].cum).toBe(4000);
    expect(cleanPushPlan(p)).toEqual(p);
    expect(buildPushPlan({ ...input, todayTargetMl: 3000 }).today).toBeUndefined();

    // Monday 2026-11-02 at the last drink time: today's total; Monday a week later: the setting's.
    const last = p.today!.water[p.today!.water.length - 1].m;
    const due = (dateKey: string) => duePushes(p, { dateKey, minutes: last, weekday: 1 }, new Set(), 0)[0].body;
    expect(due('2026-11-02')).toContain('4000');
    expect(due('2026-11-09')).toContain('3000');
  });

  it('a plan without today (older app) and a broken today are read as before', () => {
    const p = buildPushPlan(input);
    expect(cleanPushPlan({ ...p, today: { date: 'nope', water: [] } })).toEqual(p);
  });

  it('the plan from the stores: setting for the days ahead, today log target for today', () => {
    const now = new Date(2026, 10, 2, 9);
    const key = toDateKey(now);
    useSettingsStore.setState({ waterTargetMl: 3000 });
    useNutritionStore.setState({ logs: { [key]: { dateISO: key, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0, waterTargetMl: 3500 } } });
    const p = currentPushPlan(now)!;
    expect(p.water.training[p.water.training.length - 1].cum).toBe(3000);
    expect(p.today?.water[p.today.water.length - 1].cum).toBe(3500);
    useNutritionStore.setState({ logs: {} });
  });
});
