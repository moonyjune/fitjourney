// The common path of every AI Edge Function: CORS, kill switch, API key, sign-in, per-user daily quota, one Claude call
// with a forced tool (structured output), one retry on a transient failure, and usage/cost logging. Each feature function
// only builds its prompt and tool. A call with `webSearch` (suggest-cheat-places) instead lets the model search the web first
// (tool_choice auto, made once, paused turns continued; see callClaudeWithSearch and webSearch.ts). Deploy: every function that imports this is deployed with `npx supabase functions deploy <name>`.
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
  featureConfig,
  modelGroupOf,
  quotaFrom,
  quotaKey,
  quotaMessage,
  quotaReached,
  shouldRetry,
  type AiFeature,
  type TokenUsage,
  addUsage,
} from './usage.ts';
import {
  collectWebFindings,
  isRegionUnsupported,
  isUserLocationRejected,
  isWebSearchUnavailable,
  mergeFindings,
  PLACES_UNAVAILABLE_PREFIX,
  regionUnsupportedMessage,
  searchLocation,
  webSearchRetryAfter,
  webSearchTool,
  webSearchVariantFor,
  type WebFindings,
  type WebSearchAttempt,
  type WebSearchOptions,
} from './webSearch.ts';
import { collectWebEvidence, emptyEvidence, hasUserLocation, isServerToolUnavailable, withoutUserLocation, type WebEvidence } from './webtools.ts';

export type { AiFeature };

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ENV_CONFIG = { model: Deno.env.get('AI_MODEL') ?? undefined, priceIn: Deno.env.get('AI_PRICE_IN_PER_MTOK') ?? undefined, priceOut: Deno.env.get('AI_PRICE_OUT_PER_MTOK') ?? undefined };
const CONFIG_TTL_MS = 30_000;
let configCache: { at: number; config: AiConfig; rows: { key: string; value: string }[] } | null = null;

/** The model and prices in force for `feature`: the admin's saved choice (ai_settings), else the environment; a feature with its own
 *  model (`model.<group>`, see featureConfig) gets that one. Read at most every 30 s per instance. */
async function loadConfig(admin: SupabaseClient, feature?: AiFeature): Promise<AiConfig> {
  if (!configCache || Date.now() - configCache.at >= CONFIG_TTL_MS) {
    let rows: { key: string; value: string }[] | null = null;
    try {
      const { data } = await admin.from('ai_settings').select('key,value');
      rows = data;
    } catch (error) {
      console.warn('[ai] settings not read, using the environment:', error);
    }
    configCache = { at: Date.now(), config: resolveAiConfig(rows, ENV_CONFIG), rows: rows ?? [] };
  }
  return feature ? featureConfig(configCache.config, configCache.rows, modelGroupOf(feature)) : configCache.config;
}
let quotaCache: { at: number; rows: { key: string; value: unknown }[] } | null = null;

/** A feature's calls per user per day: `app_settings` key `ai_quota.<feature>`, else the default in usage.ts. Read at most every 30 s. */
async function loadQuota(admin: SupabaseClient, feature: AiFeature): Promise<number> {
  if (!quotaCache || Date.now() - quotaCache.at >= CONFIG_TTL_MS) {
    let rows: { key: string; value: unknown }[] = [];
    try {
      const { data } = await admin.from('app_settings').select('key,value').like('key', 'ai_quota.%');
      rows = data ?? [];
    } catch (error) {
      console.warn('[ai] app_settings not read, using the default quotas:', error);
    }
    quotaCache = { at: Date.now(), rows };
  }
  return quotaFrom(feature, quotaCache.rows.filter((r) => r.key === quotaKey(feature)));
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
  /** Lets the model search the web (Anthropic's server-side web search tool) before it calls `tool`. The call is then not forced
   *  (a forced tool call would skip the search), is made once (searches cost money), and its findings go to `shape`. */
  webSearch?: WebSearchOptions;
  /** Anthropic server tools (web search / fetch) offered next to the feature's tool, for the model in force. With them the model
   *  chooses when to call the feature's tool (a forced call would skip the searches); without them nothing changes. */
  serverTools?: (model: string) => Record<string, unknown>[];
  /** Time one attempt may take (default ATTEMPT_TIMEOUT_MS), for a call that writes a long answer (tempt-me's bulk refill). */
  attemptTimeoutMs?: number;
}

