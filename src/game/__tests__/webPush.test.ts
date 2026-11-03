import { describe, expect, it, jest } from '@jest/globals';
import { webcrypto } from 'crypto';

const mockUpsert = jest.fn(async (_row: unknown, _opts: unknown) => ({ error: null }));
const mockDeleteEq = jest.fn(async (_col: string, _val: string) => ({ error: null }));
const mockRpc = jest.fn(async (_fn: string, _args: Record<string, unknown>) => ({ error: null }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
    from: () => ({ upsert: mockUpsert, delete: () => ({ eq: mockDeleteEq }) }),
  },
}));
jest.mock('../../sync/cloudSync', () => ({
  currentUserId: () => 'user-1',
  pushUserData: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
}));

import { usePushStore } from '../../store/usePushStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { disableWebPush, enableWebPush } from '../../notifications/webPush';
import { cleanPushPlan, duePushes, latestPlan, localClock, MEAL_LATE_MIN, PUSH_PLAN_VERSION, type PushPlan } from '../../../supabase/functions/_shared/pushPlan';
import { b64urlDecode, b64urlEncode, encryptPayload, sendWebPush, vapidAuthorization } from '../../../supabase/functions/_shared/webpush';
import { DEFAULT_PLAN } from '../../constants/plan';
import { buildPushPlan, pushSupport, subscribePush, unsubscribePush, type PushEnv, type PushSubscriptionLike } from '../../notifications/webPush';

// The jest environment may not expose WebCrypto on the global object.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const plan = (over: Partial<PushPlan> = {}): PushPlan => ({
  v: PUSH_PLAN_VERSION,
  water: {
    training: [
      { m: 360, cum: 500, label: 'Thức dậy' },
      { m: 480, cum: 1000, label: 'Sáng' },
      { m: 600, cum: 1500, label: 'Trước bữa trưa' },
    ],
    rest: [{ m: 420, cum: 500, label: 'Thức dậy' }],
  },
  trainingDays: [1, 2, 4, 5],
  meals: [{ m: 720, title: 'Đến giờ Bữa 1', body: 'Mở app' }],
  workouts: [{ m: 1080, title: 'Đến giờ tập: Chạy', body: '30 phút' }],
  waterTitle: 'Nhắc uống nước',
  waterBody: 'Uống {ml} ml — {label} (cộng dồn {total} ml).',
  ...over,
});
// Monday 2026-11-02.
const monday = (minutes: number) => ({ dateKey: '2026-11-02', minutes, weekday: 1 });

describe('push plan: which reminders are due', () => {
  it('water: the latest drink time reached, with what is left to drink, once', () => {
    const due = duePushes(plan(), monday(8 * 60 + 10), new Set(), 300);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ key: 'water@2026-11-02@08:00', alsoKeys: ['water@2026-11-02@06:00'], title: 'Nhắc uống nước', tag: 'water' });
    expect(due[0].body).toBe('Uống 700 ml — Sáng (cộng dồn 1000 ml).');
    expect(duePushes(plan(), monday(8 * 60 + 25), new Set(['water@2026-11-02@08:00']), 300)).toHaveLength(0);
  });

  it('water: nothing when the running total is already drunk, nor more than 120 min late, nor before the first time', () => {
    expect(duePushes(plan(), monday(8 * 60 + 10), new Set(), 1000)).toHaveLength(0);
    expect(duePushes(plan(), monday(10 * 60 + 121), new Set(), 0).filter((d) => d.tag === 'water')).toHaveLength(0);
    expect(duePushes(plan(), monday(5 * 60), new Set(), 0)).toHaveLength(0);
  });

  it('water: rest days use the rest schedule; unknown water counts as none', () => {
    const sunday = { dateKey: '2026-11-08', minutes: 7 * 60 + 5, weekday: 0 };
    expect(duePushes(plan(), sunday, new Set(), null)[0].body).toContain('500 ml');
  });

  it('meals every day and workouts on training days, within the late window, once', () => {
    expect(duePushes(plan(), monday(720 + 5), new Set(), 5000).map((d) => d.key)).toEqual(['meal@2026-11-02@12:00']);
    expect(duePushes(plan(), monday(720 + MEAL_LATE_MIN + 1), new Set(), 5000)).toHaveLength(0);
    expect(duePushes(plan(), monday(720 + 5), new Set(['meal@2026-11-02@12:00']), 5000)).toHaveLength(0);
    expect(duePushes(plan(), monday(1080), new Set(), 5000).map((d) => d.key)).toEqual(['workout@2026-11-02@18:00']);
    expect(duePushes(plan(), { dateKey: '2026-11-04', minutes: 1080, weekday: 3 }, new Set(), 5000)).toHaveLength(0);
  });

  it('cleans what a device stored and picks the newest plan of several devices', () => {
    expect(cleanPushPlan(null)).toBeNull();
    expect(cleanPushPlan({ v: 99 })).toBeNull();
    const cleaned = cleanPushPlan({ ...plan(), meals: [{ m: 2000, title: 'x' }, { m: 60, title: '  ok ' }], trainingDays: [1, 1, 9] });
    expect(cleaned?.meals).toEqual([{ m: 60, title: 'ok', body: '' }]);
    expect(cleaned?.trainingDays).toEqual([1]);
    const picked = latestPlan([
      { plan: plan({ waterTitle: 'old' }), plan_updated_at: '2026-11-01T00:00:00Z', tz: 'UTC' },
      { plan: plan({ waterTitle: 'new' }), plan_updated_at: '2026-11-02T00:00:00Z', tz: 'Asia/Ho_Chi_Minh' },
      { plan: null, plan_updated_at: '2026-11-03T00:00:00Z', tz: null },
    ]);
    expect(picked?.plan.waterTitle).toBe('new');
    expect(picked?.tz).toBe('Asia/Ho_Chi_Minh');
  });

  it('reads the wall clock of the user time zone', () => {
    // 2026-11-02 01:30 UTC = 08:30 in Vietnam (Monday).
    expect(localClock(new Date('2026-11-02T01:30:00Z'), 'Asia/Ho_Chi_Minh')).toEqual({ dateKey: '2026-11-02', minutes: 510, weekday: 1 });
    expect(localClock(new Date('2026-11-01T23:30:00Z'), 'Not/AZone')).toEqual({ dateKey: '2026-11-02', minutes: 390, weekday: 1 });
  });
});

