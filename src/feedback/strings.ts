import { useCallback } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

// Copy for the food comments. The reasons and replacements inside each food rule come from the rule table and stay Vietnamese.

const vi = {
  'fb.tab': 'Nhận xét',
  'fb.empty': 'Chưa có ngày nào để nhận xét. Ghi bữa ăn trong vài ngày để thấy nhận xét ở đây.',
  'fb.snackLink': 'Gợi ý thay đồ ăn vặt khi thèm →',
  'fb.note': 'Nhận xét tự động theo từ khóa trong tên món và số liệu của bạn; không thay cho tư vấn của bác sĩ.',
  'fb.score': 'Điểm {s}/10',
  'fb.dayHead': '{date} · {kcal} kcal',
  'fb.dayTotals': 'Cả ngày so với ngưỡng:',
  'fb.total.sodium': 'Natri {v}/{max} mg',
  'fb.total.purine': 'Purine {v}/{max} mg',
  'fb.total.sugar': 'Đường {v}/{max} g',
  'fb.total.ok': '✔ trong ngưỡng',
  'fb.total.over': '⚠ vượt {d}',
  'fb.replaceTitle': 'Món nên thay / chú ý',
  'fb.replaceRow': '{short} → {to}',
  'fb.repeatTitle': 'Lặp lại trong 3 ngày',
  'fb.repeatRow': '↻ {short}: {n} lần/3 ngày → {hint}',
  'fb.repeatDefault': 'đổi món khác',
  'fb.adviceTitle': 'Việc cần làm ngày mai',
  'fb.mealsTitle': 'Từng món',
  'fb.lineGood': '✔ {short}: {why}',
  'fb.lineBad': '⚠ {short}: {why} → thay: {to}',
  'fb.frequentTitle': 'Món lặp nhiều (nên hạn chế)',
  'fb.frequentRow': '{short} ×{n} → {to}',
  'fb.liveTitle': 'Nhận xét món này',
  'fb.liveRepeat': '↻ {short}: đây là lần thứ {n} trong 3 ngày → {hint}',
  'fb.w.sodium': 'Natri riêng bữa này {v} mg = {p}% trần cả ngày ({max} mg) → các bữa còn lại ăn nhạt.',
  'fb.w.purine': 'Purine riêng bữa này {v} mg = {p}% trần cả ngày ({max} mg) → bữa sau đạm trắng.',
  'fb.w.sugar': 'Đường {v} g – kiểm tra đồ uống và sốt.',
  'fb.w.heavy': 'Bữa trên 1.000 kcal ({v}) – bớt tinh bột và mỡ.',
  'fb.w.lowProtein': 'Bữa chính ít đạm ({v} g) → thêm lòng trắng, sữa chua hoặc đậu phụ.',
  'fb.a.missing': 'Bổ sung bữa còn thiếu ({v}) để đánh giá đúng ngày này.',
  'fb.a.lowKcal': '⚠ Ăn dưới 1.300 kcal ({v}): rủi ro gout (đói sâu giảm thải uric). Ngày mai ăn đủ ~1.500 và tạo thâm hụt bằng đi bộ.',
  'fb.a.skipped': 'Có bỏ bữa → thay bằng bữa nhỏ (sữa chua + trứng).',
  'fb.a.alcohol': '⚠ Có rượu hoặc bia → ngày mai uống 3 L nước, purine dưới 300 mg, không nhịn ăn.',
  'fb.a.sodiumStreak': '3 ngày liền natri vượt trần → ngày mai là NGÀY NHẠT: không nước dùng, không đồ chế biến sẵn, thêm rau, khoai, nước dừa.',
  'fb.a.sodiumHigh': 'Natri rất cao ({v} mg) → ngày mai ăn nhạt và uống đủ nước (cân có thể tăng ảo 0,5–1,5 kg).',
  'fb.a.purineStreak': '⚠ 2 ngày liền purine vượt trần → ngày mai dưới 300 mg (lòng trắng, đậu phụ, sữa chua) và 3 L nước.',
  'fb.a.purineOver': 'Purine vượt trần ({v} mg) → ngày mai chỉ 1 bữa thịt nhỏ, còn lại đạm trắng.',
  'fb.a.surplus': 'Thặng dư calo: KHÔNG nhịn bù. Ngày mai ăn bình thường và đi bộ thêm 30 phút.',
  'fb.a.lowDeficitStreak': '2 ngày liền thâm hụt thấp → thêm 20–30 phút đi bộ, bỏ 1 đồ uống có calo.',
  'fb.a.lowProtein': 'Đạm thấp ({v} g) → thêm 150 g lòng trắng hoặc 1 hộp sữa chua.',
  'fb.a.sugar': 'Đường vượt ({v} g): kiểm tra đồ uống ngọt, chè, sốt.',
  'fb.a.noExercise': '7 ngày chưa vận động → 15 phút đi bộ sau bữa tối.',
  'fb.a.goodSaltOnly': '✔ Ngày tốt về calo, đạm, purine: chỉ còn muối cần sửa.',
  'fb.a.veryGood': '✔ Ngày rất tốt: lặp lại thực đơn này.',
};

