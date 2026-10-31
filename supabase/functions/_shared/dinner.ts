// Sanitising of the dinner request the client sends (what is left of today's calories, protein and limits, the usual foods):
// bounded numbers and short names only, so a bad client can't put instructions into the prompt. Pure (no Deno use),
// unit-tested in jest.

const bounded = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : undefined;

/** A name for the prompt: no angle brackets or line breaks, trimmed, short. (Same rule as `cleanName` in swap.ts; kept as its own
 *  copy because the shared files import nothing from each other, which keeps them loadable by both Deno and the app's tests.) */
function cleanName(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'meal'];

export interface DinnerRequest {
  budgetKcal: number;
  proteinLeftG: number;
  headroom: { purine: number; salt: number; sugar: number };
  limits: { purine: number; salt: number; sugar: number };
  hour: number;
  /** Which meal it is for (absent counts as dinner), and the hour it should be eaten by. */
  meal: 'breakfast' | 'lunch' | 'dinner' | 'meal';
  eatByHour: number;
  /** The user set the calories (and maybe protein) wanted for this meal: the figures are targets to land within ±10% of. */
  exact: boolean;
  proteinExact: boolean;
  /** Never more calories than `budgetKcal`. */
  strictKcal: boolean;
  favorites: string[];
  /** Dishes already known to the user (the cook book and the ideas just shown): the model must propose others. */
  avoid: string[];
  /** A snack, drink or dessert rather than a meal: up to `budgetKcal`, no protein asked for. */
  snack?: boolean;
  /** What the user asked for on the cook book screen (meal, craving, kind of dish, ingredients), when any. */
  filters?: DinnerFilters;
}

/** The request as a clean object, or null when it is unusable (no budget figure or hour). */
export function cleanDinnerRequest(raw: unknown): DinnerRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const budgetKcal = bounded(r.budgetKcal, 0, 10000);
  const hour = bounded(r.hour, 0, 23);
  if (budgetKcal === undefined || hour === undefined) return null;
  const num = (v: unknown, max: number) => bounded(v, 0, max) ?? 0;
  const head = (v: unknown) => bounded(v, -100000, 100000) ?? 0;
  const filters = cleanDinnerFilters(r.filters);
  return {
    budgetKcal,
    proteinLeftG: num(r.proteinLeftG, 1000),
    headroom: { purine: head(r.headroom?.purine), salt: head(r.headroom?.salt), sugar: head(r.headroom?.sugar) },
    limits: { purine: num(r.limits?.purine, 20000), salt: num(r.limits?.salt, 200), sugar: num(r.limits?.sugar, 1000) },
    hour,
    meal: MEALS.includes(r.meal) ? r.meal : 'dinner',
    eatByHour: bounded(r.eatByHour, 0, 24) ?? Math.min(24, hour + 3),
    exact: r.exact === true,
    proteinExact: r.proteinExact === true,
    strictKcal: r.strictKcal === true,
    avoid: (Array.isArray(r.avoidNames) ? r.avoidNames : []).map((f: unknown) => cleanName(f, 80)).filter(Boolean).slice(0, 40),
    favorites: (Array.isArray(r.favorites) ? r.favorites : []).map((f: unknown) => cleanName(f, 60)).filter(Boolean).slice(0, 8),
    ...(r.snack === true ? { snack: true } : {}),
    ...(filters ? { filters } : {}),
  };
}

// ===== Cookbook filters =====
// The cook book screen lets the user pick what they feel like: the occasion, a craving, a kind of dish and ingredients to use or avoid.
// The choices travel as ids (turned into words here, so nothing typed reaches the prompt but ingredient names, cleaned like any name).
// The app imports these lists too, for its chips and its own offline matching.

export const OCCASION_IDS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'coffee', 'dessert'] as const;
export const CRAVING_IDS = ['sweet', 'salty', 'sourSpicy', 'crunchy', 'fresh', 'warm', 'highProtein', 'lowCal'] as const;
export const DISH_TYPE_IDS = ['soup', 'rice', 'noodle', 'salad', 'grilled', 'steamed', 'smoothie', 'tea', 'cake'] as const;
export type OccasionId = (typeof OCCASION_IDS)[number];
export type CravingId = (typeof CRAVING_IDS)[number];
export type DishTypeId = (typeof DISH_TYPE_IDS)[number];

