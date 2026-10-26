import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockNet = jest.fn<() => Promise<{ isConnected: boolean; isInternetReachable: boolean }>>();
const mockUpsert = jest.fn<(...a: unknown[]) => Promise<{ error: unknown }>>();
const eqCalls: [string, unknown][] = [];
const mockDeleteCalled = jest.fn();
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

import { deleteUricReading, flushSyncQueue, pushUricReading } from '../../sync/cloudSync';
import { useSyncQueueStore } from '../../sync/syncQueue';
import { useAuthStore } from '../../store/useAuthStore';
import type { UricReading } from '../../uric/types';

const reading: UricReading = { id: 'diary-u-1', dateKey: '2026-10-16', valueUmol: 457, note: 'xét nghiệm' };
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
    return eqCalls.length % 2 === 0 ? Promise.resolve({ error: null }) : chain;
  };
  mockFrom.mockReturnValue({
    upsert: (...a: unknown[]) => mockUpsert(...a),
    delete: () => {
      mockDeleteCalled();
      return chain;
    },
  });
  signIn();
});

describe('uric sync', () => {
  it('upserts a reading under the signed-in user, keyed by the app’s own id', async () => {
    await pushUricReading(reading);
    expect(mockFrom).toHaveBeenCalledWith('uric_readings');
    const [row, options] = mockUpsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(row).toMatchObject({ user_id: 'user-123', client_id: 'diary-u-1', entry_date: '2026-10-16', value_umol: 457, note: 'xét nghiệm' });
    expect(options).toEqual({ onConflict: 'user_id,client_id' });
  });

  it('deletes only this user’s row with that id', async () => {
    await deleteUricReading('diary-u-1');
    expect(mockFrom).toHaveBeenCalledWith('uric_readings');
    expect(mockDeleteCalled).toHaveBeenCalledTimes(1);
    expect(eqCalls).toEqual([
      ['user_id', 'user-123'],
      ['client_id', 'diary-u-1'],
    ]);
  });

  it('does nothing without a real signed-in account', async () => {
    useAuthStore.setState({ session: null, devMode: false });
    await pushUricReading(reading);
    signIn(true);
    await deleteUricReading('x');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(useSyncQueueStore.getState().pending).toEqual([]);
  });

  it('queues writes made offline and replays them in order when the connection is back', async () => {
    mockNet.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await pushUricReading(reading);
    await deleteUricReading('diary-u-1');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(useSyncQueueStore.getState().pending.map((p) => p.type)).toEqual(['uricReading', 'uricDelete']);

    mockNet.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await flushSyncQueue();
    expect(useSyncQueueStore.getState().pending).toEqual([]);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockDeleteCalled).toHaveBeenCalledTimes(1);
  });

  it('queues a write the server rejected so it is not lost', async () => {
    mockUpsert.mockResolvedValue({ error: new Error('boom') });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await pushUricReading(reading);
    warn.mockRestore();
    expect(useSyncQueueStore.getState().pending[0]).toMatchObject({ type: 'uricReading', payload: { id: 'diary-u-1' } });
  });
});