export type FeedbackKey = keyof typeof vi;

const en: Record<FeedbackKey, string> = {
  'fb.tab': 'Feedback',
  'fb.empty': 'No day to comment on yet. Log meals for a few days to see feedback here.',
  'fb.snackLink': 'Swaps for snack cravings →',
  'fb.note': 'Automatic comments from keywords in food names and your numbers; they do not replace a doctor’s advice.',
  'fb.score': 'Score {s}/10',
  'fb.dayHead': '{date} · {kcal} kcal',
  'fb.dayTotals': 'Whole day against the limits:',
  'fb.total.sodium': 'Sodium {v}/{max} mg',
  'fb.total.purine': 'Purine {v}/{max} mg',
  'fb.total.sugar': 'Sugar {v}/{max} g',
  'fb.total.ok': '✔ within the limit',
  'fb.total.over': '⚠ over by {d}',
  'fb.replaceTitle': 'Foods to swap / watch',
  'fb.replaceRow': '{short} → {to}',
  'fb.repeatTitle': 'Repeats within 3 days',
  'fb.repeatRow': '↻ {short}: {n} times in 3 days → {hint}',
  'fb.repeatDefault': 'pick something else',
  'fb.adviceTitle': 'To do tomorrow',
  'fb.mealsTitle': 'Each food',
  'fb.lineGood': '✔ {short}: {why}',
  'fb.lineBad': '⚠ {short}: {why} → swap: {to}',
  'fb.frequentTitle': 'Foods that came up often (cut back)',
  'fb.frequentRow': '{short} ×{n} → {to}',
  'fb.liveTitle': 'Comments on this food',
  'fb.liveRepeat': '↻ {short}: this is number {n} in 3 days → {hint}',
  'fb.w.sodium': 'This meal alone: sodium {v} mg = {p}% of the whole day’s limit ({max} mg) → keep the other meals bland.',
  'fb.w.purine': 'This meal alone: purine {v} mg = {p}% of the whole day’s limit ({max} mg) → white protein next meal.',
  'fb.w.sugar': 'Sugar {v} g – check drinks and sauces.',
  'fb.w.heavy': 'Meal over 1,000 kcal ({v}) – cut starch and fat.',
  'fb.w.lowProtein': 'Low-protein main meal ({v} g) → add egg whites, yoghurt or tofu.',
  'fb.a.missing': 'Add the missing meals ({v}) to judge this day properly.',
  'fb.a.lowKcal': '⚠ Under 1,300 kcal ({v}): a gout risk (deep hunger lowers uric-acid clearance). Eat about 1,500 tomorrow and build the deficit by walking.',
  'fb.a.skipped': 'A meal was skipped → replace it with a small meal (yoghurt + egg).',
  'fb.a.alcohol': '⚠ Alcohol or beer today → tomorrow drink 3 L of water, keep purine under 300 mg, do not fast.',
  'fb.a.sodiumStreak': 'Sodium over the limit 3 days running → tomorrow is a BLAND DAY: no broth, no processed food, add vegetables, potato, coconut water.',
  'fb.a.sodiumHigh': 'Very high sodium ({v} mg) → eat bland tomorrow and drink enough water (the scale may read 0.5–1.5 kg too high).',
  'fb.a.purineStreak': '⚠ Purine over the limit 2 days running → tomorrow under 300 mg (egg whites, tofu, yoghurt) and 3 L of water.',
  'fb.a.purineOver': 'Purine over the limit ({v} mg) → tomorrow only one small meat meal, the rest white protein.',
  'fb.a.surplus': 'Calorie surplus: do NOT fast to make up. Eat normally tomorrow and walk 30 minutes more.',
  'fb.a.lowDeficitStreak': 'Low deficit 2 days running → walk 20–30 minutes more and drop one caloric drink.',
  'fb.a.lowProtein': 'Low protein ({v} g) → add 150 g egg whites or 1 pot of yoghurt.',
  'fb.a.sugar': 'Sugar over the limit ({v} g): check sweet drinks, desserts, sauces.',
  'fb.a.noExercise': 'No exercise for 7 days → walk 15 minutes after dinner.',
  'fb.a.goodSaltOnly': '✔ A good day for calories, protein and purine: only salt needs fixing.',
  'fb.a.veryGood': '✔ A very good day: repeat this menu.',
};

export function formatFeedbackText(language: 'vi' | 'en', key: FeedbackKey, params?: Record<string, string | number>): string {
  const template = (language === 'en' ? en : vi)[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export function useFeedbackText() {
  const language = useSettingsStore((s) => s.language);
  return useCallback((key: FeedbackKey, params?: Record<string, string | number>) => formatFeedbackText(language, key, params), [language]);
}
