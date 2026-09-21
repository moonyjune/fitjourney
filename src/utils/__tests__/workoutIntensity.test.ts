import { describe, expect, it } from '@jest/globals';
import { iconForWorkoutLabel, workoutIntensity } from '../workoutIntensity';

describe('workoutIntensity', () => {
  it('classifies a slow low-burn session as light', () => {
    expect(workoutIntensity(100, 30)).toBe('light'); // ~3.3 kcal/min
  });

  it('classifies a moderate session as medium', () => {
    expect(workoutIntensity(350, 45)).toBe('medium'); // ~7.8 kcal/min
  });

  it('classifies a hard, calorie-dense session as high', () => {
    expect(workoutIntensity(500, 30)).toBe('high'); // ~16.7 kcal/min
  });

  it('treats a zero-duration session as light rather than dividing by zero', () => {
    expect(() => workoutIntensity(100, 0)).not.toThrow();
    expect(workoutIntensity(100, 0)).toBe('light');
  });
});

describe('iconForWorkoutLabel', () => {
  it('matches swim-related labels', () => {
    expect(iconForWorkoutLabel('Buổi bơi chi tiết (khởi động - chính - thả lỏng)')).toBe('🏊');
  });

  it('matches incline-walk labels', () => {
    expect(iconForWorkoutLabel('Đi bộ dốc Incline')).toBe('🚶');
  });

  it('matches cardio-machine labels', () => {
    expect(iconForWorkoutLabel('Tập chiều - Cardio máy tập')).toBe('🔥');
  });

  it('prefers swim over walk when a label mentions both', () => {
    expect(iconForWorkoutLabel('Tập sáng (Bụng đói) - Bơi lội / Đi bộ dốc')).toBe('🏊');
  });

  it('falls back to a generic icon for an unrecognized label', () => {
    expect(iconForWorkoutLabel('Buổi tập tự do')).toBe('💪');
  });
});
