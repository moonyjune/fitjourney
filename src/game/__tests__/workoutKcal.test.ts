import { describe, expect, it, jest } from '@jest/globals';
import {
  cleanWorkoutKcalAnswer,
  cleanWorkoutKcalRequest,
  WORKOUT_KCAL_MAX,
  WORKOUT_TEXT_MAX,
  workoutKcalPrompt,
} from '../../../supabase/functions/_shared/workoutKcal';
import { DAILY_QUOTA } from '../../../supabase/functions/_shared/usage';
import { buildWorkoutKcalInput } from '../../ai/workoutKcal';
import { fakeWorkoutKcal } from '../../ai/devPhotoAnalysis';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({ requestWorkoutKcal: jest.fn(), WORKOUT_KCAL_EMPTY: 'empty' }));

describe('workout kcal estimate: the request', () => {
  it('keeps a short one-line description, bounded minutes and the weight', () => {
    const req = cleanWorkoutKcalRequest({ description: '  Chạy bộ\n<b>5 km</b>  ', durationMin: 30, profile: { weightKg: 72.44, heightCm: 170 } });
    expect(req).toEqual({ description: 'Chạy bộ b 5 km /b', durationMin: 30, weightKg: 72.4 });
    expect(cleanWorkoutKcalRequest({ description: 'x'.repeat(1000), profile: { weightKg: 70 } })!.description).toHaveLength(WORKOUT_TEXT_MAX);
  });
  it('drops minutes out of range and refuses a request without a description or a sane weight (no guessed weight)', () => {
    expect(cleanWorkoutKcalRequest({ description: 'Bơi', durationMin: 9999, profile: { weightKg: 70 } })).toEqual({ description: 'Bơi', weightKg: 70 });
    expect(cleanWorkoutKcalRequest({ description: 'Bơi', durationMin: '30', profile: { weightKg: 70 } })).toEqual({ description: 'Bơi', weightKg: 70 });
    expect(cleanWorkoutKcalRequest({ description: '  ', profile: { weightKg: 70 } })).toBeNull();
    expect(cleanWorkoutKcalRequest({ description: 'Bơi', profile: {} })).toBeNull();
    expect(cleanWorkoutKcalRequest({ description: 'Bơi', profile: { weightKg: 5 } })).toBeNull();
    expect(cleanWorkoutKcalRequest(null)).toBeNull();
  });
  it('the prompt holds the description as tagged data, the weight, and the typed minutes or the rule for missing ones', () => {
    const withMin = workoutKcalPrompt({ description: 'Đạp xe', durationMin: 45, weightKg: 80 }, 'Người dùng: cân nặng 80 kg.');
    expect(withMin).toContain('<workout>Đạp xe</workout>');
    expect(withMin).toContain('80 kg');
    expect(withMin).toContain('45 phút');
    const noMin = workoutKcalPrompt({ description: 'Đạp xe', weightKg: 80 }, '');
    expect(noMin).toContain('kcal = 0');
  });
  it('the feature has its own daily quota', () => {
    expect(DAILY_QUOTA.workout).toBe(20);
  });
});

describe('workout kcal estimate: the answer', () => {
  it('rounds and bounds every number, and keeps a one-line explanation', () => {
    expect(cleanWorkoutKcalAnswer({ kcal: 287.6, durationMin: 30.4, met: 8, activity: 'Chạy bộ\n8 km/h', explanation: 'MET 8 × 72 kg × 0,5 giờ', accuracyPercent: 61.2 })).toEqual({
      kcal: 288,
      durationMin: 30,
      met: 8,
      activity: 'Chạy bộ 8 km/h',
      explanation: 'MET 8 × 72 kg × 0,5 giờ',
      accuracyPercent: 61,
    });
  });
  it('no usable kcal (0, too high, missing) is no answer; nonsense extras are dropped', () => {
    expect(cleanWorkoutKcalAnswer({ kcal: 0, explanation: 'thiếu thời lượng' })).toBeNull();
    expect(cleanWorkoutKcalAnswer({ kcal: WORKOUT_KCAL_MAX + 1, explanation: '' })).toBeNull();
    expect(cleanWorkoutKcalAnswer({ explanation: 'x' })).toBeNull();
    expect(cleanWorkoutKcalAnswer({ kcal: 200, durationMin: 9999, met: 99 })).toEqual({ kcal: 200, explanation: '' });
  });
  it('the offline dev answer goes through the same cleaning (MET 6 × kg × hours)', () => {
    expect(cleanWorkoutKcalAnswer(fakeWorkoutKcal('Đi bộ', 60, 80))).toMatchObject({ kcal: 480, durationMin: 60, met: 6 });
  });
});

describe('buildWorkoutKcalInput', () => {
  it('sends the name as the description, the typed minutes and the body profile', () => {
    expect(buildWorkoutKcalInput(' Bơi ếch ', '40,5', { weightKg: 90, heightCm: 175, age: 40, gender: 'male' })).toEqual({
      description: 'Bơi ếch',
      durationMin: 40.5,
      profile: { weightKg: 90, heightCm: 175, age: 40, gender: 'male' },
    });
  });
  it('leaves out minutes that are empty or not positive', () => {
    expect(buildWorkoutKcalInput('Bơi', '', { weightKg: 90 })).toEqual({ description: 'Bơi', profile: { weightKg: 90 } });
    expect(buildWorkoutKcalInput('Bơi', '0', { weightKg: 90 })).toEqual({ description: 'Bơi', profile: { weightKg: 90 } });
  });
  it('says what is missing instead of sending: no description, or no weight', () => {
    expect(buildWorkoutKcalInput('  ', '30', { weightKg: 90 })).toEqual({ problem: 'noLabel' });
    expect(buildWorkoutKcalInput('Bơi', '30', { heightCm: 170 })).toEqual({ problem: 'noWeight' });
  });
});
