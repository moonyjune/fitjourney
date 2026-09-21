export type WorkoutIntensity = 'light' | 'medium' | 'high';

// kcal burned per minute — thresholds picked against this app's own workout templates (roughly
// 7-10 kcal/min for swim/incline-walk sessions) so the badge actually differentiates a light
// custom log (e.g. a slow walk) from a hard one, not just label every session "high".
const LIGHT_MAX_KCAL_PER_MIN = 6;
const MEDIUM_MAX_KCAL_PER_MIN = 10;

export function workoutIntensity(caloriesBurned: number, durationMin: number): WorkoutIntensity {
  const rate = durationMin > 0 ? caloriesBurned / durationMin : 0;
  if (rate < LIGHT_MAX_KCAL_PER_MIN) return 'light';
  if (rate < MEDIUM_MAX_KCAL_PER_MIN) return 'medium';
  return 'high';
}

const KEYWORD_ICONS: [RegExp, string][] = [
  [/bơi|swim/i, '🏊'],
  [/(yoga|giãn cơ|stretch)/i, '🧘'],
  [/(tạ|gym|weight|strength)/i, '🏋️'],
  [/(đạp xe|xe đạp|elliptical|cycl|bike)/i, '🚴'],
  [/(chạy|run)/i, '🏃'],
  [/(đi bộ|dốc|incline|walk)/i, '🚶'],
  [/(cardio|hiit|nhảy)/i, '🔥'],
];

/** Best-effort icon from a free-text workout label — used for both the plan's own templates and
 *  user-typed custom sessions, so it has to work on arbitrary text, not just a fixed enum. */
export function iconForWorkoutLabel(label: string): string {
  for (const [pattern, icon] of KEYWORD_ICONS) {
    if (pattern.test(label)) return icon;
  }
  return '💪';
}
