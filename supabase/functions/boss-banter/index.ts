// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy boss-banter
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Battle banter (Map > Hội thoại chiến đấu): one short chat between the stage boss and the player about one day. A deficit day is a
// named move that hits the boss for the day's estimated fat damage; a surplus day the boss heals and taunts the player into tomorrow.
// The app builds the day's summary from its logs (deficit, level, damage, weigh-in, workouts, foods) and sends only that; it is
// cleaned here (_shared/banter.ts) and the model writes 3-6 Vietnamese lines from it, inventing nothing. Nothing is stored here: the
// app keeps the exchanges (user_data key `bossTalk`). Asked automatically once for yesterday when the Map opens, otherwise by a tap.
// Calls per user per day: app_settings key `ai_quota.banter` (default 10).

import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { BANTER_SYSTEM, BANTER_TOOL, banterPrompt, cleanBanterAnswer, cleanBanterSummary } from '../_shared/banter.ts';

serveAi('banter', async (body) => {
  const summary = cleanBanterSummary((body as { summary?: unknown }).summary);
  if (!summary) return jsonResponse({ error: 'Chưa có dữ liệu ngày để viết hội thoại.' }, 400);
  return {
    responseKey: 'result',
    call: {
      tool: BANTER_TOOL,
      system: BANTER_SYSTEM,
      maxTokens: 1500,
      messages: [{ role: 'user', content: banterPrompt(summary) }],
    },
    shape: (input) => cleanBanterAnswer(input) ?? { error: 'empty' },
  };
});
