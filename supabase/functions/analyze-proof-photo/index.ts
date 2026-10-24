// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy analyze-proof-photo
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Vision analysis of a meal or workout photo, called right after the user picks/takes it and before they
// confirm saving it. The photo goes straight to the model (no separate OCR step). For a meal photo it names
// the food and estimates calories, protein and, if a drink is visible, water ml. For a workout photo it reads
// what is visible (machine/watch/app screen, equipment) and estimates the activity, duration and calories burned.
// The client sends the user's body data (weight, height, age, gender, activity level) so the numbers fit the
// person; the client always shows the result in editable fields — a starting estimate, never saved directly.

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
  description: 'Reports the values read or estimated from the photo.',
  input_schema: {
    type: 'object',
    properties: {
      foodName: { type: 'string', description: 'Meal photos only: short name of the food/dish shown (Vietnamese).' },
      estimatedCaloriesKcal: { type: 'number', description: 'Meal photos only: estimated calories of the food/drink shown.' },
      estimatedProteinG: { type: 'number', description: 'Meal photos only: estimated grams of protein in the food shown.' },
      estimatedWaterMl: { type: 'number', description: 'Meal photos only, if a drink/water is visible: estimated ml of liquid.' },
      activityName: { type: 'string', description: 'Workout photos only: the activity shown (Vietnamese), e.g. "Đi bộ dốc", "Bơi".' },
      durationMin: { type: 'number', description: 'Workout photos only: duration in minutes if it can be read or reasonably inferred.' },
      estimatedCaloriesBurned: { type: 'number', description: 'Workout photos only: calories burned this session for THIS person.' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How sure the estimate is given what the photo shows.' },
      reasoning: { type: 'string', description: 'One short sentence (Vietnamese) explaining the estimate.' },
    },
    required: ['reasoning'],
  },
};

interface BodyProfile {
  weightKg?: number;
  heightCm?: number;
  age?: number;
  gender?: 'male' | 'female';
  activityLevel?: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Only the fields we expect, with sane bounds, so a bad client can't inject text into the prompt. */
function sanitizeProfile(raw: unknown): BodyProfile {
  const p = (raw ?? {}) as Record<string, unknown>;
  const within = (v: unknown, min: number, max: number) => {
    const n = num(v);
    return n !== undefined && n >= min && n <= max ? n : undefined;
  };
  return {
    weightKg: within(p.weightKg, 20, 400),
    heightCm: within(p.heightCm, 80, 250),
    age: within(p.age, 5, 110),
    gender: p.gender === 'male' || p.gender === 'female' ? p.gender : undefined,
    activityLevel: ['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(String(p.activityLevel))
      ? String(p.activityLevel)
      : undefined,
  };
}

function describePerson(p: BodyProfile): string {
  const parts = [
    p.weightKg ? `cân nặng ${p.weightKg} kg` : null,
    p.heightCm ? `cao ${p.heightCm} cm` : null,
    p.age ? `${p.age} tuổi` : null,
    p.gender ? (p.gender === 'male' ? 'nam' : 'nữ') : null,
    p.activityLevel ? `mức vận động ${p.activityLevel}` : null,
  ].filter(Boolean);
  return parts.length ? `Người dùng: ${parts.join(', ')}.` : 'Không có thông tin thể trạng người dùng.';
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

    const { taskType, imageBase64, mediaType, context, profile } = (await req.json()) as {
      taskType: 'meal' | 'workout';
      imageBase64: string;
      mediaType: string;
      context?: { label?: string; plannedCalories?: number };
      profile?: unknown;
    };
    if (!imageBase64 || (taskType !== 'meal' && taskType !== 'workout')) {
      return jsonResponse({ error: 'Thiếu imageBase64 hoặc taskType không hợp lệ.' }, 400);
    }

    const person = describePerson(sanitizeProfile(profile));
    const label = String(context?.label ?? '').slice(0, 120);
    const prompt =
      taskType === 'meal'
        ? `Đây là ảnh món ăn/đồ uống${label ? ` "${label}"` : ''}${
            context?.plannedCalories ? ` (kế hoạch ~${context.plannedCalories} kcal)` : ''
          }. ${person} Nhận diện món, ước tính khẩu phần thực tế trong ảnh rồi trả về tên món, calo, protein (g) và nếu có nước/đồ uống thì ml. Nếu ảnh có nhãn dinh dưỡng thì ưu tiên số trên nhãn. Nếu không chắc, nói rõ ở confidence và reasoning. Gọi tool report_photo_analysis.`
        : `Đây là ảnh buổi tập${label ? ` "${label}"` : ''}${
            context?.plannedCalories ? ` (kế hoạch đốt ~${context.plannedCalories} kcal)` : ''
          }. ${person} Đọc những gì thấy được (màn hình máy tập/đồng hồ/ứng dụng: thời gian, quãng đường, nhịp tim, calo hiển thị; hoặc dụng cụ, tư thế). Trả về hoạt động, thời lượng (phút) và lượng calo đã đốt TÍNH CHO NGƯỜI NÀY (theo cân nặng và thể trạng, không chép nguyên số calo của máy nếu số đó rõ ràng không hợp lý). Nếu không chắc, nói rõ ở confidence và reasoning. Gọi tool report_photo_analysis.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 700,
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
