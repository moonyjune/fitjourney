import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
const mockSignOut = jest.fn();
const mockRequestPermission = jest.fn<() => Promise<boolean>>();
const mockSchedule = jest.fn<() => Promise<void>>();
const mockCancel = jest.fn<() => Promise<void>>();
const mockSubmitCode = jest.fn<(code: string) => Promise<{ ok: true } | { ok: false; message: string }>>();

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })), signOut: jest.fn() } },
}));
jest.mock('../../auth/signOut', () => ({ signOutAndReset: () => mockSignOut() }));
jest.mock('../../notifications/schedule', () => ({
  requestNotificationPermissions: () => mockRequestPermission(),
  scheduleAllReminders: () => mockSchedule(),
  cancelAllReminders: () => mockCancel(),
}));
const mockIsAiAdmin = jest.fn<() => Promise<boolean>>();
jest.mock('../../sync/cloudSync', () => ({
  fetchIsAiAdmin: () => mockIsAiAdmin(),
  pushUserData: jest.fn(),
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

import MapScreen from '../../../app/(tabs)/map';
import ProfileScreen from '../../../app/(tabs)/profile';
import { QuestTabBar } from '../../components/quest/QuestTabBar';
import { resetIsAiAdminCache } from '../../ai/useIsAiAdmin';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useAchievementStore } from '../../store/useAchievementStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

const DATE = '2026-10-23';

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

function pressable(r: ReactTestRenderer, match: (label: string) => boolean): ReactTestInstance {
  const found = r.root.findAll(
    (n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && match(n.props.accessibilityLabel)
  )[0];
  if (!found) throw new Error('no pressable matched');
  return found;
}

describe('FitQuest tabs', () => {
  let renderer: ReactTestRenderer | undefined;

  function render(element: React.ReactElement): ReactTestRenderer {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(element);
    });
    renderer = r;
    return r;
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') });
    Object.values(mockRouter).forEach((fn) => fn.mockClear());
    mockSignOut.mockClear();
    mockRequestPermission.mockReset();
    mockSchedule.mockReset().mockResolvedValue(undefined);
    mockCancel.mockReset().mockResolvedValue(undefined);
    mockSubmitCode.mockReset();
    useSettingsStore.setState({
      startDateISO: '2026-10-19T08:00:00',
      startWeightKg: 110,
      goalWeightKg: 95,
      proteinTargetG: 200,
      language: 'vi',
      activityLevel: 'light',
      remindersEnabled: false,
      coachId: null,
      submitCoachCode: mockSubmitCode as never,
    });
    useAuthStore.setState({ session: { user: { id: 'u', email: 'harry@example.com' } } as never });
    useWeightStore.setState({
      entries: [
        { id: 'a', dateISO: '2026-10-21T06:00:00', weightKg: 109 },
        { id: 'b', dateISO: '2026-10-23T06:00:00', weightKg: 106.2 },
      ],
    });
    useNutritionStore.setState({
      logs: { [DATE]: { dateISO: DATE, mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 3200 } },
    });
    useWorkoutStore.setState({
      entries: [{ id: 'x', dateISO: `${DATE}T15:00:00`, templateId: null, label: 'Ngày A', durationMin: 14, caloriesBurned: 420 }],
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  describe('Map', () => {
    it('shows the current region with the player and the two locked regions above it', () => {
      const text = allText(render(<MapScreen />));
      expect(text).toContain('Vùng 1 · Đồng Khởi Hành');
      expect(text).toContain('Vùng 2 · Rừng Kỷ Luật');
      expect(text).toContain('Vùng 3 · Đỉnh Chiến Thắng');
      expect(text).toContain('mở khi đạt 105 kg');
      expect(text).toContain('106.2 kg · Vùng 1');
      expect(text).toContain('còn 1.2 kg'); // to the 105 kg gate
    });

    it('describes the trail for screen readers with the real numbers', () => {
      const r = render(<MapScreen />);
      const trail = r.root.findAll((n) => n.props.accessibilityRole === 'image' && String(n.props.accessibilityLabel).startsWith('Đường đi vùng 1'))[0];
      expect(trail.props.accessibilityLabel).toBe('Đường đi vùng 1: xuất phát 110 kg, bạn đang ở 106.2 kg, cổng ở 105 kg, đã đi 76 phần trăm');
    });

    it('switches to the chart: real stats, the weight chart and the weekly bosses', () => {
      const r = render(<MapScreen />);
      act(() => pressable(r, (l) => l === 'Biểu đồ').props.onPress());
      const text = allText(r);
      expect(text).toContain('Biểu đồ cân nặng');
      expect(text).toContain('−3.8'); // 110 -> 106.2
      expect(text).toContain('11.2'); // to the 95 kg goal
      expect(text).toContain('25%'); // 3.8 / 15
      expect(text).toContain('Tuần 43');
      expect(text).toContain('Đang đánh');
      const chart = r.root.findAll((n) => n.props.accessibilityRole === 'image' && String(n.props.accessibilityLabel).startsWith('Biểu đồ cân nặng từ'))[0];
      expect(chart.props.accessibilityLabel).toBe('Biểu đồ cân nặng từ 110.0 kg xuống 106.2 kg qua 2 lần ghi');
    });

    it('never shows a boss week dealing more damage than the boss has HP', () => {
      // Last week fully logged: 7 days x the 1,500 cap = 10,500 damage against a 7,700 HP boss.
      const logs: Record<string, unknown> = {};
      for (const d of ['12', '13', '14', '15', '16', '17', '18']) {
        logs[`2026-10-${d}`] = { dateISO: `2026-10-${d}`, mealsEaten: { meal1: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 };
      }
      useNutritionStore.setState({ logs: logs as never });
      useSettingsStore.setState({ startDateISO: '2026-10-12T08:00:00', activityLevel: 'very_active' }); // big TDEE -> every day hits the cap
      const r = render(<MapScreen />);
      act(() => pressable(r, (l) => l === 'Biểu đồ').props.onPress());
      const text = allText(r);
      expect(text).toContain('Tuần 42');
      expect(text).toContain('7,700 sát thương'); // capped at the boss's HP, shown as defeated
      expect(text).not.toContain('10,500');
      const bar = r.root.findAll((n) => n.props.accessibilityRole === 'progressbar' && n.props.accessibilityValue?.now === 100);
      expect(bar.length).toBeGreaterThan(0); // the bar is full, never beyond
    });

    it('tells you when there is no weigh-in yet instead of drawing a made-up line', () => {
      useWeightStore.setState({ entries: [] });
      const r = render(<MapScreen />);
      act(() => pressable(r, (l) => l === 'Biểu đồ').props.onPress());
      expect(allText(r)).toContain('Chưa có lần cân nào.');
    });

    it('moves to the next region once the first gate is passed', () => {
      useWeightStore.setState({ entries: [{ id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 104.5 }] });
      const text = allText(render(<MapScreen />));
      expect(text).toContain('104.5 kg · Vùng 2');
      expect(text).toContain('Vùng 3 · Đỉnh Chiến Thắng');
    });
  });

  describe('Profile', () => {
    beforeEach(() => {
      resetIsAiAdminCache();
      mockIsAiAdmin.mockReset();
      mockIsAiAdmin.mockResolvedValue(false);
    });

    it('shows the "AI & chi phí" entry only to an account the server lists as an AI admin', async () => {
      const find = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('AI & chi phí'));
      let r = render(<ProfileScreen />);
      await act(async () => undefined);
      expect(find(r)).toHaveLength(0);
      act(() => r.unmount());

      resetIsAiAdminCache();
      mockIsAiAdmin.mockResolvedValue(true);
      r = render(<ProfileScreen />);
      await act(async () => undefined);
      const row = find(r)[0];
      expect(row).toBeDefined();
      await act(async () => row.props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/ai-admin');
    });

    it('shows the level card and real stats', () => {
      const text = allText(render(<ProfileScreen />));
      expect(text).toContain('Hồ sơ');
      expect(text).toContain('harry@example.com');
      expect(text).toContain('3.8 kg'); // weight lost
      expect(text).toContain('Lửa trại');
      expect(text).toContain('Boss đã hạ');
    });

    it('opens the achievements with the real unlocked counts', () => {
      const r = render(<ProfileScreen />);
      const row = pressable(r, (l) => l.startsWith('Thành tích'));
      expect(row.props.accessibilityLabel).toMatch(/\d+ \/ \d+ sticker · 0 banner/);
      act(() => row.props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/achievements');
    });

    it('shows the equipped banner only while it is actually earned', () => {
      useAchievementStore.setState({ equippedBannerId: 'ten' }); // needs 10 kg lost; the fixture has lost 3.8
      expect(allText(render(<ProfileScreen />))).not.toContain('MƯỜI KÝ ĐẦU TIÊN');
      act(() => renderer?.unmount());
      useWeightStore.setState({ entries: [{ id: 'c', dateISO: '2026-10-23T06:00:00', weightKg: 99 }] });
      expect(allText(render(<ProfileScreen />))).toContain('MƯỜI KÝ ĐẦU TIÊN');
      useAchievementStore.setState({ equippedBannerId: null });
    });

    it('lets the user move the purine, salt and sugar limits within sane bounds, and reset them', async () => {
      useLimitsStore.getState().reset();
      const r = render(<ProfileScreen />);
      expect(allText(r)).toContain('Giới hạn hằng ngày');
      expect(allText(r)).toMatch(/1,?200 mg/);
      await act(async () => {
        pressable(r, (l) => l === 'Tăng Purine tối đa').props.onPress();
      });
      expect(useLimitsStore.getState().purineMg).toBe(1250);
      await act(async () => {
        pressable(r, (l) => l === 'Tăng Muối tối đa').props.onPress();
      });
      expect(useLimitsStore.getState().saltG).toBe(7.5);
      expect(allText(r)).toContain('7.5 g');
      for (let i = 0; i < 8; i++) { // 25 → 5 takes 4 steps; the rest must stay clamped
        await act(async () => {
          pressable(r, (l) => l === 'Giảm Đường tối đa').props.onPress();
        });
      }
      expect(useLimitsStore.getState().sugarG).toBe(5); // clamped at the floor, never 0 or negative
      expect(pressable(r, (l) => l === 'Giảm Đường tối đa').props.accessibilityState.disabled).toBe(true);
      await act(async () => {
        pressable(r, (l) => l === 'Về mặc định').props.onPress();
      });
      expect(useLimitsStore.getState()).toMatchObject({ purineMg: 1200, saltG: 7, sugarG: 25 });
    });

    it('has a Full HD photo switch for the AI that is off by default and remembers the choice', async () => {
      useAiPhotoStore.getState().setFullHd(false);
      const r = render(<ProfileScreen />);
      const toggle = r.root.findAll((n) => n.props.accessibilityLabel === 'Gửi ảnh Full HD cho AI' && typeof n.props.onValueChange === 'function')[0];
      expect(toggle.props.value).toBe(false);
      await act(async () => toggle.props.onValueChange(true));
      expect(useAiPhotoStore.getState().fullHd).toBe(true);
      useAiPhotoStore.getState().setFullHd(false);
    });

    it('has a weekly AI review entry for everybody that opens the review', () => {
      const r = render(<ProfileScreen />);
      const row = pressable(r, (l) => l.startsWith('Tổng kết tuần (AI)'));
      act(() => row.props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/weekly-report');
    });

    it('has an intermittent-fasting switch that is on by default; turning it off is remembered (and saved to the cloud settings)', async () => {
      useMealModeStore.setState({ fasting: true });
      const r = render(<ProfileScreen />);
      const toggle = r.root.findAll((n) => n.props.accessibilityLabel === 'Nhịn ăn gián đoạn (16:8)' && typeof n.props.onValueChange === 'function')[0];
      expect(toggle.props.value).toBe(true);
      expect(allText(r)).toContain('Tắt: ngày ăn 3 bữa bình thường');
      await act(async () => toggle.props.onValueChange(false));
      expect(useMealModeStore.getState().fasting).toBe(false);
      useMealModeStore.setState({ fasting: true });
    });

    it('has a master AI switch that is on by default and remembers the choice', async () => {
      useAiPhotoStore.getState().setAiEnabled(true);
      const r = render(<ProfileScreen />);
      const toggle = r.root.findAll((n) => n.props.accessibilityLabel === 'Dùng AI (Claude)' && typeof n.props.onValueChange === 'function')[0];
      expect(toggle.props.value).toBe(true);
      await act(async () => toggle.props.onValueChange(false));
      expect(useAiPhotoStore.getState().aiEnabled).toBe(false);
      useAiPhotoStore.getState().setAiEnabled(true);
    });

    it('opens the plan, weight, nutrition and history screens', () => {
      const r = render(<ProfileScreen />);
      const routes: [string, string][] = [
        ['Kế hoạch', '/(tabs)/plan'],
        ['Cân nặng', '/(tabs)/weight'],
        ['Dinh dưỡng', '/(tabs)/nutrition'],
        ['Lịch sử', '/(tabs)/history'],
        ['Phân tích', '/insights'],
        ['Thói quen', '/habits'],
        ['Kiến thức', '/learn'],
        ['Axit uric', '/uric'],
        ['Nhập nhật ký', '/import-diary'],
      ];
      for (const [label, path] of routes) {
        act(() => pressable(r, (l) => l.startsWith(label)).props.onPress());
        expect(mockRouter.push).toHaveBeenCalledWith(path);
      }
    });

    it('switches the language and persists it', async () => {
      const r = render(<ProfileScreen />);
      await act(async () => {
        pressable(r, (l) => l === 'English').props.onPress();
      });
      expect(useSettingsStore.getState().language).toBe('en');
      expect(allText(r)).toContain('SETTINGS'); // the eyebrow is set in capitals
    });

    it('turns reminders on only when the OS grants permission', async () => {
      const r = render(<ProfileScreen />);
      const sw = () => r.root.findAll((n) => typeof n.props.onValueChange === 'function' && n.props.accessibilityLabel === 'Nhắc nhở')[0];

      mockRequestPermission.mockResolvedValue(false);
      await act(async () => {
        await sw().props.onValueChange(true);
      });
      expect(useSettingsStore.getState().remindersEnabled).toBe(false); // refused -> stays off
      expect(mockSchedule).not.toHaveBeenCalled();

      mockRequestPermission.mockResolvedValue(true);
      await act(async () => {
        await sw().props.onValueChange(true);
      });
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(useSettingsStore.getState().remindersEnabled).toBe(true);

      await act(async () => {
        await sw().props.onValueChange(false);
      });
      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(useSettingsStore.getState().remindersEnabled).toBe(false);
    });

    it('still saves the preference when notifications are unavailable in this runtime', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockRequestPermission.mockRejectedValue(new Error('not available in Expo Go'));
      const r = render(<ProfileScreen />);
      const sw = r.root.findAll((n) => typeof n.props.onValueChange === 'function' && n.props.accessibilityLabel === 'Nhắc nhở')[0];
      await act(async () => {
        await sw.props.onValueChange(true);
      });
      expect(useSettingsStore.getState().remindersEnabled).toBe(true);
      warn.mockRestore();
    });

    it('connects a coach code, and shows the error when it is rejected', async () => {
      mockSubmitCode.mockResolvedValueOnce({ ok: false, message: 'Mã không đúng' }).mockResolvedValueOnce({ ok: true });
      const r = render(<ProfileScreen />);
      const input = () => r.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === 'Mã coach')[0];
      act(() => input().props.onChangeText('ABC123'));
      await act(async () => {
        await pressable(r, (l) => l === 'Kết nối').props.onPress();
      });
      expect(mockSubmitCode).toHaveBeenCalledWith('ABC123');
      expect(allText(r)).toContain('Mã không đúng');

      await act(async () => {
        await pressable(r, (l) => l === 'Kết nối').props.onPress();
      });
      expect(input().props.value).toBe(''); // cleared after success
    });

    it('asks before signing out (web uses window.confirm)', () => {
      const confirm = jest.fn(() => false);
      (globalThis as unknown as { window: unknown }).window = { confirm };
      const rn = require('react-native') as { Platform: { OS: string } };
      const original = rn.Platform.OS;
      rn.Platform.OS = 'web';
      try {
        const r = render(<ProfileScreen />);
        act(() => pressable(r, (l) => l === 'Đăng xuất').props.onPress());
        expect(confirm).toHaveBeenCalled();
        expect(mockSignOut).not.toHaveBeenCalled(); // declined

        confirm.mockReturnValue(true);
        act(() => pressable(r, (l) => l === 'Đăng xuất').props.onPress());
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      } finally {
        rn.Platform.OS = original;
        delete (globalThis as unknown as { window?: unknown }).window;
      }
    });
  });

  describe('Tab bar', () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const routes = ['index', 'today-classic', 'map', 'profile', 'weight', 'nutrition', 'workout', 'history', 'plan', 'clients', 'coach-account'].map((name) => ({
      key: `${name}-k`,
      name,
    }));
    const hidden = new Set(['today-classic', 'weight', 'nutrition', 'history', 'plan', 'clients', 'coach-account']);

    function bar(focusedName = 'index') {
      const descriptors: Record<string, { options: object }> = {};
      for (const r of routes) descriptors[r.key] = { options: hidden.has(r.name) ? { tabBarItemStyle: { display: 'none' } } : {} };
      const index = routes.findIndex((r) => r.name === focusedName);
      const props = { state: { index, routes }, descriptors, navigation: { navigate, emit }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
      return render(<QuestTabBar {...(props as unknown as React.ComponentProps<typeof QuestTabBar>)} />);
    }

    beforeEach(() => {
      navigate.mockClear();
      emit.mockClear().mockReturnValue({ defaultPrevented: false });
    });

    it('shows exactly Camp, Train, Map and Profile plus the + button; hidden routes never appear', () => {
      const r = bar();
      // findAll returns both the composite and host node of each Pressable, so de-duplicate by label.
      const tabs = [...new Set(r.root.findAll((n) => n.props.accessibilityRole === 'tab').map((n) => n.props.accessibilityLabel))];
      expect(tabs).toEqual(['Trại', 'Tập', 'Bản đồ', 'Hồ sơ']); // the design's order, not the routes' declaration order
      expect(allText(r)).not.toContain('Cân nặng');
    });

    it('marks the focused tab as selected and navigates when another is pressed', () => {
      const r = bar('map');
      const selected = r.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityState?.selected);
      expect([...new Set(selected.map((n) => n.props.accessibilityLabel))]).toEqual(['Bản đồ']);
      act(() => pressable(r, (l) => l === 'Hồ sơ').props.onPress());
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'profile-k' }));
      expect(navigate).toHaveBeenCalledWith('profile');
      navigate.mockClear();
      act(() => pressable(r, (l) => l === 'Bản đồ').props.onPress()); // already focused
      expect(navigate).not.toHaveBeenCalled();
    });

    it('respects a tabPress listener that prevents the default', () => {
      emit.mockReturnValue({ defaultPrevented: true });
      const r = bar();
      act(() => pressable(r, (l) => l === 'Tập').props.onPress());
      expect(navigate).not.toHaveBeenCalled();
    });

    it('opens Quick add from the centre button', () => {
      const r = bar();
      act(() => pressable(r, (l) => l === 'Ghi nhanh').props.onPress());
      expect(mockRouter.push).toHaveBeenCalledWith('/quick-add');
    });
  });
});
