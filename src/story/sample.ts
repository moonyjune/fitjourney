// Offline stand-in for `story-chapter`, used only by the Login Dev account: a chapter put together from the summary's own facts,
// clearly labelled as simulated (no AI, nothing invented).

import type { StoryChapterText, StorySummary } from '../../supabase/functions/_shared/story';

export const SAMPLE_LABEL = '[Mẫu Dev]';

const dd = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function sampleChapter(s: StorySummary): StoryChapterText {
  const { chapter, deficit, weight, workouts, foods } = s;
  const opening =
    chapter.kind === 'boss' && s.boss
      ? `Ngày ${dd(chapter.to)}, ${s.boss.name} gục ngã dưới mốc ${s.boss.toKg} kg.`
      : `Tuần ${dd(chapter.from)} – ${dd(chapter.to)}: người hùng ghi nhật ký ${deficit.daysLogged} ngày.`;
  const facts = [
    deficit.best ? `Đòn mạnh nhất rơi vào ${dd(deficit.best.date)} với ${deficit.best.kcal} kcal thâm hụt.` : '',
    weight.changeKg !== undefined ? `Cân nặng đổi ${weight.changeKg} kg.` : '',
    workouts.sessions > 0 ? `${workouts.sessions} buổi tập, ${workouts.minutes} phút.` : '',
    foods.top[0] ? `Món hay gặp nhất: ${foods.top[0].name} (${foods.top[0].count} lần).` : '',
  ].filter(Boolean);
  return {
    title: `${SAMPLE_LABEL} ${chapter.kind === 'boss' && s.boss ? `Hạ ${s.boss.name}` : `Tuần từ ${dd(chapter.from)}`}`,
    paragraphs: [opening, facts.join(' ') || 'Dữ liệu mẫu, không phải chương do AI viết.'],
  };
}