/** What the web tools gave a call: whether they were offered and accepted by the API, and what the answer showed of the web. */
export interface WebOutcome {
  offered: boolean;
  /** False when the API refused the tools (e.g. not enabled for the key) and the call went ahead without them. */
  available: boolean;
  searches: number;
  evidence: WebEvidence;
}

/** What `shape` gets besides the tool input. */
export interface ShapeInfo {
  ctx: AiContext;
  usage?: TokenUsage;
  findings: WebFindings | null;
  web?: WebOutcome;
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
export type AiPlan =
  | {
      call: AiCall;
      responseKey: string;
      after?: (input: Record<string, unknown>, ctx: AiContext) => Promise<void>;
      /** What goes into the response instead of the raw tool input (e.g. the input checked against what the web search or the web
       *  tools showed). `findings`: a `webSearch` call's; `web`: a `serverTools` call's. */
      shape?: (input: Record<string, unknown>, info: ShapeInfo) => unknown;
    }
  | Response;

async function usedToday(admin: SupabaseClient, userId: string, feature: AiFeature): Promise<number> {
  // One row per model, so a day on which the model was changed has several.
  const { data } = await admin.from('ai_usage').select('calls').eq('user_id', userId).eq('day', dayKey()).eq('feature', feature);
  return (data ?? []).reduce((sum, row) => sum + Number(row.calls ?? 0), 0);
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

/** How many times a call that paused in its server-tool loop (`pause_turn`), or searched and then stopped without the feature's tool,
 *  is continued. */
const MAX_TOOL_CONTINUATIONS = 2;

async function callClaude(
  call: AiCall,
  model: string
): Promise<{ input: Record<string, unknown>; usage?: TokenUsage; web: WebOutcome; stopReason?: string } | { error: string; status: number }> {
  let serverTools = call.serverTools ? call.serverTools(model) : [];
  const web: WebOutcome = { offered: serverTools.length > 0, available: serverTools.length > 0, searches: 0, evidence: emptyEvidence() };
  let messages = call.messages;
  let continuations = 0;
  let inTokens = 0;
  let outTokens = 0;
  let searches = 0;
  const addUsage = (u: TokenUsage | undefined) => {
    inTokens += Number(u?.input_tokens ?? 0) || 0;
    outTokens += Number(u?.output_tokens ?? 0) || 0;
    searches += Number(u?.server_tool_use?.web_search_requests ?? 0) || 0;
  };
  const bodyFor = (forced: boolean) => {
    // With server tools the model must be free to search first, so the feature's tool is never forced then.
    const force = forced && serverTools.length === 0;
    const system = systemFor(call.system, call.tool.name, force);
    return JSON.stringify({
      model,
      max_tokens: call.maxTokens,
      ...(system ? { system } : {}),
      tools: [...serverTools, call.tool],
      tool_choice: toolChoiceFor(call.tool.name, force),
      messages,
    });
  };
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    let failure = 'Claude API không phản hồi.';
    // Read per request: calls running at once may learn that the model refuses a forced tool while this one is in flight.
    const sentForced = !noForcedTool.has(model);
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: anthropicHeaders(ANTHROPIC_API_KEY!, Deno.env.get('AI_WORKSPACE_ID')),
        body: bodyFor(sentForced),
        signal: AbortSignal.timeout(call.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS),
      });
    } catch (error) {
      // No answer at all (network, or the attempt timed out): worth another try like a 5xx.
      failure = `Claude API không phản hồi (${error instanceof Error ? error.message : 'lỗi mạng'}).`;
    }
    if (response?.ok) {
      const data = await response.json();
      addUsage(data.usage);
      const blocks: Array<Record<string, unknown>> = data.content ?? [];
      if (serverTools.length > 0) collectWebEvidence(blocks, web.evidence);
      const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === call.tool.name);
      if (!toolUse && serverTools.length > 0 && continuations < MAX_TOOL_CONTINUATIONS && (data.stop_reason === 'pause_turn' || data.stop_reason === 'end_turn')) {
        // The server-side search loop paused (resumed by sending the turn back as it is), or the model searched and then answered in
        // text (asked once more for the tool call). Not a failed attempt.
        continuations += 1;
        messages = [...messages, { role: 'assistant', content: blocks }];
        if (data.stop_reason === 'end_turn') messages = [...messages, { role: 'user', content: `Gọi tool ${call.tool.name} ngay bây giờ với những gì bạn đã có.` }];
        attempt -= 1;
        continue;
      }
      if (!toolUse) {
        console.error('[ai] no tool_use in the answer', data.stop_reason);
        const why = data.stop_reason === 'max_tokens' ? 'câu trả lời bị cắt do quá dài, hãy thử lại' : (data.stop_reason ?? 'không rõ lý do');
        return { error: `AI không trả về kết quả phân tích (${why}).`, status: 502 };
      }
      web.searches = searches;
      const usage: TokenUsage = { input_tokens: inTokens, output_tokens: outTokens, ...(searches > 0 ? { server_tool_use: { web_search_requests: searches } } : {}) };
      return { input: toolUse.input as Record<string, unknown>, usage, web, stopReason: data.stop_reason };
    }
    const retryable = response === null || shouldRetry(response.status);
    if (response) {
      const text = await response.text();
      if (hasUserLocation(serverTools) && isUserLocationRejected(response.status, text)) {
        // The API does not take the location (e.g. country VN not supported): the same tools without it, at once (not a failed attempt).
        console.warn('[ai] web tools user_location refused, retrying without it:', summarizeUpstreamError(response.status, text));
        serverTools = withoutUserLocation(serverTools);
        attempt -= 1;
        continue;
      }
      if (serverTools.length > 0 && isServerToolUnavailable(response.status, text)) {
        // The key may not use the web tools: go on without them (the feature tells the user). Not a failed attempt.
        console.warn('[ai] web tools refused, continuing without them:', summarizeUpstreamError(response.status, text));
        serverTools = [];
        web.available = false;
        messages = call.messages;
        attempt -= 1;
        continue;
      }
      if (sentForced && isToolChoiceUnsupported(response.status, text)) {
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

/** Time a call with web search may take in all: an Edge Function is cut off at about 150 s. */
const WEB_SEARCH_BUDGET_MS = 135_000;
/** A long search turn the API paused (`pause_turn`) is continued at most this many times. */
const MAX_CONTINUATIONS = 3;

/** The instruction added to a web search call's system prompt: search first, then report (the plain "answer only with the tool"
 *  of `systemFor` would talk the model out of searching). */
const searchThenReport = (toolName: string) =>
  `Trước hết hãy dùng công cụ web_search để tìm; xong thì gọi tool ${toolName} đúng một lần với những gì đã tìm thấy (không thấy thì để trống).`;

/** One Claude call that may search the web first: tool_choice auto with the web search tool and the feature's tool. A paused turn
 *  is sent back to continue; a model that ends without calling the tool is asked once more to call it. No retry of a failed
 *  request (searches already run are paid). A model or platform that refuses the tool version (or the code execution behind
 *  dynamic filtering) gets the next one. Every failure says why (status, the API's message, the stop reason). */
async function callClaudeWithSearch(
  call: AiCall,
  model: string
): Promise<{ input: Record<string, unknown>; usage?: TokenUsage; findings: WebFindings; stopReason?: string } | { error: string; status: number }> {
  const started = Date.now();
  // withLocation only when there is a location left to send (VN is never sent), so a refusal is not retried for nothing.
  let how: WebSearchAttempt = { variant: webSearchVariantFor(model), withLocation: searchLocation(call.webSearch!.userLocation) !== null };
  const messages: unknown[] = [...call.messages];
  const findings: WebFindings[] = [];
  let usage: TokenUsage | undefined;
  let continuations = 0;
  let nudged = false;
  for (;;) {
    const left = WEB_SEARCH_BUDGET_MS - (Date.now() - started);
    if (left < 5_000) return { error: `Tìm kiếm quá lâu (hơn ${Math.round(WEB_SEARCH_BUDGET_MS / 1000)} giây), hãy thử lại.`, status: 504 };
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: anthropicHeaders(ANTHROPIC_API_KEY!, Deno.env.get('AI_WORKSPACE_ID')),
        body: JSON.stringify({
          model,
          max_tokens: call.maxTokens,
          system: call.system ? `${call.system} ${searchThenReport(call.tool.name)}` : searchThenReport(call.tool.name),
          tools: [webSearchTool(call.webSearch!, how.variant, how.withLocation), call.tool],
          tool_choice: { type: 'auto' },
          messages,
        }),
        signal: AbortSignal.timeout(left),
      });
    } catch (error) {
      const timedOut = error instanceof Error && /timed? ?out|abort/i.test(`${error.name} ${error.message}`);
      return { error: timedOut ? `Tìm kiếm quá lâu (hơn ${Math.round(WEB_SEARCH_BUDGET_MS / 1000)} giây), hãy thử lại.` : `Claude API không phản hồi (${error instanceof Error ? error.message : 'lỗi mạng'}).`, status: timedOut ? 504 : 502 };
    }
    if (!response.ok) {
      const text = await response.text();
      // A refused location first (it may also name web_search, which would otherwise read as "not enabled" or a tool version).
      const next = webSearchRetryAfter(response.status, text, how);
      if (next && !next.withLocation && how.withLocation) {
        console.warn('[ai] web search user_location refused; retrying without it:', summarizeUpstreamError(response.status, text));
        how = next;
        continue;
      }
      if (isRegionUnsupported(response.status, text)) {
        return { error: regionUnsupportedMessage(summarizeUpstreamError(response.status, text)), status: 503 };
      }
      if (isWebSearchUnavailable(response.status, text)) {
        return { error: `${PLACES_UNAVAILABLE_PREFIX}: ${summarizeUpstreamError(response.status, text)}`, status: 503 };
      }
      if (next) {
        console.warn('[ai] web search variant', how.variant, 'refused; trying', next.variant);
        how = next;
        continue;
      }
      console.error('[ai]', summarizeUpstreamError(response.status, text), 'request-id', response.headers.get('request-id'));
      return { error: summarizeUpstreamError(response.status, text), status: 502 };
    }
    const data = await response.json();
    const blocks: Array<Record<string, unknown>> = data.content ?? [];
    usage = addUsage(usage, data.usage);
    findings.push(collectWebFindings(blocks));
    const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === call.tool.name);
    if (toolUse) return { input: toolUse.input as Record<string, unknown>, usage, findings: mergeFindings(findings), stopReason: data.stop_reason };
    if (data.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
      // Send the paused turn back unchanged; the API resumes it.
      continuations++;
      messages.push({ role: 'assistant', content: blocks });
      continue;
    }
    if (data.stop_reason === 'end_turn' && !nudged) {
      nudged = true;
      messages.push({ role: 'assistant', content: blocks }, { role: 'user', content: `Hãy gọi tool ${call.tool.name} ngay bây giờ với những gì đã tìm thấy (không thấy thì để trống).` });
      continue;
    }
    console.error('[ai] no tool_use in the web search answer', data.stop_reason, 'continuations', continuations);
    const why =
      data.stop_reason === 'max_tokens'
        ? 'câu trả lời bị cắt do quá dài, hãy thử lại'
        : data.stop_reason === 'pause_turn'
          ? 'tìm kiếm chưa xong sau nhiều lượt, hãy thử lại'
          : data.stop_reason === 'refusal'
            ? 'AI từ chối yêu cầu'
            : (data.stop_reason ?? 'không rõ lý do');
    return { error: `AI không trả về kết quả (${why}).`, status: 502 };
  }
}

