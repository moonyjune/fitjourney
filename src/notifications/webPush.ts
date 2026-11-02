import { Platform } from 'react-native';
import { getDayType, TRAINING_WEEKDAYS } from '../constants/plan';
import { formatGameText } from '../game/strings';
import { supabase } from '../lib/supabase';
import { currentUserId } from '../sync/cloudSync';
import { useMealModeStore } from '../store/useMealModeStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { usePushStore } from '../store/usePushStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWaterWindowStore } from '../store/useWaterWindowStore';
import type { PlanData } from '../types';
import { toDateKey } from '../utils/date';
import { dayWaterTargetMl } from '../water/schedule';
import { waterPlanFor } from '../water/useWaterPlan';
import { PUSH_PLAN_VERSION, type PushPlan, type PushWaterPoint } from '../../supabase/functions/_shared/pushPlan';

/**
 * Web Push: reminders that arrive with the web app (and the browser) closed. The device subscribes with the server's VAPID
 * public key and saves the subscription, with its reminder plan and time zone, to `push_subscriptions`; the send-push function
 * (pg_cron, every 15 minutes) sends what is due. On iPhone this only works for the app added to the Home Screen (iOS 16.4+),
 * and permission can only be asked from a tap.
 */

/** Public by design (the browser needs it to subscribe); the private half is a server secret. */
export const DEFAULT_VAPID_PUBLIC_KEY = 'BDMIupwau73sZvgvv0cdSncJkzkMW4kqtlKuQPMl8KL9-3eXFPw356RvLGqxLOKtUOTkQJ7FEXAJhYTXT3ymQ6M';
export const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

/** What the browser offers, injectable for tests. */
export interface PushEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** iOS Safari's own flag for a Home Screen app. */
  standalone?: boolean;
  displayStandalone?: boolean;
  serviceWorker?: {
    getRegistration: () => Promise<PushRegistration | undefined>;
    register: (url: string) => Promise<unknown>;
    ready: Promise<PushRegistration>;
  };
  hasPushManager: boolean;
  Notification?: { permission: string; requestPermission: () => Promise<string> };
}

export interface PushRegistration {
  pushManager: {
    getSubscription: () => Promise<PushSubscriptionLike | null>;
    subscribe: (options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => Promise<PushSubscriptionLike>;
  };
}

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON: () => { endpoint?: string; keys?: Record<string, string> };
  unsubscribe: () => Promise<boolean>;
}

export function browserPushEnv(): PushEnv | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { standalone?: boolean };
  let displayStandalone = false;
  try {
    displayStandalone = !!window.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    // no matchMedia
  }
  return {
    userAgent: nav.userAgent ?? '',
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: nav.standalone,
    displayStandalone,
    serviceWorker: 'serviceWorker' in nav ? (nav.serviceWorker as unknown as PushEnv['serviceWorker']) : undefined,
    hasPushManager: 'PushManager' in window,
    Notification: typeof Notification !== 'undefined' ? (Notification as unknown as PushEnv['Notification']) : undefined,
  };
}

export const isIos = (env: PushEnv) => /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1);
export const isStandalone = (env: PushEnv) => env.standalone === true || env.displayStandalone === true;

export type PushSupport = 'ok' | 'unsupported' | 'needsHomeScreen' | 'denied';

/** Can this browser get Web Push now? An iPhone in Safari (not the Home Screen app) needs the app added first. */
export function pushSupport(env: PushEnv | null): PushSupport {
  if (!env) return 'unsupported';
  if (isIos(env) && !isStandalone(env)) return 'needsHomeScreen';
  if (!env.serviceWorker || !env.hasPushManager || !env.Notification) return 'unsupported';
  if (env.Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function registration(env: PushEnv): Promise<PushRegistration> {
  const sw = env.serviceWorker!;
  // index.html registers /sw.js on load; register here too in case that has not happened yet (same URL: no second worker).
  if (!(await sw.getRegistration())) await sw.register('/sw.js');
  return sw.ready;
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SubscribeResult = { ok: true; subscription: SubscriptionKeys } | { ok: false; reason: Exclude<PushSupport, 'ok'> | 'failed' };

/** Asks for permission (call straight from a tap: no await before it) and subscribes, reusing an existing subscription. */
export async function subscribePush(env: PushEnv | null, vapidKey = VAPID_PUBLIC_KEY): Promise<SubscribeResult> {
  const support = pushSupport(env);
  if (support !== 'ok' || !env) return { ok: false, reason: support as Exclude<PushSupport, 'ok'> };
  try {
    const permission = env.Notification!.permission === 'granted' ? 'granted' : await env.Notification!.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await registration(env);
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey) }));
    const json = sub.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!sub.endpoint || !p256dh || !auth) return { ok: false, reason: 'failed' };
    return { ok: true, subscription: { endpoint: sub.endpoint, p256dh, auth } };
  } catch (error) {
    console.warn('[webPush] subscribe failed:', error);
    return { ok: false, reason: 'failed' };
  }
}

/** Drops this browser's subscription (if any); returns its endpoint. */
export async function unsubscribePush(env: PushEnv | null): Promise<string | null> {
  if (!env?.serviceWorker || !env.hasPushManager) return null;
  try {
    const reg = await env.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return null;
    await sub.unsubscribe();
    return sub.endpoint;
  } catch (error) {
    console.warn('[webPush] unsubscribe failed:', error);
    return null;
  }
}

