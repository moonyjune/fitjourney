import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: jest.fn(async () => 'file:///docs/p.jpg'),
  deletePersistedPhoto: jest.fn(async () => undefined),
  imageUriToBase64: jest.fn(async (uri: string) => ({ base64: `B64:${uri}`, mediaType: 'image/jpeg' })),
}));
jest.mock('../../utils/pickPhoto', () => ({ pickPhoto: jest.fn(), pickPhotos: jest.fn() }));
type Outcome = { ok: true; result: Record<string, unknown> };
const mockText = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushFeelingRecord: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
  requestMealText: (...a: unknown[]) => mockText(...a),
  requestPhotoAnalysis: jest.fn(),
}));

import AddFoodScreen from '../../../app/add-food';
import { accuracyLevel, cleanAccuracyWhy, explainAccuracy, foodAccuracyOf, mentionsAmount, pickTips, readFoodAccuracy, MAX_TIPS } from '../../ai/accuracyWhy';
import { cleanLabel } from '../../ai/nutritionLabel';
import { fakeMealText, fakeNutritionLabel, fakePhotoAnalysis } from '../../ai/devPhotoAnalysis';
import { photoResultToMealText } from '../../food/photoResult';
import { AccuracyBadge } from '../../components/quest/AccuracyInfo';
import { ACCURACY_WHY_PROMPT, ACCURACY_WHY_PROPERTY } from '../../../supabase/functions/_shared/coach';
import { buildMealTextPrompt } from '../../../supabase/functions/_shared/mealText';
import { formatGameText } from '../strings';
import { saveMeal, tap, typeIn, ANALYZE } from '../../testing/mealFlow';
import { useAiCalibrationStore } from '../../store/useAiCalibrationStore';
import { useFoodDbStore } from '../../store/useFoodDbStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const vi = (k: Parameters<typeof formatGameText>[1], p?: Record<string, string | number>) => formatGameText('vi', k, p);
const lineText = (l: { key: Parameters<typeof formatGameText>[1]; params?: Record<string, string | number> } | { text: string }) =>
  'text' in l ? l.text : vi(l.key, l.params);

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}

