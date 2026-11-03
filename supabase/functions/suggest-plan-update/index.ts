// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy suggest-plan-update
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Multi-turn chat: the client sends the whole message history plus the plan as it currently
// stands (including any not-yet-confirmed edits from earlier in the same chat). Claude replies
// conversationally and, whenever it wants to change the plan, calls the `propose_plan_update`
// tool with the FULL updated plan as its input — that's how we reliably get structured JSON out
// of a free-flowing chat instead of asking the model to emit raw JSON as text.
// This function never writes to `plans` itself — the client only applies a proposal locally and
// pushes it to Supabase after the user taps "Xác nhận áp dụng".
// Goes through the shared AI code (_shared/ai.ts, a free-form call with the tool offered, tool_choice auto): AI_DISABLED, sign-in,
// quota, budgets, cost logged in ai_usage as `planchat` (for the caller, also when a coach edits a client's plan). Calls per user
// per day: app_settings key `ai_quota.planchat` (default 10). Model: the global one (ai_settings `model`, default claude-sonnet-5-5).
// Prompt and tool in _shared/planChat.ts. Response: { reply, plan } or { error } (plus `raw` when the proposed plan is incomplete).

import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { chatMessages, isValidPlanShape, PLAN_TOOL, SYSTEM_PROMPT_HEADER } from '../_shared/planChat.ts';

serveAi('planchat', async (body, ctx) => {
  const { currentPlan, messages, targetUserId } = body as { currentPlan?: unknown; messages?: unknown; targetUserId?: unknown };
  if (!currentPlan || !Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: 'Thiếu currentPlan hoặc messages.' }, 400);
  }
  const lastMessage = messages[messages.length - 1] as { content?: unknown } | null;
  if (!lastMessage || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
    return jsonResponse({ error: 'Tin nhắn cuối cùng trống.' }, 400);
  }
  const instruction = lastMessage.content;
  // AI for coaches is switched off unless AI_COACH_ENABLED=1 is set for the functions: a request that edits somebody else's plan
  // (a coach editing a client's) is refused. A user's own plan chat is not affected.
  if (typeof targetUserId === 'string' && targetUserId && targetUserId !== ctx.userId && Deno.env.get('AI_COACH_ENABLED') !== '1') {
    return jsonResponse({ error: 'Tính năng AI cho Coach đang tạm tắt.' }, 503);
  }
  // Coach editing a client's plan: targetUserId is the client. Authorization for the audit-log
  // insert and the actual `plans` write (done client-side after Confirm) is enforced by
  // Postgres RLS, not here — an unauthorized targetUserId simply fails to write, it never
  // reaches another user's data.
  const auditUserId = typeof targetUserId === 'string' && targetUserId ? targetUserId : ctx.userId;

  return {
    chat: {
      system: SYSTEM_PROMPT_HEADER + JSON.stringify(currentPlan),
      maxTokens: 8000,
      tools: [PLAN_TOOL],
      messages: chatMessages(messages),
    },
    respond: async ({ text, toolUses }, c) => {
      const toolUse = toolUses.find((t) => t.name === PLAN_TOOL.name);
      let proposedPlan: unknown = null;
      if (toolUse) {
        proposedPlan = toolUse.input;
        if (!isValidPlanShape(proposedPlan)) {
          return jsonResponse({ error: 'AI đề xuất kế hoạch nhưng thiếu trường bắt buộc.', raw: proposedPlan }, 502);
        }
        // Best-effort audit log (the user's own client, so RLS applies); failure here should not block returning the proposal.
        await c.userClient.from('plan_update_requests').insert({
          user_id: auditUserId,
          instruction,
          proposed_plan_json: proposedPlan,
          applied: false,
        });
      }
      return jsonResponse({
        reply: text || (proposedPlan ? 'Mình đã cập nhật kế hoạch, bạn xem thử nhé.' : ''),
        plan: proposedPlan,
      });
    },
  };
});
