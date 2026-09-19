// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy suggest-plan-update
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Takes the user's current plan (meal templates, workout templates, shopping list) plus a
// natural-language instruction, asks Claude to return an updated plan in the exact same JSON
// shape, and hands that proposal back to the client for preview + explicit confirmation.
// This function never writes to the database itself — the client calls `plans` upsert only
// after the user taps "Confirm".

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_MODEL = 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Bạn là trợ lý chỉnh sửa kế hoạch giảm cân. Bạn nhận một JSON "currentPlan" đúng \
schema PlanData và một yêu cầu chỉnh sửa bằng tiếng Việt. Hãy trả về DUY NHẤT một JSON object hợp lệ \
đúng schema PlanData sau, không kèm giải thích, không markdown code fence:

type PlanData = {
  mealTemplates: {
    training: MealTemplate[]; // đúng 3 phần tử, slot lần lượt "meal1","meal2","meal3"
    rest: MealTemplate[];      // đúng 3 phần tử, slot lần lượt "meal1","meal2","meal3"
  };
  workoutTemplates: WorkoutTemplate[];
  shoppingList: ShoppingListItem[];
  waterSchedule: WaterCheckpoint[];
};
type MealTemplate = {
  slot: "meal1" | "meal2" | "meal3";
  label: string; timeRange: string; startHour: number; startMinute: number;
  items: { name: string; calories: number }[]; // liệt kê TỪNG món ăn riêng, mỗi món 1 dòng + calo riêng
  calories: number; // PHẢI bằng tổng calories của items
  proteinG: number;
};
type WorkoutTemplate = {
  id: string; label: string; timeRange: string; durationMin: number; caloriesBurned: number;
  description: string; reminderSlot?: "morning" | "evening"; startHour?: number; startMinute?: number;
};
type ShoppingListItem = {
  category: string; name: string; amountPerWeek: string; quantityToBuy: string; estimatedPriceVnd: number;
};
type WaterCheckpoint = {
  hour: number; minute: number; label: string;
  cumulativeTargetMl: number; // lượng nước CỘNG DỒN cần đạt tính từ đầu ngày tới mốc này
};

Quy tắc:
- Giữ nguyên mọi phần không liên quan đến yêu cầu chỉnh sửa.
- Giữ đơn vị: calo (kcal), protein (g), giá (VNĐ, số nguyên), nước (ml).
- Nếu yêu cầu ảnh hưởng đến calo/protein của món ăn, cập nhật lại items và calories/proteinG cho hợp lý
  (calories của meal luôn bằng tổng calories của các items trong items).
- Nếu yêu cầu thêm/đổi nguyên liệu, cập nhật shoppingList tương ứng (thêm dòng mới nếu cần, ước tính giá VNĐ hợp lý theo mặt bằng giá siêu thị/chợ Việt Nam).
- Nếu yêu cầu ảnh hưởng đến giờ giấc/lượng nước uống, cập nhật waterSchedule; cumulativeTargetMl của mốc cuối cùng phải bằng tổng lượng nước mục tiêu cả ngày, các mốc phải tăng dần theo thời gian.
- Không thêm trường ngoài schema. Không bỏ trường bắt buộc.`;

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

    const { currentPlan, instruction, targetUserId } = await req.json();
    if (!currentPlan || typeof instruction !== 'string' || !instruction.trim()) {
      return jsonResponse({ error: 'Thiếu currentPlan hoặc instruction.' }, 400);
    }
    // Coach editing a client's plan: targetUserId is the client. Authorization for the audit-log
    // insert and (later) the actual `plans` write is enforced by Postgres RLS, not here — an
    // unauthorized targetUserId simply fails to insert/write, it never reaches another user's data.
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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `currentPlan:\n${JSON.stringify(currentPlan)}\n\nYêu cầu chỉnh sửa: ${instruction}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();
      return jsonResponse({ error: `Claude API lỗi: ${detail}` }, 502);
    }

    const claudeData = await claudeResponse.json();
    const text: string = claudeData.content?.[0]?.text ?? '';
    const jsonText = extractJson(text);

    let proposedPlan: unknown;
    try {
      proposedPlan = JSON.parse(jsonText);
    } catch {
      return jsonResponse({ error: 'AI trả về dữ liệu không đúng định dạng JSON.', raw: text }, 502);
    }

    if (!isValidPlanShape(proposedPlan)) {
      return jsonResponse({ error: 'AI trả về JSON nhưng thiếu trường bắt buộc.', raw: proposedPlan }, 502);
    }

    // Best-effort audit log; failure here should not block returning the proposal.
    await supabase.from('plan_update_requests').insert({
      user_id: auditUserId,
      instruction,
      proposed_plan_json: proposedPlan,
      applied: false,
    });

    return jsonResponse({ plan: proposedPlan });
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

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
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
