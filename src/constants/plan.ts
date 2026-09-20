import type { DayType, MealTemplate, MilestoneDef, PlanData, ShoppingListItem, WaterCheckpoint, WorkoutTemplate } from '../types';

// Nguồn: Input/KeHoachGiamCan.docx và Input/BuyingList.docx
// Kế hoạch IF 16:8 cho người 110kg: khung ăn 12:00 - 20:00, khung nhịn 20:00 - 12:00 hôm sau.

export const IF_EATING_START_HOUR = 12;
export const IF_EATING_END_HOUR = 20;

export const DEFAULT_CALORIE_TARGET = 1950;
export const DEFAULT_PROTEIN_TARGET_G = 200;
export const DEFAULT_WATER_TARGET_ML = 4500;
export const DEFAULT_START_WEIGHT_KG = 110;
export const WEEKLY_FAT_LOSS_TARGET_KG = [0.9, 1.1] as const;

// Thứ 2,3,5,6 là ngày tập (training); Thứ 4,7,CN là ngày nghỉ (rest).
// getDay(): 0 = Chủ Nhật, 1 = Thứ 2, ... 6 = Thứ 7
export const TRAINING_WEEKDAYS = new Set([1, 2, 4, 5]);

// Lịch trình uống nước mặc định theo mốc thời gian trong ngày (giờ ngủ dậy -> trước khi ngủ),
// mỗi mốc ghi lượng nước CỘNG DỒN cần đạt tính từ đầu ngày. Tổng khớp DEFAULT_WATER_TARGET_ML.
export const DEFAULT_WATER_SCHEDULE: WaterCheckpoint[] = [
  { hour: 6, minute: 0, label: 'Thức dậy - 1 ly nước ấm', cumulativeTargetMl: 500 },
  { hour: 6, minute: 30, label: 'Trong lúc tập sáng', cumulativeTargetMl: 1000 },
  { hour: 8, minute: 30, label: 'Trong khung nhịn (sáng)', cumulativeTargetMl: 2000 },
  { hour: 12, minute: 0, label: 'Sau bữa 1 (trưa)', cumulativeTargetMl: 2300 },
  { hour: 15, minute: 30, label: 'Trước bữa 2 (chiều)', cumulativeTargetMl: 2700 },
  { hour: 17, minute: 30, label: 'Trong/sau lúc tập chiều', cumulativeTargetMl: 3300 },
  { hour: 19, minute: 15, label: 'Sau bữa 3 (tối)', cumulativeTargetMl: 3700 },
  { hour: 20, minute: 0, label: 'Trước khi bắt đầu nhịn tối', cumulativeTargetMl: 4500 },
];

// Mốc tiến trình chi tiết theo tuần/tháng kể từ ngày bắt đầu.
export const MILESTONES: MilestoneDef[] = [
  { key: '1w', label: 'Mốc 1 tuần', daysFromStart: 7 },
  { key: '2w', label: 'Mốc 2 tuần', daysFromStart: 14 },
  { key: '4w', label: 'Mốc 4 tuần', daysFromStart: 28 },
  { key: '1m', label: 'Mốc 1 tháng', daysFromStart: 30 },
  { key: '6w', label: 'Mốc 6 tuần', daysFromStart: 42 },
  { key: '2m', label: 'Mốc 2 tháng', daysFromStart: 61 },
  { key: '10w', label: 'Mốc 10 tuần', daysFromStart: 70 },
  { key: '3m', label: 'Mốc 3 tháng', daysFromStart: 91 },
];

export function getDayType(date: Date = new Date()): DayType {
  return TRAINING_WEEKDAYS.has(date.getDay()) ? 'training' : 'rest';
}

