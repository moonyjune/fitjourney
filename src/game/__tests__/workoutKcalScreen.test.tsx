import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// Only navigation, storage, the picker and the network edge are mocked; stores, the screen and the form are real.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: jest.fn(),
  deletePersistedPhoto: jest.fn(),
  imageUriToBase64: async () => ({ base64: 'QUJD', mediaType: 'image/jpeg' }),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

type KcalOutcome = { ok: true; result: Record<string, unknown> } | { ok: false; message: string; kind: 'offline' | 'quota' | 'generic' };
const mockKcal = jest.fn<(input: unknown) => Promise<KcalOutcome>>();
const mockPushWorkout = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: (...a: unknown[]) => mockPushWorkout(...a),
  deleteWorkoutEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProofPhoto: jest.fn(),
  deleteProofPhoto: jest.fn(async () => undefined),
  pushFeelingRecord: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
  requestPhotoAnalysis: jest.fn(),
  requestWorkoutKcal: (input: unknown) => mockKcal(input),
  WORKOUT_KCAL_EMPTY: 'empty',
}));

import WorkoutScreen from '../../../app/(tabs)/workout-classic';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useNutritionStore } from '../../store/useNutritionStore';

const NOW = new Date('2026-10-23T16:10:00');
const AI_BUTTON = 'Dùng AI ước tính kcal tiêu hao từ mô tả buổi tập và thể trạng của bạn';

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return parts.join(' ');
}
const inputById = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const found = r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.testID === id)[0];
  if (!found) throw new Error(`no input ${id}`);
  return found;
};

describe('Workout form: "AI ước tính kcal"', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<WorkoutScreen />);
    });
    return renderer!;
  };
  const type = async (r: ReactTestRenderer, id: string, text: string) => {
    await act(async () => {
      inputById(r, id).props.onChangeText(text);
    });
  };
  const pressAi = async (r: ReactTestRenderer) => {
    const button = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === AI_BUTTON)[0];
    if (!button) throw new Error('no AI kcal button');
    await act(async () => {
      button.props.onPress();
    });
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
    mockKcal.mockReset();
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useNutritionStore.setState({ logs: {} });
    useWorkoutStore.setState({ entries: [] });
    useProofStore.setState({ photos: [] });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sends the description and the body profile, fills kcal and the empty minutes, shows the arithmetic, saves nothing', async () => {
    mockKcal.mockResolvedValue({
      ok: true,
      result: { kcal: 520, durationMin: 30, met: 9.8, activity: 'Chạy bộ 10 km/h', explanation: 'MET 9,8 × 106,2 kg × 0,5 giờ ≈ 520 kcal' },
    });
    const r = await mount();
    await type(r, 'log-label', 'Chạy bộ 5 km');
    await pressAi(r);
    expect(mockKcal).toHaveBeenCalledWith({
      description: 'Chạy bộ 5 km',
      profile: { weightKg: 106.2, heightCm: 172, age: 34, gender: 'male', activityLevel: 'light' },
    });
    expect(inputById(r, 'log-calories').props.value).toBe('520');
    expect(inputById(r, 'log-duration').props.value).toBe('30');
    expect(allText(r)).toContain('Chạy bộ 10 km/h: ~520 kcal');
    expect(allText(r)).toContain('MET 9,8 × 106,2 kg × 0,5 giờ ≈ 520 kcal');
    expect(useWorkoutStore.getState().entries).toHaveLength(0);
    expect(mockPushWorkout).not.toHaveBeenCalled();

    // The user checks and saves: the estimate is what gets logged.
    await act(async () => {
      r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Ghi nhận')[0].props.onPress();
    });
    expect(useWorkoutStore.getState().entries[0]).toMatchObject({ label: 'Chạy bộ 5 km', durationMin: 30, caloriesBurned: 520 });
  });

  it('typed minutes are sent and kept; a typed kcal is replaced by the estimate that was asked for', async () => {
    mockKcal.mockResolvedValue({ ok: true, result: { kcal: 210, durationMin: 45, explanation: 'MET 4 × 106,2 kg × 0,75 giờ' } });
    const r = await mount();
    await type(r, 'log-label', 'Bơi ếch thong thả');
    await type(r, 'log-duration', '45');
    await type(r, 'log-calories', '999');
    await pressAi(r);
    expect(mockKcal).toHaveBeenCalledWith(expect.objectContaining({ description: 'Bơi ếch thong thả', durationMin: 45 }));
    expect(inputById(r, 'log-duration').props.value).toBe('45');
    expect(inputById(r, 'log-calories').props.value).toBe('210');
  });

  it('without a description it says what to type and sends nothing', async () => {
    const r = await mount();
    await pressAi(r);
    expect(mockKcal).not.toHaveBeenCalled();
    expect(allText(r)).toContain('Mô tả buổi tập ở ô tên');
  });

  it('a failure shows the reason and leaves the inputs alone; no kcal back asks for the minutes', async () => {
    mockKcal.mockResolvedValueOnce({ ok: false, kind: 'quota', message: 'Hết lượt' });
    const r = await mount();
    await type(r, 'log-label', 'Yoga');
    await type(r, 'log-calories', '90');
    await pressAi(r);
    expect(allText(r)).toContain('Bạn đã dùng hết lượt AI hôm nay');
    expect(inputById(r, 'log-calories').props.value).toBe('90');

    mockKcal.mockResolvedValueOnce({ ok: false, kind: 'generic', message: 'empty' });
    await pressAi(r);
    expect(allText(r)).toContain('Hãy nhập số phút');
    expect(inputById(r, 'log-calories').props.value).toBe('90');
  });
});
