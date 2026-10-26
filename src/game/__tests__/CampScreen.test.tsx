import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// Only the network/navigation edges are mocked; the stores, game engine and every component are real.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

import CampScreen from '../../../app/(tabs)/index';
import { formatHoursMinutes } from '../../components/quest/WindowCard';
import { useCelebrationStore } from '../../store/useCelebrationStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

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

describe('FitQuest Camp screen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') }); // a Friday, inside the eating window
    mockPush.mockClear();
    useCelebrationStore.setState({ seenLevel: null });
    useSettingsStore.setState({
      startDateISO: '2026-10-19T08:00:00',
      startWeightKg: 110,
      language: 'vi',
      gender: null,
      age: null,
      heightCm: null,
      activityLevel: 'light',
    });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 }] });
    useNutritionStore.setState({
      logs: {
        '2026-10-23': {
          dateISO: '2026-10-23',
          mealsEaten: { meal1: true, meal2: true },
          extraCalories: 0,
          extraProteinG: 0,
          extraItems: [],
          waterMl: 3200,
        },
      },
    });
    useWorkoutStore.setState({
      entries: [{ id: 'x', dateISO: '2026-10-23T15:00:00', templateId: null, label: 'Ngày A', durationMin: 14, caloriesBurned: 420 }],
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  function render(): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<CampScreen />);
    });
    renderer = r;
    return r;
  }

  it('shows the player, the weekly boss and all seven missions', () => {
    const text = allText(render());
    expect(text).toContain('Quái Một Ký Mỡ');
    expect(text).toContain('7,700 HP');
    expect(text).toContain('Nhiệm vụ hôm nay');
    for (const name of ['Tập luyện', 'Thâm hụt', 'Protein 200 g', 'Purine', 'Muối', 'Đường', 'Không đồ ăn vặt']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('GIỜ TIẾP TẾ ĐANG MỞ'); // 16:10 is inside the 12:00-20:00 window (title is set in capitals)
  });

  it('shows the dinner card in the afternoon while the last meal is still to come, and not in the morning', () => {
    const text = allText(render());
    expect(text).toContain('Gợi ý bữa tối'); // 16:10, meal 3 not eaten
    expect(text).toMatch(/Còn ~\d+ kcal và thiếu ~\d+ g đạm trong hôm nay\./);
    act(() => renderer?.unmount());
    jest.setSystemTime(new Date('2026-10-23T10:00:00'));
    expect(allText(render())).not.toContain('Gợi ý bữa tối');
  });

  it('marks the logged workout done and protein still open (117 / 200 g)', () => {
    const text = allText(render());
    expect(text).toContain('14 phút · đốt 420 kcal');
    expect(text).toContain('117 / 200 g');
    // Unfinished missions advertise the XP they would pay, not +0.
    expect(text).toMatch(/\+\s*40/); // protein
    expect(text).not.toMatch(/\+\s*0(?!\d)/);
  });

  it('jumps to the right tab when a mission row is tapped', () => {
    const r = render();
    const rows = r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    const protein = rows.find((n) => String(n.props.accessibilityLabel).startsWith('Protein'));
    expect(protein).toBeDefined();
    act(() => protein!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/nutrition');
    const workoutRow = rows.find((n) => String(n.props.accessibilityLabel).startsWith('Tập luyện'));
    act(() => workoutRow!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/workout');
  });

  it('opens the boss detail when the boss card is tapped', () => {
    const r = render();
    const card = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('Boss tuần'))[0];
    expect(card).toBeDefined();
    act(() => card.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/boss');
  });

  describe('level-up celebration', () => {
    const manyWorkouts = () =>
      useWorkoutStore.setState({
        entries: ['19', '20', '21', '22', '23'].map((d) => ({ id: d, dateISO: `2026-10-${d}T15:00:00`, templateId: null, label: 'x', durationMin: 14, caloriesBurned: 420 })),
      });

    it('records the starting level silently the first time, without celebrating', () => {
      manyWorkouts(); // level 2 already earned before tracking began
      render();
      expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/level-up' }));
      expect(useCelebrationStore.getState().seenLevel).toBe(2);
    });

    it('celebrates a level gained since the last time it was seen, once', () => {
      manyWorkouts();
      useCelebrationStore.setState({ seenLevel: 1 });
      const r = render();
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/level-up', params: { from: 1, to: 2 } });
      expect(mockPush.mock.calls.filter((c) => (c[0] as { pathname?: string }).pathname === '/level-up')).toHaveLength(1);
      act(() => r.update(<CampScreen />)); // re-render before the sheet marked it seen: no second push
      expect(mockPush.mock.calls.filter((c) => (c[0] as { pathname?: string }).pathname === '/level-up')).toHaveLength(1);
    });

    it('stays quiet when nothing was gained, and lowers the mark if the level dropped', () => {
      manyWorkouts();
      useCelebrationStore.setState({ seenLevel: 2 });
      render();
      expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/level-up' }));
      act(() => renderer?.unmount());
      useCelebrationStore.setState({ seenLevel: 9 });
      render();
      expect(useCelebrationStore.getState().seenLevel).toBe(2);
    });
  });

  it('follows the language setting', () => {
    useSettingsStore.setState({ language: 'en' }); // nothing is mounted yet, so no act() needed
    const text = allText(render());
    expect(text).toContain("Today's missions");
    expect(text).toContain('The One-Kilo Blob');
  });

  it('switches to the fasting panel outside the eating window', () => {
    jest.setSystemTime(new Date('2026-10-23T10:36:00'));
    const text = allText(render());
    expect(text).toContain('THIỀN ĐỊNH · ĐANG NHỊN ĂN');
    expect(text).toContain('1:24'); // 24 minutes past ten -> 1h24 until noon
  });
});

describe('formatHoursMinutes', () => {
  it('is immune to floating-point noise and rounds partial minutes up', () => {
    expect(formatHoursMinutes(12 - 10.6)).toBe('1:24'); // 1.4000000000000004 h
    expect(formatHoursMinutes(1.4)).toBe('1:24');
    expect(formatHoursMinutes(3 + 50 / 60)).toBe('3:50');
    expect(formatHoursMinutes(1 / 3600)).toBe('0:01'); // a single second left still shows time remaining
    expect(formatHoursMinutes(0)).toBe('0:00');
    expect(formatHoursMinutes(-1)).toBe('0:00');
  });
});
