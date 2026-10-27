import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPushWorkout = jest.fn();
const mockPushProof = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushWorkoutEntry: (...a: unknown[]) => mockPushWorkout(...a),
  deleteWorkoutEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
  pushProofPhoto: (...a: unknown[]) => mockPushProof(...a),
  deleteProofPhoto: jest.fn(async () => undefined),
}));
const mockDeletePhoto = jest.fn<(uri: string) => Promise<void>>();
jest.mock('../../utils/photoStorage', () => ({
  persistPickedPhoto: async (_u: string, id: string) => `file:///docs/${id}.jpg`,
  deletePersistedPhoto: (uri: string) => mockDeletePhoto(uri),
}));

import { useProofStore } from '../../store/useProofStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

describe('workout store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeletePhoto.mockResolvedValue(undefined);
    useWorkoutStore.setState({ entries: [] });
    useProofStore.setState({ photos: [] });
  });

  it('addEntry returns the entry it created (and still stores and syncs it)', () => {
    const created = useWorkoutStore.getState().addEntry({ templateId: null, label: 'Bơi', durationMin: 30, caloriesBurned: 200 }, '2026-10-23T07:00:00.000Z');
    expect(created).toMatchObject({ label: 'Bơi', dateISO: '2026-10-23T07:00:00.000Z' });
    expect(created.id).toBeTruthy();
    expect(useWorkoutStore.getState().entries).toEqual([created]);
    expect(mockPushWorkout).toHaveBeenCalledWith(created);
  });

  it('updateEntry changes only the given fields, keeps the id and template, and syncs the result', () => {
    useWorkoutStore.setState({ entries: [{ id: 'a', dateISO: '2026-10-23T07:00:00.000Z', templateId: 'home-A', label: 'Nhóm A', durationMin: 8, caloriesBurned: 60 }] });
    const updated = useWorkoutStore.getState().updateEntry('a', { durationMin: 12 });
    expect(updated).toEqual({ id: 'a', dateISO: '2026-10-23T07:00:00.000Z', templateId: 'home-A', label: 'Nhóm A', durationMin: 12, caloriesBurned: 60 });
    expect(useWorkoutStore.getState().entries[0]).toEqual(updated);
    expect(mockPushWorkout).toHaveBeenCalledWith(updated);
  });

  it('updateEntry on an unknown id does nothing and does not sync', () => {
    expect(useWorkoutStore.getState().updateEntry('nope', { label: 'x' })).toBeUndefined();
    expect(mockPushWorkout).not.toHaveBeenCalled();
  });

  it('removeEntry also removes the workout photo (proof and file) but leaves other proofs alone', () => {
    useWorkoutStore.setState({ entries: [{ id: 'a', dateISO: '2026-10-23T07:00:00.000Z', templateId: null, label: 'x', durationMin: 5, caloriesBurned: 5 }] });
    useProofStore.setState({
      photos: [
        { id: 'p1', dateISO: '2026-10-23T07:00:00.000Z', taskType: 'workout', taskRefId: 'a', photoUri: 'file:///docs/a.jpg', note: '', createdAtISO: '' },
        { id: 'p2', dateISO: '2026-10-23T07:00:00.000Z', taskType: 'workout', taskRefId: 'other', photoUri: 'file:///docs/other.jpg', note: '', createdAtISO: '' },
        { id: 'p3', dateISO: '2026-10-23T07:00:00.000Z', taskType: 'meal', taskRefId: 'a', photoUri: 'file:///docs/meal.jpg', note: '', createdAtISO: '' },
      ],
    });
    useWorkoutStore.getState().removeEntry('a');
    expect(useWorkoutStore.getState().entries).toHaveLength(0);
    expect(useProofStore.getState().photos.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(mockDeletePhoto).toHaveBeenCalledWith('file:///docs/a.jpg');
    expect(mockDeletePhoto).not.toHaveBeenCalledWith('file:///docs/other.jpg');
  });
});
