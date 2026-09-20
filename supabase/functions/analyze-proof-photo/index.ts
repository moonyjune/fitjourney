// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy analyze-proof-photo
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Vision analysis of a meal or workout proof photo, called right after the user picks/takes it
// and before they confirm saving it. For a meal photo: estimates calories eaten (and, if a drink
// is visible, water/liquid ml). For a workout photo: estimates calories burned. The client always
// shows these as editable fields — this is a starting estimate, never written to the DB directly.

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

const ANALYSIS_TOOL = {
  name: 'report_photo_analysis',
  description: 'Reports the estimated nutrition/exercise values read from the photo.',
  input_schema: {
    type: 'object',
    properties: {
      estimatedCaloriesKcal: { type: 'number', description: 'Meal photos only: estimated calories of the food/drink shown.' },
      estimatedWaterMl: { type: 'number', description: 'Meal photos only, if a drink/water is visible: estimated ml of liquid.' },
      estimatedCaloriesBurned: { type: 'number', description: 'Workout photos only: estimated calories burned this session.' },
      reasoning: { type: 'string', description: 'One short sentence (Vietnamese) explaining the estimate.' },
    },
    required: ['reasoning'],
  },
};

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

    const { taskType, imageBase64, mediaType, context } = (await req.json()) as {
      taskType: 'meal' | 'workout';
      imageBase64: string;
      mediaType: string;
      context?: { label?: string; plannedCalories?: number };
    };
    if (!imageBase64 || (taskType !== 'meal' && taskType !== 'workout')) {
      return jsonResponse({ error: 'Thiếu imageBase64 hoặc taskType không hợp lệ.' }, 400);
    }

    const prompt =
      taskType === 'meal'
        ? `Đây là ảnh minh chứng bữa ăn "${context?.label ?? ''}"${
            context?.plannedCalories ? ` (kế hoạch ~${context.plannedCalories} kcal)` : ''
          }. Ước tính lượng calo thực tế trong ảnh, và nếu có nước/đồ uống thì ước tính thêm ml. Gọi tool report_photo_analysis.`
        : `Đây là ảnh minh chứng buổi tập "${context?.label ?? ''}"${
            context?.plannedCalories ? ` (kế hoạch đốt ~${context.plannedCalories} kcal)` : ''
          }. Ước tính lượng calo đã đốt dựa trên những gì thấy được (máy tập, đồng hồ, cường độ...). Gọi tool report_photo_analysis.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: 'report_photo_analysis' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
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
    const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === 'report_photo_analysis');
    if (!toolUse) {
      return jsonResponse({ error: 'AI không trả về kết quả phân tích.' }, 502);
    }

    return jsonResponse({ result: toolUse.input });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
  }
});