export const DEFAULT_MEAL_TEMPLATES: Record<DayType, MealTemplate[]> = {
  training: [
    {
      slot: 'meal1',
      label: 'Bữa 1 - Trưa (Phá cỗ)',
      timeRange: '12:00 - 12:45',
      startHour: 12,
      startMinute: 0,
      items: [
        { name: '4 lòng trắng trứng luộc', calories: 68 },
        { name: '2 quả trứng luộc nguyên quả', calories: 143 },
        { name: '120g xúc xích gà nạc áp chảo', calories: 180 },
        { name: '1 lát bánh mì nguyên cám', calories: 70 },
        { name: '1 hũ sữa chua không đường (100g)', calories: 60 },
        { name: '30g yến mạch cán vỡ + 1/2 quả chuối chín', calories: 165 },
        { name: '8 hạt hạnh nhân', calories: 55 },
      ],
      calories: 741,
      proteinG: 53,
    },
    {
      slot: 'meal2',
      label: 'Bữa 2 - Chiều (Trước tập)',
      timeRange: '15:30 - 16:00',
      startHour: 15,
      startMinute: 30,
      items: [
        { name: '200g lườn gà xé phay không da', calories: 330 },
        { name: '40g miến khô (ngâm nở nấu bát lớn)', calories: 130 },
        { name: 'Rau cải, mộc nhĩ, nước dùng gà trong', calories: 40 },
      ],
      calories: 500,
      proteinG: 64,
    },
    {
      slot: 'meal3',
      label: 'Bữa 3 - Tối (Chốt cửa sổ ăn)',
      timeRange: '19:15 - 20:00',
      startHour: 19,
      startMinute: 15,
      items: [
        { name: '200g ức gà áp chảo/nướng mộc', calories: 330 },
        { name: '180g khoai tây nghiền (hoặc 150g khoai lang luộc)', calories: 130 },
        { name: '1 bát salad lớn (dưa chuột, cà chua, hành tây)', calories: 40 },
        { name: '2 quả trứng luộc nguyên quả', calories: 143 },
        { name: '1 ly sữa tươi tách béo không đường (200ml)', calories: 70 },
      ],
      calories: 713,
      proteinG: 86,
    },
  ],
  rest: [
    {
      slot: 'meal1',
      label: 'Bữa 1 - Trưa (Phá cỗ)',
      timeRange: '12:00 - 12:45',
      startHour: 12,
      startMinute: 0,
      items: [
        { name: '4 lòng trắng trứng luộc', calories: 68 },
        { name: '2 quả trứng luộc nguyên quả', calories: 143 },
        { name: '80g xúc xích gà nạc áp chảo', calories: 120 },
        { name: '1 hũ sữa chua không đường', calories: 60 },
        { name: '30g yến mạch cán vỡ + 1/2 quả chuối chín', calories: 165 },
        { name: '8 hạt hạnh nhân', calories: 55 },
      ],
      calories: 611,
      proteinG: 50,
    },
    {
      slot: 'meal2',
      label: 'Bữa 2 - Chiều',
      timeRange: '15:30 - 16:00',
      startHour: 15,
      startMinute: 30,
      items: [
        { name: '200g lườn gà / thăn bò / phi lê cá', calories: 330 },
        { name: '20g miến khô (hoặc 80g cơm gạo lứt)', calories: 65 },
        { name: 'Rau củ hấp', calories: 40 },
      ],
      calories: 435,
      proteinG: 60,
    },
    {
      slot: 'meal3',
      label: 'Bữa 3 - Tối',
      timeRange: '19:15 - 20:00',
      startHour: 19,
      startMinute: 15,
      items: [
        { name: '200g ức gà / phi lê cá', calories: 330 },
        { name: '120g khoai lang luộc', calories: 104 },
        { name: 'Salad rau củ lớn', calories: 40 },
        { name: '200ml sữa tươi tách béo không đường', calories: 70 },
      ],
      calories: 544,
      proteinG: 74,
    },
  ],
};

