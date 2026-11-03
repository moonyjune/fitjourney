// Plan chat (suggest-plan-update): the system prompt, the `propose_plan_update` tool and the check of a proposed plan. Pure (no Deno
// or network use), so it is unit-tested in jest.

export const SYSTEM_PROMPT_HEADER = `Bạn là trợ lý trò chuyện giúp chỉnh sửa kế hoạch giảm cân (thực đơn, bài tập, \
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

export const PLAN_TOOL = {
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

/** The chat as the API takes it: each message's role and text, nothing else. */
export function chatMessages(messages: unknown[]): { role: string; content: string }[] {
  return messages.map((m) => ({ role: (m as { role: string }).role, content: (m as { content: string }).content }));
}

/** Whether a proposed plan has every part the app needs (meal templates for both day types, workouts, shopping list, water). */
export function isValidPlanShape(value: unknown): value is {
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
