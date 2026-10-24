import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({ pushProfile: jest.fn(), ensureCoachCode: jest.fn(), linkToCoach: jest.fn(), pullProfile: jest.fn() }));

import { EXERCISE_BY_ID } from '../training/exercises';
import { buildSteps, sessionReducer, startSession } from '../training/session';
import {
  LEAD_IN_MS,
  REST_COUNTDOWN_FROM,
  SWITCH_PAUSE_MS,
  dueEvents,
  repTimeline,
  restScript,
  resumeOffsetMs,
  shouldCallHold,
  shouldCallRest,
  spokenAmount,
  workScript,
} from '../training/voice';

describe('repTimeline', () => {
  it('counts each rep after repSec seconds, after a short lead-in, and ends the set on the last rep', () => {
    const tl = repTimeline(3, false, 3);
    const reps = tl.filter((e) => e.kind === 'rep');
    expect(reps.map((e) => e.spoken)).toEqual([1, 2, 3]);
    expect(reps.map((e) => e.atMs)).toEqual([LEAD_IN_MS + 3000, LEAD_IN_MS + 6000, LEAD_IN_MS + 9000]);
    const last = tl[tl.length - 1];
    expect(last.kind).toBe('done');
    expect(last.atMs).toBe(reps[2].atMs); // time is the source of truth: the set is over the moment the last rep is counted
  });

  it('counts both sides of a one-sided exercise, with a switch call and a pause between them', () => {
    const tl = repTimeline(2, true, 4);
    expect(tl.map((e) => `${e.kind}${e.spoken || ''}`)).toEqual(['rep1', 'rep2', 'switch', 'rep1', 'rep2', 'done2']);
    const sw = tl.find((e) => e.kind === 'switch')!;
    const secondFirst = tl.filter((e) => e.kind === 'rep')[2];
    expect(sw.atMs).toBe(LEAD_IN_MS + 2 * 4000);
    expect(secondFirst.atMs - sw.atMs).toBe(4000 + SWITCH_PAUSE_MS);
  });

  it('is empty for a set with nothing to count', () => {
    expect(repTimeline(0, false, 3)).toEqual([]);
  });
});

describe('dueEvents', () => {
  const tl = repTimeline(4, false, 2);
  it('returns only what fell inside the window (exclusive start, inclusive end)', () => {
    const first = LEAD_IN_MS + 2000;
    expect(dueEvents(tl, 0, first - 1)).toHaveLength(0);
    expect(dueEvents(tl, 0, first).map((e) => e.spoken)).toEqual([1]);
    expect(dueEvents(tl, first, first + 2000).map((e) => e.spoken)).toEqual([2]);
  });

  it('never repeats or skips an event across consecutive windows, even when ticks are late', () => {
    const seen: string[] = [];
    let from = 0;
    for (const to of [500, 4100, 4300, 9000, 20000]) {
      seen.push(...dueEvents(tl, from, to).map((e) => `${e.kind}${e.spoken}`));
      from = to;
    }
    expect(seen).toEqual(['rep1', 'rep2', 'rep3', 'rep4', 'done4']);
  });
});

describe('resumeOffsetMs', () => {
  it('resumes right after the rep already counted, skipping the lead-in', () => {
    const tl = repTimeline(5, false, 3);
    expect(resumeOffsetMs(tl, 0)).toBe(0);
    expect(resumeOffsetMs(tl, 2)).toBe(LEAD_IN_MS + 6000);
    // The next rep is then exactly one rep later, not one rep plus the lead-in.
    const next = tl.find((e) => e.kind === 'rep' && e.index === 3)!;
    expect(next.atMs - resumeOffsetMs(tl, 2)).toBe(3000);
  });
});

describe('hold and rest call-outs', () => {
  it('calls a hold every 10 seconds and every one of the last 5, never at the start or at zero', () => {
    const called = Array.from({ length: 31 }, (_, i) => 30 - i).filter((left) => shouldCallHold(left, 30));
    expect(called).toEqual([20, 10, 5, 4, 3, 2, 1]);
    expect(shouldCallHold(0, 30)).toBe(false);
  });

  it('counts the last three seconds of a rest, and nothing for a rest that short', () => {
    const called = Array.from({ length: 41 }, (_, i) => 40 - i).filter((left) => shouldCallRest(left, 40));
    expect(called).toEqual([REST_COUNTDOWN_FROM, 2, 1]);
    expect(shouldCallRest(2, 2)).toBe(false);
  });
});

describe('spoken scripts (always English, whatever the app language is)', () => {
  const squat = EXERCISE_BY_ID.chairSquat;
  const [step] = buildSteps([{ id: 'chairSquat', level: 1 }]);

  it('briefs the first set: name, amount, every step, then asks to press start', () => {
    const lines = workScript(step, squat, 0);
    expect(lines[0]).toBe('Chair squat');
    expect(lines[1]).toBe('3 sets of 8 reps.');
    expect(lines.slice(2, 5)).toEqual(squat.steps.map((s) => s.en));
    expect(lines[lines.length - 1]).toBe('Press start when you are ready.');
  });

  it('only names the set number after the first one', () => {
    expect(workScript(step, squat, 1)).toEqual(['Set 2 of 3.']);
  });

  it('adds the one-sided hint and reads seconds for holds', () => {
    const [bird] = buildSteps([{ id: 'birdDog', level: 1 }]);
    const lines = workScript(bird, EXERCISE_BY_ID.birdDog, 0);
    expect(lines[1]).toMatch(/each side/);
    expect(lines).toContain('Do both sides in every set.');
    const [plank] = buildSteps([{ id: 'kneePlank', level: 1 }]);
    expect(spokenAmount(plank)).toMatch(/hold for \d+ seconds/);
  });

  it('announces a rest with its length and the next exercise', () => {
    const [next] = buildSteps([{ id: 'wallPushup', level: 1 }]);
    expect(restScript(40, next, EXERCISE_BY_ID.wallPushup)).toBe('Rest for 40 seconds. Next up: Wall push-up, 3 sets of 8 reps.');
    expect(restScript(40, undefined, undefined)).toBe('Rest for 40 seconds.');
  });

  it('never contains Vietnamese text', () => {
    const vi = /[À-ỹ]/;
    for (const id of Object.keys(EXERCISE_BY_ID) as (keyof typeof EXERCISE_BY_ID)[]) {
      const [st] = buildSteps([{ id, level: 1 }]);
      const lines = [...workScript(st, EXERCISE_BY_ID[id], 0), ...workScript(st, EXERCISE_BY_ID[id], 1), restScript(30, st, EXERCISE_BY_ID[id])];
      for (const line of lines) expect(line).not.toMatch(vi);
    }
  });
});

describe('setCount action', () => {
  it('sets the counter exactly during work, never below zero, and is ignored while resting', () => {
    const steps = buildSteps([{ id: 'chairSquat', level: 1 }]);
    let s = startSession(steps);
    s = sessionReducer(s, { type: 'setCount', count: 5 });
    expect(s.count).toBe(5);
    expect(sessionReducer(s, { type: 'setCount', count: -3 }).count).toBe(0);
    const resting = sessionReducer(s, { type: 'finishSet' });
    expect(sessionReducer(resting, { type: 'setCount', count: 7 })).toBe(resting);
  });
});
