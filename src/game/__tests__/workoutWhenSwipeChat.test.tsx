import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  deleteWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { WorkoutDetailDialog } from '../../components/quest/WorkoutDetailDialog';
import { useSettingsStore } from '../../store/useSettingsStore';
import { pushWorkoutEntry } from '../../sync/cloudSync';
import { editWorkoutWhen, movedWorkoutStart } from '../workoutWhen';
import { useToastStore } from '../../store/useToastStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';
import { isSidewaysDrag, swipedDayKey } from '../../utils/swipe';
import { chatOver, chatRepliesLeft, MAX_CHAT_REPLIES } from '../../temptation/stats';
import { cleanTurn, MAX_TURNS } from '../../../supabase/functions/_shared/tempt';

const NOW = new Date(2026, 10, 19, 18, 0);
const startAt = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();

describe('moving a workout to another day / start time', () => {
  it('keeps its own time of day on another day when no time is typed', () => {
    const at = new Date(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: '2026-11-17', clock: null }, NOW)!);
    expect(toDateKey(at)).toBe('2026-11-17');
    expect([at.getHours(), at.getMinutes()]).toEqual([6, 45]);
  });

  it('takes the typed start time, on the same day or another one', () => {
    const same = new Date(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: '2026-11-19', clock: [17, 30] }, NOW)!);
    expect([toDateKey(same), same.getHours(), same.getMinutes()]).toEqual(['2026-11-19', 17, 30]);
    const other = new Date(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: '2026-11-01', clock: [5, 5] }, NOW)!);
    expect([toDateKey(other), other.getHours(), other.getMinutes()]).toEqual(['2026-11-01', 5, 5]);
  });

  it('refuses a start in the future or a day that is not one', () => {
    expect(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: '2026-11-19', clock: [19, 0] }, NOW)).toBeNull();
    expect(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: '2026-11-20', clock: null }, NOW)).toBeNull();
    expect(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: '2026-02-31', clock: null }, NOW)).toBeNull();
    expect(movedWorkoutStart(startAt(2026, 11, 19, 6, 45), { dateKey: 'nope', clock: null }, NOW)).toBeNull();
  });

  describe('editWorkoutWhen', () => {
    const entry = { id: 'w1', label: 'Chạy bộ', durationMin: 30, caloriesBurned: 250, templateId: null, dateISO: startAt(2026, 11, 19, 6, 45) };
    beforeEach(() => {
      useWorkoutStore.setState({ entries: [entry] });
      (pushWorkoutEntry as jest.Mock).mockClear();
    });

    it('moves the entry (same id, synced with the new start, day totals follow) and Hoàn tác puts it back', () => {
      const moved = editWorkoutWhen('w1', { dateKey: '2026-11-18', clock: [20, 15] }, 'Đã chuyển', NOW);
      expect(moved).not.toBeNull();
      const store = useWorkoutStore.getState();
      expect(store.entriesForDateKey('2026-11-19')).toHaveLength(0);
      expect(store.entriesForDateKey('2026-11-18').map((e) => e.id)).toEqual(['w1']);
      expect(pushWorkoutEntry).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'w1', dateISO: moved }));
      expect(useToastStore.getState().toast?.text).toBe('Đã chuyển');
      useToastStore.getState().undo();
      expect(useWorkoutStore.getState().entries[0].dateISO).toBe(entry.dateISO);
      expect(pushWorkoutEntry).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'w1', dateISO: entry.dateISO }));
    });

    it('changes nothing for an unknown id, a future start or an unchanged form', () => {
      expect(editWorkoutWhen('nope', { dateKey: '2026-11-18', clock: null }, 'x', NOW)).toBeNull();
      expect(editWorkoutWhen('w1', { dateKey: '2026-11-19', clock: [23, 0] }, 'x', NOW)).toBeNull();
      expect(editWorkoutWhen('w1', { dateKey: '2026-11-19', clock: null }, 'x', NOW)).toBeNull();
      expect(useWorkoutStore.getState().entries[0].dateISO).toBe(entry.dateISO);
      expect(pushWorkoutEntry).not.toHaveBeenCalled();
    });
  });
});