describe('web push sending (RFC 8291 / 8292)', () => {
  it('encrypts exactly as the RFC 8291 example', async () => {
    const body = await encryptPayload(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      {
        salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'),
        senderKeys: {
          publicKey: b64urlDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
          privateKey: b64urlDecode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        },
      }
    );
    expect(b64urlEncode(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
    );
  });

  const vapidPair = async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    return { pair, keys: { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: 'https://fitjourney-vn.vercel.app' } };
  };

  it('signs a VAPID JWT for the push service origin', async () => {
    const { pair, keys } = await vapidPair();
    const header = await vapidAuthorization('https://web.push.apple.com/QGv/abc', keys, 1_000_000);
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({ aud: 'https://web.push.apple.com', exp: 1_000_000 + 12 * 3600, sub: keys.subject });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it('posts an encrypted body and reports gone subscriptions', async () => {
    const { keys } = await vapidPair();
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
    const fetchImpl = jest.fn(async () => ({ status: 410, arrayBuffer: async () => new ArrayBuffer(0) }));
    const res = await sendWebPush(target, { title: 't' }, keys, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ status: 410, ok: false, gone: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(target.endpoint);
    expect(init.headers['Content-Encoding']).toBe('aes128gcm');
    expect(init.headers.Authorization).toMatch(/^vapid t=/);
    expect((init.body as Uint8Array).length).toBeGreaterThan(86 + 16);
  });
});

describe('client: subscribe helper', () => {
  const fakeSub = (endpoint = 'https://web.push.apple.com/abc'): PushSubscriptionLike => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } }),
    unsubscribe: jest.fn(async () => true),
  });
  const env = (over: Partial<PushEnv> = {}, existing: PushSubscriptionLike | null = null) => {
    const pushManager = { getSubscription: jest.fn(async () => existing), subscribe: jest.fn(async () => fakeSub()) };
    const reg = { pushManager };
    const e: PushEnv = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      standalone: true,
      hasPushManager: true,
      serviceWorker: { getRegistration: jest.fn(async () => reg), register: jest.fn(async () => reg), ready: Promise.resolve(reg) },
      Notification: { permission: 'default', requestPermission: jest.fn(async () => 'granted') },
      ...over,
    };
    return { e, pushManager };
  };

  it('asks an iPhone in Safari to add the app to the Home Screen first', async () => {
    const { e } = env({ standalone: false, displayStandalone: false });
    expect(pushSupport(e)).toBe('needsHomeScreen');
    expect(await subscribePush(e)).toEqual({ ok: false, reason: 'needsHomeScreen' });
    expect(e.Notification!.requestPermission).not.toHaveBeenCalled();
    expect(pushSupport(null)).toBe('unsupported');
    expect(pushSupport(env({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', hasPushManager: false }).e)).toBe('unsupported');
  });

  it('asks permission, then subscribes with the VAPID key', async () => {
    const { e, pushManager } = env();
    const result = await subscribePush(e, 'BDMIupwau73sZvgvv0cdSncJkzkMW4kqtlKuQPMl8KL9-3eXFPw356RvLGqxLOKtUOTkQJ7FEXAJhYTXT3ymQ6M');
    expect(e.Notification!.requestPermission).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, subscription: { endpoint: 'https://web.push.apple.com/abc', p256dh: expect.any(String), auth: 'BTBZMqHH6r4Tts7J_aSIgg' } });
    const options = (pushManager.subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }])[0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toHaveLength(65);
  });

  it('reuses an existing subscription; a refusal subscribes nothing', async () => {
    const existing = fakeSub('https://fcm.googleapis.com/x');
    const { e, pushManager } = env({}, existing);
    expect(await subscribePush(e)).toMatchObject({ ok: true, subscription: { endpoint: 'https://fcm.googleapis.com/x' } });
    expect(pushManager.subscribe).not.toHaveBeenCalled();

    const refused = env({ Notification: { permission: 'default', requestPermission: jest.fn(async () => 'denied') } });
    expect(await subscribePush(refused.e)).toEqual({ ok: false, reason: 'denied' });
    expect(refused.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes and returns the endpoint', async () => {
    const existing = fakeSub();
    const { e } = env({}, existing);
    expect(await unsubscribePush(e)).toBe('https://web.push.apple.com/abc');
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(await unsubscribePush(env({}, null).e)).toBeNull();
  });
});

