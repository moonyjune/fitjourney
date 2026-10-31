// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy story-chapter
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Story chapters (Map > Câu chuyện): the player's journey told as an RPG story, one chapter per week and one for each stage boss that
// falls. The app builds the chapter's summary from its logs (damage, weight, deficits, habits, workouts, notable foods) and sends only
// that; it is cleaned here (_shared/story.ts) and the model writes a short Vietnamese chapter from it, inventing nothing. Nothing is
// stored here: the app keeps the chapters (user_data key `story`). Only written when the player asks (a button), never on its own.
// Calls per user per day: app_settings key `ai_quota.story` (default 3).

import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { cleanChapterAnswer, cleanStorySummary, STORY_SYSTEM, STORY_TOOL, storyPrompt } from '../_shared/story.ts';

serveAi('story', async (body) => {
  const summary = cleanStorySummary((body as { summary?: unknown }).summary);
  if (!summary) return jsonResponse({ error: 'Chưa có dữ liệu chương để kể.' }, 400);
  return {
    responseKey: 'result',
    call: {
      tool: STORY_TOOL,
      system: STORY_SYSTEM,
      maxTokens: 3000,
      messages: [{ role: 'user', content: storyPrompt(summary) }],
    },
    shape: (input) => cleanChapterAnswer(input) ?? { error: 'empty' },
  };
});
