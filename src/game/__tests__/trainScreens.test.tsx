import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { ids?: string; group?: string; id?: string } = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));
const mockSpeak = jest.fn<(text: string, o: { queue?: boolean }) => void>();
const mockStop = jest.fn();
jest.mock('../training/speech', () => ({
  speak: (text: string, o: { queue?: boolean }) => mockSpeak(text, o),
  stopSpeaking: () => mockStop(),
  isSpeechAvailable: () => true,
  preloadVoices: () => Promise.resolve(),
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

import TrainScreen from '../../../app/(tabs)/workout';
import DetailScreen from '../../../app/train/detail';
import SessionScreen from '../../../app/train/session';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTrainingStore } from '../../store/useTrainingStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { EXERCISE_BY_ID } from '../training/exercises';

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
  if (!found) throw new Error(`no pressable matched; labels: ${r.root.findAll((n) => typeof n.props.onPress === 'function').map((n) => n.props.accessibilityLabel).join(' | ')}`);
  return found;
}
const byLabel = (label: string) => (l: string) => l === label;
const press = (r: ReactTestRenderer, label: string) => act(() => pressable(r, byLabel(label)).props.onPress());
const isDisabled = (r: ReactTestRenderer, label: string) => !!pressable(r, byLabel(label)).props.accessibilityState?.disabled;

describe('Train tab, exercise detail and session', () => {
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
    jest.useFakeTimers({ now: new Date('2026-10-23T17:00:00') }); // Friday -> group B is suggested
    Object.values(mockRouter).forEach((m) => m.mockClear());
    mockParams = {};
    useSettingsStore.setState({ language: 'vi', startWeightKg: 110 });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106 }] });
    useWorkoutStore.setState({ entries: [] });
    useTrainingStore.setState({ progress: {} });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  describe('Train tab', () => {
    it("pre-selects the day's group and says why", () => {
      const r = render(<TrainScreen />);
      const text = allText(r);
      expect(text).toContain('Nhiệm vụ Tập luyện');
      expect(text).toContain('Hôm nay gợi ý nhóm B');
      expect(text).toContain('3 đã chọn');
      for (const name of ['Chống đẩy tường', 'Dip ghế co gối', 'Dead bug']) {
        expect(pressable(r, byLabel(`Chọn ${name}`)).props.accessibilityState.selected).toBe(true);
      }
      expect(pressable(r, byLabel('Chọn Squat ngồi ghế')).props.accessibilityState.selected).toBe(false);
      expect(text).toContain('3 bài + cằm lùi');
    });

    it('swaps the selection when another group is chosen and notes the override', () => {
      const r = render(<TrainScreen />);
      press(r, 'A · Thân dưới');
      const text = allText(r);
      expect(text).toContain('Hôm nay gợi ý B · bạn đổi sang A');
      expect(pressable(r, byLabel('Chọn Squat ngồi ghế')).props.accessibilityState.selected).toBe(true);
      expect(pressable(r, byLabel('Chọn Dead bug')).props.accessibilityState.selected).toBe(false);
    });

    it('allows 2-3 exercises only and blocks a fourth with a visible reason', () => {
      const r = render(<TrainScreen />);
      press(r, 'Chọn Squat ngồi ghế'); // a fourth
      expect(pressable(r, byLabel('Chọn Squat ngồi ghế')).props.accessibilityState.selected).toBe(false);
      expect(allText(r)).toContain('Tối đa 3 bài mỗi buổi');
      press(r, 'Chọn Dead bug');
      press(r, 'Chọn Dip ghế co gối'); // down to one
      expect(allText(r)).toContain('Chọn ít nhất 2 bài');
      expect(isDisabled(r, 'Bắt đầu')).toBe(true);
      press(r, 'Chọn Squat ngồi ghế');
      expect(isDisabled(r, 'Bắt đầu')).toBe(false);
    });

    it('starts the session with the picked exercises plus the always-on chin tuck', () => {
      const r = render(<TrainScreen />);
      press(r, 'Bắt đầu');
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/train/session',
        params: { ids: 'wallPushup,chairDip,deadBug,chinTuck', group: 'B' },
      });
    });

    it('shows each exercise at the level the user has reached', () => {
      useTrainingStore.setState({ progress: { chairSquat: { level: 3, lastChangeISO: '2026-10-10T08:00:00.000Z', ratings: [] } } });
      const r = render(<TrainScreen />);
      expect(allText(r)).toMatch(/3 × 15\s+·\s+Cấp 3/);
    });

    it('opens the exercise detail', () => {
      const r = render(<TrainScreen />);
      press(r, 'Xem cách tập Dead bug');
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/train/detail', params: { id: 'deadBug', group: 'B' } });
    });

    it('sums up what was already trained today', () => {
      useWorkoutStore.setState({
        entries: [{ id: 'x', dateISO: '2026-10-23T08:00:00', templateId: null, label: 'Walk', durationMin: 25, caloriesBurned: 110 }],
      });
      expect(allText(render(<TrainScreen />))).toContain('25 phút · 110 kcal');
    });

    it('rests on Sunday but still lets the user pick a group', () => {
      jest.setSystemTime(new Date('2026-10-25T17:00:00'));
      const text = allText(render(<TrainScreen />));
      expect(text).toContain('Chủ nhật gợi ý nghỉ chủ động · bạn tập nhóm A');
    });
  });

  describe('Exercise detail', () => {
    it('shows the steps, the four levels with the current one marked, and starts that exercise alone', () => {
      useTrainingStore.setState({ progress: { chairSquat: { level: 2, lastChangeISO: '2026-10-10T08:00:00.000Z', ratings: [] } } });
      mockParams = { id: 'chairSquat', group: 'A' };
      const r = render(<DetailScreen />);
      const text = allText(r);
      expect(text).toContain('Squat ngồi ghế');
      expect(text).toContain('Đẩy mông ra sau như sắp ngồi');
      expect(text).toContain('ĐANG Ở');
      for (const rx of ['3 × 8', '3 × 12', '3 × 15', '3 × 12 · không ghế']) expect(text).toContain(rx);
      expect(text).toContain('Hôm nay: 3 set × 12');
      press(r, 'Bắt đầu bài này');
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/train/session', params: { ids: 'chairSquat', group: 'A' } });
    });

    it('does not crash on an unknown exercise id', () => {
      mockParams = { id: 'nope' };
      expect(() => render(<DetailScreen />)).not.toThrow();
    });
  });

  describe('Session', () => {
    function finishAllSets(r: ReactTestRenderer, sets: number) {
      for (let i = 0; i < sets; i++) {
        press(r, 'Xong set');
        if (i < sets - 1) press(r, 'Bỏ qua nghỉ');
      }
    }

    it('counts reps, rests between sets and logs one workout at the end', () => {
      mockParams = { ids: 'chairSquat', group: 'A' };
      const r = render(<SessionScreen />);
      expect(allText(r)).toContain('Set 1 / 3');
      press(r, '+1 lần');
      press(r, '+1 lần');
      expect(allText(r)).toMatch(/SỐ LẦN\s+2\s+Set 1 \/ 3/);
      press(r, 'Xong set');
      expect(allText(r)).toContain('Set 2 / 3');
      expect(allText(r)).toMatch(/NGHỈ\s+40/); // rest countdown shows the exercise's rest
      press(r, 'Bỏ qua nghỉ');
      expect(allText(r)).toMatch(/SỐ LẦN\s+0\s+Set 2 \/ 3/);
      press(r, 'Xong set');
      press(r, 'Bỏ qua nghỉ');
      expect(useWorkoutStore.getState().entries).toHaveLength(0); // nothing is logged before the last set
      press(r, 'Xong set');

      const entries = useWorkoutStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].label).toBe('Squat ngồi ghế');
      expect(entries[0].templateId).toBe('home-A');
      expect(entries[0].durationMin).toBe(1);
      expect(entries[0].caloriesBurned).toBe(6); // 3.5 MET x 106 kg x 1 min
      expect(allText(r)).toContain('Nhiệm vụ hoàn thành');
      expect(allText(r)).toContain('1 bài × set');
    });

    it('pays the workout XP only when the session reaches the 10-minute mission minimum', () => {
      mockParams = { ids: 'chairSquat', group: 'A' };
      const short = render(<SessionScreen />);
      finishAllSets(short, 3);
      expect(allText(short)).not.toContain('+60 XP');
      expect(allText(short)).toContain('nhiệm vụ Tập luyện cần ít nhất 10 phút');
      act(() => short.unmount());
      renderer = undefined;

      useWorkoutStore.setState({ entries: [] });
      const long = render(<SessionScreen />);
      act(() => {
        jest.setSystemTime(new Date('2026-10-23T17:12:00'));
        jest.advanceTimersByTime(1000);
      });
      finishAllSets(long, 3);
      expect(allText(long)).toContain('+60 XP');
      expect(useWorkoutStore.getState().entries[0].durationMin).toBeGreaterThanOrEqual(12);
    });

    it('does not promise XP again when today\'s mission was already done', () => {
      useWorkoutStore.setState({
        entries: [{ id: 'x', dateISO: '2026-10-23T08:00:00', templateId: null, label: 'Walk', durationMin: 30, caloriesBurned: 150 }],
      });
      mockParams = { ids: 'chairSquat', group: 'A' };
      const r = render(<SessionScreen />);
      act(() => {
        jest.setSystemTime(new Date('2026-10-23T17:12:00'));
        jest.advanceTimersByTime(1000);
      });
      finishAllSets(r, 3);
      expect(allText(r)).not.toContain('+60 XP');
      expect(allText(r)).toContain('đã hoàn thành trước đó');
    });

    it('runs a timed exercise from a countdown and finishes the set when it reaches zero', () => {
      mockParams = { ids: 'kneePlank', group: 'A' };
      const r = render(<SessionScreen />);
      expect(allText(r)).toMatch(/GIÂY\s+15/);
      press(r, 'Bắt đầu đếm');
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(allText(r)).toMatch(/GIÂY\s+10/);
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(allText(r)).toMatch(/NGHỈ\s+30/); // set finished by itself, now resting
    });

    it('levels an exercise up from the done screen when the previous session was also easy', () => {
      useTrainingStore.setState({
        progress: { chairSquat: { level: 1, lastChangeISO: null, ratings: [{ dateISO: '2026-10-21T17:00:00.000Z', rating: 'easy' }] } },
      });
      mockParams = { ids: 'chairSquat', group: 'A' };
      const r = render(<SessionScreen />);
      finishAllSets(r, 3);
      expect(allText(r)).toContain('Giữ nguyên các cấp'); // nothing rated yet -> nothing changes
      press(r, 'Squat ngồi ghế: Dễ');
      expect(allText(r)).toContain('Squat ngồi ghế lên Cấp 2');
      expect(useTrainingStore.getState().progress.chairSquat?.level).toBe(1); // a preview only, until "Về trại"
      press(r, 'Về trại');
      expect(useTrainingStore.getState().progress.chairSquat?.level).toBe(2);
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    });

    it('keeps the level after a hard session and skips unrated exercises', () => {
      mockParams = { ids: 'chairSquat', group: 'A' };
      const r = render(<SessionScreen />);
      finishAllSets(r, 3);
      press(r, 'Về trại'); // no rating at all
      expect(useTrainingStore.getState().progress.chairSquat).toBeUndefined();

      act(() => r.unmount());
      renderer = undefined;
      useWorkoutStore.setState({ entries: [] });
      const r2 = render(<SessionScreen />);
      finishAllSets(r2, 3);
      press(r2, 'Squat ngồi ghế: Khó');
      press(r2, 'Về trại');
      expect(useTrainingStore.getState().progress.chairSquat?.level).toBe(1);
      expect(useTrainingStore.getState().progress.chairSquat?.ratings.map((x) => x.rating)).toEqual(['hard']);
    });

    it('asks before throwing a workout away', () => {
      mockParams = { ids: 'chairSquat', group: 'A' };
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const r = render(<SessionScreen />);
      press(r, 'Thoát buổi tập');
      expect(alert).toHaveBeenCalledTimes(1);
      expect(mockRouter.back).not.toHaveBeenCalled(); // nothing is thrown away until the user confirms
      const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      expect(buttons.map((b) => b.text)).toEqual(['Tiếp tục tập', 'Thoát']);
      act(() => buttons[1].onPress?.());
      expect(mockRouter.back).toHaveBeenCalled();
      alert.mockRestore();
      expect(useWorkoutStore.getState().entries).toHaveLength(0);
    });

    it('speaks English when the language is English', () => {
      useSettingsStore.setState({ language: 'en' });
      mockParams = { ids: 'chairSquat', group: 'A' };
      const text = allText(render(<SessionScreen />));
      expect(text).toContain('Chair squat');
      expect(text).toContain('REPS');
    });
  });
  describe('Session voice guidance', () => {
    const spoken = () => mockSpeak.mock.calls.map(([text]) => text);

    beforeEach(() => {
      mockSpeak.mockClear();
      mockStop.mockClear();
      useTrainingStore.setState({ voiceOn: true, voiceLang: 'en', voiceGender: 'female' });
      mockParams = { ids: 'chairSquat', group: 'A' };
    });

    it('briefs the first set in order: name, amount, the steps, then asks to press start', () => {
      render(<SessionScreen />);
      expect(spoken()).toEqual([
        'Chair squat',
        '3 sets of 8 reps.',
        ...EXERCISE_BY_ID.chairSquat.steps.map((st) => st.en),
        'Press start when you are ready.',
      ]);
      // The script is queued sentence by sentence, behind a stop that clears anything stale.
      expect(mockSpeak.mock.calls.every(([, o]) => o.queue === true)).toBe(true);
      expect(mockStop).toHaveBeenCalled();
    });

    it('counts reps aloud on a timer, and ends the set by itself when the last rep is counted', () => {
      const r = render(<SessionScreen />);
      mockSpeak.mockClear();
      press(r, 'Bắt đầu, tự đếm');
      expect(spoken()).toEqual(['Get ready.']);
      act(() => {
        jest.advanceTimersByTime(2000 + 3000 + 200); // lead-in, then the first 3-second rep
      });
      expect(allText(r)).toMatch(/SỐ LẦN\s+1/);
      expect(spoken()).toContain('1');
      act(() => {
        jest.advanceTimersByTime(3000 * 7);
      });
      expect(spoken().filter((t) => /^\d+$/.test(t))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      // 8 reps done: nobody tapped "Xong set", the clock did. Now resting before set 2.
      expect(allText(r)).toMatch(/NGHỈ\s+4[01]/); // 40 s rest (a tick of slack)
      expect(spoken().some((t) => t.startsWith('Rest for 40 seconds. Next up: Chair squat'))).toBe(true);
    });

    it('hands over to the user on a manual tap: counting stops and the pending speech is cut', () => {
      const r = render(<SessionScreen />);
      press(r, 'Bắt đầu, tự đếm');
      act(() => {
        jest.advanceTimersByTime(2000 + 3000 * 2 + 200);
      });
      expect(allText(r)).toMatch(/SỐ LẦN\s+2/);
      mockStop.mockClear();
      press(r, '+1 lần');
      expect(mockStop).toHaveBeenCalled();
      expect(allText(r)).toMatch(/SỐ LẦN\s+3/);
      mockSpeak.mockClear();
      act(() => {
        jest.advanceTimersByTime(20_000);
      });
      expect(allText(r)).toMatch(/SỐ LẦN\s+3/); // the timer no longer moves it
      expect(spoken()).toEqual([]);
      expect(allText(r)).toContain('Set 1 / 3');
    });

    it('can be started again and carries on after the reps already done', () => {
      const r = render(<SessionScreen />);
      press(r, 'Bắt đầu, tự đếm');
      act(() => {
        jest.advanceTimersByTime(2000 + 3000 * 2 + 200);
      });
      press(r, 'Dừng đếm');
      expect(allText(r)).toMatch(/SỐ LẦN\s+2/);
      mockSpeak.mockClear();
      press(r, 'Bắt đầu, tự đếm');
      expect(spoken()).toEqual([]); // resuming mid-set: no "get ready"
      act(() => {
        jest.advanceTimersByTime(3000 + 200);
      });
      expect(allText(r)).toMatch(/SỐ LẦN\s+3/);
    });

    it('calls out a timed hold and counts the last seconds', () => {
      mockParams = { ids: 'kneePlank', group: 'A' };
      const r = render(<SessionScreen />);
      mockSpeak.mockClear();
      press(r, 'Bắt đầu đếm');
      expect(spoken()).toEqual(['Go!']);
      // Advance one second at a time, the way the screen's own clock ticks.
      for (let t = 0; t < 14; t++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(spoken().filter((t) => /^\d+$/.test(t))).toEqual(['10', '5', '4', '3', '2', '1']);
      expect(allText(r)).toMatch(/GIÂY\s+1/);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(allText(r)).toMatch(/NGHỈ/); // zero reached: set over, no tap needed
    });

    it('counts the last three seconds of a rest', () => {
      const r = render(<SessionScreen />);
      press(r, 'Xong set');
      mockSpeak.mockClear();
      act(() => {
        jest.advanceTimersByTime(37_000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(spoken().filter((t) => /^\d+$/.test(t))).toEqual(['3', '2', '1']);
      expect(allText(r)).toContain('Set 2 / 3');
      expect(spoken()).toContain('Set 2 of 3.'); // rest ran out by itself and the next set is briefed
    });

    it('is silent when the voice is switched off, and cuts what is being said', () => {
      const r = render(<SessionScreen />);
      mockStop.mockClear();
      mockSpeak.mockClear();
      act(() => pressable(r, byLabel('Giọng nói')).props.onPress());
      expect(useTrainingStore.getState().voiceOn).toBe(false);
      expect(mockStop).toHaveBeenCalled();
      press(r, 'Bắt đầu, tự đếm');
      act(() => {
        jest.advanceTimersByTime(2000 + 3000 + 200);
      });
      expect(allText(r)).toMatch(/SỐ LẦN\s+1/); // still counts, just without sound
      press(r, 'Xong set');
      expect(spoken()).toEqual([]);
    });

    it('stays off for the next session once switched off, and starts silent', () => {
      useTrainingStore.setState({ voiceOn: false });
      render(<SessionScreen />);
      expect(spoken()).toEqual([]);
    });

    it('stops speaking when the workout is quit and when the screen goes away', () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const r = render(<SessionScreen />);
      press(r, 'Thoát buổi tập');
      const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      mockStop.mockClear();
      act(() => buttons[1].onPress?.());
      expect(mockStop).toHaveBeenCalled();
      alert.mockRestore();
      mockStop.mockClear();
      act(() => renderer?.unmount());
      renderer = undefined;
      expect(mockStop).toHaveBeenCalled();
    });

    it('speaks English even though the screen is in Vietnamese (and in English too)', () => {
      for (const language of ['vi', 'en'] as const) {
        mockSpeak.mockClear();
        useSettingsStore.setState({ language });
        render(<SessionScreen />);
        expect(spoken()[0]).toBe('Chair squat');
        expect(spoken()[1]).toBe('3 sets of 8 reps.');
        expect(spoken().every((t) => !/[À-ỹ]/.test(t))).toBe(true);
        act(() => renderer?.unmount());
        renderer = undefined;
      }
      // The on-screen text still follows the app language.
      useSettingsStore.setState({ language: 'vi' });
      expect(allText(render(<SessionScreen />))).toContain('Squat ngồi ghế');
    });

    it('speaks Vietnamese when the voice language is Vietnamese, with the chosen gender, even if the app is in English', () => {
      useSettingsStore.setState({ language: 'en' });
      useTrainingStore.setState({ voiceLang: 'vi', voiceGender: 'male' });
      render(<SessionScreen />);
      expect(spoken()[0]).toBe('Squat ngồi ghế');
      expect(spoken()[1]).toBe('3 hiệp, mỗi hiệp 8 lần.');
      expect(spoken()).toContain(EXERCISE_BY_ID.chairSquat.steps[0].vi);
      expect(mockSpeak.mock.calls.every(([, o]) => (o as { voice?: { lang: string; gender: string } }).voice?.lang === 'vi')).toBe(true);
      expect((mockSpeak.mock.calls[0][1] as { voice: { gender: string } }).voice.gender).toBe('male');
    });

    it('switches language and gender from the picker: saved, the old speech is cut and the new voice says hello', () => {
      useSettingsStore.setState({ language: 'vi' });
      const r = render(<SessionScreen />);
      mockSpeak.mockClear();
      mockStop.mockClear();
      act(() => pressable(r, byLabel('Ngôn ngữ giọng nói: Tiếng Việt')).props.onPress());
      expect(useTrainingStore.getState().voiceLang).toBe('vi');
      expect(mockStop).toHaveBeenCalled();
      expect(spoken()).toEqual(['Xin chào! Mình sẽ hướng dẫn bạn tập.']);
      act(() => pressable(r, byLabel('Giọng nam hay nữ: Nam')).props.onPress());
      expect(useTrainingStore.getState().voiceGender).toBe('male');
      const last = mockSpeak.mock.calls[mockSpeak.mock.calls.length - 1][1] as { voice: { lang: string; gender: string } };
      expect(last.voice).toEqual({ lang: 'vi', gender: 'male' });
      // Counting after the switch is in the new voice too.
      mockSpeak.mockClear();
      press(r, 'Bắt đầu, tự đếm');
      expect(spoken()).toEqual(['Chuẩn bị.']);
    });

    it('cheers when the workout is complete', () => {
      mockParams = { ids: 'kneePlank', group: 'A' };
      const r = render(<SessionScreen />);
      for (let i = 0; i < 3; i++) {
        press(r, 'Bắt đầu đếm');
        act(() => {
          jest.advanceTimersByTime(15_000);
        });
        if (i < 2) press(r, 'Bỏ qua nghỉ');
      }
      expect(spoken()).toContain('Workout complete. Great job!');
    });
  });
});
