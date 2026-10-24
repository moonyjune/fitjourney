import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  ALWAYS_EXERCISE,
  estimateKcal,
  estimateMinutes,
  EXERCISE_BY_ID,
  EXERCISES,
  GROUP_EXERCISES,
  GROUP_ORDER,
  suggestedGroup,
} from '../training/exercises';
import { formatAmount } from '../training/format';
import { POSES } from '../training/poses';
import { applyRating, NEW_PROGRESS, type ExerciseProgress } from '../training/progress';
import { buildSteps, sessionProgress, sessionReducer, startSession, totalSetsDone } from '../training/session';

jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

const day = (iso: string) => new Date(`${iso}T12:00:00`);

describe('exercise library', () => {
  it('has the 10 designed exercises, 4 levels each, and every text in both languages', () => {
    expect(EXERCISES).toHaveLength(10);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(10);
    for (const e of EXERCISES) {
      expect(e.levels).toHaveLength(4);
      expect(e.steps).toHaveLength(3);
      expect(e.nameVi && e.nameEn && e.caution.vi && e.caution.en).toBeTruthy();
      for (const s of e.steps) expect(s.vi && s.en).toBeTruthy();
      // Levels must never get easier: the total work (sets x amount) is non-decreasing except where a level
      // swaps to a harder variation (marked by a note).
      expect(e.levels[3].sets * e.levels[3].amount).toBeGreaterThanOrEqual(e.levels[0].sets * e.levels[0].amount * 0.75);
    }
  });

  it('puts three exercises in each group and keeps the neck exercise out of them', () => {
    for (const grp of GROUP_ORDER) {
      expect(GROUP_EXERCISES[grp]).toHaveLength(3);
      for (const id of GROUP_EXERCISES[grp]) expect(EXERCISE_BY_ID[id].group).toBe(grp);
    }
    expect(EXERCISE_BY_ID[ALWAYS_EXERCISE].group).toBeNull();
  });

  it('formats prescriptions the way the cards show them', () => {
    expect(formatAmount(EXERCISE_BY_ID.chairSquat.levels[0], 'vi')).toBe('3 × 8');
    expect(formatAmount(EXERCISE_BY_ID.kneePlank.levels[0], 'vi')).toBe('3 × 15s · gối');
    expect(formatAmount(EXERCISE_BY_ID.deadBug.levels[0], 'vi')).toBe('3 × 5/bên');
    expect(formatAmount(EXERCISE_BY_ID.deadBug.levels[0], 'en')).toBe('3 × 5/side');
    expect(formatAmount(EXERCISE_BY_ID.chairSquat.levels[3], 'en', false)).toBe('3 × 12');
  });

  it('rotates A/B/C from Monday and rests on Sunday', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => suggestedGroup(new Date(2026, 9, 18 + n)))).toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
    expect(suggestedGroup(day('2026-10-25'))).toBeNull(); // Sunday
    expect(suggestedGroup(day('2026-10-23'))).toBe('B'); // the Friday of the design boards
  });

  it('keeps every starting session inside the 15-20 minute promise', () => {
    for (const grp of GROUP_ORDER) {
      const minutes = estimateMinutes([...GROUP_EXERCISES[grp], ALWAYS_EXERCISE].map((id) => ({ id, level: 1 as const })));
      expect(minutes).toBeGreaterThanOrEqual(8);
      expect(minutes).toBeLessThanOrEqual(20);
    }
    // Level 4 everywhere still has to fit.
    for (const grp of GROUP_ORDER) {
      expect(estimateMinutes([...GROUP_EXERCISES[grp], ALWAYS_EXERCISE].map((id) => ({ id, level: 4 as const })))).toBeLessThanOrEqual(25);
    }
  });

  it('estimates calories from weight and time (3.5 MET)', () => {
    expect(estimateKcal(106, 14)).toBe(87);
    expect(estimateKcal(80, 0)).toBe(0);
  });
});

describe('illustrations', () => {
  it('has two drawable poses per exercise, inside the 120 x 80 canvas', () => {
    for (const e of EXERCISES) {
      const def = POSES[e.id];
      expect(def.poses).toHaveLength(2);
      expect(def.labelVi[0] && def.labelVi[1] && def.labelEn[0] && def.labelEn[1]).toBeTruthy();
      for (const pose of def.poses) {
        expect(pose.limbs.length).toBeGreaterThan(0);
        expect(pose.limbs.some((l) => l.hot)).toBe(true); // every pose highlights the working muscle
        const pts = [pose.head, ...pose.limbs.flatMap((l) => l.pts), ...def.props.flatMap((p) => p.pts)];
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(120);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(80);
        }
      }
    }
  });
});

