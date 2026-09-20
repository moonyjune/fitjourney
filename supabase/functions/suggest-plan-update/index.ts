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

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_MODEL = 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT_HEADER = `Bạn là trợ lý trò chuyện giúp chỉnh sửa kế hoạch giảm cân (thực đơn, bài tập, \
lịch uống nước, danh sách đi chợ). Trả lời ngắn gọn, thân thiện, bằng tiếng Việt.

Khi người dùng muốn thay đổi kế hoạch, hãy gọi tool "propose_plan_update" với TOÀN BỘ kế hoạch đã cập nhật \
(không phải chỉ phần thay đổi) — dựa trên "Kế hoạch hiện tại" bên dưới cộng với thay đổi được yêu cầu. \
Nếu người dùng chỉ hỏi thông tin, góp ý, hoặc yêu cầu chưa rõ ràng, cứ trả lời bằng văn bản, KHÔNG cần gọi tool.

Quy tắc khi gọi tool:
- Giữ nguyên mọi phần không liên quan đến yêu cầu chỉnh sửa.
- Giữ đơn vị: calo (kcal), protein (g), giá (VNĐ, số nguyên), nước (ml).
- Mỗi meal có "items" liệt kê từng món ăn riêng (tên + calo); "calories" của meal PHẢI bằng tổng calories của items.
- Nếu thêm/đổi nguyên liệu, cập nhật shoppingList tương ứng (ước tính giá VNĐ hợp lý theo mặt bằng giá Việt Nam).
- waterSchedule: các mốc phải tăng dần theo thời gian và theo cumulativeTargetMl; mốc cuối = tổng mục tiêu nước cả ngày.
- mealTemplates.training và mealTemplates.rest luôn có đúng 3 phần tử, slot lần lượt "meal1","meal2","meal3".

Kế hoạch hiện tại (JSON):
`;

const PLAN_TOOL = {
  name: 'propose_plan_update',
  description: 'Đề xuất một phiên bản kế hoạch (PlanData) đã được cập nhật để người dùng xem trước và xác nhận.',
  input_schema: {
    type: 'object',
    properties: {
      mealTemplates: {
        type: 'object',
        properties: {
          training: { type: 'array', items: mealTemplateSchema() },
          rest: { type: 'array', items: mealTemplateSchema() },
        },
        required: ['training', 'rest'],
      },
      workoutTemplates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            timeRange: { type: 'string' },
            durationMin: { type: 'number' },
            caloriesBurned: { type: 'number' },
            description: { type: 'string' },
            steps: {
              type: 'array',
              description:
                'Step-by-step breakdown (warm-up, main set, cooldown, ...). durationMin/caloriesBurned of each step must sum to the template totals above. Always fill this in fully — never leave it empty.',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  instruction: { type: 'string' },
                  durationMin: { type: 'number' },
                  caloriesBurned: { type: 'number' },
                },
                required: ['label', 'instruction', 'durationMin', 'caloriesBurned'],
              },
            },
            reminderSlot: { type: 'string', enum: ['morning', 'evening'] },
            startHour: { type: 'number' },
            startMinute: { type: 'number' },
          },
          required: ['id', 'label', 'timeRange', 'durationMin', 'caloriesBurned', 'description', 'steps'],
        },
      },
      shoppingList: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            name: { type: 'string' },
            amountPerWeek: { type: 'string' },
            quantityToBuy: { type: 'string' },
            estimatedPriceVnd: { type: 'number' },
          },
          required: ['category', 'name', 'amountPerWeek', 'quantityToBuy', 'estimatedPriceVnd'],
        },
      },
      waterSchedule: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hour: { type: 'number' },
            minute: { type: 'number' },
            label: { type: 'string' },
            cumulativeTargetMl: { type: 'number' },
          },
          required: ['hour', 'minute', 'label', 'cumulativeTargetMl'],
        },
      },
    },
    required: ['mealTemplates', 'workoutTemplates', 'shoppingList', 'waterSchedule'],
  },
};

function mealTemplateSchema() {
  return {
    type: 'object',
    properties: {
      slot: { type: 'string', enum: ['meal1', 'meal2', 'meal3'] },
      label: { type: 'string' },
      timeRange: { type: 'string' },
      startHour: { type: 'number' },
      startMinute: { type: 'number' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, calories: { type: 'number' } },
          required: ['name', 'calories'],
        },
      },
      calories: { type: 'number' },
      proteinG: { type: 'number' },
    },
    required: ['slot', 'label', 'timeRange', 'startHour', 'startMinute', 'items', 'calories', 'proteinG'],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: 'Server chưa cấu hình ANTHROPIC_API_KEY.' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Thiếu Authorization header.' }, 401);
    }

    // Verify the caller is a real logged-in user (RLS-equivalent check for this function).
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Không xác thực được người dùng.' }, 401);
    }

    const { currentPlan, messages, targetUserId } = await req.json();
    if (!currentPlan || !Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Thiếu currentPlan hoặc messages.' }, 400);
    }
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
      return jsonResponse({ error: 'Tin nhắn cuối cùng trống.' }, 400);
    }
    // Coach editing a client's plan: targetUserId is the client. Authorization for the audit-log
    // insert and the actual `plans` write (done client-side after Confirm) is enforced by
    // Postgres RLS, not here — an unauthorized targetUserId simply fails to write, it never
    // reaches another user's data.
    const auditUserId = typeof targetUserId === 'string' && targetUserId ? targetUserId : user.id;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT_HEADER + JSON.stringify(currentPlan),
        tools: [PLAN_TOOL],
        messages: messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();
      return jsonResponse({ error: `Claude API lỗi: ${detail}` }, 502);
    }

    const claudeData = await claudeResponse.json();
    const blocks: Array<Record<string, unknown>> = claudeData.content ?? [];

    const replyText = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === 'propose_plan_update');
    let proposedPlan: unknown = null;
    if (toolUse) {
      proposedPlan = toolUse.input;
      if (!isValidPlanShape(proposedPlan)) {
        return jsonResponse({ error: 'AI đề xuất kế hoạch nhưng thiếu trường bắt buộc.', raw: proposedPlan }, 502);
      }
      // Best-effort audit log; failure here should not block returning the proposal.
      await supabase.from('plan_update_requests').insert({
        user_id: auditUserId,
        instruction: lastMessage.content,
        proposed_plan_json: proposedPlan,
        applied: false,
      });
    }

    return jsonResponse({
      reply: replyText || (proposedPlan ? 'Mình đã cập nhật kế hoạch, bạn xem thử nhé.' : ''),
      plan: proposedPlan,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function isValidPlanShape(value: unknown): value is {
  mealTemplates: { training: unknown[]; rest: unknown[] };
  workoutTemplates: unknown[];
  shoppingList: unknown[];
  waterSchedule: unknown[];
} {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const meals = v.mealTemplates as Record<string, unknown> | undefined;
  return (
    !!meals &&
    Array.isArray(meals.training) &&
    Array.isArray(meals.rest) &&
    Array.isArray(v.workoutTemplates) &&
    Array.isArray(v.shoppingList) &&
    Array.isArray(v.waterSchedule)
  );
}