/** This browser's current subscription (null when there is none: iOS drops it when the Home Screen app is removed). */
export async function currentSubscription(env: PushEnv | null): Promise<SubscriptionKeys | null> {
  if (!env?.serviceWorker || !env.hasPushManager) return null;
  try {
    const reg = await env.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const json = sub?.toJSON();
    if (!sub?.endpoint || !json?.keys?.p256dh || !json.keys.auth) return null;
    return { endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
  } catch {
    return null;
  }
}

interface PlanInput {
  plan: Pick<PlanData, 'mealTemplates' | 'workoutTemplates'>;
  targetMl: number;
  startMinutes: number;
  endMinutes: number;
  fasting: boolean;
  language: 'vi' | 'en';
  now: Date;
}

/** The next date (from `now`) of the given day type, for naming that day's drinks. */
function nextDateOf(now: Date, type: 'training' | 'rest'): Date {
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    if (getDayType(d) === type) return d;
  }
  return now;
}

/** The plan the server reminds from: the same water schedule, meal and workout times the app reminds with
 *  (src/water/useWaterPlan.ts, src/notifications/schedule.ts), the texts already in the user's language. */
export function buildPushPlan(input: PlanInput): PushPlan {
  const t = (key: Parameters<typeof formatGameText>[1], params?: Record<string, string | number>) => formatGameText(input.language, key, params);
  const water = (type: 'training' | 'rest'): PushWaterPoint[] =>
    waterPlanFor({ ...input, date: nextDateOf(input.now, type) }).schedule.map((c) => ({ m: c.hour * 60 + c.minute, cum: c.cumulativeTargetMl, label: c.label }));
  return {
    v: PUSH_PLAN_VERSION,
    water: { training: water('training'), rest: water('rest') },
    trainingDays: [...TRAINING_WEEKDAYS].sort(),
    // Meal times are the same on training and rest days; the phone reminds from the training template too.
    meals: (input.plan.mealTemplates.training ?? []).map((m) => ({ m: m.startHour * 60 + m.startMinute, title: t('push.mealTitle', { label: m.label }), body: t('push.mealBody') })),
    workouts: input.plan.workoutTemplates
      .filter((w) => w.reminderSlot && w.startHour !== undefined && w.startMinute !== undefined)
      .map((w) => ({ m: w.startHour! * 60 + w.startMinute!, title: t('push.workoutTitle', { label: w.label }), body: w.description })),
    waterTitle: t('water.notifTitle'),
    waterBody: formatGameText(input.language, 'water.notifBody', { ml: '{ml}', label: '{label}', total: '{total}' }),
  };
}

/** The plan from the stores now, or null when reminders are off (nothing is sent then). */
export function currentPushPlan(now = new Date()): PushPlan | null {
  const settings = useSettingsStore.getState();
  if (!settings.remindersEnabled) return null;
  const window = useWaterWindowStore.getState();
  return buildPushPlan({
    plan: usePlanStore.getState().plan,
    targetMl: dayWaterTargetMl(useNutritionStore.getState().logs[toDateKey(now)], settings.waterTargetMl),
    startMinutes: window.startMinutes,
    endMinutes: window.endMinutes,
    fasting: useMealModeStore.getState().fasting,
    language: settings.language,
    now,
  });
}

const timeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

/** Saves (or updates) this device's subscription row with the current plan. */
export async function saveSubscription(sub: SubscriptionKeys, plan: PushPlan | null, userAgent: string): Promise<boolean> {
  const userId = currentUserId();
  if (!userId) return false;
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: userAgent.slice(0, 400),
      plan,
      plan_updated_at: new Date().toISOString(),
      tz: timeZone(),
      failures: 0,
    },
    { onConflict: 'endpoint' }
  );
  if (error) {
    console.warn('[webPush] save failed:', error);
    return false;
  }
  return true;
}

/** Turns push on for this device (from the Profile switch's tap). */
export async function enableWebPush(env = browserPushEnv()): Promise<SubscribeResult> {
  const result = await subscribePush(env);
  if (!result.ok) return result;
  const plan = currentPushPlan();
  if (!(await saveSubscription(result.subscription, plan, env?.userAgent ?? ''))) return { ok: false, reason: 'failed' };
  usePushStore.getState().set({ enabled: true, endpoint: result.subscription.endpoint, savedPlanJson: JSON.stringify(plan) });
  return result;
}

/** Turns push off for this device: unsubscribes and deletes the row (also on sign-out, while still signed in). */
export async function disableWebPush(env = browserPushEnv()): Promise<void> {
  const endpoint = (await unsubscribePush(env)) ?? usePushStore.getState().endpoint;
  if (endpoint && currentUserId()) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) console.warn('[webPush] delete failed:', error);
  }
  usePushStore.getState().reset();
}

/** Sends the plan again when it changed (settings, plan, language, reminders switch), as an upsert of the whole row, so a row the
 *  server dropped or an endpoint the browser renewed is saved again; turns the switch off when the subscription is gone. */
export async function refreshPushPlan(env = browserPushEnv(), force = false): Promise<void> {
  const state = usePushStore.getState();
  if (!state.enabled || !currentUserId()) return;
  const sub = await currentSubscription(env);
  if (!sub) {
    usePushStore.getState().reset();
    return;
  }
  const plan = currentPushPlan();
  const json = JSON.stringify(plan);
  if (!force && json === state.savedPlanJson && sub.endpoint === state.endpoint) return;
  if (await saveSubscription(sub, plan, env?.userAgent ?? '')) usePushStore.getState().set({ endpoint: sub.endpoint, savedPlanJson: json });
}
