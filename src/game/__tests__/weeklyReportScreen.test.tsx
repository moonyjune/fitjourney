import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

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
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

type Outcome = { ok: true; report: unknown; cached: boolean; generatedAtISO?: string } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'quota' | 'disabled' | 'generic' };
const mockRequest = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
const mockFetch = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
  requestWeeklyReport: (...a: unknown[]) => mockRequest(...a),
  fetchWeeklyReport: (...a: unknown[]) => mockFetch(...a),
}));

import WeeklyReportScreen from '../../../app/weekly-report';
import { AI_AUTO_DEBOUNCE_MS, AI_AUTO_MIN_GAP_MS, WeeklyReportAutoRefresh } from '../../ai/useWeeklyReportAutoRefresh';
import { buildWeeklyReportInput, weekInputFingerprint } from '../../ai/weeklyReport';
import { resetAnalysisStore, useAnalysisStore } from '../../store/useAnalysisStore';
import { useAiReportStore } from '../../store/useAiReportStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

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
const press = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const f = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
  if (!f) throw new Error(`no pressable "${label}"`);
  return f;
};

const REPORT = {
  headline: 'Tuần này boss còn nhiều máu.',
  causes: [{ date: '2026-10-20', text: 'Ăn pizza lúc 21h.' }],
  patterns: ['Ăn sau 20h ở 2 ngày.'],
  weightNote: 'Cân giảm ít hơn dự kiến vì giữ nước.',
  nextWeek: [{ action: 'Ăn xong trước 20h.', why: 'Giữ thâm hụt.' }, { action: 'Ghi đủ món.' }, { action: 'Uống đủ nước.' }],
  encouragement: 'Vẫn kịp.',
};