export interface DinnerFilters {
  occasions: OccasionId[];
  cravings: CravingId[];
  types: DishTypeId[];
  /** Ingredients the user has and wants used. */
  have: string[];
  /** Ingredients the user does not want. */
  avoid: string[];
}

export const OCCASION_WORDS: Record<OccasionId, string> = {
  breakfast: 'bữa sáng',
  lunch: 'bữa trưa',
  dinner: 'bữa tối',
  snack: 'món ăn vặt',
  drink: 'đồ uống',
  coffee: 'cà phê',
  dessert: 'món tráng miệng / đồ ngọt',
};
export const CRAVING_WORDS: Record<CravingId, string> = {
  sweet: 'vị ngọt (ít đường, ưu tiên ngọt tự nhiên)',
  salty: 'vị mặn đậm đà (vẫn ít muối)',
  sourSpicy: 'chua cay',
  crunchy: 'giòn',
  fresh: 'mát, nhẹ bụng',
  warm: 'nóng, ấm bụng',
  highProtein: 'nhiều đạm',
  lowCal: 'ít calo',
};
export const DISH_TYPE_WORDS: Record<DishTypeId, string> = {
  soup: 'món nước / canh / súp',
  rice: 'món cơm',
  noodle: 'bún / phở / mì / miến',
  salad: 'salad / gỏi / nộm',
  grilled: 'nướng / áp chảo',
  steamed: 'hấp / luộc',
  smoothie: 'sinh tố / nước ép',
  tea: 'trà',
  cake: 'bánh',
};

const pickIds = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? allowed.filter((id) => v.includes(id)) : []);

function ingredientNames(v: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    const name = cleanName(raw, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === 10) break;
  }
  return out;
}

/** The filters as a clean object (known ids only, at most 10 short ingredient names each way), or null when nothing is chosen. */
export function cleanDinnerFilters(raw: unknown): DinnerFilters | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const f: DinnerFilters = {
    occasions: pickIds(r.occasions, OCCASION_IDS),
    cravings: pickIds(r.cravings, CRAVING_IDS),
    types: pickIds(r.types, DISH_TYPE_IDS),
    have: ingredientNames(r.have),
    avoid: ingredientNames(r.avoid),
  };
  return f.occasions.length + f.cravings.length + f.types.length + f.have.length + f.avoid.length > 0 ? f : null;
}

/** What the user is looking for, in words for the prompt, plus the low-purine rules every idea then follows. Empty without filters. */
export function filtersPrompt(f: DinnerFilters | undefined): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.occasions.length) parts.push(`Dịp: ${f.occasions.map((id) => OCCASION_WORDS[id]).join(', ')}.`);
  if (f.cravings.length) parts.push(`Người dùng đang thèm: ${f.cravings.map((id) => CRAVING_WORDS[id]).join(', ')}.`);
  if (f.types.length) parts.push(`Kiểu món muốn: ${f.types.map((id) => DISH_TYPE_WORDS[id]).join(', ')}.`);
  if (f.have.length) parts.push(`Nguyên liệu có sẵn, hãy dùng (ít nhất một thứ trong mỗi món): ${f.have.join('; ')}.`);
  if (f.avoid.length) parts.push(`KHÔNG dùng các nguyên liệu: ${f.avoid.join('; ')}.`);
  return (
    ` Yêu cầu của người dùng (hãy bám sát; không khớp hết được thì chọn món gần nhất): ${parts.join(' ')}` +
    ' Người dùng cần giữ purine thấp: ưu tiên nguyên liệu ít purine, không dùng nội tạng (gan, lòng, tim, cật, óc), cá nhỏ nhiều purine (cá cơm, cá mòi, cá trích), ' +
    'hải sản có vỏ, nước dùng xương hầm lâu, bia rượu; nếu nguyên liệu người dùng chọn giàu purine (hải sản, thịt đỏ, nấm...) thì dùng lượng nhỏ và ghi cảnh báo purine trong how.'
  );
}

const MEAL_WORD: Record<string, string> = { breakfast: 'bữa sáng', lunch: 'bữa trưa', dinner: 'bữa tối', meal: 'bữa ăn' };

