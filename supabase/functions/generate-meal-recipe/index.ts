// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy generate-meal-recipe
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Suggests one alternative Vietnamese dish for a meal slot, matching the plan's calorie/protein
// target for that slot but a different dish than the plan's default (or the client's current
// suggestion, on refresh). The client caches the result in `meal_recipe_suggestions` so re-opening
// Nutrition shows the same suggestion until the user taps refresh — this function never touches
// the DB itself, same division of responsibility as analyze-weekly-feelings/analyze-proof-photo.

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

const RECIPE_TOOL = {
  name: 'report_recipe',
  description: 'Reports one suggested dish for the meal slot, with its recipe.',
  input_schema: {
    type: 'object',
    properties: {
      dishName: { type: 'string', description: 'Tên món ăn, tiếng Việt.' },
      emoji: { type: 'string', description: 'Một emoji duy nhất đại diện cho món ăn (vd: 🍜, 🍳, 🥗).' },
      durationMinutes: { type: 'number', description: 'Thời gian chuẩn bị + nấu, tính bằng phút.' },
      difficulty: { type: 'integer', description: 'Độ khó từ 1 (rất dễ) đến 5 (khó).', minimum: 1, maximum: 5 },
      caloriesKcal: { type: 'number', description: 'Tổng calo của món, càng sát target càng tốt.' },
      proteinG: { type: 'number', description: 'Tổng protein (g) của món, càng sát target càng tốt.' },
      ingredients: {
        type: 'array',
        description: 'Danh sách nguyên liệu.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'string', description: 'Số lượng, vd: "200g", "1 quả".' },
          },
          required: ['name', 'quantity'],
        },
      },
      steps: {
        type: 'array',
        description: 'Các bước nấu, mỗi bước một câu ngắn gọn, đủ chi tiết để làm theo (ít nhất 4 bước).',
        items: { type: 'string' },
      },
    },
    required: ['dishName', 'emoji', 'durationMinutes', 'difficulty', 'caloriesKcal', 'proteinG', 'ingredients', 'steps'],
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

    const { mealLabel, dayType, targetCalories, targetProtein, avoidDishNames } = (await req.json()) as {
      mealLabel: string;
      dayType: 'training' | 'rest';
      targetCalories: number;
      targetProtein: number;
      avoidDishNames?: string[];
    };
    if (!mealLabel || !targetCalories || !targetProtein) {
      return jsonResponse({ error: 'Thiếu mealLabel/targetCalories/targetProtein.' }, 400);
    }

    const avoidText =
      avoidDishNames && avoidDishNames.length > 0
        ? ` Không được trùng với các món đã gợi ý trước đó: ${avoidDishNames.join(', ')}.`
        : '';
    const prompt =
      `Gợi ý MỘT món ăn Việt Nam khác cho "${mealLabel}" (${dayType === 'training' ? 'ngày tập luyện' : 'ngày nghỉ'}), ` +
      `sao cho tổng calo khoảng ${Math.round(targetCalories)}kcal và protein khoảng ${Math.round(targetProtein)}g ` +
      `(sai số trong khoảng 10%).${avoidText} Món ăn phải thực tế, dễ chuẩn bị tại nhà. Gọi tool report_recipe.`;

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
        tools: [RECIPE_TOOL],
        tool_choice: { type: 'tool', name: 'report_recipe' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();
      return jsonResponse({ error: `Claude API lỗi: ${detail}` }, 502);
    }

    const claudeData = await claudeResponse.json();
    const blocks: Array<Record<string, unknown>> = claudeData.content ?? [];
    const toolUse = blocks.find((b) => b.type === 'tool_use' && b.name === 'report_recipe');
    if (!toolUse) {
      return jsonResponse({ error: 'AI không trả về công thức món ăn.' }, 502);
    }

    return jsonResponse({ recipe: toolUse.input });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
  }
});
