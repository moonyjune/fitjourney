import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { DEFAULT_MEAL_TEMPLATES, DEFAULT_WATER_SCHEDULE } from '../../constants/plan';
import type { WorkoutLogEntry } from '../../types';
import { isMissingColumn } from '../../sync/cloudSync';
import { mergeWorkouts, workoutStart } from '../../sync/restore';
import { toDateKey } from '../../utils/date';
import { buildTimeline, groupWorkouts } from '../timeline';
import { buildSteps, sessionReducer, startSession } from '../training/session';
import { estimateMinutes } from '../training/exercises';

const w = (id: string, start: string, durationMin: number, label = 'Nhóm A'): WorkoutLogEntry => ({
  id,
  dateISO: new Date(start).toISOString(),
  templateId: null,
  label,
  durationMin,
  caloriesBurned: 50,
});

describe('workouts in the battle log', () => {
  it('groups workouts that follow each other into one row with a time range', () => {
    const day = [w('a', '2026-10-30T17:00:00', 5, 'Squat'), w('b', '2026-10-30T17:07:00', 6, 'Dead bug'), w('c', '2026-10-30T20:00:00', 10, 'Nhóm B')];
    expect(groupWorkouts(day).map((g) => g.map((x) => x.id))).toEqual([['a', 'b'], ['c']]);
    const items = buildTimeline({
      dateKey: '2026-10-30',
      now: new Date('2026-10-30T22:00:00'),
      log: undefined,
      meals: DEFAULT_MEAL_TEMPLATES.training,
      waterSchedule: DEFAULT_WATER_SCHEDULE,
      workouts: day,
      feelings: [],
      photoSlots: new Set<string>(),
    }).filter((i) => i.kind === 'workout');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ minutes: 17 * 60, endMinutes: 17 * 60 + 13, label: 'Squat + Dead bug', durationMin: 11, kcal: 100, entryIds: ['a', 'b'] });
    expect(items[1]).toMatchObject({ minutes: 20 * 60, endMinutes: 20 * 60 + 10, entryIds: ['c'] });
  });
});

describe('workout time from the cloud', () => {
  it('uses started_at, then the first write less the length, then midday', () => {
    expect(workoutStart({ started_at: '2026-10-30T10:15:00.000Z', entry_date: '2026-10-30' }, '2026-10-30')).toBe('2026-10-30T10:15:00.000Z');
    const created = new Date('2026-10-30T18:40:00');
    const start = workoutStart({ created_at: created.toISOString(), duration_min: 25 }, '2026-10-30');
    expect(new Date(start).getTime()).toBe(created.getTime() - 25 * 60_000);
    // An old row stored the UTC date: a local early-morning workout may be filed a day early.
    const early = new Date('2026-10-31T06:30:00');
    expect(toDateKey(new Date(workoutStart({ created_at: early.toISOString(), duration_min: 10 }, toDateKey(new Date(early.getTime() - 86_400_000)))))).toBe('2026-10-31');
    // Written long after (an import): keep the date, at midday.
    expect(workoutStart({ created_at: '2026-11-20T10:00:00.000Z', duration_min: 10 }, '2026-10-01')).toBe('2026-10-01T05:00:00.000Z');
  });

  it('keeps the per-exercise results of a row and drops malformed ones', () => {
    const details = { exercises: [{ id: 'chairSquat', level: 1, sets: 3, amount: 8, unit: 'reps', restSec: 40, results: [8, 8, 6] }] };
    const [good] = mergeWorkouts([], [{ id: 'u1', client_id: 'x1', entry_date: '2026-10-30', label: 'A', duration_min: 20, calories_burned: 90, details }]);
    expect(good.details).toEqual(details);
    const [bad] = mergeWorkouts([], [{ id: 'u2', client_id: 'x2', entry_date: '2026-10-30', label: 'A', duration_min: 20, calories_burned: 90, details: { exercises: [{ nope: 1 }] } }]);
    expect(bad.details).toBeUndefined();
  });

  it('recognises a missing column, so the push can fall back until schema.sql is run', () => {
    expect(isMissingColumn({ code: 'PGRST204', message: "Could not find the 'started_at' column of 'workout_entries' in the schema cache" })).toBe(true);
    expect(isMissingColumn({ code: '23505', message: 'duplicate key' })).toBe(false);
  });
});

describe('adjusting a session', () => {
  it('uses the saved numbers for the level they were set at, and only that level', () => {
    const custom = { chairSquat: { level: 1 as const, sets: 4, amount: 10, restSec: 60 } };
    expect(buildSteps([{ id: 'chairSquat', level: 1 }], custom)[0]).toMatchObject({ sets: 4, amount: 10, restSec: 60 });
    expect(buildSteps([{ id: 'chairSquat', level: 2 }], custom)[0]).toMatchObject({ sets: 3, amount: 12, restSec: 40 });
    expect(estimateMinutes([{ id: 'chairSquat', level: 1 }], custom)).toBeGreaterThan(estimateMinutes([{ id: 'chairSquat', level: 1 }]));
  });

  it('changes sets, set length and rest within bounds, never below the set in progress, and records each set', () => {
    let s = startSession(buildSteps([{ id: 'kneePlank', level: 1 }]));
    s = sessionReducer(s, { type: 'adjust', patch: { amount: 47, restSec: 400 } });
    expect(s.steps[0]).toMatchObject({ amount: 47, restSec: 300 });
    s = sessionReducer(s, { type: 'finishSet', done: 40 });
    s = sessionReducer(s, { type: 'skipRest' });
    s = sessionReducer(s, { type: 'adjust', patch: { sets: 1 } });
    expect(s.steps[0].sets).toBe(2); // set 2 is about to start
    s = sessionReducer(s, { type: 'finishSet', done: 47 });
    expect(s.phase).toBe('done');
    expect(s.results[0]).toEqual([40, 47]);
  });

  it('lengthens the rest in progress', () => {
    let s = startSession(buildSteps([{ id: 'chairSquat', level: 1 }]));
    s = sessionReducer(s, { type: 'finishSet' });
    s = sessionReducer(s, { type: 'adjustRest', restSec: 55 });
    expect(s.restSec).toBe(55);
  });
});
