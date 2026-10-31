import type { Exercise, SideSpec } from './exercises';
import type { SessionPhase, SessionStep } from './session';
import { LEAD_IN_MS, sideSpec, stepTimeline } from './voice';

// The step-by-step plan of one exercise in a session, shown as a list under the counter: every set with its start,
// side changes and end (times from the start of that set), and the rests in between. Pure, so the list and the
// "you are here" marker can be tested without a clock.

export type PlanRowKind = 'rest' | 'ready' | 'go' | 'switch' | 'done';

export interface PlanRow {
  key: string;
  kind: PlanRowKind;
  /** The set this row belongs to (0-based). A rest row carries the set it comes before. */
  set: number;
  /** Milliseconds from the start of the set (lead-in included). 0 for rests. */
  atMs: number;
  /** One-sided exercises: which arm / leg works from this row on. */
  side?: SideSpec;
  /** Which illustration to draw: 0 = start position, 1 = working position. */
  pose: 0 | 1;
  /** Rest rows: how long. */
  restSec?: number;
  /** Rep-based sets: moves already done when this row begins (locates the row when counting by hand). */
  moves: number;
}

/** The rows of one set. */
export function setRows(step: SessionStep, ex: Exercise, set: number): PlanRow[] {
  const key = (k: string) => `${set}-${k}`;
  const first = step.perSide && ex.sides ? sideSpec(ex.sides, 1) : undefined;
  if (step.unit === 'seconds') {
    return [
      { key: key('go'), kind: 'go', set, atMs: 0, pose: 1, side: first, moves: 0 },
      { key: key('done'), kind: 'done', set, atMs: step.amount * 1000, pose: 0, moves: 0 },
    ];
  }
  const timeline = stepTimeline(step, ex);
  const rows: PlanRow[] = [
    { key: key('ready'), kind: 'ready', set, atMs: 0, pose: 0, side: first, moves: 0 },
    { key: key('go'), kind: 'go', set, atMs: LEAD_IN_MS, pose: 1, side: first, moves: 0 },
  ];
  for (const e of timeline) {
    if (e.kind === 'switch') {
      rows.push({
        key: key(`sw${e.index}`),
        kind: 'switch',
        set,
        atMs: e.atMs,
        pose: 1,
        side: ex.sides ? sideSpec(ex.sides, e.side ?? 2) : undefined,
        moves: e.index,
      });
    } else if (e.kind === 'done') {
      rows.push({ key: key('done'), kind: 'done', set, atMs: e.atMs, pose: 0, moves: e.index });
    }
  }
  return rows;
}

/** Every set of an exercise with the rests between them. `restBefore`: the rest that leads into the first set (from
 *  the exercise before), or null for the first exercise of the session. */
export function exercisePlan(step: SessionStep, ex: Exercise, restBefore: number | null): PlanRow[] {
  const rows: PlanRow[] = [];
  for (let set = 0; set < step.sets; set++) {
    const rest = set === 0 ? restBefore : step.restSec;
    if (rest !== null && rest > 0) rows.push({ key: `${set}-rest`, kind: 'rest', set, atMs: 0, pose: 0, restSec: rest, moves: 0 });
    rows.push(...setRows(step, ex, set));
  }
  return rows;
}

export interface PlanPosition {
  phase: SessionPhase;
  /** The set in progress, or (while resting) the set the rest leads into. */
  set: number;
  /** Time into the running set when a clock drives it (auto count, hold timer); null when counting by hand. */
  elapsedMs: number | null;
  /** Moves done in the set when counting by hand (both sides counted). */
  moves: number;
}

/** Index of the row the user is at, or -1. */
export function activeRow(rows: PlanRow[], pos: PlanPosition): number {
  if (pos.phase === 'done') return -1;
  if (pos.phase === 'rest') return rows.findIndex((r) => r.kind === 'rest' && r.set === pos.set);
  let found = -1;
  rows.forEach((r, i) => {
    if (r.set !== pos.set || r.kind === 'rest') return;
    if (found === -1) found = i; // the set's first row until something later applies
    if (pos.elapsedMs !== null) {
      if (r.atMs <= Math.max(0, pos.elapsedMs)) found = i;
    } else if (pos.moves > 0 && r.kind !== 'ready' && r.kind !== 'done' && r.moves <= pos.moves) {
      found = i;
    }
  });
  return found;
}

/** "00:12" for a row time. */
export function formatRowTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