describe('Weekly review screen', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<WeeklyReportScreen />);
    });
    return renderer!;
  };
  const day = (date: string, kcal: number) => ({ dateISO: date, mealsEaten: {}, extraCalories: kcal, extraProteinG: 100, extraItems: [{ id: `i-${date}`, name: 'x', calories: kcal, proteinG: 100, loggedAtISO: `${date}T12:00:00`, mealTime: 'lunch' as const }], waterMl: 3000 });

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, startWeightKg: 106, startDateISO: '2026-10-01T08:00:00' });
    useLimitsStore.setState({ purineMg: 1200, saltG: 7, sugarG: 25 });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [{ id: 'a', dateISO: '2026-10-18T06:00:00', weightKg: 106 }, { id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 105.2 }] });
    useNutritionStore.setState({ logs: { '2026-10-19': day('2026-10-19', 1500), '2026-10-22': day('2026-10-22', 1800) } });
    useAiReportStore.setState({ weekly: {} });
    resetAnalysisStore();
    mockFetch.mockResolvedValue(null);
    mockRequest.mockResolvedValue({ ok: true, report: REPORT, cached: false });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('shows this week\'s numbers (computed here, not by the AI) before any analysis', async () => {
    const r = await mount();
    const text = allText(r);
    expect(text).toContain('Tổng kết tuần');
    expect(text.toUpperCase()).toContain('19/10 – 23/10');
    expect(text).toContain('Boss còn 5000/7700 máu · đã gây 2700'); // 1500 (capped) + 1200
    expect(text).toContain('Đã ghi 2/5 ngày');
    expect(text).toContain('thâm hụt TB 1350 kcal/ngày (mục tiêu 1100)');
    expect(text).toContain('Cân nặng -0.8 kg · dự kiến theo thâm hụt -0.4 kg');
    expect(text).toContain('Phân tích tuần bằng AI');
    expect(mockRequest).not.toHaveBeenCalled(); // opening the screen costs nothing
  });

  it('asks for the review of this week (not forced to refresh), shows it, and stores it for next time', async () => {
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    const [week, period, refresh] = mockRequest.mock.calls[0] as [Record<string, any>, string, boolean];
    expect(period).toBe('2026-10-19');
    expect(refresh).toBe(false);
    expect(week.boss).toMatchObject({ damageSoFar: 2700, hpLeft: 5000 });
    const text = allText(r);
    expect(text).toContain('Tuần này boss còn nhiều máu.');
    expect(text).toContain('• 20/10: Ăn pizza lúc 21h.');
    expect(text).toContain('• Ăn sau 20h ở 2 ngày.');
    expect(text).toContain('Cân giảm ít hơn dự kiến vì giữ nước.');
    expect(text).toContain('1. Ăn xong trước 20h.');
    expect(text).toContain('Giữ thâm hụt.');
    expect(text).toContain('3. Uống đủ nước.');
    expect(text).toContain('Vẫn kịp.');
    expect(text).toContain('không thay thế bác sĩ');
    expect(text).toContain('Làm mới phân tích');
    expect(useAiReportStore.getState().weekly['2026-10-19'].report.headline).toBe('Tuần này boss còn nhiều máu.');
  });

  it('opens a stored review without any request, and refreshing asks the server for a new one', async () => {
    useAiReportStore.getState().saveWeekly('2026-10-19', { headline: 'Đã lưu từ trước', causes: [], patterns: ['Thói quen cũ'], nextWeek: [] }, '2026-10-21T08:30:00.000Z');
    const r = await mount();
    expect(allText(r)).toContain('Đã lưu từ trước');
    expect(allText(r)).toContain('Viết lúc 21/10');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled(); // already on this device
    await act(async () => press(r, 'Làm mới phân tích').props.onPress());
    expect(mockRequest.mock.calls[0][2]).toBe(true);
    expect(allText(r)).toContain('Tuần này boss còn nhiều máu.');
  });

  it('fetches the review another device saved when this device has none', async () => {
    mockFetch.mockResolvedValue({ report: { headline: 'Từ máy khác', causes: [], patterns: ['Muộn'], nextWeek: [] }, generatedAtISO: '2026-10-22T10:00:00.000Z' });
    const r = await mount();
    expect(mockFetch).toHaveBeenCalledWith('2026-10-19');
    expect(allText(r)).toContain('Từ máy khác');
    expect(useAiReportStore.getState().weekly['2026-10-19'].generatedAtISO).toBe('2026-10-22T10:00:00.000Z');
  });

  it('ignores a fetched review that is not usable', async () => {
    mockFetch.mockResolvedValue({ report: { headline: '' }, generatedAtISO: '2026-10-22T10:00:00.000Z' });
    await mount();
    expect(useAiReportStore.getState().weekly['2026-10-19']).toBeUndefined();
  });

  it.each([
    ['notConfigured', 'AI chưa được thiết lập'],
    ['quota', 'hết lượt AI hôm nay'],
    ['disabled', 'AI đang tắt'],
    ['offline', 'Không có mạng'],
  ] as Array<['notConfigured' | 'quota' | 'disabled' | 'offline', string]>)('shows a friendly message for a %s failure and keeps the numbers', async (kind, expected) => {
    mockRequest.mockResolvedValue({ ok: false, message: 'x', kind });
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    expect(allText(r)).toContain(expected);
    expect(allText(r)).toContain('Đã ghi 2/5 ngày');
  });

  it('says so when the AI answer is unusable, and stores nothing', async () => {
    mockRequest.mockResolvedValue({ ok: true, report: { headline: 'x', causes: [], patterns: [], nextWeek: [] }, cached: false });
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    expect(allText(r)).toContain('kết quả chưa dùng được');
    expect(useAiReportStore.getState().weekly['2026-10-19']).toBeUndefined();
  });

  it('cannot analyze an empty week, and says why', async () => {
    useNutritionStore.setState({ logs: {} });
    const r = await mount();
    expect(allText(r)).toContain('Cần ghi ít nhất một ngày');
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first request is running', async () => {
    let resolve!: (o: Outcome) => void;
    mockRequest.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    await act(async () => press(r, 'Đang phân tích…').props.onPress());
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, report: REPORT, cached: false }));
    expect(allText(r)).toContain('Tuần này boss còn nhiều máu.');
  });

  it('keeps the generated-at time the server gives for a stored review', async () => {
    mockRequest.mockResolvedValue({ ok: true, report: REPORT, cached: true, generatedAtISO: '2026-10-20T03:05:00.000Z' });
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    expect(useAiReportStore.getState().weekly['2026-10-19'].generatedAtISO).toBe('2026-10-20T03:05:00.000Z');
  });

  it('a review written now is current; once the week\'s data changes it says it is outdated', async () => {
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    expect(useAiReportStore.getState().weekly['2026-10-19'].dataFp).toBe(weekInputFingerprint(buildWeeklyReportInput(new Date())));
    expect(allText(r)).not.toContain('Cũ');
    expect(allText(r)).not.toContain('AI sẽ tự viết lại');
    await act(async () => {
      useNutritionStore.getState().addExtra('2026-10-23', 'Phở bò', 450, 25, 'breakfast', { fromFoodDb: true });
    });
    expect(allText(r)).toContain('AI sẽ tự viết lại sau ít phút');
    await act(async () => {
      useAnalysisStore.setState({ mode: 'manual' });
    });
    expect(allText(r)).toContain('Bấm “Làm mới phân tích” để AI viết lại.');
  });

  it('a review the server already had is not taken as current', async () => {
    mockRequest.mockResolvedValue({ ok: true, report: REPORT, cached: true });
    const r = await mount();
    await act(async () => press(r, 'Phân tích tuần bằng AI').props.onPress());
    expect(useAiReportStore.getState().weekly['2026-10-19'].dataFp).toBeUndefined();
    expect(allText(r)).toContain('AI sẽ tự viết lại');
  });
});

