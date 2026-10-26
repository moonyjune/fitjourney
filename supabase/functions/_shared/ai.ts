// The common path of every AI Edge Function: CORS, kill switch, API key, sign-in, per-user daily quota, one Claude call
// with a forced tool (structured output), one retry on a transient failure, and usage/cost logging. Each feature function
// only builds its prompt and tool. Deploy: every function that imports this is deployed with `npx supabase functions deploy <name>`.
//
// Secrets / env:  ANTHROPIC_API_KEY (required)   AI_MODEL (default claude-sonnet-5-5)   AI_DISABLED=1 (kill switch)
//                 AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK (cost estimate only)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  DEFAULT_PRICE_IN_PER_MTOK,
  DEFAULT_USER_DAILY_BUDGET_USD,
  GLOBAL_BUDGET_MESSAGE,
  USER_BUDGET_MESSAGE,
  budgetFrom,
  budgetReached,
  DEFAULT_PRICE_OUT_PER_MTOK,
  dayKey,
  estimateCostUsd,
  priceFrom,
  quotaMessage,
  quotaReached,
  shouldRetry,
  type AiFeature,
  type TokenUsage,
} from './usage.ts';

export type { AiFeature };

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
export const MODEL = Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5';
const PRICE_IN = priceFrom(Deno.env.get('AI_PRICE_IN_PER_MTOK'), DEFAULT_PRICE_IN_PER_MTOK);
const PRICE_OUT = priceFrom(Deno.env.get('AI_PRICE_OUT_PER_MTOK'), DEFAULT_PRICE_OUT_PER_MTOK);
const USER_BUDGET = budgetFrom(Deno.env.get('AI_USER_DAILY_BUDGET_USD'), DEFAULT_USER_DAILY_BUDGET_USD);
const GLOBAL_BUDGET = budgetFrom(Deno.env.get('AI_DAILY_BUDGET_USD'), 0);
const REQUEST_TIMEOUT_MS = 90_000;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AiCall {
  tool: ToolDef;
  /** Anthropic `messages` array. */
  messages: unknown[];
  system?: string;
  maxTokens: number;
}

export interface AiContext {
  userId: string;
  /** The user's own client (their JWT): row-level security applies. */
  userClient: SupabaseClient;
  /** Service-role client for server-only tables (usage, reports). */
  admin: SupabaseClient;
}

/** What a feature handler returns: the Claude call to make plus how to wrap its tool input in the response, or a ready
 *  response (e.g. a cached report, no AI call and no quota used). */
export type AiPlan = { call: AiCall; responseKey: string; after?: (input: Record<string, unknown>, ctx: AiContext) => Promise<void> } | Response;

async function usedToday(admin: SupabaseClient, userId: string, feature: AiFeature): Promise<number> {
  const { data } = await admin.from('ai_usage').select('calls').eq('user_id', userId).eq('day', dayKey()).eq('feature', feature).maybeSingle();
  return Number(data?.calls ?? 0);
}

/** Estimated dollars this user already spent today across every feature. */
async function userCostToday(admin: SupabaseClient, userId: string): Promise<number> {
  const { data } = await admin.from('ai_usage').select('cost_usd').eq('user_id', userId).eq('day', dayKey());
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
}

/** Estimated dollars everybody spent today (only asked when a global cap is set). */
async function globalCostToday(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.rpc('ai_cost_on_day', { p_day: dayKey() });
  return Number(data ?? 0);
}

async function recordUsage(admin: SupabaseClient, userId: string, feature: AiFeature, usage: TokenUsage | undefined): Promise<void> {
  try {
    await admin.rpc('ai_usage_bump', {
      p_user: userId,
      p_day: dayKey(),
      p_feature: feature,
      p_in: usage?.input_tokens ?? 0,
      p_out: usage?.output_tokens ?? 0,
      p_cost: estimateCostUsd(usage, PRICE_IN, PRICE_OUT),
      p_model: MODEL,
    });
  } catch (error) {
    console.warn('[ai] usage not recorded:', error);
  }
}

async function callClaude(call: AiCall): Promise<{ input: Record<string, unknown>; usage?: TokenUsage } | { error: string; status: number }> {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: call.maxTokens,
    ...(call.system ? { system: call.system } : {}),
    tools: [call.tool],
    tool_choice: { type: 'tool', name: call.tool.name },
    messages: call.messages,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const data = await response.json();
      const blocks: Array<Record<string, unknown>> = data.content ?? [];
      const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === call.tool.name);
      if (!toolUse) return { error: 'AI không trả về kết quả phân tích.', status: 502 };
      return { input: toolUse.input as Record<string, unknown>, usage: data.usage };
    }
    if (attempt === 0 && shouldRetry(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }
    const detail = await response.text();
    return { error: `Claude API lỗi: ${detail}`, status: 502 };
  }
  return { error: 'Claude API không phản hồi.', status: 502 };
}

/** Wraps a feature: `plan` receives the parsed JSON body and the context, and returns the Claude call (or a Response). */
export function serveAi(feature: AiFeature, plan: (body: Record<string, unknown>, ctx: AiContext) => Promise<AiPlan>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (Deno.env.get('AI_DISABLED') === '1') return jsonResponse({ error: 'Tính năng AI đang tạm tắt.' }, 503);
      if (!ANTHROPIC_API_KEY) return jsonResponse({ error: 'Server chưa cấu hình ANTHROPIC_API_KEY.' }, 500);
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ error: 'Thiếu Authorization header.' }, 401);

      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();
      if (userError || !user) return jsonResponse({ error: 'Không xác thực được người dùng.' }, 401);

      if (!SERVICE_ROLE_KEY) return jsonResponse({ error: 'Server chưa cấu hình khóa dịch vụ (SUPABASE_SERVICE_ROLE_KEY).' }, 500);
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const ctx: AiContext = { userId: user.id, userClient, admin };

      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: 'Nội dung yêu cầu không hợp lệ.' }, 400);
      }

      const planned = await plan(body ?? {}, ctx);
      if (planned instanceof Response) return planned;

      if (quotaReached(feature, await usedToday(admin, user.id, feature))) return jsonResponse({ error: quotaMessage(feature) }, 429);
      if (budgetReached(await userCostToday(admin, user.id), USER_BUDGET)) return jsonResponse({ error: USER_BUDGET_MESSAGE }, 429);
      if (GLOBAL_BUDGET > 0 && budgetReached(await globalCostToday(admin), GLOBAL_BUDGET)) return jsonResponse({ error: GLOBAL_BUDGET_MESSAGE }, 503);

      const outcome = await callClaude(planned.call);
      if ('error' in outcome) return jsonResponse({ error: outcome.error }, outcome.status);
      await recordUsage(admin, user.id, feature, outcome.usage);
      if (planned.after) await planned.after(outcome.input, ctx);
      return jsonResponse({ [planned.responseKey]: outcome.input });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
    }
  });
}
