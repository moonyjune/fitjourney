// Work done for nobody in particular (the temptation pool's refills and pictures, the photo repair jobs): a service-role context
// without a player, the cost logged as system cost on the pool's meta row (tempt_pool_add_cost, never a player's usage or budget;
// the global daily cap AI_DAILY_BUDGET_USD still counts it), the cron-secret check of a maintenance call, and background work.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AiContext } from './ai.ts';
import type { TokenUsage } from './usage.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

export type RecordFn = (usage: TokenUsage | undefined, costUsd: number, model: string) => Promise<void>;

/** Logs a call made for the system (not a player) on tempt_pool_meta.system_cost_* (tempt_pool_add_cost); `tag` names it in the logs. */
export const systemRecord =
  (admin: SupabaseClient, tag = 'system'): RecordFn =>
  async (usage, costUsd, model) => {
    const { error } = await admin.rpc('tempt_pool_add_cost', { p_in: usage?.input_tokens ?? 0, p_out: usage?.output_tokens ?? 0, p_cost: costUsd });
    if (error) console.warn(`[${tag}] system cost not recorded:`, JSON.stringify(error));
    console.log(`[${tag}] system call`, model, 'cost', costUsd.toFixed(4));
  };

/** A context for system work: service role everywhere, no player. */
export const systemContext = (admin: SupabaseClient): AiContext => ({ userId: '', userClient: admin, admin });

/** Compares two secrets in constant time (for the same length). */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The cron secret (PUSH_CRON_SECRET, the same as send-push's and the tempt-me seed's). */
export const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? '';

/** A maintenance call: null when the request has no x-cron-secret header (a normal call), a 401 answer when the secret is wrong,
 *  else the JSON body (empty when there is none). */
export async function cronBody(req: Request): Promise<null | { forbidden: true } | { body: Record<string, unknown> }> {
  const secret = req.headers.get('x-cron-secret');
  if (secret === null) return null;
  if (!sameSecret(secret, CRON_SECRET)) return { forbidden: true };
  try {
    const body = (await req.json()) as Record<string, unknown>;
    return { body: body && typeof body === 'object' ? body : {} };
  } catch {
    return { body: {} };
  }
}

/** Keeps `work` running after the answer is sent (Supabase's EdgeRuntime.waitUntil); awaited where that is not available. */
export async function inBackground(work: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
  else await work;
}
