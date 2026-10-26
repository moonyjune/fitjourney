import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => ({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined } }));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

const mockDeletes: { table: string; col: string; value: string }[] = [];
let mockFailTable: string | null = null;
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    from: (table: string) => ({
      delete: () => ({
        eq: () => ({
          lt: async (col: string, value: string) => {
            mockDeletes.push({ table, col, value });
            return { error: mockFailTable === table ? { message: 'boom' } : null };
          },
        }),
      }),
    }),
  },
}));
jest.mock('../../sync/cloudSync', () => ({ currentUserId: () => 'u1', whenPushesSettled: async () => undefined, pushUserData: jest.fn(), pushNutritionLog: jest.fn(), pushWeightEntry: jest.fn(), pushWorkoutEntry: jest.fn(), pushFeelingRecord: jest.fn(), pushProofPhoto: jest.fn() }));

import { purgeBefore } from '../../sync/purgeBefore';
import { useAuthStore } from '../../store/useAuthStore';
import { useFeelingStore } from '../../store/useFeelingStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useSyncQueueStore } from '../../sync/syncQueue';

const day = (dateISO: string) => ({ dateISO, mealsEaten: {}, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 3000 });

beforeEach(() => {
  mockDeletes.length = 0;
  mockFailTable = null;
  useAuthStore.setState({ session: { user: { id: 'u1' } } as never, devMode: false });
  useNutritionStore.setState({ logs: { '2026-09-14': day('2026-09-14'), '2026-09-19': day('2026-09-19'), '2026-09-20': day('2026-09-20'), '2026-09-21': day('2026-09-21'), '2026-10-01': day('2026-10-01') } });
  useWeightStore.setState({ entries: [{ id: 'w1', dateISO: '2026-09-14T05:00:00.000Z', weightKg: 90 }, { id: 'w2', dateISO: '2026-09-22T05:00:00.000Z', weightKg: 89 }] });
  useWorkoutStore.setState({ entries: [{ id: 'k1', dateISO: '2026-09-19T05:00:00.000Z', templateId: null, label: 'x', durationMin: 10, caloriesBurned: 50 }] });
  useFeelingStore.setState({ records: [{ id: 'f1', loggedAtISO: '2026-09-20T05:00:00.000Z', cravingLevel: 1, hungerLevel: 1, mood: 'good', workoutCondition: null, note: '' }] });
  useSyncQueueStore.setState({ pending: [{ id: 'q1', type: 'nutritionLog', payload: day('2026-09-14') }, { id: 'q2', type: 'nutritionLog', payload: day('2026-10-01') }] });
});

describe('purgeBefore', () => {
  it('deletes the days before the cutoff in the cloud and on the device, and keeps the cutoff day on', async () => {
    const r = await purgeBefore('2026-09-21');
    expect(r).toMatchObject({ ok: true, days: 3, weights: 1, workouts: 1, feelings: 1 });
    expect(Object.keys(useNutritionStore.getState().logs).sort()).toEqual(['2026-09-21', '2026-10-01']);
    expect(useWeightStore.getState().entries.map((e) => e.id)).toEqual(['w2']);
    expect(useWorkoutStore.getState().entries).toEqual([]);
    expect(useFeelingStore.getState().records).toEqual([]);
    expect(mockDeletes.map((d) => d.table).sort()).toEqual(['feeling_records', 'nutrition_logs', 'proof_photos', 'weight_entries', 'workout_entries']);
    expect(mockDeletes.find((d) => d.table === 'nutrition_logs')).toMatchObject({ col: 'entry_date', value: '2026-09-21' });
  });

  it('drops queued pushes of removed days so they cannot bring a day back', async () => {
    await purgeBefore('2026-09-21');
    expect(useSyncQueueStore.getState().pending.map((p) => p.id)).toEqual(['q2']);
  });

  it('removes nothing on the device when the cloud delete fails', async () => {
    mockFailTable = 'weight_entries';
    const r = await purgeBefore('2026-09-21');
    expect(r.ok).toBe(false);
    expect(Object.keys(useNutritionStore.getState().logs)).toHaveLength(5);
    expect(useWeightStore.getState().entries).toHaveLength(2);
  });

  it('refuses a malformed date', async () => {
    expect((await purgeBefore('21/09/2026')).ok).toBe(false);
    expect(mockDeletes).toHaveLength(0);
  });
});
