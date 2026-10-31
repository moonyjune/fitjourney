import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockNet = jest.fn<() => Promise<{ isConnected: boolean; isInternetReachable: boolean }>>();
const mockUpsert = jest.fn<(...a: unknown[]) => Promise<{ error: unknown }>>();
const eqCalls: [string, unknown][] = [];
const mockDelete = jest.fn();
const mockFrom = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => mockNet(), addEventListener: () => () => undefined },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), auth: { signOut: jest.fn() } },
}));

import { flushSyncQueue, pushHabit, pushHabitCheck, pushUserData, pushWeightEntry, whenPushesSettled } from '../../sync/cloudSync';
import { mergeHabits } from '../../sync/restore';
import { useSyncQueueStore } from '../../sync/syncQueue';
import { useAuthStore } from '../../store/useAuthStore';
import type { Habit } from '../../habits/types';

const habit: Habit = { id: 'diary-h-07', name: 'Uống đủ 3 lít nước/ngày', status: 'formed', assessment: 'tốt', kaizen: 'rải đều', measuredBy: '', tracked: true, auto: 'water', sort: 7, archived: false };
const signIn = (devMode = false) => useAuthStore.setState({ session: { user: { id: 'user-123', email: 'a@b.c' } } as never, devMode });

beforeEach(() => {
  jest.clearAllMocks();
  eqCalls.length = 0;
  useSyncQueueStore.setState({ pending: [] });
  mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockUpsert.mockResolvedValue({ error: null });
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return eqCalls.length % 3 === 0 ? Promise.resolve({ error: null }) : chain;
  };
  mockDelete.mockReturnValue(chain);
  mockFrom.mockReturnValue({ upsert: (...a: unknown[]) => mockUpsert(...a), delete: () => mockDelete() });
  signIn();
});

describe('habit sync', () => {
  it('upserts a habit under the signed-in user, keyed by the app’s own id', async () => {
    await pushHabit(habit);
    expect(mockFrom).toHaveBeenCalledWith('habits');
    const [row, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({ user_id: 'user-123', client_id: 'diary-h-07', name: 'Uống đủ 3 lít nước/ngày', status: 'formed', tracked: true, auto: 'water', sort: 7, archived: false, measured_by: '' });
    expect(options).toEqual({ onConflict: 'user_id,client_id' });
  });

  it('upserts a tick, and deletes it when the tick was cleared', async () => {
    await pushHabitCheck('diary-h-07', '2026-10-05', 'done');
    expect(mockFrom).toHaveBeenLastCalledWith('habit_checks');
    const [row, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({ user_id: 'user-123', habit_client_id: 'diary-h-07', entry_date: '2026-10-05', value: 'done' });
    expect(options).toEqual({ onConflict: 'user_id,habit_client_id,entry_date' });

    await pushHabitCheck('diary-h-07', '2026-10-05', null);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(eqCalls).toEqual([
      ['user_id', 'user-123'],
      ['habit_client_id', 'diary-h-07'],
      ['entry_date', '2026-10-05'],
    ]);
  });

  it('does nothing without a real signed-in account (signed out, or the offline dev account)', async () => {
    useAuthStore.setState({ session: null, devMode: false });
    await pushHabit(habit);
    signIn(true);
    await pushHabitCheck('x', '2026-10-05', 'done');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(useSyncQueueStore.getState().pending).toEqual([]);
  });

  it('queues writes made offline, one per record (the newest tick wins), and sends them when the connection is back', async () => {
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await pushHabit(habit);
    await pushHabitCheck('diary-h-07', '2026-10-05', 'done');
    await pushHabitCheck('diary-h-07', '2026-10-05', null);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(useSyncQueueStore.getState().pending.map((p) => p.type)).toEqual(['habit', 'habitCheck']);

    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await flushSyncQueue();
    expect(useSyncQueueStore.getState().pending).toEqual([]);
    expect(mockFrom.mock.calls.map((c) => c[0])).toEqual(['habits', 'habit_checks']);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('queues a write the server rejected so it is not lost', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('boom') });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await pushHabit(habit);
    warn.mockRestore();
    expect(useSyncQueueStore.getState().pending).toHaveLength(1);
    expect(useSyncQueueStore.getState().pending[0]).toMatchObject({ type: 'habit', payload: { id: 'diary-h-07' } });
  });
});

describe('habit formed mark sync', () => {
  it('sends the user\'s formed mark (null = follow the data)', async () => {
    await pushHabit({ ...habit, formedMark: true });
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ formed_mark: true });
    await pushHabit(habit);
    expect(mockUpsert.mock.calls[1][0]).toMatchObject({ formed_mark: null });
  });

  it('retries without formed_mark while the cloud table has no such column yet (PGRST204 / 42703)', async () => {
    for (const code of ['PGRST204', '42703']) {
      mockUpsert.mockReset();
      mockUpsert.mockResolvedValueOnce({ error: { code, message: "Could not find the 'formed_mark' column" } }).mockResolvedValue({ error: null });
      await pushHabit({ ...habit, formedMark: false });
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      const retry = mockUpsert.mock.calls[1][0] as Record<string, unknown>;
      expect(retry).not.toHaveProperty('formed_mark');
      expect(retry).toMatchObject({ client_id: 'diary-h-07', name: 'Uống đủ 3 lít nước/ngày' });
      expect(useSyncQueueStore.getState().pending).toEqual([]);
    }
  });

  it('does not retry on other errors (the write is queued instead)', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await pushHabit(habit);
    warn.mockRestore();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(useSyncQueueStore.getState().pending).toHaveLength(1);
  });

  it('restores the mark from the cloud row, and leaves it out when the column is missing or null', () => {
    const row = { client_id: 'h-a', name: 'A', status: 'building', tracked: true, sort: 1, archived: false };
    const [a, b, c] = mergeHabits([], [
      { ...row, formed_mark: true },
      { ...row, client_id: 'h-b', formed_mark: null },
      { ...row, client_id: 'h-c', formed_mark: false },
    ]);
    expect(a.formedMark).toBe(true);
    expect(b).not.toHaveProperty('formedMark');
    expect(c.formedMark).toBe(false);
  });
});

