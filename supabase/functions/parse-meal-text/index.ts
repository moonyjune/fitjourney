// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy parse-meal-text
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Turns a sentence the user typed or dictated ("2 bát phở bò, 1 ly trà đá ít đường") into one line per dish with
// calories, protein, purine, sugar and salt, each with its own accuracy %. Up to MAX_IMAGES photos may come with the sentence
// (or instead of it): they are sent as image blocks so the model can see the dishes and portions. Like the photo function it
// only estimates: the client shows every line in editable fields and saves nothing until the user confirms.
// The optional `coach` snapshot gives the same end-of-day `advice` as the photo analysis. The optional `notes` ("Ghi chú cho AI":
// "không ăn nước dùng", "bỏ da", "ít đường") adjust the dishes' figures. Details of a dish never become foods of their own, and
// every food comes back with its weight or volume (amount + amountUnit), see _shared/mealText.ts.

import { ACCURACY_PROPERTY, ADVICE_PROPERTY, describeCoach, describePerson, sanitizeProfile } from '../_shared/coach.ts';
import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { imageBlocks, MAX_IMAGES } from '../_shared/images.ts';
import { buildMealTextPrompt, cleanMealInput, MAX_MEAL_NOTES_CHARS, MAX_MEAL_TEXT_CHARS } from '../_shared/mealText.ts';

const MAX_ITEMS = 12;
const MEAL_TEXT_TOOL = {
  name: 'report_meal_text',
  description: 'Reports the foods found in the sentence, one entry per food or drink.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: MAX_ITEMS,
        description:
          'One entry per distinct DISH or drink, quantities already multiplied in (2 bowls = the figures for 2 bowls). Details of a dish (grams of its meat or noodles, toppings, notes like "ít đường") adjust THAT entry and are never entries of their own.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'Short Vietnamese name of the food ALWAYS ending with its amount as a weight or volume (g or ml): "Yến mạch 30g", "Sữa tươi không đường 50ml", "Phở bò 2 bát (≈900 g)". If the user gave a count or a household measure (cái, phần, xuất, hộp, bát, chén, ly, cốc…), keep it and add the estimated weight or volume in brackets: "Sữa chua 1 hộp (≈100 g)".',
            },
            amount: { type: 'number', description: 'The weight (g) or volume (ml) of this entry as eaten, the same figure as in the name.' },
            amountUnit: { type: 'string', enum: ['g', 'ml'], description: '"g" for food, "ml" for drinks and liquid dishes.' },
            caloriesKcal: { type: 'number' },
            proteinG: { type: 'number' },
            purineMg: { type: 'number', description: 'Estimated purine (mg); 0 if low-purine.' },
            sugarG: { type: 'number', description: 'Estimated free/added sugar (g); 0 if none.' },
            saltG: { type: 'number', description: 'Estimated table salt (g), including broth and sauces.' },
            accuracyPercent: ACCURACY_PROPERTY,
          },
          required: ['name', 'caloriesKcal', 'proteinG', 'amount', 'amountUnit', 'accuracyPercent'],
        },
      },
      mealTime: {
        type: 'string',
        enum: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'late_afternoon_snack', 'dinner', 'evening_snack'],
        description: 'When the user says they ate it, if the sentence says so; omit otherwise.',
      },
      advice: ADVICE_PROPERTY,
      accuracyPercent: ACCURACY_PROPERTY,
      reasoning: { type: 'string', description: 'One short sentence (Vietnamese): the assumptions made (portion sizes, cooking method) and how the notes were applied.' },
    },
    required: ['items', 'reasoning'],
  },
};

serveAi('text', async (body) => {
  const { text, notes: rawNotes, profile, coach, images } = body as { text?: unknown; notes?: unknown; profile?: unknown; coach?: unknown; images?: unknown };
  const sentence = cleanMealInput(text, MAX_MEAL_TEXT_CHARS);
  const notes = cleanMealInput(rawNotes, MAX_MEAL_NOTES_CHARS);
  const photos = imageBlocks(images);
  if (photos === null) {
    return jsonResponse({ error: `Ảnh đính kèm không hợp lệ (tối đa ${MAX_IMAGES} ảnh, mỗi ảnh dưới 5 MB).` }, 400);
  }
  if (!sentence && photos.length === 0) {
    return jsonResponse({ error: 'Thiếu nội dung món ăn.' }, 400);
  }

  const person = describePerson(sanitizeProfile(profile));
  const coachText = describeCoach(coach);
  const coachPrompt = coachText
    ? ` Dữ liệu hiện trạng (JSON; mục tiêu, hôm nay đến giờ, tối đa 7 ngày gần đây, boss tuần — tổng thâm hụt kcal cả tuần, mỗi ngày tối đa 1.500 kcal): ${coachText}. Sau khi tách món, hãy ĐÁNH GIÁ bữa này tác động thế nào tới thâm hụt hôm nay và giới hạn purine/muối/đường, rồi GỢI Ý việc cần làm cho phần còn lại của ngày (còn ăn được bao nhiêu kcal, cần thêm đạm, có cần đốt thêm không) để đạt thâm hụt ngày, từ đó đạt mục tiêu tuần và hạ boss. Chỉ dùng số trong dữ liệu. Đây là gợi ý lối sống, không thay thế bác sĩ. Điền trường advice.`
    : '';
  const prompt = buildMealTextPrompt({ sentence, notes, photoCount: photos.length, person, coachPrompt });

  return {
    responseKey: 'result',
    call: { tool: MEAL_TEXT_TOOL, maxTokens: 3500, messages: [{ role: 'user', content: photos.length > 0 ? [...photos, { type: 'text', text: prompt }] : prompt }] },
  };
});
