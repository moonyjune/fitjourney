import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../sync/cloudSync', () => ({
  pushWorkoutEntry: jest.fn(),
  deleteWorkoutEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProofPhoto: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
  requestPhotoAnalysis: jest.fn(),
}));

import WorkoutScreen from '../../../app/(tabs)/workout-classic';
import { usePlanStore } from '../../store/usePlanStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

describe('Classic workout screen (FitQuest)', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<WorkoutScreen />);
    });
    renderer = r;
    return r;
  };
  const find = (r: ReactTestRenderer, label: string, prop: string) =>
    r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props[prop] === 'function')[0];
  const press = async (r: ReactTestRenderer, label: string) => {
    await act(async () => {
      find(r, label, 'onPress').props.onPress();
    });
  };
  const type = async (r: ReactTestRenderer, label: string, text: string) => {
    await act(async () => {
      find(r, label, 'onChangeText').props.onChangeText(text);
    });
  };
  const allText = (r: ReactTestRenderer) => {
    const parts: string[] = [];
    const walk = (n: unknown) => {
      if (n == null) return;
      if (typeof n === 'string') parts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (typeof n === 'object') walk((n as { children?: unknown }).children);
    };
    walk(r.toJSON());
    return parts.join(' ');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi' });
    useWorkoutStore.setState({ entries: [] });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('lists the plan templates with their step breakdown and an empty today log', async () => {
    const r = await render();
    const text = allText(r);
    for (const t of usePlanStore.getState().plan.workoutTemplates) expect(text).toContain(t.label);
    expect(text).toContain('Chưa có buổi tập nào hôm nay');
    const logButtons = new Set(r.root.findAll((n) => n.props.accessibilityLabel === '+ Ghi nhận' && typeof n.props.onPress === 'function').map((n) => n.props.onPress));
    expect(logButtons.size).toBe(usePlanStore.getState().plan.workoutTemplates.length);
  });

  it('logs a suggested template as it is in the plan', async () => {
    const r = await render();
    const template = usePlanStore.getState().plan.workoutTemplates[0];
    await act(async () => {
      r.root.findAll((n) => n.props.accessibilityLabel === '+ Ghi nhận' && typeof n.props.onPress === 'function')[0].props.onPress();
    });
    expect(useWorkoutStore.getState().entries).toHaveLength(1);
    expect(useWorkoutStore.getState().entries[0]).toMatchObject({
      templateId: template.id,
      label: template.label,
      durationMin: template.durationMin,
      caloriesBurned: template.caloriesBurned,
    });
    expect(allText(r)).toContain('Đã tập hôm nay (1)');
  });

  it('logs a custom workout (comma decimals allowed) and clears the form', async () => {
    const r = await render();
    await type(r, 'Tên buổi tập', 'Đạp xe');
    await type(r, 'Thời lượng (phút)', '32,5');
    await type(r, 'Calo đốt', '280');
    await press(r, 'Ghi nhận');
    expect(useWorkoutStore.getState().entries[0]).toMatchObject({ templateId: null, label: 'Đạp xe', durationMin: 32.5, caloriesBurned: 280 });
    expect(find(r, 'Tên buổi tập', 'onChangeText').props.value).toBe('');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('refuses a custom workout with a missing field and says why', async () => {
    const r = await render();
    await type(r, 'Tên buổi tập', 'Đạp xe');
    await type(r, 'Thời lượng (phút)', '30');
    await press(r, 'Ghi nhận');
    expect(useWorkoutStore.getState().entries).toHaveLength(0);
    expect(Alert.alert).toHaveBeenCalledWith('Lỗi', expect.stringContaining('Nhập đầy đủ'));
    expect(find(r, 'Tên buổi tập', 'onChangeText').props.value).toBe('Đạp xe'); // the draft is kept
  });

  it("deletes today's entry and an earlier one", async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 3 * 86_400_000);
    useWorkoutStore.setState({
      entries: [
        { id: 'old', dateISO: earlier.toISOString(), templateId: null, label: 'Bơi tự do', durationMin: 30, caloriesBurned: 300 },
        { id: 'today', dateISO: now.toISOString(), templateId: null, label: 'Đi bộ nhanh', durationMin: 20, caloriesBurned: 120 },
      ],
    });
    const r = await render();
    const text = allText(r);
    expect(text).toContain('Đi bộ nhanh');
    expect(text).toContain('Bơi tự do');
    await press(r, 'Xóa: Đi bộ nhanh');
    expect(useWorkoutStore.getState().entries.map((e) => e.id)).toEqual(['old']);
    await press(r, 'Xóa: Bơi tự do');
    expect(useWorkoutStore.getState().entries).toHaveLength(0);
  });

  it('opens the AI editor for a template', async () => {
    const r = await render();
    const template = usePlanStore.getState().plan.workoutTemplates[0];
    await act(async () => {
      r.root.findAll((n) => n.props.accessibilityLabel === '✏️ Sửa bằng AI' && typeof n.props.onPress === 'function')[0].props.onPress();
    });
    expect(mockRouter.push).toHaveBeenCalledWith(`/(tabs)/plan?editWorkout=${encodeURIComponent(template.label)}`);
  });

  it('goes back, falling back to the Train tab when there is no history', async () => {
    const r = await render();
    await press(r, 'Quay lại');
    expect(mockRouter.back).toHaveBeenCalled();
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await press(r, 'Quay lại');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/workout');
  });
});