describe('weights and settings sync', () => {
  it('upserts a weigh-in by its own id with the time it was taken, so sending it twice makes one row', async () => {
    await pushWeightEntry({ id: 'diary-w-1', dateISO: '2026-10-01T14:00:00.000Z', weightKg: 107.7, note: 'Cân tối' });
    expect(mockFrom).toHaveBeenCalledWith('weight_entries');
    const [row, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({ user_id: 'user-123', client_id: 'diary-w-1', entry_date: '2026-10-01', logged_at: '2026-10-01T14:00:00.000Z', weight_kg: 107.7, note: 'Cân tối' });
    expect(options).toEqual({ onConflict: 'user_id,client_id' });
  });

  it('saves a settings blob under its key, and queues it when offline', async () => {
    await pushUserData('limits', { purineMg: 600 });
    expect(mockFrom).toHaveBeenLastCalledWith('user_data');
    const [row, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({ user_id: 'user-123', key: 'limits', value: { purineMg: 600 } });
    expect(options).toEqual({ onConflict: 'user_id,key' });

    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await pushUserData('uricTarget', 350);
    expect(useSyncQueueStore.getState().pending).toEqual([expect.objectContaining({ type: 'userData', payload: { key: 'uricTarget', value: 350 } })]);
    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await flushSyncQueue();
    expect(mockUpsert).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'uricTarget', value: 350 }), { onConflict: 'user_id,key' });
    expect(useSyncQueueStore.getState().pending).toHaveLength(0);
  });

  it('whenPushesSettled waits for writes that were started but not awaited', async () => {
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    void pushWeightEntry({ id: 'w', dateISO: '2026-10-01T05:00:00.000Z', weightKg: 100 });
    expect(useSyncQueueStore.getState().pending).toHaveLength(0);
    await whenPushesSettled();
    expect(useSyncQueueStore.getState().pending).toHaveLength(1);
  });
});