/** The user message of suggest-dinner, from a clean request. */
export function dinnerPrompt(req: DinnerRequest): string {
  const light = req.budgetKcal < 150;
  const occasions = req.filters?.occasions ?? [];
  const word = req.snack ? (occasions.length ? occasions.map((id) => OCCASION_WORDS[id]).join(' / ') : 'món ăn vặt / đồ uống') : MEAL_WORD[req.meal];
  const snackCap = Math.round(Math.max(req.budgetKcal, 60) * (req.strictKcal ? 1 : 1.1));
  return (
    `Bây giờ là ${req.hour}h. Phần dành cho ${word} này khoảng ${Math.round(req.budgetKcal)} kcal và ${Math.round(req.proteinLeftG)} g đạm. ` +
    `Phần còn lại của các giới hạn trong bữa này (âm hoặc 0 nghĩa là đã đầy): purine ${req.headroom.purine} mg, muối ${req.headroom.salt} g, đường ${req.headroom.sugar} g.\n` +
    (req.snack
      ? `Đây KHÔNG phải bữa chính: hãy gợi ý đúng 3 ${word} khác nhau, con số cho MỘT phần: calo KHÔNG ĐƯỢC vượt ${snackCap} kcal (càng nhẹ càng tốt), không cần đủ đạm, ` +
        `mỗi chất nằm trong phần còn lại (phần còn lại ≤ 0 thì gần như không có chất đó); đồ uống ít hoặc không đường.`
      : light
        ? `Ngân sách calo gần hết: gợi ý đúng 3 ${word} RẤT NHẸ (dưới 200 kcal, ví dụ rau luộc, canh rau, đạm nạc ít), vẫn nằm trong các giới hạn.`
        : req.exact
          ? `Hãy gợi ý đúng 3 món khác nhau cho ${word}, con số cho MỘT khẩu phần: người dùng muốn đúng khoảng ${Math.round(req.budgetKcal)} kcal, ` +
            (req.strictKcal
              ? `KHÔNG ĐƯỢC vượt ${Math.round(req.budgetKcal)} kcal (trong khoảng ${Math.round(req.budgetKcal * 0.8)}-${Math.round(req.budgetKcal)} kcal), `
              : `lệch không quá 10% (${Math.round(req.budgetKcal * 0.9)}-${Math.round(req.budgetKcal * 1.1)} kcal), `) +
            (req.proteinExact
              ? `đạm khoảng ${Math.round(req.proteinLeftG)} g (lệch không quá 10%: ${Math.round(req.proteinLeftG * 0.9)}-${Math.round(req.proteinLeftG * 1.1)} g), `
              : `đạm càng gần ${Math.round(req.proteinLeftG)} g càng tốt, `) +
            `mỗi chất nằm trong phần còn lại (phần còn lại ≤ 0 thì gần như không có chất đó).`
          : `Hãy gợi ý đúng 3 món khác nhau cho ${word}, con số cho MỘT khẩu phần: calo ${req.strictKcal ? 'KHÔNG ĐƯỢC vượt' : 'không quá'} ${Math.round(req.strictKcal ? req.budgetKcal : req.budgetKcal * 1.1)} kcal và khoảng ${Math.round(req.budgetKcal * 0.6)}-${Math.round(req.budgetKcal)} kcal, ` +
            `đạm càng gần ${Math.round(req.proteinLeftG)} g càng tốt (ít nhất ${Math.round(Math.min(req.proteinLeftG * 0.6, 30))} g), ` +
            `mỗi chất nằm trong phần còn lại (phần còn lại ≤ 0 thì gần như không có chất đó).`) +
    ` Món đúng kiểu ${word}, đơn giản, ít dụng cụ, nguyên liệu dễ mua ở chợ hoặc siêu thị Việt Nam, ăn xong trước ${req.eatByHour}h.` +
    filtersPrompt(req.filters) +
    (req.favorites.length ? ` Món người dùng hay ăn (để hợp khẩu vị, nhưng đừng lặp lại y nguyên): ${req.favorites.join('; ')}.` : '') +
    (req.avoid.length ? ` Người dùng đã có các món này, hãy đề xuất MÓN KHÁC, không trùng: ${req.avoid.join('; ')}.` : '') +
    ` Với mỗi món ghi đủ nguyên liệu (cho một khẩu phần), các bước nấu ngắn gọn, thời gian nấu, độ khó và dụng cụ. Ghi accuracyPercent cho từng món. Gọi tool report_dinner_ideas.`
  );
}
