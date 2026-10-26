import { useCallback } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { Evidence, LearnSection } from './types';

// Chrome for the Knowledge screen. The articles and the craving swaps themselves are written in Vietnamese.

const vi = {
  'learn.title': 'Kiến thức',
  'learn.back': 'Quay lại',
  'learn.profileRow': 'Kiến thức',
  'learn.profileRowHint': 'Lý thuyết: vì sao làm như vậy; gợi ý thay đồ ăn vặt',
  'learn.tabTheory': 'Lý thuyết',
  'learn.tabSnack': 'Thay snack',
  'learn.all': 'Tất cả',
  'learn.searchTopics': 'Tìm chủ đề (vd: muối, giấc ngủ)',
  'learn.searchSnacks': 'Tìm món đang thèm (vd: snack, trà sữa)',
  'learn.empty': 'Không tìm thấy.',
  'learn.disclaimer': 'Kiến thức dinh dưỡng phổ biến, không thay cho tư vấn của bác sĩ điều trị gout. Bài viết bằng tiếng Việt.',
  'learn.evidenceNote': 'Mức độ bằng chứng: Mạnh = đồng thuận rộng rãi; Trung bình = có nghiên cứu ủng hộ, hiệu ứng vừa phải; Hạn chế = tác dụng nhỏ hoặc gián tiếp.',
  'learn.ev.strong': 'Bằng chứng mạnh',
  'learn.ev.medium': 'Bằng chứng trung bình',
  'learn.ev.limited': 'Bằng chứng hạn chế',
  'learn.sec.basics': 'Nền tảng',
  'learn.sec.food': 'Ăn gì – vì sao',
  'learn.sec.habit': 'Thói quen – vì sao',
  'learn.sec.gout': 'Gout & vận động',
  'learn.yourData': 'Số liệu hiện tại của bạn',
  'learn.yourNote': 'Ghi chú theo nhật ký của bạn',
  'learn.yourNoteHint': 'Viết theo số liệu lúc nhập nhật ký, có thể đã cũ.',
  'learn.snackIntro': 'Khi thèm một món, thử thay bằng món gợi ý. Kcal là ước tính cho khẩu phần.',
  'learn.snackLegend': 'Màu kcal: xanh ≤ 100 (ăn vặt thoải mái) · vàng 101–200 (1 lần/ngày) · cam > 200 (thay bữa phụ, không phải ăn vặt).',
  'learn.craving': 'Khi thèm',
  'learn.swap': 'Thay bằng',
  'learn.portion': 'Khẩu phần',
  'learn.kcal': '{n} kcal',
  'learn.band.free': 'ăn vặt thoải mái',
  'learn.band.once': '1 lần mỗi ngày',
  'learn.band.meal': 'thay bữa phụ',
  'learn.lvl.high': 'tích nước cao',
  'learn.lvl.mild': 'tích nước vừa',
  'learn.lvl.normal': 'bình thường',
  'learn.lvl.releasing': 'đang xả nước',
  'learn.f.deficit': 'Thâm hụt TB {d} kcal/ngày (14 ngày gần nhất) ≈ {kg} kg mỡ mỗi tuần theo 7.700 kcal/kg.',
  'learn.f.water': 'Lần cân gần nhất lệch {kg} kg so với đường mỡ dự kiến: {lvl}.',
  'learn.f.sugar': 'Đường thêm TB {g} g/ngày (14 ngày gần nhất); mục tiêu ≤ {max} g.',
  'learn.f.sodium': 'Natri TB {mg} mg/ngày (14 ngày gần nhất), mục tiêu ≤ {max}; {n}/{d} ngày vượt.',
  'learn.f.protein': 'Đạm TB {g} g/ngày (14 ngày gần nhất); mục tiêu {t} g.',
  'learn.f.water7': 'Nước uống TB {l} L/ngày (các ngày có ghi trong 7 ngày gần nhất); mục tiêu {t} L.',
  'learn.f.eff': 'Hệ số hiệu suất của bạn {e}: mỗi 1.000 kcal thâm hụt giảm ≈ {kg} kg.',
  'learn.f.purine': 'Purine TB {mg} mg/ngày (14 ngày gần nhất), trần {max}; {n} ngày vượt.',
};

