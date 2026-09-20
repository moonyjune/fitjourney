// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy analyze-weekly-feelings
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Analyzes a week's feeling-record log (craving/hunger/mood/workout condition) alongside a
// summary of that week's actual calories/workouts/weight change, and asks Claude for concrete,
// short suggestions on adjusting the meal plan and workout schedule. Text-only (no vision), one
// request per week — the client caches the result in `weekly_suggestions` after receiving it, so
// re-opening the screen doesn't re-spend a Claude call.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_MODEL = 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

interface FeelingRecordInput {
  loggedAtISO: string;
  cravingLevel: number;
  hungerLevel: number;
  mood: string;
  workoutCondition: string | null;
  note: string;
}

interface WeekSummaryInput {
  avgCaloriesPerDay: number;
  totalWorkouts: number;
  weightChangeKg: number | null;
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

    const { feelingRecords, weekSummary } = (await req.json()) as {
      feelingRecords: FeelingRecordInput[];
      weekSummary: WeekSummaryInput;
    };
    if (!Array.isArray(feelingRecords) || feelingRecords.length < 3) {
      return jsonResponse({ error: 'Cần ít nhất 3 lượt ghi nhận cảm giác trong tuần để phân tích.' }, 400);
    }

    const recordsText = feelingRecords
      .map((r) => {
        const day = new Date(r.loggedAtISO).toLocaleDateString('vi-VN');
        const time = new Date(r.loggedAtISO).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return `- ${day} ${time}: thèm ăn ${r.cravingLevel}/5, đói ${r.hungerLevel}/5, tâm trạng ${r.mood}${
          r.workoutCondition ? `, tình trạng tập ${r.workoutCondition}` : ''
        }${r.note ? `, ghi chú: "${r.note}"` : ''}`;
      })
      .join('\n');

    const summaryText = `Trung bình ${Math.round(weekSummary.avgCaloriesPerDay)} kcal/ngày, ${weekSummary.totalWorkouts} buổi tập trong tuần${
      weekSummary.weightChangeKg != null ? `, thay đổi cân nặng ${weekSummary.weightChangeKg.toFixed(1)}kg` : ''
    }.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system:
          'Bạn là huấn luyện viên giảm cân tận tâm. Dựa trên nhật ký cảm giác (thèm ăn/đói/tâm trạng/tình trạng tập) ' +
          'và số liệu thực tế trong tuần, trả lời gồm HAI phần, ngăn cách bằng một dòng trống:\n' +
          '1) Một nhận định NGẮN (1-2 câu) mang tính cổ vũ nhưng THỰC TẾ — không tô hồng nếu tuần này khó khăn, ' +
          'nhưng luôn lạc quan và hướng người dùng tới đích.\n' +
          '2) 3-5 gợi ý NGẮN GỌN, CỤ THỂ (dạng gạch đầu dòng) để điều chỉnh thực đơn hoặc lịch tập cho tuần tới, ' +
          'không lặp lại số liệu đã cho, tập trung vào hành động nên làm.\n' +
          'Viết bằng tiếng Việt.',
        messages: [
          {
            role: 'user',
            content: `Số liệu tuần này: ${summaryText}\n\nNhật ký cảm giác:\n${recordsText}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();
      return jsonResponse({ error: `Claude API lỗi: ${detail}` }, 502);
    }

    const claudeData = await claudeResponse.json();
    const blocks: Array<Record<string, unknown>> = claudeData.content ?? [];
    const suggestion = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    if (!suggestion) {
      return jsonResponse({ error: 'AI không trả về nội dung.' }, 502);
    }

    return jsonResponse({ suggestion });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
  }
});
