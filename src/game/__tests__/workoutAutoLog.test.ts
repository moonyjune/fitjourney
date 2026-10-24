import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({}));

import { decideWorkoutAutoLog } from '../../ai/workoutAutoLog';

const full = { activityName: 'Bơi', durationMin: 30, estimatedCaloriesBurned: 250, confidence: 'medium' as const, reasoning: 'x' };
const FALLBACK = 'Buổi tập (từ ảnh)';

describe('decideWorkoutAutoLog', () => {
  it('logs a complete, confident result with the AI values', () => {
    expect(decideWorkoutAutoLog(full, {}, FALLBACK)).toEqual({ ok: true, values: { label: 'Bơi', durationMin: 30, caloriesBurned: 250 } });
  });

  it('accepts high confidence and a missing confidence, but never low', () => {
    expect(decideWorkoutAutoLog({ ...full, confidence: 'high' }, {}, FALLBACK).ok).toBe(true);
    expect(decideWorkoutAutoLog({ ...full, confidence: undefined }, {}, FALLBACK).ok).toBe(true);
    expect(decideWorkoutAutoLog({ ...full, confidence: 'low' }, {}, FALLBACK)).toEqual({ ok: false, reason: 'lowConfidence' });
  });

  it('does not log without minutes or without calories (missing, zero, negative, NaN)', () => {
    for (const bad of [undefined, 0, -3, Number.NaN]) {
      expect(decideWorkoutAutoLog({ ...full, durationMin: bad }, {}, FALLBACK)).toEqual({ ok: false, reason: 'incomplete' });
      expect(decideWorkoutAutoLog({ ...full, estimatedCaloriesBurned: bad }, {}, FALLBACK)).toEqual({ ok: false, reason: 'incomplete' });
    }
  });

  it('low confidence wins over incomplete (the user is told to check either way)', () => {
    expect(decideWorkoutAutoLog({ reasoning: 'x', confidence: 'low' }, {}, FALLBACK)).toEqual({ ok: false, reason: 'lowConfidence' });
  });

  it('what the user typed always beats the AI, and can complete a partial result', () => {
    const partial = { activityName: 'Bơi', durationMin: 30, confidence: 'high' as const, reasoning: 'x' };
    expect(decideWorkoutAutoLog(partial, { caloriesBurned: 200 }, FALLBACK)).toEqual({ ok: true, values: { label: 'Bơi', durationMin: 30, caloriesBurned: 200 } });
    expect(decideWorkoutAutoLog(full, { label: ' Của tôi ', durationMin: 50, caloriesBurned: 400 }, FALLBACK)).toEqual({
      ok: true,
      values: { label: 'Của tôi', durationMin: 50, caloriesBurned: 400 },
    });
  });

  it('falls back to a default name when neither the user nor the AI gave one', () => {
    const d = decideWorkoutAutoLog({ durationMin: 20, estimatedCaloriesBurned: 100, reasoning: 'x' }, {}, FALLBACK);
    expect(d).toEqual({ ok: true, values: { label: FALLBACK, durationMin: 20, caloriesBurned: 100 } });
  });
});