/** Whether this user may make one more call of `feature` now: the feature's daily calls, the user's daily budget and the global one.
 *  The refusal (message and status) otherwise. */
export async function aiAllowance(ctx: AiContext, feature: AiFeature): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const quota = await loadQuota(ctx.admin, feature);
  if (quotaReached(feature, await usedToday(ctx.admin, ctx.userId, feature), quota)) return { ok: false, error: quotaMessage(feature, quota), status: 429 };
  if (budgetReached(await userCostToday(ctx.admin, ctx.userId), USER_BUDGET)) return { ok: false, error: USER_BUDGET_MESSAGE, status: 429 };
  if (GLOBAL_BUDGET > 0 && budgetReached(await globalCostToday(ctx.admin), GLOBAL_BUDGET)) return { ok: false, error: GLOBAL_BUDGET_MESSAGE, status: 503 };
  return { ok: true };
}

/** What one call gave: the tool input, the usage, and what the web showed (`findings` of a `webSearch` call, `web` of a
 *  `serverTools` call). */
export type AiCallResult = { input: Record<string, unknown>; usage?: TokenUsage; findings: WebFindings | null; web?: WebOutcome; model: string; stopReason?: string };

/** One Claude call, made and logged (under `feature`, for this user) the way serveAi makes its call. No quota or budget check: the
 *  caller asks `aiAllowance` first. For a function that makes several calls in one request (tempt-me's bulk refill). */
