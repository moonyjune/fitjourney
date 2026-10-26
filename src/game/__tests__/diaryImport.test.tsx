import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushWeight = jest.fn();
const mockPushWorkout = jest.fn();
const mockPushNutrition = jest.fn();
const mockPushProfile = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  whenPushesSettled: async () => undefined,
  flushSyncQueue: async () => undefined,
  pushWeightEntry: (...a: unknown[]) => mockPushWeight(...a),
  pushWorkoutEntry: (...a: unknown[]) => mockPushWorkout(...a),
  pushNutritionLog: (...a: unknown[]) => mockPushNutrition(...a),
  pushProfile: (...a: unknown[]) => mockPushProfile(...a),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

const mockPicker = jest.fn<(...a: unknown[]) => Promise<{ canceled: boolean; assets?: { uri: string }[] }>>();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPicker(...a) }));
const mockRead = jest.fn<(asset: unknown) => Promise<string>>();
jest.mock('../../import/readPickedFile', () => ({ readPickedText: (a: unknown) => mockRead(a) }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true, push: jest.fn() },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import ImportDiaryScreen from '../../../app/import-diary';
import { applyDiaryImport, parseDiaryImport, type DiaryImportFile } from '../../import/diaryImport';
import { useAuthStore } from '../../store/useAuthStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSyncQueueStore } from '../../sync/syncQueue';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const item = (id: string, name: string, calories: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  calories,
  proteinG: 10,
  loggedAtISO: '2026-10-01T05:00:00.000Z',
  mealTime: 'lunch',
  purineMg: 20,
  saltG: 1.5,
  sugarG: 3,
  ...extra,
});

function diary(): DiaryImportFile {
  return {
    format: 'fitjourney-diary',
    version: 1,
    profile: { startWeightKg: 110, startDateISO: '2026-09-21T05:00:00.000Z', calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110 },
    weights: [
      { id: 'diary-w-20260921-1', dateISO: '2026-09-21T05:00:00.000Z', weightKg: 110, note: 'Mốc' },
      { id: 'diary-w-20261002-1', dateISO: '2026-10-02T05:00:00.000Z', weightKg: 105 },
    ],
    nutrition: [
      { dateISO: '2026-10-01', items: [item('diary-20261001-1', 'Cơm gà', 500), item('diary-20261001-2', 'Xúc xích', 150, { junk: true })] },
      { dateISO: '2026-10-02', items: [item('diary-20261002-1', 'Phở', 400)] },
    ],
    workouts: [{ id: 'diary-20260921-1', dateISO: '2026-09-21T05:00:00.000Z', templateId: null, label: 'Đi bộ dốc', durationMin: 40, caloriesBurned: 370 }],
  } as unknown as DiaryImportFile;
}

const reparse = (d: unknown) => parseDiaryImport(JSON.stringify(d));

beforeEach(() => {
  jest.clearAllMocks();
  useWeightStore.setState({ entries: [] });
  useWorkoutStore.setState({ entries: [] });
  useNutritionStore.setState({ logs: {} });
  useSettingsStore.setState({ startWeightKg: 100, calorieTargetKcal: 1800 });
  useAuthStore.setState({ session: null, devMode: false });
  useSyncQueueStore.setState({ pending: [] });
});