describe('client: the plan sent with the subscription', () => {
  it('mirrors the water schedule, meal and workout reminders, in the chosen language', () => {
    const p = buildPushPlan({ plan: DEFAULT_PLAN, targetMl: 3500, startMinutes: 360, endMinutes: 1260, fasting: true, language: 'vi', now: new Date(2026, 10, 2, 9) });
    expect(cleanPushPlan(p)).toEqual(p);
    expect(p.water.training).toHaveLength(7);
    expect(p.water.training[0]).toMatchObject({ m: 360, cum: 500 });
    expect(p.water.training[6]).toMatchObject({ m: 1260, cum: 3500 });
    expect(p.trainingDays).toEqual([1, 2, 4, 5]);
    expect(p.meals.map((m) => m.m)).toEqual(DEFAULT_PLAN.mealTemplates.training.map((m) => m.startHour * 60 + m.startMinute));
    expect(p.meals[0].title).toBe(`Đến giờ ${DEFAULT_PLAN.mealTemplates.training[0].label}`);
    expect(p.waterBody).toBe('Uống {ml} ml — {label} (cộng dồn {total} ml).');
    const en = buildPushPlan({ plan: DEFAULT_PLAN, targetMl: 3500, startMinutes: 360, endMinutes: 1260, fasting: true, language: 'en', now: new Date(2026, 10, 2, 9) });
    expect(en.waterTitle).toBe('Water reminder 💧');
  });
});

describe('client: switch on / off', () => {
  const sub: PushSubscriptionLike = {
    endpoint: 'https://web.push.apple.com/dev1',
    toJSON: () => ({ endpoint: 'https://web.push.apple.com/dev1', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } }),
    unsubscribe: jest.fn(async () => true),
  };
  const reg = { pushManager: { getSubscription: jest.fn(async () => sub as PushSubscriptionLike | null), subscribe: jest.fn(async () => sub) } };
  const e: PushEnv = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    hasPushManager: true,
    serviceWorker: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) },
    Notification: { permission: 'granted', requestPermission: async () => 'granted' },
  };

  it('saves the subscription with the plan and time zone, then deletes it when switched off', async () => {
    useSettingsStore.setState({ remindersEnabled: true, language: 'vi' });
    const result = await enableWebPush(e);
    expect(result.ok).toBe(true);
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe('push_claim_subscription');
    expect(args).toMatchObject({ p_endpoint: 'https://web.push.apple.com/dev1', p_auth: 'BTBZMqHH6r4Tts7J_aSIgg', p_tz: expect.any(String) });
    expect(cleanPushPlan(args.p_plan)).not.toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(usePushStore.getState()).toMatchObject({ enabled: true, endpoint: 'https://web.push.apple.com/dev1' });

    await disableWebPush(e);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(mockDeleteEq).toHaveBeenCalledWith('endpoint', 'https://web.push.apple.com/dev1');
    expect(usePushStore.getState().enabled).toBe(false);
  });
});
