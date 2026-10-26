import { useCallback } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { FoodGroup } from './types';

// Copy for the food database (screen, lookup in Add food). Food names themselves are stored in Vietnamese.

const vi = {
  'fdb.title': 'Cơ sở dữ liệu món ăn',
  'fdb.back': 'Quay lại',
  'fdb.profileRow': 'Cơ sở dữ liệu món ăn',
  'fdb.profileRowHint': 'Tra cứu kcal, đạm, purine, natri; thêm món của bạn',
  'fdb.search': 'Tìm món (vd: ức gà, phở)',
  'fdb.count': '{n} món',
  'fdb.all': 'Tất cả',
  'fdb.empty': 'Không tìm thấy món nào.',
  'fdb.disclaimer': 'Giá trị tham khảo từ bảng dinh dưỡng và nhãn phổ biến, không thay cho tư vấn của bác sĩ. Món hỗn hợp hoặc ăn ngoài có sai số lớn.',
  'fdb.per100': 'Trên 100 {u}',
  'fdb.kcal': 'Kcal',
  'fdb.protein': 'Đạm (g)',
  'fdb.purine': 'Purine (mg)',
  'fdb.sugar': 'Đường thêm (g)',
  'fdb.sodium': 'Natri (mg)',
  'fdb.perUnit': 'Mỗi {unit} ≈ {g} g: {kcal} kcal',
  'fdb.purineLow': 'Purine thấp',
  'fdb.purineMedium': 'Purine trung bình',
  'fdb.purineHigh': 'Purine cao',
  'fdb.confHigh': 'Độ tin cậy cao',
  'fdb.confMedium': 'Độ tin cậy trung bình',
  'fdb.confLow': 'Độ tin cậy thấp: món hỗn hợp hoặc ngoài hàng, sai số lớn',
  'fdb.custom': 'Món của bạn',
  'fdb.auto': 'Tự lưu từ nhật ký',
  'food.savedTitle': 'Đã có trong cơ sở dữ liệu món ăn',
  'food.savedHint': 'Lần trước bạn ghi món này: {kcal} kcal · đạm {p} g. Dùng lại số liệu đó, không cần hỏi AI.',
  'food.savedUse': 'Dùng số liệu đã lưu',
  'food.savedUsed': 'Dùng số liệu bạn đã lưu cho "{name}" (không gọi AI). Sửa lại nếu khẩu phần hôm nay khác.',
  'fdb.edited': 'Đã sửa theo nhãn',
  'fdb.calcTitle': 'Tính nhanh',
  'fdb.calcQty': 'Số lượng ({unit})',
  'fdb.calcResult': '{q} {unit} ≈ {kcal} kcal · đạm {p} g · purine {pu} mg · đường {s} g · natri {na} mg',
  'fdb.add': 'Thêm món mới',
  'fdb.edit': 'Sửa',
  'fdb.editBuiltIn': 'Sửa theo nhãn',
  'fdb.delete': 'Xóa món',
  'fdb.deleteConfirm': 'Bấm lần nữa để xóa',
  'fdb.resetEdit': 'Khôi phục giá trị gốc',
  'fdb.formName': 'Tên món',
  'fdb.formGroup': 'Nhóm',
  'fdb.formUnit': 'Đơn vị (g, ml, quả, bát…)',
  'fdb.formUnitG': 'Gram (hoặc ml) mỗi đơn vị',
  'fdb.formHint': 'Nhập giá trị trên 100 g hoặc 100 ml (xem nhãn sản phẩm).',
  'fdb.save': 'Lưu',
  'fdb.cancel': 'Hủy',
  'fdb.errName': 'Nhập tên món.',
  'fdb.errDuplicate': 'Đã có món tên này.',
  'fdb.errUnit': 'Nhập đơn vị và số gram mỗi đơn vị (lớn hơn 0).',
  'fdb.errAmount': 'Các giá trị dinh dưỡng phải là số không âm.',
  'fdb.errKcal': 'Kcal trên 100 g không thể quá 900.',
  'fdb.lookupTitle': 'Tra cứu món (tính theo g/ml)',
  'fdb.lookupHint': 'Chọn món, nhập lượng ăn, rồi dùng kết quả cho món này.',
  'fdb.recent': 'Dùng gần đây',
  'fdb.basket': 'Món đã chọn',
  'fdb.qty': 'Số lượng',
  'fdb.remove': 'Bỏ {name}',
  'fdb.total': 'Tổng: {kcal} kcal · đạm {p} g · purine {pu} mg · muối {salt} g · đường {s} g',
  'fdb.apply': 'Dùng cho món này',
  'fdb.lowConf': 'Có món độ tin cậy thấp: sai số lớn, hãy kiểm tra lại.',
  'fdb.openDb': 'Mở cơ sở dữ liệu món ăn',
  'fdb.addToBasket': 'Thêm {name}',
};

export type FoodKey = keyof typeof vi;