describe('parseDiaryImport', () => {
  it('accepts a well-formed file', () => {
    expect(reparse(diary()).ok).toBe(true);
  });

  it('tells apart text that is not JSON, a file of another kind, and a damaged diary', () => {
    expect(parseDiaryImport('not json {')).toEqual({ ok: false, reason: 'notJson' });
    expect(reparse({ hello: 1 })).toEqual({ ok: false, reason: 'format' });
    expect(reparse({ ...diary(), version: 2 })).toEqual({ ok: false, reason: 'format' });
    expect(reparse({ ...diary(), weights: 'x' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['an item without the diary- id prefix', (d: DiaryImportFile) => { d.nutrition[0].items[0].id = 'abc'; }],
    ['a negative calorie value', (d: DiaryImportFile) => { d.nutrition[0].items[0].calories = -5; }],
    ['an unknown meal time', (d: DiaryImportFile) => { (d.nutrition[0].items[0] as unknown as { mealTime: string }).mealTime = 'brunch'; }],
    ['a bad day key', (d: DiaryImportFile) => { d.nutrition[0].dateISO = '01/10/2026'; }],
    ['the same day twice', (d: DiaryImportFile) => { d.nutrition[1].dateISO = d.nutrition[0].dateISO; }],
    ['a duplicate item id in a day', (d: DiaryImportFile) => { d.nutrition[0].items[1].id = d.nutrition[0].items[0].id; }],
    ['a zero weight', (d: DiaryImportFile) => { d.weights[0].weightKg = 0; }],
    ['a duplicate weight id', (d: DiaryImportFile) => { d.weights[1].id = d.weights[0].id; }],
    ['a workout with no label', (d: DiaryImportFile) => { (d.workouts[0] as unknown as { label: unknown }).label = 5; }],
    ['a negative profile target', (d: DiaryImportFile) => { d.profile = { proteinTargetG: -1 }; }],
  ])('rejects the whole file on %s', (_name, damage) => {
    const d = diary();
    damage(d);
    expect(reparse(d)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('applyDiaryImport', () => {
  it('writes meals, weights, workouts and the profile to the device and syncs each to the cloud', () => {
    const summary = applyDiaryImport(diary());
    expect(summary).toEqual({ days: 2, foodItems: 3, weightsAdded: 2, workoutsAdded: 1, habitsAdded: 0, notesLoaded: 0, uricAdded: 0, waterDays: 0, profileUpdated: true });

    const day = useNutritionStore.getState().logs['2026-10-01'];
    expect(day.extraItems.map((i) => i.name)).toEqual(['Cơm gà', 'Xúc xích']);
    expect(day.extraCalories).toBe(650);
    expect(day.extraProteinG).toBe(20);
    expect(day.extraItems[1].junk).toBe(true);
    expect(day.removedMealSlots).toEqual(['meal1', 'meal2', 'meal3']);
    expect(mockPushNutrition).toHaveBeenCalledTimes(2);

    expect(useWeightStore.getState().entries.map((e) => e.weightKg)).toEqual([110, 105]);
    expect(mockPushWeight).toHaveBeenCalledTimes(2);
    expect(useWorkoutStore.getState().entries).toHaveLength(1);
    expect(mockPushWorkout).toHaveBeenCalledTimes(1);

    expect(useSettingsStore.getState()).toMatchObject({ startWeightKg: 110, calorieTargetKcal: 1520, targetDailyDeficitKcal: 1000, proteinTargetG: 110 });
    expect(mockPushProfile).toHaveBeenCalled();
  });

  it('is safe to run twice: no duplicate weights, workouts or food, and nothing new is pushed for weights', () => {
    applyDiaryImport(diary());
    mockPushWeight.mockClear();
    const again = applyDiaryImport(diary());
    expect(again).toMatchObject({ weightsAdded: 0, workoutsAdded: 0 });
    expect(mockPushWeight).not.toHaveBeenCalled();
    expect(useWeightStore.getState().entries).toHaveLength(2);
    expect(useWorkoutStore.getState().entries).toHaveLength(1);
    expect(useNutritionStore.getState().logs['2026-10-01'].extraItems).toHaveLength(2);
  });

  it('keeps what was logged by hand on a day, replaces the diary’s older items, and keeps a ticked plan meal', () => {
    useNutritionStore.setState({
      logs: {
        '2026-10-01': {
          dateISO: '2026-10-01',
          mealsEaten: { meal2: true },
          extraCalories: 330,
          extraProteinG: 20,
          extraItems: [item('hand-1', 'Trà sữa', 200, { mealTime: null }) as never, item('diary-20261001-1', 'Món cũ', 130) as never],
          waterMl: 1500,
        },
      },
    });
    applyDiaryImport(diary());
    const day = useNutritionStore.getState().logs['2026-10-01'];
    expect(day.extraItems.map((i) => i.name)).toEqual(['Trà sữa', 'Cơm gà', 'Xúc xích']);
    expect(day.extraCalories).toBe(850);
    expect(day.mealsEaten).toEqual({ meal2: true });
    expect(day.removedMealSlots).toEqual(['meal1', 'meal3']);
    expect(day.waterMl).toBe(1500);
  });

  it('overwrites a workout it already has with the diary’s numbers and does not count it as new', () => {
    useWorkoutStore.setState({ entries: [{ id: 'diary-20260921-1', dateISO: '2026-09-21T05:00:00.000Z', templateId: null, label: 'Cũ', durationMin: 10, caloriesBurned: 50 }] });
    const summary = applyDiaryImport(diary());
    expect(summary.workoutsAdded).toBe(0);
    expect(useWorkoutStore.getState().entries[0]).toMatchObject({ label: 'Đi bộ dốc', durationMin: 40, caloriesBurned: 370 });
  });

  it('leaves the profile alone when the file has none', () => {
    const d = diary();
    delete d.profile;
    expect(applyDiaryImport(d).profileUpdated).toBe(false);
    expect(useSettingsStore.getState().startWeightKg).toBe(100);
  });
});

describe('water for days without a water figure', () => {
  const withWater = (water: unknown): DiaryImportFile => ({ ...diary(), water } as unknown as DiaryImportFile);
  const range = { fromDateKey: '2026-09-30', toDateKey: '2026-10-03', ml: 3000 };
  const water = (day: string) => useNutritionStore.getState().getLog(day).waterMl;

  it('gives every day in the range 3 L, including days with no food at all, and none outside it', () => {
    const summary = applyDiaryImport(withWater(range));
    expect(summary.waterDays).toBe(4);
    expect(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map(water)).toEqual([3000, 3000, 3000, 3000]);
    expect(water('2026-09-29')).toBe(0);
    expect(water('2026-10-04')).toBe(0);
    // Days that also have food keep their food, and the water does not count as a logged day for the analysis.
    expect(useNutritionStore.getState().logs['2026-10-01'].extraItems.map((i) => i.name)).toEqual(['Cơm gà', 'Xúc xích']);
    expect(mockPushNutrition).toHaveBeenCalled();
  });

  it('leaves a day that already has a water figure alone, and importing again changes nothing', () => {
    useNutritionStore.getState().addWater('2026-10-01', 1250);
    expect(applyDiaryImport(withWater(range)).waterDays).toBe(3);
    expect(water('2026-10-01')).toBe(1250);
    mockPushNutrition.mockClear();
    expect(applyDiaryImport(withWater(range)).waterDays).toBe(0);
    expect(water('2026-10-02')).toBe(3000);
  });

  it('a file without a water section changes no water', () => {
    expect(applyDiaryImport(diary()).waterDays).toBe(0);
    expect(water('2026-10-01')).toBe(0);
  });

  it.each([
    ['a day that does not exist', { ...range, toDateKey: '2026-02-30' }],
    ['an end before the start', { ...range, fromDateKey: '2026-10-04' }],
    ['a range of more than a year', { ...range, fromDateKey: '2025-01-01' }],
    ['almost no water', { ...range, ml: 100 }],
    ['an impossible amount', { ...range, ml: 50000 }],
    ['amount as text', { ...range, ml: '3000' }],
    ['a missing field', { fromDateKey: range.fromDateKey, ml: 3000 }],
  ])('rejects the whole file on %s', (_label, bad) => {
    expect(reparse(withWater(bad))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts a good range', () => {
    expect(reparse(withWater(range)).ok).toBe(true);
  });
});

describe('Import diary screen', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  const text = (r: ReactTestRenderer): string => {
    const parts: string[] = [];
    const walk = (n: unknown) => {
      if (typeof n === 'string') parts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') walk((n as { children?: unknown }).children);
    };
    walk(r.toJSON());
    return parts.join(' ');
  };
  const choose = async (r: ReactTestRenderer) => {
    const btn = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.title === 'Chọn file nhật ký')[0];
    await act(async () => {
      (btn.props.onPress as () => void)();
    });
  };
  const mount = async () => {
    await act(async () => {
      renderer = create(<ImportDiaryScreen />);
    });
    return renderer!;
  };

  it('imports the picked file and reports what it did', async () => {
    mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///d.json' }] });
    mockRead.mockResolvedValue(JSON.stringify(diary()));
    const r = await mount();
    await choose(r);
    expect(text(r)).toContain('Đã nhập xong');
    expect(text(r)).toContain('2 ngày ăn uống, 3 món.');
    expect(text(r)).toContain('2 lần cân mới, 1 buổi tập mới.');
    expect(useNutritionStore.getState().logs['2026-10-02'].extraCalories).toBe(400);
  });

  it('writes nothing and says why when the file is wrong', async () => {
    mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.json' }] });
    mockRead.mockResolvedValue(JSON.stringify({ hello: 1 }));
    const r = await mount();
    await choose(r);
    expect(text(r)).toContain('Đây không phải file nhật ký FitJourney.');
    expect(useNutritionStore.getState().logs).toEqual({});
  });

  it('does nothing when the picker is cancelled, and reports a read failure', async () => {
    mockPicker.mockResolvedValue({ canceled: true });
    const r = await mount();
    await choose(r);
    expect(text(r)).not.toContain('Đã nhập xong');
    mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///d.json' }] });
    mockRead.mockRejectedValue(new Error('io'));
    await choose(r);
    expect(text(r)).toContain('Không mở được file.');
  });
  describe('cloud status after the import', () => {
    const pickDiary = () => {
      mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///d.json' }] });
      mockRead.mockResolvedValue(JSON.stringify(diary()));
    };

    it('says the data only sits on this device when not signed in to a real account', async () => {
      pickDiary();
      const r = await mount();
      await choose(r);
      expect(text(r)).toContain('chỉ nằm trên máy này');
      useAuthStore.setState({ session: { user: { id: 'u' } } as never, devMode: true });
      await choose(r);
      expect(text(r)).toContain('chỉ nằm trên máy này');
    });

    it('confirms the cloud save when signed in and nothing is waiting', async () => {
      pickDiary();
      useAuthStore.setState({ session: { user: { id: 'u' } } as never, devMode: false });
      const r = await mount();
      await choose(r);
      expect(text(r)).toContain('Đã lưu lên cloud');
      expect(text(r)).not.toContain('chỉ nằm trên máy này');
    });

    it('warns with the number of items still waiting for a connection', async () => {
      pickDiary();
      useAuthStore.setState({ session: { user: { id: 'u' } } as never, devMode: false });
      useSyncQueueStore.setState({ pending: [{ id: '1', type: 'uricDelete', payload: { readingId: 'a' } }, { id: '2', type: 'uricDelete', payload: { readingId: 'b' } }] });
      const r = await mount();
      await choose(r);
      expect(text(r)).toContain('Còn 2 mục chưa gửi được lên cloud');
      expect(text(r)).not.toContain('Đã lưu lên cloud');
    });
  });
});
