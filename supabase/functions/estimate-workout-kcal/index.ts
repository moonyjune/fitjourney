// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy estimate-workout-kcal
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Workout kcal estimate (Tập luyện > Ghi buổi tập > "AI ước tính kcal"): the user describes a workout in their own words (and maybe
// types the minutes); the model picks a MET value (Compendium of Physical Activities) and works out MET × kg × hours from the body
// profile the app sends. The answer only fills the form: the user checks it and saves. The request and the answer are cleaned in
// _shared/workoutKcal.ts. Calls per user per day: app_settings key `ai_quota.workout` (default 20).

import { describePerson, sanitizeProfile } from '../_shared/coach.ts';
import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { cleanWorkoutKcalAnswer, cleanWorkoutKcalRequest, WORKOUT_KCAL_SYSTEM, WORKOUT_KCAL_TOOL, workoutKcalPrompt } from '../_shared/workoutKcal.ts';

serveAi('workout', async (body) => {
  const req = cleanWorkoutKcalRequest(body);
  if (!req) return jsonResponse({ error: 'Thiếu mô tả buổi tập hoặc cân nặng.' }, 400);
  const person = describePerson(sanitizeProfile((body as { profile?: unknown }).profile));
  return {
    responseKey: 'result',
    call: {
      tool: WORKOUT_KCAL_TOOL,
      system: WORKOUT_KCAL_SYSTEM,
      maxTokens: 800,
      messages: [{ role: 'user', content: workoutKcalPrompt(req, person) }],
    },
    shape: (input) => cleanWorkoutKcalAnswer(input) ?? { error: 'empty' },
  };
});
