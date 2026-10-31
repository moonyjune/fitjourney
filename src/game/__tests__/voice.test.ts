import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({ pushProfile: jest.fn(), ensureCoachCode: jest.fn(), linkToCoach: jest.fn(), pullProfile: jest.fn() }));

import { EXERCISE_BY_ID } from '../training/exercises';
import { buildSteps, sessionReducer, startSession } from '../training/session';
import { activeRow, exercisePlan, formatRowTime } from '../training/plan';
import {
  LEAD_IN_MS,
  REST_COUNTDOWN_FROM,
  SPEECH_TEXT,
  SWITCH_PAUSE_MS,
  dueEvents,
  firstSideLine,
  introScript,
  mirrorSide,
  repTimeline,
  sideWords,
  switchLine,
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

describe('spoken scripts (English by default, whatever the app language is)', () => {
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
    expect(lines).toContain('Alternate sides: right arm and left leg, then left arm and right leg. One rep is both sides.');
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

describe('spoken scripts in Vietnamese (voice language vi)', () => {
  const squat = EXERCISE_BY_ID.chairSquat;
  const [step] = buildSteps([{ id: 'chairSquat', level: 1 }]);

  it('briefs in Vietnamese: the Vietnamese name, amount and steps', () => {
    const lines = workScript(step, squat, 0, 'vi');
    expect(lines[0]).toBe('Squat ngồi ghế');
    expect(lines[1]).toBe('3 hiệp, mỗi hiệp 8 lần.');
    expect(lines.slice(2, 5)).toEqual(squat.steps.map((s) => s.vi));
    expect(lines[lines.length - 1]).toBe(SPEECH_TEXT.vi.pressStart);
    expect(workScript(step, squat, 1, 'vi')).toEqual(['Hiệp 2 trên 3.']);
  });

  it('announces rests and one-sided sets in Vietnamese', () => {
    const [next] = buildSteps([{ id: 'wallPushup', level: 1 }]);
    expect(restScript(40, next, EXERCISE_BY_ID.wallPushup, 'vi')).toBe(`Nghỉ 40 giây. Tiếp theo: ${EXERCISE_BY_ID.wallPushup.nameVi}, 3 hiệp, mỗi hiệp 8 lần.`);
    const [bird] = buildSteps([{ id: 'birdDog', level: 1 }]);
    expect(workScript(bird, EXERCISE_BY_ID.birdDog, 0, 'vi')).toContain('Đổi bên xen kẽ: tay phải và chân trái, rồi tay trái và chân phải. Mỗi lượt hai bên tính một lần.');
    expect(spokenAmount(bird, 'vi')).toMatch(/mỗi bên/);
  });

  it('has every phrase in both languages', () => {
    expect(Object.keys(SPEECH_TEXT.vi).sort()).toEqual(Object.keys(SPEECH_TEXT.en).sort());
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

describe('left / right cues', () => {
  it('alternates one move per side, says the number after each pair and names the next side after every move', () => {
    const tl = repTimeline(2, true, 4, 'alternate');
    expect(tl.map((e) => `${e.kind}${e.kind === 'switch' ? e.side : e.spoken}`)).toEqual(['switch2', 'rep1', 'switch1', 'switch2', 'rep2', 'done2']);
    expect(tl.filter((e) => e.kind === 'rep').map((e) => e.atMs)).toEqual([LEAD_IN_MS + 8000, LEAD_IN_MS + 16000]);
    // Resuming after one pair (2 moves) carries on from the third move.
    expect(resumeOffsetMs(tl, 2)).toBe(LEAD_IN_MS + 8000);
  });

  it('names the side to start with and the side to switch to, in both voice languages', () => {
    const lunge = EXERCISE_BY_ID.chairLunge;
    const [st] = buildSteps([{ id: 'chairLunge', level: 1 }]);
    expect(firstSideLine(st, lunge)).toBe('Right leg first.');
    expect(firstSideLine(st, lunge, 'vi')).toBe('Chân phải trước.');
    expect(switchLine(lunge, 2)).toBe('Switch sides: left leg.');
    expect(switchLine(lunge, 2, 'vi')).toBe('Đổi bên: chân trái.');
    expect(workScript(st, lunge, 0)).toContain('Start with the right leg, then switch to the left leg.');
    expect(switchLine(EXERCISE_BY_ID.deadBug, 2, 'vi')).toBe('Tay trái và chân phải.');
    expect(sideWords(mirrorSide({ arm: 'R', leg: 'L' }))).toBe('left arm and right leg');
    const [squat] = buildSteps([{ id: 'chairSquat', level: 1 }]);
    expect(firstSideLine(squat, EXERCISE_BY_ID.chairSquat)).toBe('');
  });

  it('an auto-started set gets a short intro; the rest before a new exercise reads its steps', () => {
    const [st] = buildSteps([{ id: 'chairLunge', level: 1 }]);
    expect(introScript(st, EXERCISE_BY_ID.chairLunge, 1)).toEqual(['Set 2 of 2.']);
    expect(introScript(st, EXERCISE_BY_ID.chairLunge, 0)).toEqual([
      'Supported reverse lunge',
      '2 sets of 6 reps on each side.',
      'Start with the right leg, then switch to the left leg.',
    ]);
    expect(restScript(40, st, EXERCISE_BY_ID.chairLunge, 'en', true)).toContain(EXERCISE_BY_ID.chairLunge.steps[1].en);
  });
});

describe('exercise plan list', () => {
  it('lists every set with its start, side changes and end, and the rests between sets', () => {
    const [st] = buildSteps([{ id: 'chairLunge', level: 1 }]); // 2 sets x 6 per side, 4 s a rep, rest 40
    const rows = exercisePlan(st, EXERCISE_BY_ID.chairLunge, null);
    expect(rows.map((r) => `${r.set}:${r.kind}${r.side?.leg ?? ''}@${formatRowTime(r.atMs)}`)).toEqual([
      '0:readyR@00:00',
      '0:goR@00:02',
      '0:switchL@00:26',
      '0:done@00:53',
      '1:rest@00:00',
      '1:readyR@00:00',
      '1:goR@00:02',
      '1:switchL@00:26',
      '1:done@00:53',
    ]);
    expect(rows[4].restSec).toBe(40);
    // A later exercise starts with the rest that leads into it.
    expect(exercisePlan(st, EXERCISE_BY_ID.chairLunge, 30)[0]).toMatchObject({ kind: 'rest', restSec: 30, set: 0 });
  });

  it('marks the row in progress from the clock, the count by hand, or the rest', () => {
    const [st] = buildSteps([{ id: 'chairLunge', level: 1 }]);
    const rows = exercisePlan(st, EXERCISE_BY_ID.chairLunge, null);
    const at = (pos: Partial<Parameters<typeof activeRow>[1]>) =>
      rows[activeRow(rows, { phase: 'work', set: 0, elapsedMs: null, moves: 0, ...pos })]?.key;
    expect(at({})).toBe('0-ready');
    expect(at({ elapsedMs: 3000 })).toBe('0-go');
    expect(at({ elapsedMs: 27_000 })).toBe('0-sw6');
    expect(at({ moves: 3 })).toBe('0-go');
    expect(at({ moves: 6 })).toBe('0-sw6'); // all reps on the right done by hand: time to switch
    expect(at({ phase: 'rest', set: 1 })).toBe('1-rest');
    expect(activeRow(rows, { phase: 'done', set: 0, elapsedMs: null, moves: 0 })).toBe(-1);
  });

  it('alternating exercises get a row per side change; holds get start and end', () => {
    const [bug] = buildSteps([{ id: 'deadBug', level: 1 }]); // 5 per side
    const set0 = exercisePlan(bug, EXERCISE_BY_ID.deadBug, null).filter((r) => r.set === 0 && r.kind === 'switch');
    expect(set0).toHaveLength(9);
    expect(set0[0].side).toEqual({ arm: 'L', leg: 'R' });
    expect(set0[1].side).toEqual({ arm: 'R', leg: 'L' });
    const [plank] = buildSteps([{ id: 'kneePlank', level: 1 }]);
    expect(exercisePlan(plank, EXERCISE_BY_ID.kneePlank, null).slice(0, 2).map((r) => `${r.kind}@${r.atMs}`)).toEqual(['go@0', 'done@15000']);
  });
});
