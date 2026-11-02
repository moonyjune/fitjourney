// Supabase Edge Function (Deno runtime): Web Push reminders, so they arrive with the app (and the browser) closed.
// Called every 15 minutes by pg_cron (supabase/schema.sql, "Web Push"), never by the app.
//
// Deploy (no user JWT: the cron call is checked with the shared secret instead):
//   npx supabase functions deploy send-push --no-verify-jwt
// Secrets:
//   VAPID_PUBLIC_KEY   the public key the app subscribes with (EXPO_PUBLIC_VAPID_PUBLIC_KEY / src/notifications/webPush.ts)
//   VAPID_PRIVATE_KEY  its private key (base64url, 32 bytes)
//   VAPID_SUBJECT      contact for the push services, `mailto:...` or `https://...` (default: the web app's URL)
//   PUSH_CRON_SECRET   the same value as the vault secret 'push_cron_secret' the cron job sends in x-cron-secret
//
// For each user with a subscription and reminders on: the reminders due now in their time zone (_shared/pushPlan.ts), sent to
// every device of theirs, each recorded in push_sent so it is never sent twice. Subscriptions the push service says are gone
// (404 / 410) are deleted.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { duePushes, latestPlan, localClock, type DuePush } from '../_shared/pushPlan.ts';
import { sendWebPush, type VapidKeys } from '../_shared/webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? '';
const MAX_FAILURES = 10;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  plan: unknown;
  plan_updated_at: string | null;
  tz: string | null;
  failures: number;
}

Deno.serve(async (req) => {
  if (!sameSecret(req.headers.get('x-cron-secret') ?? '', CRON_SECRET)) return json({ error: 'forbidden' }, 401);
  const vapid: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') || 'https://fitjourney-vn.vercel.app',
  };
  if (!vapid.publicKey || !vapid.privateKey) return json({ error: 'VAPID keys not set' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, plan, plan_updated_at, tz, failures')
    .not('plan', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const byUser = new Map<string, SubRow[]>();
  for (const s of (subs ?? []) as SubRow[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  if (byUser.size === 0) return json({ users: 0, sent: 0 });

  // The master "Reminders" switch of the app (profiles.reminders_enabled) turns these off too.
  const { data: profiles } = await admin.from('profiles').select('id, reminders_enabled').in('id', [...byUser.keys()]);
  const off = new Set((profiles ?? []).filter((p) => p.reminders_enabled === false).map((p) => p.id as string));

  const now = new Date();
  const since = new Date(now.getTime() - 2 * 86400_000).toISOString();
  let sentCount = 0;
  let goneCount = 0;

  for (const [userId, rows] of byUser) {
    if (off.has(userId)) continue;
    const picked = latestPlan(rows);
    if (!picked) continue;
    const clock = localClock(now, picked.tz);

    const [{ data: sentRows }, { data: log }] = await Promise.all([
      admin.from('push_sent').select('key').eq('user_id', userId).gte('sent_at', since),
      admin.from('nutrition_logs').select('water_ml').eq('user_id', userId).eq('entry_date', clock.dateKey).maybeSingle(),
    ]);
    const sent = new Set((sentRows ?? []).map((r) => r.key as string));
    const due: DuePush[] = duePushes(picked.plan, clock, sent, log ? Number(log.water_ml) : null);
    if (due.length === 0) continue;

    let alive = rows;
    for (const message of due) {
      let delivered = false;
      const next: SubRow[] = [];
      for (const sub of alive) {
        try {
          const res = await sendWebPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            { title: message.title, body: message.body, tag: message.tag, url: message.url },
            vapid,
            { ttlSec: 3600 }
          );
          if (res.gone) {
            goneCount++;
            await admin.from('push_subscriptions').delete().eq('id', sub.id);
            continue;
          }
          if (res.ok) {
            delivered = true;
            await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq('id', sub.id);
          } else {
            console.warn('[send-push] push service answered', res.status);
            sub.failures += 1;
            if (sub.failures >= MAX_FAILURES) {
              await admin.from('push_subscriptions').delete().eq('id', sub.id);
              continue;
            }
            await admin.from('push_subscriptions').update({ failures: sub.failures }).eq('id', sub.id);
          }
        } catch (e) {
          console.warn('[send-push] send failed', e instanceof Error ? e.message : e);
        }
        next.push(sub);
      }
      alive = next;
      // Recorded once delivered to at least one device; a message nobody got is tried again on the next run (within its window).
      if (delivered) {
        sentCount++;
        const keys = [message.key, ...message.alsoKeys];
        await admin.from('push_sent').upsert(keys.map((key) => ({ user_id: userId, key, sent_at: now.toISOString() })), { onConflict: 'user_id,key' });
      }
    }
  }

  // Keys older than a few days are no longer needed (a key holds its date).
  await admin.from('push_sent').delete().lt('sent_at', new Date(now.getTime() - 4 * 86400_000).toISOString());
  return json({ users: byUser.size, sent: sentCount, gone: goneCount });
});
