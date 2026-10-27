import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }), addEventListener: () => () => undefined },
}));
const mockDownload = jest.fn(async (_url: string, id: string) => `file:///docs/proofs/${id}.jpg`);
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: jest.fn(),
  deletePersistedPhoto: jest.fn(async () => undefined),
  downloadPhoto: (url: string, id: string) => mockDownload(url, id),
}));

type Row = Record<string, unknown>;
let mockOnline = true;
let mockUser: string | null = 'u1';
let mockRows: Row[] = [];
const mockUploads: string[] = [];
const mockRemoved: string[][] = [];
let mockInsertCount = 0;
let mockUpdateCount = 0;

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          mockUploads.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          mockRemoved.push(paths);
          return { error: null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` } }),
      }),
    },
    from: () => {
      let filter: Row = {};
      let like: string | null = null;
      const matches = () =>
        mockRows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v) && (!like || String(r.photo_path).startsWith(like.replace('%', ''))));
      const query: Record<string, unknown> = {
        eq: (c: string, v: unknown) => {
          filter = { ...filter, [c]: v };
          return query;
        },
        like: (_c: string, v: string) => {
          like = v;
          return query;
        },
        order: () => query,
        limit: () => query,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: matches(), error: null }).then(resolve),
      };
      return {
        select: () => query,
        insert: async (row: Row) => {
          mockInsertCount += 1;
          mockRows.push({ id: `r${mockInsertCount}`, ...row });
          return { error: null };
        },
        update: (row: Row) => ({
          eq: async (_c: string, id: unknown) => {
            mockUpdateCount += 1;
            mockRows = mockRows.map((r) => (r.id === id ? { ...r, ...row } : r));
            return { error: null };
          },
        }),
        delete: () => {
          const del = {
            eq: (c: string, v: unknown) => {
              filter = { ...filter, [c]: v };
              return del;
            },
            like: (_c: string, v: string) => {
              const keep = mockRows.filter((r) => !(String(r.photo_path).startsWith(v.replace('%', '')) && r.user_id === filter.user_id));
              mockRows = keep;
              return Promise.resolve({ error: null });
            },
          };
          return del;
        },
      };
    },
  },
}));
import { deleteProofPhoto, pushProofPhoto, currentUserId } from '../../sync/cloudSync';
import { restoreProofPhotos } from '../../sync/restorePhotos';
import { useAuthStore } from '../../store/useAuthStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { useSyncQueueStore } from '../../sync/syncQueue';
import type { ProofPhoto } from '../../types';

const proof: ProofPhoto = { id: '1700000000000', dateISO: '2026-10-23T07:00:00.000Z', taskType: 'meal', taskRefId: 'extra:55', photoUri: 'data:image/jpeg;base64,AAAA', note: 'Phở', createdAtISO: '2026-10-23T07:00:00.000Z' };

beforeEach(() => {
  mockOnline = true;
  mockRows = [];
  mockUploads.length = 0;
  mockRemoved.length = 0;
  mockInsertCount = 0;
  mockUpdateCount = 0;
  mockDownload.mockClear();
  useProofStore.setState({ photos: [] });
  useNutritionStore.setState({ logs: {} });
  useSyncQueueStore.setState({ pending: [] });
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, blob: async () => ({ type: 'image/jpeg' }) }));
  useAuthStore.setState({ session: { user: { id: mockUser } } as never });
});

describe('proof photo cloud sync', () => {
  it('knows the signed-in user', () => {
    expect(currentUserId()).toBe('u1');
  });

  it('uploads the file and writes its row, and uploading the same photo again does not double it', async () => {
    await pushProofPhoto(proof);
    await pushProofPhoto(proof);
    expect(mockUploads).toEqual(['u1/1700000000000.jpg', 'u1/1700000000000.jpg']);
    expect(mockRows).toHaveLength(1);
    expect(mockInsertCount).toBe(1);
    expect(mockUpdateCount).toBe(1);
    expect(mockRows[0]).toMatchObject({ user_id: 'u1', task_type: 'meal', task_ref_id: 'extra:55', entry_date: '2026-10-23', note: 'Phở' });
    expect(useSyncQueueStore.getState().pending).toHaveLength(0);
  });

  it('queues the photo while offline', async () => {
    mockOnline = false;
    await pushProofPhoto(proof);
    expect(useSyncQueueStore.getState().pending.map((p) => p.type)).toEqual(['proofPhoto']);
    expect(mockUploads).toHaveLength(0);
  });

  it('drops a photo whose file is gone instead of retrying it forever', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error('gone');
    });
    await pushProofPhoto(proof);
    expect(useSyncQueueStore.getState().pending).toHaveLength(0);
    expect(mockUploads).toHaveLength(0);
  });

  it('removes the file and the row from the cloud', async () => {
    await pushProofPhoto(proof);
    await deleteProofPhoto(proof.id);
    expect(mockRemoved).toEqual([['u1/1700000000000.jpg']]);
    expect(mockRows).toHaveLength(0);
  });

  it('removing a photo from the store also removes it from the cloud, but not when the caller already did', async () => {
    useProofStore.setState({ photos: [proof] });
    await pushProofPhoto(proof);
    useProofStore.getState().removeProof(proof.id, { cloud: false });
    await Promise.resolve();
    expect(mockRows).toHaveLength(1);
    useProofStore.setState({ photos: [proof] });
    useProofStore.getState().removeProof(proof.id);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRows).toHaveLength(0);
  });
});

describe('restoring photos from the cloud', () => {
  const cloudRow = (id: string, ref: string, date = '2026-10-23') => ({ id: `r-${id}`, user_id: 'u1', entry_date: date, task_type: 'meal', task_ref_id: ref, photo_path: `u1/${id}.jpg`, note: 'x', created_at: '2026-10-23T08:00:00Z' });

  it('downloads the photos this device lacks, keeps the ones it has, and points the food at the photo that is here', async () => {
    mockRows = [cloudRow('111', 'extra:55'), cloudRow('222', 'meal1'), cloudRow('333', 'meal2')];
    useProofStore.setState({ photos: [{ ...proof, id: '222', taskRefId: 'meal1', dateISO: '2026-10-23T05:00:00.000Z', photoUri: 'file:///mine.jpg' }] });
    useNutritionStore.setState({
      logs: { '2026-10-23': { dateISO: '2026-10-23', mealsEaten: {}, extraCalories: 100, extraProteinG: 1, waterMl: 0, extraItems: [{ id: '55', name: 'Phở', calories: 100, proteinG: 1, mealTime: null, loggedAtISO: '2026-10-23T07:00:00.000Z', photoUri: 'file:///other-device.jpg' }] } },
    });
    expect(await restoreProofPhotos()).toBe(2);
    const photos = useProofStore.getState().photos;
    expect(photos.map((p) => p.id).sort()).toEqual(['111', '222', '333']);
    expect(photos.find((p) => p.id === '222')?.photoUri).toBe('file:///mine.jpg');
    expect(photos.find((p) => p.id === '111')).toMatchObject({ taskRefId: 'extra:55', photoUri: 'file:///docs/proofs/cloud-111.jpg' });
    expect(useNutritionStore.getState().logs['2026-10-23'].extraItems[0].photoUri).toBe('file:///docs/proofs/cloud-111.jpg');
  });

  it('adds nothing when everything is already here, or when nobody is signed in', async () => {
    mockRows = [cloudRow('111', 'extra:55')];
    useProofStore.setState({ photos: [{ ...proof, id: '111' }] });
    expect(await restoreProofPhotos()).toBe(0);
    expect(mockDownload).not.toHaveBeenCalled();
    useAuthStore.setState({ session: null });
    expect(await restoreProofPhotos()).toBe(0);
  });

  it('replaces a photo that is only a dead blob: link (web before the fix), also for the old "<id>.app/<uuid>" storage path', async () => {
    mockRows = [{ id: 'r1', user_id: 'u1', entry_date: '2026-10-27', task_type: 'meal', task_ref_id: 'extra:55', photo_path: 'u1/1793072031471.app/4ee93739-ec55', note: 'x', created_at: '2026-10-27T03:33:52Z' }];
    useProofStore.setState({ photos: [{ ...proof, id: '1793072031471', dateISO: '2026-10-27T03:33:00.000Z', photoUri: 'blob:https://x/abc' }] });
    useNutritionStore.setState({
      logs: { '2026-10-27': { dateISO: '2026-10-27', mealsEaten: {}, extraCalories: 100, extraProteinG: 1, waterMl: 0, extraItems: [{ id: '55', name: 'Phở', calories: 100, proteinG: 1, mealTime: null, loggedAtISO: '2026-10-27T03:00:00.000Z', photoUri: 'blob:https://x/old' }] } },
    });
    expect(await restoreProofPhotos()).toBe(1);
    const photos = useProofStore.getState().photos;
    expect(photos).toHaveLength(1);
    expect(photos[0].photoUri).toBe('file:///docs/proofs/cloud-1793072031471.jpg');
    expect(useNutritionStore.getState().logs['2026-10-27'].extraItems[0].photoUri).toBe('file:///docs/proofs/cloud-1793072031471.jpg');
  });
});