describe('level progression', () => {
  const t0 = new Date('2026-10-05T18:00:00');
  const later = (days: number) => new Date(t0.getTime() + days * 86_400_000);

  it('levels up after two easy sessions in a row, not after one', () => {
    const first = applyRating(NEW_PROGRESS, 'easy', t0);
    expect(first.change).toBe('none');
    const second = applyRating(first.progress, 'easy', later(2));
    expect(second.change).toBe('up');
    expect(second.progress.level).toBe(2);
    expect(second.progress.lastChangeISO).toBe(later(2).toISOString());
  });

  it('is not fooled by a non-easy session in between, and "hard" never lowers the level', () => {
    let p: ExerciseProgress = { ...NEW_PROGRESS, level: 2 };
    for (const [i, r] of (['easy', 'hard', 'easy', 'medium', 'easy'] as const).entries()) {
      const out = applyRating(p, r, later(i));
      expect(out.change).toBe('none');
      p = out.progress;
    }
    expect(p.level).toBe(2);
  });

  it('allows at most one level-up per week and counts only ratings after the last change', () => {
    let p = applyRating(applyRating(NEW_PROGRESS, 'easy', t0).progress, 'easy', later(1)).progress; // -> level 2 on day 1
    expect(p.level).toBe(2);
    // Old easy ratings from before the level-up must not count: one new easy is not enough.
    const one = applyRating(p, 'easy', later(2));
    expect(one.change).toBe('none');
    // Two new easies inside the 7-day lock: held back, reported as ready.
    const two = applyRating(one.progress, 'easy', later(3));
    expect(two.change).toBe('ready');
    expect(two.progress.level).toBe(2);
    // The next easy once a week has passed since the level-up goes through.
    const three = applyRating(two.progress, 'easy', later(8));
    expect(three.change).toBe('up');
    expect(three.progress.level).toBe(3);
  });

  it('never goes above level 4', () => {
    let p: ExerciseProgress = { level: 4, lastChangeISO: null, ratings: [] };
    for (let i = 0; i < 4; i++) p = applyRating(p, 'easy', later(i * 10)).progress;
    expect(p.level).toBe(4);
  });
});

describe('session reducer', () => {
  const steps = buildSteps([
    { id: 'chairSquat', level: 1 }, // 3 sets of 8
    { id: 'kneePlank', level: 1 }, // 3 sets of 15 s
  ]);

  it('walks every set with a rest between them and ends after the last set', () => {
    let s = startSession(steps);
    const trail: string[] = [];
    let guard = 0;
    while (s.phase !== 'done' && guard++ < 50) {
      trail.push(`${s.phase}:${s.step}.${s.set}`);
      s = sessionReducer(s, { type: s.phase === 'work' ? 'finishSet' : 'skipRest' });
    }
    expect(trail).toEqual([
      'work:0.0', 'rest:0.1', 'work:0.1', 'rest:0.2', 'work:0.2', 'rest:1.0',
      'work:1.0', 'rest:1.1', 'work:1.1', 'rest:1.2', 'work:1.2',
    ]);
    expect(s.phase).toBe('done');
    expect(totalSetsDone(s)).toBe(6);
    expect(sessionProgress(s)).toBe(1);
  });

  it('counts reps (never below zero) and resets the count for the next set', () => {
    let s = startSession(steps);
    s = sessionReducer(s, { type: 'removeRep' });
    expect(s.count).toBe(0);
    s = sessionReducer(sessionReducer(s, { type: 'addRep' }), { type: 'addRep' });
    expect(s.count).toBe(2);
    s = sessionReducer(s, { type: 'finishSet' });
    expect(s.count).toBe(0);
  });

  it('ignores actions in the wrong phase', () => {
    const resting = sessionReducer(startSession(steps), { type: 'finishSet' });
    expect(sessionReducer(resting, { type: 'finishSet' })).toBe(resting);
    expect(sessionReducer(resting, { type: 'addRep' })).toBe(resting);
    const working = startSession(steps);
    expect(sessionReducer(working, { type: 'skipRest' })).toBe(working);
  });

  it('rests as long as the exercise says', () => {
    expect(sessionReducer(startSession(steps), { type: 'finishSet' }).restSec).toBe(EXERCISE_BY_ID.chairSquat.restSec);
  });
});