describe('accuracy tooltip: content (pure)', () => {
  it('levels: Cao ≥85, Khá 70–84, Trung bình 50–69, Thấp <50', () => {
    expect([100, 85, 84, 70, 69, 50, 49, 0].map(accuracyLevel)).toEqual(['high', 'high', 'good', 'good', 'fair', 'fair', 'low', 'low']);
    expect(accuracyLevel(null)).toBeNull();
    expect(accuracyLevel(NaN)).toBeNull();
  });

  it('cleans the AI reasons: strings only, at most 3 per list, 60 characters, no duplicates; nothing → undefined', () => {
    const long = 'x'.repeat(80);
    const why = cleanAccuracyWhy({ up: ['  Đọc   rõ nhãn ', 'Đọc rõ nhãn', 5, '', 'a', 'b', 'c'], down: [long], missing: 'no' });
    expect(why?.up).toEqual(['Đọc rõ nhãn', 'a', 'b']);
    expect(why?.down[0]).toHaveLength(60);
    expect(why?.down[0].endsWith('…')).toBe(true);
    expect(why?.missing).toEqual([]);
    expect(cleanAccuracyWhy({ up: [], down: [] })).toBeUndefined();
    expect(cleanAccuracyWhy('x')).toBeUndefined();
    expect(cleanAccuracyWhy(null)).toBeUndefined();
  });

  it('the AI reasons come first; its missing phrases can be added to the notes', () => {
    const e = explainAccuracy({ pct: 72, source: 'photo', why: { up: ['Thấy rõ khẩu phần, có thìa để so'], down: ['Không thấy lượng dầu'], missing: ['Khối lượng cơm (g)'] }, photos: 1 });
    expect(e.level).toBe('good');
    expect(e.up.map(lineText)).toEqual(['Thấy rõ khẩu phần, có thìa để so']);
    expect(e.down.map(lineText)).toEqual(['Không thấy lượng dầu']);
    expect(e.missing).toEqual([{ line: { text: 'Khối lượng cơm (g)' }, action: 'notes', prefill: 'Khối lượng cơm (g)' }]);
  });

  it('falls back to what the app knows: database, label, photo only, text without grams, notes given', () => {
    const db = explainAccuracy({ pct: null, source: 'db' });
    expect(db.level).toBeNull();
    expect(db.up.map(lineText)).toEqual(['Lấy từ cơ sở dữ liệu món ăn – số liệu chuẩn']);
    expect(db.missing).toEqual([]);

    const label = explainAccuracy({ pct: 60, source: 'label', photos: 1 });
    expect(label.up.map(lineText)).toEqual(['Đọc từ nhãn dinh dưỡng']);
    expect(label.down.map(lineText)).toEqual([vi('accWhy.down.labelBlur')]);
    expect(label.missing.map((m) => m.action)).toEqual(['amount']);
    expect(explainAccuracy({ pct: 92, source: 'label' }).down).toEqual([]);

    const photo = explainAccuracy({ pct: 55, source: 'photo', photos: 2 });
    expect(photo.up.map(lineText)).toEqual([vi('accWhy.up.photo'), 'Có 2 ảnh của cùng bữa']);
    expect(photo.down.map(lineText)).toEqual([vi('accWhy.down.photoOnly')]);
    expect(photo.missing.map((m) => m.action)).toEqual(['amount', 'notes']);

    const text = explainAccuracy({ pct: 45, source: 'text', hasText: true });
    expect(text.level).toBe('low');
    expect(text.down.map(lineText)).toEqual([vi('accWhy.down.noPhoto'), vi('accWhy.down.noGrams')]);

    const precise = explainAccuracy({ pct: 80, source: 'text', hasText: true, gramsGiven: true, notesGiven: true });
    expect(precise.up.map(lineText)).toEqual([vi('accWhy.up.grams'), vi('accWhy.up.notes')]);
    expect(precise.missing).toEqual([]);
    expect(precise.tips).not.toContain('accTip.text.grams');

    const idea = explainAccuracy({ pct: 70, source: 'idea' });
    expect(idea.down.map(lineText)).toEqual([vi('accWhy.down.idea')]);
    expect(idea.missing).toEqual([]);
  });

  it('tips: at most 4, tailored and most useful first', () => {
    const photo = pickTips('photo', { photos: 1, grams: false, notes: false, hasText: false, pct: 50 });
    expect(photo).toHaveLength(MAX_TIPS);
    expect(photo[0]).toBe('accTip.photo.scale');
    expect(photo).toContain('accTip.text.grams');
    expect(pickTips('photo', { photos: 1, grams: true, notes: true, hasText: true, pct: 50 })).toEqual(['accTip.photo.scale', 'accTip.photo.angle', 'accTip.photo.frame', 'accTip.photo.before']);
    expect(pickTips('text', { photos: 0, grams: false, notes: false, hasText: true, pct: 50 })[0]).toBe('accTip.text.grams');
    expect(pickTips('text', { photos: 0, grams: true, notes: false, hasText: true, pct: 50 })).toEqual(['accTip.text.cook', 'accTip.text.fat', 'accTip.text.photo']);
    expect(pickTips('text', { photos: 2, grams: true, notes: true, hasText: true, pct: 50 })[0]).toBe('accTip.photo.scale');
    expect(pickTips('label', { photos: 1, grams: false, notes: false, hasText: false, pct: 50 })[0]).toBe('accTip.label.straight');
    expect(pickTips('db', { photos: 0, grams: false, notes: false, hasText: false, pct: null })).toEqual(['accTip.db.amount', 'accTip.db.cook']);
    for (const s of ['photo', 'text', 'label', 'db', 'idea', 'swap'] as const) {
      const tips = pickTips(s, { photos: 0, grams: false, notes: false, hasText: false, pct: 50 });
      expect(tips.length).toBeLessThanOrEqual(MAX_TIPS);
      expect(new Set(tips).size).toBe(tips.length);
      for (const t of tips) expect(vi(t).length).toBeGreaterThan(0);
    }
  });

  it('detects weights and volumes in a description', () => {
    expect(mentionsAmount('cơm 150g, canh 200 ml')).toBe(true);
    expect(mentionsAmount('0,5 kg thịt')).toBe(true);
    expect(mentionsAmount('1 bát phở bò')).toBe(false);
    expect(mentionsAmount('')).toBe(false);
  });

  it('what is kept with a logged food survives a round trip and rejects junk', () => {
    const kept = foodAccuracyOf({ pct: 71.6, source: 'text', why: { up: ['a'], down: [], missing: [] }, photos: 0, hasText: true, gramsGiven: false });
    expect(kept).toEqual({ pct: 72, source: 'text', why: { up: ['a'], down: [], missing: [] }, hasText: true });
    expect(readFoodAccuracy(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
    expect(foodAccuracyOf({ pct: null, source: 'db' })).toEqual({ pct: null, source: 'db' });
    expect(foodAccuracyOf({ pct: null, source: 'photo' })).toBeUndefined();
    expect(readFoodAccuracy({ pct: 50, source: 'nope' })).toBeUndefined();
    expect(readFoodAccuracy(undefined)).toBeUndefined();
  });
});

describe('accuracy tooltip: AI schema and dev fake', () => {
  const read = (name: string) => readFileSync(join(__dirname, '../../../supabase/functions', name, 'index.ts'), 'utf8');

  it('the shared accuracyWhy property has up / down / missing lists of at most 3 strings', () => {
    expect(ACCURACY_WHY_PROPERTY.type).toBe('object');
    for (const k of ['up', 'down', 'missing'] as const) {
      expect(ACCURACY_WHY_PROPERTY.properties[k]).toEqual({ type: 'array', maxItems: 3, items: { type: 'string' } });
    }
    expect(ACCURACY_WHY_PROPERTY.description).toContain('60');
    expect(ACCURACY_WHY_PROMPT).toContain('accuracyWhy');
  });

  it('photo, meal text and label tools carry it (optional: never required)', () => {
    for (const fn of ['analyze-proof-photo', 'parse-meal-text', 'read-nutrition-label']) {
      const src = read(fn);
      expect(src).toMatch(/accuracyWhy: (\{ \.\.\.)?ACCURACY_WHY_PROPERTY/);
      expect(src).not.toMatch(/required: \[[^\]]*'accuracyWhy'/);
    }
    expect(buildMealTextPrompt({ sentence: 'phở', notes: '', photoCount: 0, person: '', coachPrompt: '' })).toContain('accuracyWhy');
  });

  it('the dev fakes return sample reasons, and they reach the app through the label cleaner and the photo → text shape', () => {
    expect(cleanAccuracyWhy(fakePhotoAnalysis('meal').accuracyWhy)?.missing.length).toBeGreaterThan(0);
    expect(cleanAccuracyWhy(fakeMealText('phở bò').accuracyWhy)?.down.length).toBeGreaterThan(0);
    expect(cleanLabel(fakeNutritionLabel())?.accuracyWhy?.up.length).toBeGreaterThan(0);
    const viaPhoto = photoResultToMealText(fakePhotoAnalysis('meal') as never, 'Món');
    expect(cleanAccuracyWhy(viaPhoto.accuracyWhy)).toBeDefined();
  });
});

describe('accuracy tooltip: tapping the badge', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    useSettingsStore.setState({ language: 'vi' });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('opens the sheet with the %, the level, why, what is missing (with its action) and tips', async () => {
    const onAction = jest.fn();
    await act(async () => {
      renderer = create(
        <AccuracyBadge accuracy={{ pct: 64, source: 'photo', photos: 1, why: { up: ['Thấy rõ bát phở'], down: ['Không rõ lượng bánh'], missing: ['Khối lượng bánh phở (g)'] } }} onAction={onAction} testID="b" />
      );
    });
    const r = renderer!;
    expect(allText(r)).toContain('chính xác ~64% ⓘ');
    expect(allText(r)).not.toContain('Vì sao');
    const badge = r.root.findAll((n) => n.props.testID === 'b' && typeof n.props.onPress === 'function')[0];
    // Small text, but at least 44 pt to tap.
    const slop = badge.props.hitSlop as { top: number; bottom: number };
    expect(12 * 1.4 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    await act(async () => badge.props.onPress());
    const text = allText(r);
    for (const s of ['Chính xác ~64%', 'Mức: Trung bình', 'Vì sao', 'Thấy rõ bát phở', 'Không rõ lượng bánh', 'Còn thiếu', 'Khối lượng bánh phở (g)', 'Mẹo chụp để chính xác hơn', vi('accTip.photo.scale')]) {
      expect(text).toContain(s);
    }
    await tap(r, 'Thêm vào ghi chú: Khối lượng bánh phở (g)');
    expect(onAction).toHaveBeenCalledWith('notes', 'Khối lượng bánh phở (g)');
  });
});

describe('accuracy tooltip in Ghi bữa', () => {
  let renderer: ReactTestRenderer | undefined;
  const DATE = '2026-10-23';
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T12:10:00') });
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useWorkoutStore.setState({ entries: [] });
    useFoodDbStore.setState({ custom: [], overrides: {}, recent: [] });
    useAiCalibrationStore.getState().clear();
    useNutritionStore.setState({ logs: {} });
    mockText.mockResolvedValue({
      ok: true,
      result: {
        items: [{ name: 'Bún bò 1 bát (≈550 g)', caloriesKcal: 560, proteinG: 30, accuracyPercent: 58 }],
        accuracyPercent: 58,
        accuracyWhy: { up: ['Món quen, khẩu phần phổ biến'], down: ['Không rõ lượng thịt và nước dùng'], missing: ['Có ăn nước dùng không'] },
        reasoning: 'Giả định một bát vừa.',
      },
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('the meal badge opens the tooltip; "Thêm vào ghi chú" fills the notes; the reasons are saved with the food', async () => {
    await act(async () => {
      renderer = create(<AddFoodScreen />);
    });
    const r = renderer!;
    await typeIn(r, 'Món & lượng', '1 bát bún bò');
    await tap(r, ANALYZE);
    await tap(r, 'Độ chính xác ~58%: vì sao và mẹo để chính xác hơn');
    const text = allText(r);
    expect(text).toContain('Mức: Trung bình');
    expect(text).toContain('Không rõ lượng thịt và nước dùng');
    expect(text).toContain('Mẹo để chính xác hơn');
    expect(text).toContain(vi('accTip.text.grams'));
    expect(text).toContain('Phân tích lại với ghi chú');
    await tap(r, 'Thêm vào ghi chú: Có ăn nước dùng không');
    const notes = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === 'Ghi chú cho AI')[0];
    expect(notes.props.value).toBe('Có ăn nước dùng không: ');
    await saveMeal(r);
    const item = useNutritionStore.getState().logs[DATE]?.extraItems?.[0];
    expect(item?.accuracy).toEqual({
      pct: 58,
      source: 'text',
      why: { up: ['Món quen, khẩu phần phổ biến'], down: ['Không rõ lượng thịt và nước dùng'], missing: ['Có ăn nước dùng không'] },
      hasText: true,
    });
  });
});