export const DEFAULT_WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'morning-swim-incline',
    label: 'Tập sáng (Bụng đói) - Bơi lội / Đi bộ dốc',
    timeRange: '06:30 - 07:15',
    durationMin: 45,
    caloriesBurned: 420,
    description:
      'Bơi lội (đi bộ nước + bơi ếch + đập chân phao + bơi sải) HOẶC đi bộ dốc Incline 12-15%, tốc độ 3.5-4.0 km/h.',
    steps: [
      { label: 'Khởi động', instruction: 'Đi bộ nhẹ hoặc bơi thả lỏng làm nóng cơ.', durationMin: 5, caloriesBurned: 35 },
      {
        label: 'Bài chính',
        instruction: 'Bơi lội (đi bộ nước + bơi ếch + đập chân phao + bơi sải) HOẶC đi bộ dốc Incline 12-15%, tốc độ 3.5-4.0 km/h.',
        durationMin: 35,
        caloriesBurned: 350,
      },
      { label: 'Thả lỏng', instruction: 'Giảm tốc độ dần, hít thở sâu, giãn cơ nhẹ.', durationMin: 5, caloriesBurned: 35 },
    ],
    reminderSlot: 'morning',
    startHour: 6,
    startMinute: 30,
  },
  {
    id: 'evening-cardio-machine',
    label: 'Tập chiều - Cardio máy tập',
    timeRange: '17:30 - 18:15',
    durationMin: 45,
    caloriesBurned: 380,
    description: '25 phút đi bộ dốc Incline 10-12% (4.0 km/h) + 20 phút Elliptical hoặc xe đạp tựa lưng.',
    steps: [
      { label: 'Đi bộ dốc Incline', instruction: 'Đi bộ dốc Incline 10-12%, tốc độ 4.0 km/h.', durationMin: 25, caloriesBurned: 211 },
      { label: 'Elliptical / xe đạp tựa lưng', instruction: 'Elliptical hoặc xe đạp tựa lưng, nhịp độ vừa phải.', durationMin: 20, caloriesBurned: 169 },
    ],
    reminderSlot: 'evening',
    startHour: 17,
    startMinute: 30,
  },
  {
    id: 'swim-detailed',
    label: 'Buổi bơi chi tiết (khởi động - chính - thả lỏng)',
    timeRange: '45 phút',
    durationMin: 45,
    caloriesBurned: 399,
    description:
      '10p đi bộ dưới nước, 15p bơi ếch, 10p đập chân với phao, 5p bơi sải tốc độ nhanh, 5p thả lỏng vẩy tay chân dưới nước.',
    steps: [
      { label: 'Đi bộ dưới nước', instruction: 'Đi bộ dưới nước khởi động.', durationMin: 10, caloriesBurned: 89 },
      { label: 'Bơi ếch', instruction: 'Bơi ếch nhịp độ vừa phải.', durationMin: 15, caloriesBurned: 133 },
      { label: 'Đập chân với phao', instruction: 'Đập chân với phao, tập trung cơ chân.', durationMin: 10, caloriesBurned: 89 },
      { label: 'Bơi sải tốc độ nhanh', instruction: 'Bơi sải với tốc độ nhanh.', durationMin: 5, caloriesBurned: 44 },
      { label: 'Thả lỏng', instruction: 'Vẩy tay chân dưới nước thả lỏng.', durationMin: 5, caloriesBurned: 44 },
    ],
  },
];

export const WATER_QUICK_ADD_ML = [250, 500, 1000];

export const CARB_SWAP_OPTIONS = [
  '150g khoai lang luộc',
  '180g khoai tây luộc/nghiền (không bơ, không kem)',
  '120g cơm gạo lứt (hoặc cơm trắng / quinoa)',
  '40g miến khô (ngâm nở)',
  '35g yến mạch cán vỡ',
  '1.5 lát bánh mì nguyên cám',
];

export const PROTEIN_SWAP_OPTIONS = [
  '140g ức gà / lườn gà không da',
  '140g thịt thăn bò nạc',
  '140g thịt thăn heo nạc (bỏ sạch mỡ)',
  '160g tôm tươi bóc vỏ',
  '170g phi-lê cá (diêu hồng, cá chẽm, cá thu, cá ngừ)',
  '4 lòng trắng + 2 quả trứng nguyên',
];