export async function runAiCall(
  ctx: AiContext,
  feature: AiFeature,
  call: AiCall,
  opts: {
    /** Logs the call somewhere else than the user's ai_usage (a call made for nobody in particular, e.g. the temptation pool's seed);
     *  then it counts against no user's quota or budget. */
    record?: (usage: TokenUsage | undefined, costUsd: number, model: string) => Promise<void>;
  } = {}
): Promise<AiCallResult | { error: string; status: number }> {
  if (!ANTHROPIC_API_KEY) return { error: 'Server chưa cấu hình ANTHROPIC_API_KEY.', status: 500 };
  const config = await loadConfig(ctx.admin, feature);
  const outcome = call.webSearch ? await callClaudeWithSearch(call, config.model) : await callClaude(call, config.model);
  if ('error' in outcome) return outcome;
  if (opts.record) await opts.record(outcome.usage, estimateCostUsd(outcome.usage, config.priceInPerMtok, config.priceOutPerMtok), config.model).catch((e) => console.warn('[ai] usage not recorded:', e));
  else await recordUsage(ctx.admin, ctx.userId, feature, outcome.usage, config);
  return { input: outcome.input, usage: outcome.usage, findings: 'findings' in outcome ? outcome.findings : null, web: 'web' in outcome ? outcome.web : undefined, model: config.model, stopReason: outcome.stopReason };
}

