// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy analyze-weekly-feelings
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Analyzes a week's feeling-record log (craving/hunger/mood/workout condition) alongside a
// summary of that week's actual calories/workouts/weight change, and asks Claude for concrete,
// short suggestions on adjusting the meal plan and workout schedule. Text-only (no vision), one
// request per week — the client caches the result in `weekly_suggestions` after receiving it, so
// re-opening the screen doesn't re-spend a Claude call.
// Goes through the shared AI code (_shared/ai.ts, a free-form text call): AI_DISABLED, sign-in, quota, budgets, cost logged in
// ai_usage as `feelings`. Calls per user per day: app_settings key `ai_quota.feelings` (default 3). Model: the global one
// (ai_settings `model`, default claude-sonnet-5-5). Prompt in _shared/feelings.ts.
// Response: { suggestion } or { error }.

import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { FEELINGS_SYSTEM, feelingsPrompt, MIN_FEELING_RECORDS, type FeelingRecordInput, type WeekSummaryInput } from '../_shared/feelings.ts';

serveAi('feelings', async (body) => {
  const { feelingRecords, weekSummary } = body as { feelingRecords: FeelingRecordInput[]; weekSummary: WeekSummaryInput };
  if (!Array.isArray(feelingRecords) || feelingRecords.length < MIN_FEELING_RECORDS) {
    return jsonResponse({ error: 'Cần ít nhất 3 lượt ghi nhận cảm giác trong tuần để phân tích.' }, 400);
  }
  return {
    chat: {
      system: FEELINGS_SYSTEM,
      maxTokens: 1200,
      messages: [{ role: 'user', content: feelingsPrompt(feelingRecords, weekSummary) }],
    },
    respond: ({ text }) => (text ? jsonResponse({ suggestion: text }) : jsonResponse({ error: 'AI không trả về nội dung.' }, 502)),
  };
});
