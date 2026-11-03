import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// Only the network/navigation edges are mocked; the stores, game engine and every component are real.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: () => undefined,
}));
const mockPick = jest.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ uri: 'blob:meal' }));
jest.mock('../../utils/pickPhoto', () => ({ pickPhoto: (...a: unknown[]) => mockPick(...a), pickPhotos: jest.fn() }));
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
import { useMealModeStore } from '../../store/useMealModeStore';
import { formatHoursMinutes } from '../../components/quest/WindowCard';
import { useCelebrationStore } from '../../store/useCelebrationStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useFeelingStore } from '../../store/useFeelingStore';
import { useSelectedDayStore } from '../../store/useSelectedDayStore';
import { useToastStore } from '../../store/useToastStore';
import { takePendingMealPhoto } from '../../food/pendingPhoto';

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


/** Camp shows the missions as 7 rings: one tap opens the missions sheet. */
function openMissions(r: ReactTestRenderer) {
  const rings = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('Nhiệm vụ hôm nay'))[0];
  if (rings) act(() => rings.props.onPress());
}

/** The first pressable whose accessible name starts with `label`. */
function button(r: ReactTestRenderer, label: string) {
  const found = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith(label))[0];
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

describe('FitQuest Camp screen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T16:10:00') }); // a Friday, inside the eating window
    mockPush.mockClear();
    useCelebrationStore.setState({ seenLevel: null, weeklyDoneKey: null });
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
    openMissions(r);
    return r;
  }

  it('is one compact page: header with the date chip, the hero card, 3 tiles, mission rings and the timeline; the sheet opens on tap', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<CampScreen />);
    });
    renderer = r;
    const text = allText(r);
    expect(text).toContain('Cấp 1');
    expect(text).toContain('Hôm nay'); // the date chip
    expect(text).toMatch(/còn ăn \d[\d,]* \/ [\d,]+ kcal/);
    expect(text).toContain('Dự kiến ~1,172'); // the estimate until the day is settled (dinner still to come)
    expect(text).toContain('chờ chốt');
    expect(text).toContain('Đạm 117 /200 g');
    expect(text).toContain('Chụp món');
    expect(text).toContain('+250 ml');
    expect(text).toMatch(/Tập \d+′/);
    expect(text).toContain('Nhiệm vụ 1/7 xong');
    expect(text).toContain('Dòng thời gian');
    // The week strip, the 4 figure boxes and the colour key moved to the Journal.
    expect(text).not.toContain('Nhật ký trận');
    expect(text).not.toContain('Tuần trước');
    expect(text).not.toContain('Không đồ ăn vặt'); // mission titles live in the sheet
    openMissions(r);
    expect(allText(r)).toContain('Không đồ ăn vặt');
  });

  it('shows the player, the weekly boss and all seven missions', () => {
    const text = allText(render());
    expect(text).toContain('Quái Một Ký Mỡ');
    expect(text).toContain('7,700 HP');
    expect(text).toContain('Nhiệm vụ hôm nay');
    for (const name of ['Tập luyện', 'Thâm hụt', 'Protein 200 g', 'Purine', 'Muối', 'Đường', 'Không đồ ăn vặt']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('1 xong'); // the sheet's counters
    expect(text).toContain('GIỜ TIẾP TẾ ĐANG MỞ'); // 16:10 is inside the 12:00-20:00 window (title is set in capitals)
  });

  it("shows the next meal with one dish from an hour before the fasting window, and every meal's share in the ⓘ sheet", () => {
    const r = render();
    const text = allText(r);
    expect(text).toContain('Bữa 3 - Tối (Chốt cửa sổ ăn) · 19:15'); // 16:10, dinner still to come
    expect(text).toContain('Ghi món này');
    expect(text).toContain('Món khác');
    expect(text).not.toContain('Gợi ý các bữa còn lại'); // the full card is in the sheet
    act(() => button(r, 'Phần của các bữa còn lại').props.onPress());
    const sheet = allText(r);
    expect(sheet).toContain('Gợi ý các bữa còn lại');
    expect(sheet).toMatch(/Còn ~\d+ kcal và thiếu ~\d+ g đạm trong hôm nay\./);
    act(() => button(r, 'Món khác cho').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/cookbook', params: { quick: 'fits' } });
    act(() => renderer?.unmount());
    jest.setSystemTime(new Date('2026-10-23T10:00:00'));
    expect(allText(render())).not.toContain('Ghi món này'); // the window opens at 12:00, the card at 11:00
  });

  it('with fasting off: no fasting-window card, and the meal suggestions are there all day (a normal 3-meal day)', () => {
    useMealModeStore.setState({ fasting: false });
    try {
      jest.setSystemTime(new Date('2026-10-23T08:00:00'));
      const text = allText(render());
      expect(text).not.toContain('GIỜ TIẾP TẾ');
      expect(text).not.toContain('NHỊN ĂN');
      expect(text).toContain('Bữa sáng · ');
      expect(text).toContain('Món khác');
    } finally {
      useMealModeStore.setState({ fasting: true });
    }
  });

  it('marks the logged workout done and protein still open (117 / 200 g)', () => {
    const text = allText(render());
    expect(text).toContain('14 phút · đốt 420 kcal');
    expect(text).toContain('117 / 200 g');
    // Unfinished missions advertise the XP they would pay, not +0.
    expect(text).toMatch(/\+\s*40/); // protein
    expect(text).not.toMatch(/\+\s*0(?!\d)/);
  });

  it("a mission row opens where to act: Tập the Train tab, a food mission the day's journal, with a link to the cook book filtered", () => {
    const r = render();
    act(() => button(r, 'Protein').props.onPress());
    // Journal › Ngày, scrolled to the nutrient table with the Protein row lit.
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/journal', params: { tab: 'day', focus: 'protein' } });
    openMissions(r);
    act(() => button(r, 'Tập luyện').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/workout');
    openMissions(r);
    act(() => button(r, 'Gợi ý món ít purine').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/cookbook', params: { quick: 'lowPurine' } });
  });

  it("the boss bar opens the weekly boss sheet (HP, today's pending hit, 7 days), and Xem cả tuần the full week", () => {
    const r = render();
    act(() => button(r, 'Boss tuần').props.onPress());
    const text = allText(r);
    expect(text).toContain('Boss tuần 43 · reset 05:00 sáng thứ Hai');
    expect(text).toContain('Đòn hôm nay');
    expect(text).toContain('~−1,172'); // pending: not taken off the HP yet
    expect(text).toContain('phần mờ = ~1,172 chờ chốt, chưa trừ');
    act(() => button(r, 'Xem cả tuần').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/journal', params: { tab: 'week' } });
  });

  it('+250 ml logs water on the picked day at once, with "Hoàn tác" on the toast', () => {
    const r = render();
    act(() => button(r, 'Thêm 250 ml nước').props.onPress());
    expect(useNutritionStore.getState().logs['2026-10-23'].waterMl).toBe(3450);
    expect(useToastStore.getState().toast?.text).toContain('+250 ml');
    act(() => useToastStore.getState().undo());
    expect(useNutritionStore.getState().logs['2026-10-23'].waterMl).toBe(3200);
  });

  it("The Tập tile starts today's session in one tap; its › opens the Train screen", () => {
    const r = render();
    act(() => button(r, 'Bắt đầu buổi tập nhóm').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/train/session', params: expect.objectContaining({ ids: expect.any(String), group: expect.any(String) }) });
    act(() => button(r, 'Mở màn Tập').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/workout');
  });

  it('after 19:00 shows the evening check-in card until today has a check-in', () => {
    jest.setSystemTime(new Date('2026-10-23T19:30:00'));
    const r = render();
    expect(allText(r)).toContain('Hôm nay thế nào?');
    act(() => button(r, 'Check-in').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/checkin');
    act(() => renderer?.unmount());
    useFeelingStore.setState({ records: [{ id: 'f', loggedAtISO: '2026-10-23T19:00:00', cravingLevel: 2, hungerLevel: 2, mood: 'good', workoutCondition: null, note: '' }] });
    try {
      expect(allText(render())).not.toContain('Hôm nay thế nào?');
    } finally {
      useFeelingStore.setState({ records: [] });
    }
    act(() => renderer?.unmount());
    jest.setSystemTime(new Date('2026-10-23T18:30:00'));
    expect(allText(render())).not.toContain('Hôm nay thế nào?');
  });

  it("the date chip's day drives the hero, the tiles and the timeline (a past day: no next meal)", async () => {
    useSelectedDayStore.setState({ selectedKey: '2026-10-22' });
    try {
      const r = render();
      const text = allText(r);
      expect(text).toContain('Hôm qua');
      expect(text).not.toContain('Ghi món này');
      act(() => button(r, 'Thêm 250 ml nước').props.onPress());
      expect(useNutritionStore.getState().logs['2026-10-22'].waterMl).toBe(250);
      // "Chụp món" opens the camera from the tap, then hands the photo to Ghi bữa (analysed there at once).
      await act(async () => button(r, 'Chụp món').props.onPress());
      expect(mockPick).toHaveBeenCalledWith('camera');
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/add-food', params: { date: '2026-10-22', photo: '1' } });
      expect(takePendingMealPhoto()).toBe('blob:meal');
      // Cancelled: nothing opens. No camera: Ghi bữa opens so a photo can be picked there.
      mockPush.mockClear();
      mockPick.mockResolvedValueOnce(null);
      await act(async () => button(r, 'Chụp món').props.onPress());
      expect(mockPush).not.toHaveBeenCalled();
      mockPick.mockResolvedValueOnce({ error: 'cameraDenied' });
      await act(async () => button(r, 'Chụp món').props.onPress());
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/add-food', params: { date: '2026-10-22' } });
    } finally {
      useSelectedDayStore.setState({ selectedKey: null });
    }
  });

  it("on Monday shows last week's review card", () => {
    jest.setSystemTime(new Date('2026-10-26T10:00:00'));
    const r = render();
    expect(allText(r)).toMatch(/Tổng kết tuần 43/);
    act(() => button(r, 'Xem: Tổng kết tuần').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/weekly-report');
  });

  it("keeps last week's review card after Monday until it is closed (×) or the weekly report is opened", () => {
    jest.setSystemTime(new Date('2026-10-28T10:00:00')); // a Wednesday
    const r = render();
    expect(allText(r)).toMatch(/Tổng kết tuần 43/);
    expect(button(r, 'Ẩn thẻ tổng kết tuần')).toBeTruthy();
    act(() => renderer?.unmount());
    // What × (and opening the weekly report) records: last week's Monday. The card is gone from then on.
    useCelebrationStore.setState({ weeklyDoneKey: '2026-10-19' });
    expect(allText(render())).not.toMatch(/Tổng kết tuần 43/);
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
    const r = render();
    expect(allText(r)).toContain('Missions 1/7 done');
    act(() => button(r, "Today's missions").props.onPress());
    const text = allText(r);
    expect(text).toContain("Today's missions"); // the missions sheet
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