export type LearnKey = keyof typeof vi;

const en: Record<LearnKey, string> = {
  'learn.title': 'Knowledge',
  'learn.back': 'Back',
  'learn.profileRow': 'Knowledge',
  'learn.profileRowHint': 'Theory: why it works; swaps for snack cravings',
  'learn.tabTheory': 'Theory',
  'learn.tabSnack': 'Snack swaps',
  'learn.all': 'All',
  'learn.searchTopics': 'Search topics (e.g. muối, giấc ngủ)',
  'learn.searchSnacks': 'Search a craving (e.g. snack, trà sữa)',
  'learn.empty': 'Nothing found.',
  'learn.disclaimer': 'General nutrition knowledge, not a replacement for a gout doctor’s advice. The articles are written in Vietnamese.',
  'learn.evidenceNote': 'Level of evidence: Strong = widely agreed; Medium = supported by studies, moderate effect; Limited = small or indirect effect.',
  'learn.ev.strong': 'Strong evidence',
  'learn.ev.medium': 'Medium evidence',
  'learn.ev.limited': 'Limited evidence',
  'learn.sec.basics': 'Basics',
  'learn.sec.food': 'What to eat and why',
  'learn.sec.habit': 'Habits and why',
  'learn.sec.gout': 'Gout & exercise',
  'learn.yourData': 'Your numbers now',
  'learn.yourNote': 'Note from your diary',
  'learn.yourNoteHint': 'Written from the figures when the diary was imported; it may be out of date.',
  'learn.snackIntro': 'When a craving hits, try the suggested swap. Kcal is an estimate for the portion.',
  'learn.snackLegend': 'Kcal colour: green ≤ 100 (nibble freely) · yellow 101–200 (once a day) · orange > 200 (replaces a snack meal, not a nibble).',
  'learn.craving': 'When you crave',
  'learn.swap': 'Swap for',
  'learn.portion': 'Portion',
  'learn.kcal': '{n} kcal',
  'learn.band.free': 'nibble freely',
  'learn.band.once': 'once a day',
  'learn.band.meal': 'replaces a snack meal',
  'learn.lvl.high': 'high water retention',
  'learn.lvl.mild': 'some water retention',
  'learn.lvl.normal': 'normal',
  'learn.lvl.releasing': 'releasing water',
  'learn.f.deficit': 'Average deficit {d} kcal/day (last 14 days) ≈ {kg} kg of fat a week at 7,700 kcal/kg.',
  'learn.f.water': 'Your latest weigh-in is {kg} kg from the expected fat line: {lvl}.',
  'learn.f.sugar': 'Average added sugar {g} g/day (last 14 days); target ≤ {max} g.',
  'learn.f.sodium': 'Average sodium {mg} mg/day (last 14 days), target ≤ {max}; {n}/{d} days over.',
  'learn.f.protein': 'Average protein {g} g/day (last 14 days); target {t} g.',
  'learn.f.water7': 'Average water {l} L/day (days logged in the last 7); target {t} L.',
  'learn.f.eff': 'Your efficiency factor is {e}: every 1,000 kcal of deficit removes ≈ {kg} kg.',
  'learn.f.purine': 'Average purine {mg} mg/day (last 14 days), limit {max}; {n} days over.',
};

export const SECTION_KEY: Record<LearnSection, LearnKey> = { basics: 'learn.sec.basics', food: 'learn.sec.food', habit: 'learn.sec.habit', gout: 'learn.sec.gout' };
export const EVIDENCE_KEY: Record<Evidence, LearnKey> = { strong: 'learn.ev.strong', medium: 'learn.ev.medium', limited: 'learn.ev.limited' };

export function formatLearnText(language: 'vi' | 'en', key: LearnKey, params?: Record<string, string | number>): string {
  const template = (language === 'en' ? en : vi)[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export function useLearnText() {
  const language = useSettingsStore((s) => s.language);
  return useCallback((key: LearnKey, params?: Record<string, string | number>) => formatLearnText(language, key, params), [language]);
}
