// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy read-nutrition-label
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Reads the nutrition facts panel of a packaged food from a photo. Unlike the meal photo analysis this is OCR, not
// estimation: the model copies the numbers printed on the label (per 100 g/ml and/or per serving, serving size, servings
// per pack) and nothing else. The client does the arithmetic for how much was eaten, shows every figure in editable
// fields and saves nothing until the user confirms. Labels carry no purine, so none is returned.

import { ACCURACY_PROPERTY } from '../_shared/coach.ts';
import { jsonResponse, serveAi } from '../_shared/ai.ts';

const FIGURES = {
  type: 'object',
  description: 'Numbers exactly as printed in ONE column of the label. Leave a field out when the label does not print it.',
  properties: {
    energyKcal: { type: 'number', description: 'Energy in kcal (if only kJ is printed, convert: kcal = kJ / 4.184).' },
    proteinG: { type: 'number' },
    sugarG: { type: 'number', description: 'Total sugars in grams ("đường", "trong đó đường").' },
    saltG: { type: 'number', description: 'Salt in grams, only if the label prints salt (muối).' },
    sodiumMg: { type: 'number', description: 'Sodium in mg, only if the label prints sodium (natri). Do not convert it to salt.' },
  },
};

const LABEL_TOOL = {
  name: 'report_nutrition_label',
  description: 'Reports the numbers printed on the nutrition facts label in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'False when the photo shows no nutrition facts panel or it is too blurry to read the numbers.' },
      productName: { type: 'string', description: 'Product name as printed (Vietnamese or as is); omit if not visible.' },
      per100: { ...FIGURES, description: 'The "per 100 g" or "per 100 ml" column, if there is one.' },
      perServing: { ...FIGURES, description: 'The "per serving" ("mỗi khẩu phần", "mỗi phần") column, if there is one.' },
      servingSize: {
        type: 'object',
        description: 'The size of one serving as printed.',
        properties: { amount: { type: 'number' }, unit: { type: 'string', enum: ['g', 'ml'] } },
      },
      servingsPerPack: { type: 'number', description: 'Servings per pack as printed, if any.' },
      per100Unit: { type: 'string', enum: ['g', 'ml'], description: 'Whether the per-100 column is per 100 g or per 100 ml.' },
      accuracyPercent: ACCURACY_PROPERTY,
      reasoning: { type: 'string', description: 'One short sentence (Vietnamese): which columns were found, anything unclear (blur, glare, cut off).' },
    },
    required: ['readable', 'reasoning'],
  },
};

serveAi('label', async (body) => {
  const { imageBase64, mediaType } = body as { imageBase64?: unknown; mediaType?: unknown };
  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return jsonResponse({ error: 'Thiếu imageBase64.' }, 400);
  }
  const prompt =
    'Đây là ảnh bảng thông tin dinh dưỡng (nhãn) của một sản phẩm đóng gói. Hãy ĐỌC (không ước tính) các con số in trên nhãn: ' +
    'năng lượng (kcal), đạm, đường, muối hoặc natri, cho cột "trên 100 g/ml" và/hoặc cột "mỗi khẩu phần", cùng khối lượng một khẩu phần và số khẩu phần mỗi gói. ' +
    'Chỉ điền những gì nhãn thật sự in; trường nào không in thì bỏ trống, đừng suy ra từ kiến thức về loại thực phẩm. ' +
    'Nếu chỉ có kJ thì đổi sang kcal (chia 4,184). Nếu ảnh không có bảng dinh dưỡng hoặc quá mờ để đọc số thì đặt readable=false. ' +
    'Ghi accuracyPercent theo mức bạn chắc chắn đã đọc đúng các con số (ảnh nét, đủ cột: cao; mờ, loá, bị cắt: thấp). Gọi tool report_nutrition_label.';
  return {
    responseKey: 'result',
    call: {
      tool: LABEL_TOOL,
      maxTokens: 1600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: typeof mediaType === 'string' && mediaType ? mediaType : 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
  };
});
