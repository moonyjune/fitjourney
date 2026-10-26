// The common path of every AI Edge Function: CORS, kill switch, API key, sign-in, per-user daily quota, one Claude call
// with a forced tool (structured output), one retry on a transient failure, and usage/cost logging. Each feature function
// only builds its prompt and tool. Deploy: every function that imports this is deployed with `npx supabase functions deploy <name>`.
//
// Secrets / env:  ANTHROPIC_API_KEY (required)   AI_MODEL (default claude-sonnet-5-5)   AI_DISABLED=1 (kill switch)
//                 The admin can change the model and prices on the AI & cost screen (table ai_settings); that wins over AI_MODEL / AI_PRICE_*.
//                 AI_WORKSPACE_ID (only for an API key that is not tied to one workspace)   AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK (cost estimate only)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  ATTEMPT_TIMEOUT_MS,
  anthropicHeaders,
  isToolChoiceUnsupported,
  systemFor,
  toolChoiceFor,
  type AiConfig,
  resolveAiConfig,
  RETRY_WAITS_MS,
  canRetry,
  summarizeUpstreamError,
  DEFAULT_USER_DAILY_BUDGET_USD,
  GLOBAL_BUDGET_MESSAGE,
  USER_BUDGET_MESSAGE,
  budgetFrom,
  budgetReached,
  dayKey,
  estimateCostUsd,
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
const ENV_CONFIG = { model: Deno.env.get('AI_MODEL') ?? undefined, priceIn: Deno.env.get('AI_PRICE_IN_PER_MTOK') ?? undefined, priceOut: Deno.env.get('AI_PRICE_OUT_PER_MTOK') ?? undefined };
const CONFIG_TTL_MS = 30_000;
let configCache: { at: number; config: AiConfig } | null = null;

/** The model and prices in force: the admin's saved choice (ai_settings), else the environment. Read at most every 30 s per instance. */
async function loadConfig(admin: SupabaseClient): Promise<AiConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.config;
  let rows: { key: string; value: string }[] | null = null;
  try {
    const { data } = await admin.from('ai_settings').select('key,value');
    rows = data;
  } catch (error) {
    console.warn('[ai] settings not read, using the environment:', error);
  }
  const config = resolveAiConfig(rows, ENV_CONFIG);
  configCache = { at: Date.now(), config };
  return config;
}
const USER_BUDGET = budgetFrom(Deno.env.get('AI_USER_DAILY_BUDGET_USD'), DEFAULT_USER_DAILY_BUDGET_USD);
const GLOBAL_BUDGET = budgetFrom(Deno.env.get('AI_DAILY_BUDGET_USD'), 0);

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

async function recordUsage(admin: SupabaseClient, userId: string, feature: AiFeature, usage: TokenUsage | undefined, config: AiConfig): Promise<void> {
  try {
    await admin.rpc('ai_usage_bump', {
      p_user: userId,
      p_day: dayKey(),
      p_feature: feature,
      p_in: usage?.input_tokens ?? 0,
      p_out: usage?.output_tokens ?? 0,
      p_cost: estimateCostUsd(usage, config.priceInPerMtok, config.priceOutPerMtok),
      p_model: config.model,
    });
  } catch (error) {
    console.warn('[ai] usage not recorded:', error);
  }
}

/** Models that have refused a forced tool call, so later calls with them in this instance go straight to the working mode. */
const noForcedTool = new Set<string>();

async function callClaude(call: AiCall, model: string): Promise<{ input: Record<string, unknown>; usage?: TokenUsage } | { error: string; status: number }> {
  const bodyFor = (forced: boolean) => {
    const system = systemFor(call.system, call.tool.name, forced);
    return JSON.stringify({
      model,
      max_tokens: call.maxTokens,
      ...(system ? { system } : {}),
      tools: [call.tool],
      tool_choice: toolChoiceFor(call.tool.name, forced),
      messages: call.messages,
    });
  };
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    let failure = 'Claude API không phản hồi.';
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: anthropicHeaders(ANTHROPIC_API_KEY!, Deno.env.get('AI_WORKSPACE_ID')),
        body: bodyFor(!noForcedTool.has(model)),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch (error) {
      // No answer at all (network, or the attempt timed out): worth another try like a 5xx.
      failure = `Claude API không phản hồi (${error instanceof Error ? error.message : 'lỗi mạng'}).`;
    }
    if (response?.ok) {
      const data = await response.json();
      const blocks: Array<Record<string, unknown>> = data.content ?? [];
      const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === call.tool.name);
      if (!toolUse) {
        console.error('[ai] no tool_use in the answer', data.stop_reason);
        const why = data.stop_reason === 'max_tokens' ? 'câu trả lời bị cắt do quá dài, hãy thử lại' : (data.stop_reason ?? 'không rõ lý do');
        return { error: `AI không trả về kết quả phân tích (${why}).`, status: 502 };
      }
      return { input: toolUse.input as Record<string, unknown>, usage: data.usage };
    }
    const retryable = response === null || shouldRetry(response.status);
    if (response) {
      const text = await response.text();
      if (!noForcedTool.has(model) && isToolChoiceUnsupported(response.status, text)) {
        // This model does not take a forced tool call: switch to letting it choose, and go again at once (not a failed attempt).
        console.warn('[ai] model refuses a forced tool call; switching to tool_choice auto');
        noForcedTool.add(model);
        attempt -= 1;
        continue;
      }
      failure = summarizeUpstreamError(response.status, text);
      console.error('[ai]', failure, 'attempt', attempt + 1, 'request-id', response.headers.get('request-id'));
    } else {
      console.error('[ai]', failure, 'attempt', attempt + 1);
    }
    if (!retryable || !canRetry(attempt, Date.now() - started)) return { error: failure, status: 502 };
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAITS_MS[attempt] ?? 1500));
  }
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

      const config = await loadConfig(admin);
      const outcome = await callClaude(planned.call, config.model);
      if ('error' in outcome) return jsonResponse({ error: outcome.error }, outcome.status);
      await recordUsage(admin, user.id, feature, outcome.usage, config);
      if (planned.after) await planned.after(outcome.input, ctx);
      return jsonResponse({ [planned.responseKey]: outcome.input });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
    }
  });
}