/** Wraps a feature: `plan` receives the parsed JSON body and the context, and returns the Claude call (or a Response). */
export function serveAi(
  feature: AiFeature,
  plan: (body: Record<string, unknown>, ctx: AiContext) => Promise<AiPlan>,
  options: {
    /** Runs before the sign-in check with a service-role client: a Response answers the request (e.g. a maintenance call checked
     *  with a secret instead of a user), null goes on as usual. */
    preAuth?: (req: Request, admin: SupabaseClient) => Promise<Response | null>;
  } = {}
) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      if (Deno.env.get('AI_DISABLED') === '1') return jsonResponse({ error: 'Tính năng AI đang tạm tắt.' }, 503);
      if (!ANTHROPIC_API_KEY) return jsonResponse({ error: 'Server chưa cấu hình ANTHROPIC_API_KEY.' }, 500);
      if (options.preAuth && SERVICE_ROLE_KEY) {
        const early = await options.preAuth(req, createClient(SUPABASE_URL, SERVICE_ROLE_KEY));
        if (early) return early;
      }
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

      const allowed = await aiAllowance(ctx, feature);
      if (!allowed.ok) return jsonResponse({ error: allowed.error }, allowed.status);

      const outcome = await runAiCall(ctx, feature, planned.call);
      if ('error' in outcome) return jsonResponse({ error: outcome.error }, outcome.status);
      if (planned.after) await planned.after(outcome.input, ctx);
      const info: ShapeInfo = { ctx, usage: outcome.usage, findings: outcome.findings, web: outcome.web };
      return jsonResponse({ [planned.responseKey]: planned.shape ? await planned.shape(outcome.input, info) : outcome.input });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
    }
  });
}