describe('Automatic rewrite of the weekly review', () => {
  let renderer: ReactTestRenderer | undefined;
  const day = (date: string, kcal: number) => ({ dateISO: date, mealsEaten: {}, extraCalories: kcal, extraProteinG: 100, extraItems: [{ id: `i-${date}`, name: 'x', calories: kcal, proteinG: 100, loggedAtISO: `${date}T12:00:00`, mealTime: 'lunch' as const }], waterMl: 3000 });
  const mountWatcher = async (enabled = true) => {
    await act(async () => {
      renderer = create(<WeeklyReportAutoRefresh enabled={enabled} />);
    });
  };
  const saveCurrent = () => useAiReportStore.getState().saveWeekly('2026-10-19', { headline: 'Cũ', causes: [], patterns: ['p'], nextWeek: [] }, '2026-10-22T08:00:00.000Z', weekInputFingerprint(buildWeeklyReportInput(new Date())));
  const edit = async () =>
    act(async () => {
      useNutritionStore.getState().addExtra('2026-10-23', 'Phở bò', 450, 25, 'breakfast', { fromFoodDb: true });
    });

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi', gender: null, age: null, heightCm: null, activityLevel: null, calorieTargetKcal: 1900, targetDailyDeficitKcal: 1100, proteinTargetG: 200, waterTargetMl: 3000, startWeightKg: 106, startDateISO: '2026-10-01T08:00:00' });
    useWorkoutStore.setState({ entries: [] });
    useWeightStore.setState({ entries: [] });
    useNutritionStore.setState({ logs: { '2026-10-19': day('2026-10-19', 1500) } });
    useAiReportStore.setState({ weekly: {} });
    resetAnalysisStore();
    mockRequest.mockResolvedValue({ ok: true, report: REPORT, cached: false });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('auto: rewrites this week\'s review once, after the edits settle', async () => {
    saveCurrent();
    await mountWatcher();
    await edit();
    await act(async () => jest.advanceTimersByTime(AI_AUTO_DEBOUNCE_MS - 1000));
    await edit(); // another edit restarts the wait
    await act(async () => jest.advanceTimersByTime(AI_AUTO_DEBOUNCE_MS - 1000));
    expect(mockRequest).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][1]).toBe('2026-10-19');
    expect(mockRequest.mock.calls[0][2]).toBe(true);
    const stored = useAiReportStore.getState().weekly['2026-10-19'];
    expect(stored.report.headline).toBe('Tuần này boss còn nhiều máu.');
    expect(stored.dataFp).toBe(weekInputFingerprint(buildWeeklyReportInput(new Date())));
    // a later change waits for the minimum gap between automatic rewrites
    await edit();
    await act(async () => jest.advanceTimersByTime(AI_AUTO_DEBOUNCE_MS + 1000));
    expect(mockRequest).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(AI_AUTO_MIN_GAP_MS));
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('never calls the AI by itself in manual mode, without a review, or when nothing changed', async () => {
    saveCurrent();
    await mountWatcher();
    await act(async () => jest.advanceTimersByTime(AI_AUTO_MIN_GAP_MS * 2));
    expect(mockRequest).not.toHaveBeenCalled(); // nothing changed
    await act(async () => {
      useAnalysisStore.setState({ mode: 'manual' });
    });
    await edit();
    await act(async () => jest.advanceTimersByTime(AI_AUTO_MIN_GAP_MS * 2));
    expect(mockRequest).not.toHaveBeenCalled();
    await act(async () => {
      useAiReportStore.setState({ weekly: {} });
    });
    await act(async () => {
      useAnalysisStore.setState({ mode: 'auto' });
    });
    await edit();
    await act(async () => jest.advanceTimersByTime(AI_AUTO_MIN_GAP_MS * 2));
    expect(mockRequest).not.toHaveBeenCalled(); // no review to rewrite
  });
});