export const DEFAULT_SHOPPING_LIST: ShoppingListItem[] = [
  { category: 'Đạm (Protein)', name: 'Ức gà / lườn gà tươi (không da)', amountPerWeek: '400g/ngày tập x4 + 350g/ngày nghỉ x3', quantityToBuy: '2.7 - 3.0 kg', estimatedPriceVnd: 195000 },
  { category: 'Đạm (Protein)', name: 'Trứng gà', amountPerWeek: '8 quả/ngày tập x4 + 6 quả/ngày nghỉ x3', quantityToBuy: '45 quả (4.5 vỉ)', estimatedPriceVnd: 145000 },
  { category: 'Đạm (Protein)', name: 'Xúc xích gà nạc áp chảo', amountPerWeek: '120g x4 ngày + 80g x3 ngày', quantityToBuy: '700g (~2-3 gói)', estimatedPriceVnd: 150000 },
  { category: 'Đạm (Protein)', name: 'Sữa tươi tách béo không đường', amountPerWeek: '200ml x 7 ngày = 1.4L', quantityToBuy: '2 hộp (1L/hộp)', estimatedPriceVnd: 85000 },
  { category: 'Đạm (Protein)', name: 'Sữa chua không đường', amountPerWeek: '1 hũ x 7 ngày', quantityToBuy: '2 lốc (8 hũ)', estimatedPriceVnd: 60000 },
  { category: 'Tinh bột & hạt', name: 'Bánh mì nguyên cám', amountPerWeek: '1 lát x 4 ngày', quantityToBuy: '1 ổ / túi (250g)', estimatedPriceVnd: 35000 },
  { category: 'Tinh bột & hạt', name: 'Yến mạch cán vỡ', amountPerWeek: '30g x 7 ngày = 210g', quantityToBuy: '1 túi (500g)', estimatedPriceVnd: 50000 },
  { category: 'Tinh bột & hạt', name: 'Miến dong khô', amountPerWeek: '40g x4 + 20g x3 = 220g', quantityToBuy: '1 gói (300g)', estimatedPriceVnd: 40000 },
  { category: 'Tinh bột & hạt', name: 'Khoai tây & khoai lang tươi', amountPerWeek: '180g x4 + 120g x3 = 1.08kg', quantityToBuy: '1.5 kg', estimatedPriceVnd: 45000 },
  { category: 'Tinh bột & hạt', name: 'Chuối chín', amountPerWeek: '1/2 quả x 7 ngày', quantityToBuy: '1 nải (~1kg)', estimatedPriceVnd: 25000 },
  { category: 'Tinh bột & hạt', name: 'Hạt hạnh nhân sấy mộc', amountPerWeek: '8 hạt x 7 ngày (~70g)', quantityToBuy: '1 hũ (150-200g)', estimatedPriceVnd: 70000 },
  { category: 'Rau củ & phụ liệu', name: 'Rau cải (cải ngọt/cải thìa)', amountPerWeek: 'Nấu miến gà x 7 ngày', quantityToBuy: '1.5 kg', estimatedPriceVnd: 35000 },
  { category: 'Rau củ & phụ liệu', name: 'Dưa chuột (dưa leo)', amountPerWeek: 'Salad x 7 ngày', quantityToBuy: '1.5 kg', estimatedPriceVnd: 30000 },
  { category: 'Rau củ & phụ liệu', name: 'Cà chua & hành tây', amountPerWeek: 'Salad x 7 ngày', quantityToBuy: '1.0 kg', estimatedPriceVnd: 30000 },
  { category: 'Rau củ & phụ liệu', name: 'Mộc nhĩ, gừng, tỏi, hành lá', amountPerWeek: 'Nấu nước dùng miến gà', quantityToBuy: '1 phần nhỏ', estimatedPriceVnd: 25000 },
  { category: 'Rau củ & phụ liệu', name: 'Cà phê đen phin/gói không đường', amountPerWeek: 'Uống sáng x 7 ngày', quantityToBuy: '1 hộp/túi', estimatedPriceVnd: 45000 },
];

export const DEFAULT_PLAN: PlanData = {
  mealTemplates: DEFAULT_MEAL_TEMPLATES,
  workoutTemplates: DEFAULT_WORKOUT_TEMPLATES,
  shoppingList: DEFAULT_SHOPPING_LIST,
  waterSchedule: DEFAULT_WATER_SCHEDULE,
};

export function shoppingListTotalVnd(shoppingList: ShoppingListItem[]): number {
  return shoppingList.reduce((sum, item) => sum + item.estimatedPriceVnd, 0);
}