describe('WorkoutDetailDialog: Ngày & giờ', () => {
  it('opens the form from the workout, saves the new start time with Hoàn tác and closes the sheet', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 19, 18, 0) });
    useSettingsStore.setState({ language: 'vi' });
    const entry = { id: 'w2', label: 'Đạp xe', durationMin: 40, caloriesBurned: 300, templateId: null, dateISO: startAt(2026, 11, 19, 7, 0) };
    useWorkoutStore.setState({ entries: [entry] });
    const onClose = jest.fn();
    let r: ReactTestRenderer | undefined;
    await act(async () => {
      r = create(<WorkoutDetailDialog entries={[entry]} lang="vi" onClose={onClose} editable />);
    });
    const byLabel = (label: string) => r!.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
    await act(async () => byLabel('Sửa ngày và giờ tập: Đạp xe').props.onPress());
    const time = r!.root.findAll((n) => n.props.testID === 'workout-when-time' && typeof n.props.onChangeText === 'function')[0];
    expect(time.props.value).toBe('07:00');
    await act(async () => time.props.onChangeText('05:10'));
    const save = r!.root.findAll((n) => n.props.title === 'Lưu' && typeof n.props.onPress === 'function')[0];
    await act(async () => save.props.onPress());
    const moved = new Date(useWorkoutStore.getState().entries[0].dateISO);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([5, 10]);
    expect(useToastStore.getState().toast?.text).toBe('Đã chuyển Đạp xe sang Hôm nay lúc 05:10');
    expect(onClose).toHaveBeenCalled();
    act(() => r!.unmount());
    jest.useRealTimers();
  });
});

describe('journal day swipe', () => {
  it('goes to the day before on a swipe right and the next day on a swipe left', () => {
    expect(swipedDayKey('2026-11-10', 80, 0.1, '2026-11-19')).toBe('2026-11-09');
    expect(swipedDayKey('2026-11-10', -80, -0.1, '2026-11-19')).toBe('2026-11-11');
    expect(swipedDayKey('2026-03-01', 30, 0.9, '2026-11-19')).toBe('2026-02-28');
    expect(swipedDayKey('2025-12-31', -30, -0.9, '2026-11-19')).toBe('2026-01-01');
  });

  it('never goes past today nor before the oldest day, and ignores a short slow drag', () => {
    expect(swipedDayKey('2026-11-19', -120, -1, '2026-11-19')).toBeNull();
    expect(swipedDayKey('2026-11-01', 120, 1, '2026-11-19', '2026-11-01')).toBeNull();
    expect(swipedDayKey('2026-11-10', 20, 0.1, '2026-11-19')).toBeNull();
  });

  it('takes only a clearly sideways drag (vertical scrolling stays a scroll)', () => {
    expect(isSidewaysDrag(40, 5)).toBe(true);
    expect(isSidewaysDrag(-40, 10)).toBe(true);
    expect(isSidewaysDrag(30, 20)).toBe(false);
    expect(isSidewaysDrag(10, 0)).toBe(false);
    expect(isSidewaysDrag(5, 80)).toBe(false);
  });
});

describe('teasing the temptation boss back: reply limit', () => {
  it('gives the player the same number of replies as the server allows', () => {
    expect(MAX_CHAT_REPLIES).toBe(3);
    expect(MAX_TURNS).toBe(MAX_CHAT_REPLIES);
  });

  it('counts the replies left and ends the chat at the last one or on a surrender', () => {
    expect([0, 1, 2, 3, 4].map(chatRepliesLeft)).toEqual([3, 2, 1, 0, 0]);
    expect(chatOver(1, 'insist')).toBe(false);
    expect(chatOver(1, 'concede')).toBe(true);
    expect(chatOver(3, 'retry')).toBe(true);
  });

  it('makes the boss give up on the player\'s third reply whatever the model said', () => {
    expect(cleanTurn({ move: 'insist', lines: ['Hừ, ăn đi mà!'] }, [], 1).move).toBe('insist');
    expect(cleanTurn({ move: 'insist', lines: ['Hừ, ăn đi mà!'] }, [], 2).move).toBe('concede');
  });
});
