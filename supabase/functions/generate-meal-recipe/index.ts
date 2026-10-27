// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy generate-meal-recipe
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Suggests one alternative Vietnamese dish for a meal slot, matching the plan's calorie/protein
// target for that slot but a different dish than the plan's default (or the client's current
// suggestion, on refresh). The client caches the result in `meal_recipe_suggestions` so re-opening
// Nutrition shows the same suggestion until the user taps refresh — this function never touches
// the DB itself, same division of responsibility as analyze-weekly-feelings/analyze-proof-photo.
// The client also sends `favorites` (foods the user actually eats often, from their log) and `dislikes` (foods they flagged
// as junk), so the dish fits their taste; the dish must be simple: few tools, short, ingredients easy to buy.

import { jsonResponse, serveAi } from '../_shared/ai.ts';

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
      equipment: {
        type: 'array',
        maxItems: 3,
        description: 'Dụng cụ cần dùng, tối đa 3, chỉ những thứ nhà nào cũng có (chảo, nồi, nồi cơm điện, lò vi sóng, dao, thớt...).',
        items: { type: 'string' },
      },
      tasteNote: { type: 'string', description: 'Một câu ngắn: vì sao món này hợp khẩu vị người dùng (dựa trên món họ hay ăn), hoặc để trống nếu không có dữ liệu.' },
      steps: {
        type: 'array',
        description: 'Các bước nấu, mỗi bước một câu ngắn gọn, đủ chi tiết để làm theo (ít nhất 4 bước).',
        items: { type: 'string' },
      },
    },
    required: ['dishName', 'emoji', 'durationMinutes', 'difficulty', 'caloriesKcal', 'proteinG', 'ingredients', 'equipment', 'steps'],
  },
};

serveAi('recipe', async (body) => {
  const { mealLabel, dayType, targetCalories, targetProtein, avoidDishNames, favorites, dislikes, dishName } = body as {
    dishName?: string;
    mealLabel: string;
    dayType: 'training' | 'rest';
    targetCalories: number;
    targetProtein: number;
    avoidDishNames?: string[];
    favorites?: unknown;
    dislikes?: unknown;
  };
  if (!mealLabel || !targetCalories || !targetProtein) {
    return jsonResponse({ error: 'Thiếu mealLabel/targetCalories/targetProtein.' }, 400);
  }

  const avoidText =
    avoidDishNames && avoidDishNames.length > 0
      ? ` Không được trùng với các món đã gợi ý trước đó: ${avoidDishNames.join(', ')}.`
      : '';
  // Names only, short, at most 10 each: they are shown to the model as data, never as instructions.
  const names = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.replace(/[<>\n\r]/g, ' ').trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 10);
  const likes = names(favorites);
  const dislikeNames = names(dislikes);
  const tasteText =
    (likes.length ? ` Món người dùng hay ăn (để hiểu khẩu vị; gợi ý món cùng gu nhưng KHÁC các món này): ${likes.join('; ')}.` : '') +
    (dislikeNames.length ? ` Món họ tự đánh dấu là đồ ăn vặt/không tốt, đừng gợi ý món tương tự: ${dislikeNames.join('; ')}.` : '');
  const wanted = typeof dishName === 'string' ? dishName.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  if (wanted) {
    // The dish is already chosen: write its recipe (for one portion of about the given calories), do not pick another.
    return {
      responseKey: 'recipe',
      call: {
        tool: RECIPE_TOOL,
        maxTokens: 3000,
        messages: [{ role: 'user', content: `Viết công thức cho đúng món "${wanted}" (một khẩu phần khoảng ${Math.round(targetCalories)} kcal, ${Math.round(targetProtein)} g đạm), cho ${mealLabel}. Giữ nguyên tên món trong dishName. Dễ làm tại nhà, tối đa 3 dụng cụ thông dụng, nguyên liệu dễ mua ở Việt Nam, ít dầu mỡ, muối, đường. Gọi tool report_recipe.` }],
      },
    };
  }
  const prompt =
    `Gợi ý MỘT món ăn Việt Nam khác cho "${mealLabel}" (${dayType === 'training' ? 'ngày tập luyện' : 'ngày nghỉ'}), ` +
    `sao cho tổng calo khoảng ${Math.round(targetCalories)}kcal và protein khoảng ${Math.round(targetProtein)}g ` +
    `(sai số trong khoảng 10%).${avoidText} Món ăn phải thực tế, dễ chuẩn bị tại nhà: tối đa 3 dụng cụ thông dụng (chảo, nồi, nồi cơm điện, lò vi sóng), tối đa 30 phút, độ khó 1-2, nguyên liệu dễ mua ở chợ/siêu thị Việt Nam, ít dầu mỡ, ít muối và đường, ưu tiên nguyên liệu ít purine.${tasteText} Gọi tool report_recipe.`;

  return {
    responseKey: 'recipe',
    call: { tool: RECIPE_TOOL, maxTokens: 3000, messages: [{ role: 'user', content: prompt }] },
  };
});
