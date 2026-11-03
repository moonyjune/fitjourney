// Weekly feelings analysis (analyze-weekly-feelings): the prompt built from a week's feeling records and the week's numbers. Pure (no
// Deno or network use), so it is unit-tested in jest.

export interface FeelingRecordInput {
  loggedAtISO: string;
  cravingLevel: number;
  hungerLevel: number;
  mood: string;
  workoutCondition: string | null;
  note: string;
}

export interface WeekSummaryInput {
  avgCaloriesPerDay: number;
  totalWorkouts: number;
  weightChangeKg: number | null;
}

/** Fewer records than this give nothing to analyze (the app asks only from this many on). */
export const MIN_FEELING_RECORDS = 3;

export const FEELINGS_SYSTEM =
  'Bạn là huấn luyện viên giảm cân tận tâm. Dựa trên nhật ký cảm giác (thèm ăn/đói/tâm trạng/tình trạng tập) ' +
  'và số liệu thực tế trong tuần, trả lời gồm HAI phần, ngăn cách bằng một dòng trống:\n' +
  '1) Một nhận định NGẮN (1-2 câu) mang tính cổ vũ nhưng THỰC TẾ — không tô hồng nếu tuần này khó khăn, ' +
  'nhưng luôn lạc quan và hướng người dùng tới đích.\n' +
  '2) 3-5 gợi ý NGẮN GỌN, CỤ THỂ (dạng gạch đầu dòng) để điều chỉnh thực đơn hoặc lịch tập cho tuần tới, ' +
  'không lặp lại số liệu đã cho, tập trung vào hành động nên làm.\n' +
  'Viết bằng tiếng Việt.';

/** The user message: the week's numbers, then one line per feeling record (Vietnamese dates and times). */
export function feelingsPrompt(feelingRecords: FeelingRecordInput[], weekSummary: WeekSummaryInput): string {
  const recordsText = feelingRecords
    .map((r) => {
      const day = new Date(r.loggedAtISO).toLocaleDateString('vi-VN');
      const time = new Date(r.loggedAtISO).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      return `- ${day} ${time}: thèm ăn ${r.cravingLevel}/5, đói ${r.hungerLevel}/5, tâm trạng ${r.mood}${
        r.workoutCondition ? `, tình trạng tập ${r.workoutCondition}` : ''
      }${r.note ? `, ghi chú: "${r.note}"` : ''}`;
    })
    .join('\n');

  const summaryText = `Trung bình ${Math.round(weekSummary.avgCaloriesPerDay)} kcal/ngày, ${weekSummary.totalWorkouts} buổi tập trong tuần${
    weekSummary.weightChangeKg != null ? `, thay đổi cân nặng ${weekSummary.weightChangeKg.toFixed(1)}kg` : ''
  }.`;

  return `Số liệu tuần này: ${summaryText}\n\nNhật ký cảm giác:\n${recordsText}`;
}