const en: Record<FoodKey, string> = {
  'fdb.title': 'Food database',
  'fdb.back': 'Back',
  'fdb.profileRow': 'Food database',
  'fdb.profileRowHint': 'Look up kcal, protein, purine, sodium; add your own foods',
  'fdb.search': 'Search food (e.g. ức gà, phở)',
  'fdb.count': '{n} foods',
  'fdb.all': 'All',
  'fdb.empty': 'No food found.',
  'fdb.disclaimer': 'Reference values from common nutrition tables and labels; they do not replace a doctor’s advice. Mixed or restaurant dishes carry a large error.',
  'fdb.per100': 'Per 100 {u}',
  'fdb.kcal': 'Kcal',
  'fdb.protein': 'Protein (g)',
  'fdb.purine': 'Purine (mg)',
  'fdb.sugar': 'Added sugar (g)',
  'fdb.sodium': 'Sodium (mg)',
  'fdb.perUnit': 'Each {unit} ≈ {g} g: {kcal} kcal',
  'fdb.purineLow': 'Low purine',
  'fdb.purineMedium': 'Medium purine',
  'fdb.purineHigh': 'High purine',
  'fdb.confHigh': 'High confidence',
  'fdb.confMedium': 'Medium confidence',
  'fdb.confLow': 'Low confidence: mixed or restaurant dish, large error',
  'fdb.custom': 'Your food',
  'fdb.auto': 'Saved from your diary',
  'food.savedTitle': 'Already in the food database',
  'food.savedHint': 'Last time you logged this: {kcal} kcal · protein {p} g. Reuse those figures, no AI needed.',
  'food.savedUse': 'Use saved figures',
  'food.savedUsed': 'Used the figures you saved for "{name}" (no AI call). Adjust them if today’s portion differs.',
  'fdb.edited': 'Edited from a label',
  'fdb.calcTitle': 'Quick calculator',
  'fdb.calcQty': 'Amount ({unit})',
  'fdb.calcResult': '{q} {unit} ≈ {kcal} kcal · protein {p} g · purine {pu} mg · sugar {s} g · sodium {na} mg',
  'fdb.add': 'Add a new food',
  'fdb.edit': 'Edit',
  'fdb.editBuiltIn': 'Edit from label',
  'fdb.delete': 'Delete food',
  'fdb.deleteConfirm': 'Tap again to delete',
  'fdb.resetEdit': 'Restore original values',
  'fdb.formName': 'Food name',
  'fdb.formGroup': 'Group',
  'fdb.formUnit': 'Unit (g, ml, piece, bowl…)',
  'fdb.formUnitG': 'Grams (or ml) per unit',
  'fdb.formHint': 'Enter the values per 100 g or 100 ml (see the product label).',
  'fdb.save': 'Save',
  'fdb.cancel': 'Cancel',
  'fdb.errName': 'Enter a food name.',
  'fdb.errDuplicate': 'A food with this name already exists.',
  'fdb.errUnit': 'Enter a unit and the grams per unit (more than 0).',
  'fdb.errAmount': 'Nutrition values must be numbers, not negative.',
  'fdb.errKcal': 'Kcal per 100 g cannot be above 900.',
  'fdb.lookupTitle': 'Food lookup (by g/ml)',
  'fdb.lookupHint': 'Pick a food, enter how much you ate, then use the result for this item.',
  'fdb.recent': 'Recently used',
  'fdb.basket': 'Picked foods',
  'fdb.qty': 'Amount',
  'fdb.remove': 'Remove {name}',
  'fdb.total': 'Total: {kcal} kcal · protein {p} g · purine {pu} mg · salt {salt} g · sugar {s} g',
  'fdb.apply': 'Use for this item',
  'fdb.lowConf': 'Some foods have low confidence: large error, double-check them.',
  'fdb.openDb': 'Open the food database',
  'fdb.addToBasket': 'Add {name}',
};

export const GROUP_LABEL: Record<'vi' | 'en', Record<FoodGroup, string>> = {
  vi: {
    eggDairy: 'Trứng & sữa', plantProtein: 'Đạm thực vật', poultry: 'Gia cầm', redMeat: 'Thịt đỏ', seafood: 'Hải sản', processed: 'Chế biến sẵn',
    starch: 'Tinh bột', soup: 'Món nước', vegetable: 'Rau', fruit: 'Trái cây', nuts: 'Hạt', seasoning: 'Gia vị', drink: 'Đồ uống', sweet: 'Đồ ngọt', snack: 'Đồ vặt',
  },
  en: {
    eggDairy: 'Eggs & dairy', plantProtein: 'Plant protein', poultry: 'Poultry', redMeat: 'Red meat', seafood: 'Seafood', processed: 'Processed',
    starch: 'Starches', soup: 'Soups', vegetable: 'Vegetables', fruit: 'Fruit', nuts: 'Nuts', seasoning: 'Seasoning', drink: 'Drinks', sweet: 'Sweets', snack: 'Snacks',
  },
};

const UNIT_EN: Record<string, string> = {
  quả: 'pc', cái: 'pc', hộp: 'pot', thanh: 'stick', miếng: 'piece', lát: 'slice', ổ: 'loaf', gói: 'pack', bát: 'bowl',
  'thìa canh': 'tbsp', 'thìa cà phê': 'tsp', lon: 'can', cốc: 'cup', chén: 'shot',
};

/** A food unit as shown in the reader's language ('g' and 'ml' are the same everywhere). */
export const unitLabel = (unit: string, language: 'vi' | 'en'): string => (language === 'en' ? UNIT_EN[unit] ?? unit : unit);

export function formatFoodText(language: 'vi' | 'en', key: FoodKey, params?: Record<string, string | number>): string {
  const template = (language === 'en' ? en : vi)[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export function useFoodText() {
  const language = useSettingsStore((s) => s.language);
  return useCallback((key: FoodKey, params?: Record<string, string | number>) => formatFoodText(language, key, params), [language]);
}
