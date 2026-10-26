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
// The client also sends a `coach` snapshot (targets, today so far, up to 7 recent days of intake/workouts/weights and
// this week's boss state). From it the model returns `advice`: how the day stands against the deficit target and what to
// do for the rest of the day so the daily target, then the weekly one (the boss), is reached. It never replaces a doctor.

import { ACCURACY_PROPERTY, ADVICE_PROPERTY, describeCoach, describePerson, sanitizeProfile } from '../_shared/coach.ts';
import { jsonResponse, serveAi } from '../_shared/ai.ts';

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
      estimatedPurineMg: { type: 'number', description: 'Meal photos only: estimated purine (mg) of the food shown; 0 if it is low-purine.' },
      estimatedSugarG: { type: 'number', description: 'Meal photos only: estimated FREE/added sugar in grams (sugar, syrup, juice, sweetened drinks); 0 if none.' },
      estimatedSaltG: { type: 'number', description: 'Meal photos only: estimated table salt in grams (sodium x 2.5), including sauces/broth.' },
      activityName: { type: 'string', description: 'Workout photos only: the activity shown (Vietnamese), e.g. "Đi bộ dốc", "Bơi".' },
      durationMin: { type: 'number', description: 'Workout photos only: duration in minutes if it can be read or reasonably inferred.' },
      estimatedCaloriesBurned: { type: 'number', description: 'Workout photos only: calories burned this session for THIS person.' },
      advice: ADVICE_PROPERTY,
      accuracyPercent: ACCURACY_PROPERTY,
      confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How sure the estimate is given what the photo shows.' },
      reasoning: { type: 'string', description: 'One short sentence (Vietnamese) explaining the estimate.' },
    },
    required: ['reasoning'],
  },
};

serveAi('photo', async (body) => {
  const { taskType, imageBase64, mediaType, context, profile, coach } = body as {
    taskType: 'meal' | 'workout';
    imageBase64: string;
    mediaType: string;
    context?: { label?: string; plannedCalories?: number };
    profile?: unknown;
    coach?: unknown;
  };
  if (!imageBase64 || (taskType !== 'meal' && taskType !== 'workout')) {
    return jsonResponse({ error: 'Thiếu imageBase64 hoặc taskType không hợp lệ.' }, 400);
  }

  const person = describePerson(sanitizeProfile(profile));
  const coachText = describeCoach(coach);
  const coachPrompt = coachText
    ? ` Dữ liệu hiện trạng (JSON; mục tiêu, hôm nay đến giờ, tối đa 7 ngày gần đây, boss tuần — boss là tổng thâm hụt kcal cả tuần, mỗi ngày tối đa 1.500 kcal): ${coachText}. Sau khi đọc ảnh, hãy ĐÁNH GIÁ bữa/buổi tập này tác động thế nào tới mục tiêu thâm hụt hôm nay và các giới hạn purine/muối/đường, rồi GỢI Ý việc cần làm cho phần còn lại của ngày (còn được ăn bao nhiêu kcal, cần thêm bao nhiêu đạm, có cần đốt thêm không, uống nước) để đạt thâm hụt ngày, từ đó đạt mục tiêu tuần và hạ boss. Dựa vào xu hướng các ngày gần đây (ví dụ hay ăn quá muộn, thiếu đạm, thiếu nước). Chỉ dùng số trong dữ liệu, không bịa. Đây là gợi ý lối sống, không thay thế bác sĩ. Điền trường advice.`
    : '';
  const label = String(context?.label ?? '').slice(0, 120);
  const prompt =
    taskType === 'meal'
      ? `Đây là ảnh món ăn/đồ uống${label ? ` "${label}"` : ''}${
          context?.plannedCalories ? ` (kế hoạch ~${context.plannedCalories} kcal)` : ''
        }. ${person} Nhận diện món, ước tính khẩu phần thực tế trong ảnh rồi trả về tên món, calo, protein (g) và nếu có nước/đồ uống thì ml. Nếu ảnh có nhãn dinh dưỡng thì ưu tiên số trên nhãn. Nếu không chắc, nói rõ ở confidence và reasoning. Ước tính cả purine (mg), đường tự do (g) và muối (g). Ghi accuracyPercent (0-100): độ chính xác bạn tự đánh giá cho các con số. Gọi tool report_photo_analysis.${coachPrompt}`
      : `Đây là ảnh buổi tập${label ? ` "${label}"` : ''}${
          context?.plannedCalories ? ` (kế hoạch đốt ~${context.plannedCalories} kcal)` : ''
        }. ${person} Đọc những gì thấy được (màn hình máy tập/đồng hồ/ứng dụng: thời gian, quãng đường, nhịp tim, calo hiển thị; hoặc dụng cụ, tư thế). Trả về hoạt động, thời lượng (phút) và lượng calo đã đốt TÍNH CHO NGƯỜI NÀY (theo cân nặng và thể trạng, không chép nguyên số calo của máy nếu số đó rõ ràng không hợp lý). Nếu không chắc, nói rõ ở confidence và reasoning. Ghi accuracyPercent (0-100): độ chính xác bạn tự đánh giá cho các con số. Gọi tool report_photo_analysis.${coachPrompt}`;

  return {
    responseKey: 'result',
    call: {
      tool: ANALYSIS_TOOL,
      maxTokens: 1400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
  };
});
