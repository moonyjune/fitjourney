import type { Exercise } from './exercises';
import type { SessionStep } from './session';

// Pure scheduling for the voice-guided session: when each rep / hold second / rest second is announced.
// No timers here — the screen owns the clock and asks "what became due between these two moments?", which keeps this
// unit-testable and keeps time the single source of truth for when a set is finished.

/** Quiet moment after "start" before the first rep is counted, so the user can get into position. */
export const LEAD_IN_MS = 2000;
/** Time given to change sides in a one-sided exercise before the second half starts counting. */
export const SWITCH_PAUSE_MS = 3000;
/** The last seconds of a rest period that are counted out loud. */
export const REST_COUNTDOWN_FROM = 3;

export interface RepEvent {
  /** Milliseconds after the start of the set (including lead-in) at which this event is due. */
  atMs: number;
  kind: 'rep' | 'switch' | 'done';
  /** 1-based rep number across the whole set (both sides for one-sided exercises). */
  index: number;
  /** The number to say and show: restarts at 1 on the second side. 0 for `switch`. */
  spoken: number;
}

/** Every event of one rep-based set. A rep counts as done after `repSec` seconds of work.
 *  One-sided exercises (`perSide`) do `amount` reps on each side, with a pause and a "switch" call in between. */
export function repTimeline(amount: number, perSide: boolean, repSec: number): RepEvent[] {
  const total = perSide ? amount * 2 : amount;
  const events: RepEvent[] = [];
  for (let i = 1; i <= total; i++) {
    const secondSide = perSide && i > amount;
    const atMs = LEAD_IN_MS + i * repSec * 1000 + (secondSide ? SWITCH_PAUSE_MS : 0);
    const spoken = secondSide ? i - amount : i;
    events.push({ atMs, kind: 'rep', index: i, spoken });
    if (perSide && i === amount) events.push({ atMs, kind: 'switch', index: i, spoken: 0 });
  }
  const last = events[events.length - 1];
  if (last) events.push({ atMs: last.atMs, kind: 'done', index: last.index, spoken: last.spoken });
  return events;
}

/** Events with `fromMs < atMs <= toMs`, in order. Calling it with consecutive windows never repeats or skips one. */
export function dueEvents(timeline: RepEvent[], fromMs: number, toMs: number): RepEvent[] {
  return timeline.filter((e) => e.atMs > fromMs && e.atMs <= toMs);
}

/** Where on the timeline to resume so counting carries on after `repsDone` reps (0 = from the very start, lead-in
 *  included). Used when the user stops the auto count, adjusts by hand, and starts it again. */
export function resumeOffsetMs(timeline: RepEvent[], repsDone: number): number {
  if (repsDone <= 0) return 0;
  const rep = timeline.find((e) => e.kind === 'rep' && e.index === repsDone);
  return rep ? rep.atMs : 0;
}

/** Whether to call out the remaining seconds of a hold: every 10 s, and each of the last 5. Never at the very start
 *  (the start is announced separately) and never at 0 (the set simply ends). */
export function shouldCallHold(secondsLeft: number, totalSeconds: number): boolean {
  if (secondsLeft < 1 || secondsLeft >= totalSeconds) return false;
  return secondsLeft <= 5 || secondsLeft % 10 === 0;
}

/** Whether to call out a rest second: the last three. */
export function shouldCallRest(secondsLeft: number, restSec: number): boolean {
  return secondsLeft >= 1 && secondsLeft <= REST_COUNTDOWN_FROM && secondsLeft < restSec;
}

/** The voice always speaks English, whatever language the app is set to: only the on-screen text follows the setting.
 *  These phrases are therefore not part of the vi/en UI strings. */
export const SPEECH = {
  setsReps: '{sets} sets of {n} reps.',
  setsRepsSide: '{sets} sets of {n} reps on each side.',
  setsSeconds: '{sets} sets, hold for {n} seconds.',
  bothSides: 'Do both sides in every set.',
  pressStart: 'Press start when you are ready.',
  nextSet: 'Set {s} of {t}.',
  ready: 'Get ready.',
  go: 'Go!',
  switchSides: 'Switch sides.',
  rest: 'Rest for {n} seconds. Next up: {name}, {rx}',
  restOnly: 'Rest for {n} seconds.',
  allDone: 'Workout complete. Great job!',
} as const;

function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

/** "3 sets of 8 reps" in words, so the voice reads a sentence instead of "3 × 8". */
export function spokenAmount(step: Pick<SessionStep, 'sets' | 'amount' | 'unit' | 'perSide'>): string {
  const params = { sets: step.sets, n: step.amount };
  if (step.unit === 'seconds') return fill(SPEECH.setsSeconds, params);
  return fill(step.perSide ? SPEECH.setsRepsSide : SPEECH.setsReps, params);
}

/** What is said, in order, when a set is about to start. The first set of an exercise gets the full briefing (name,
 *  amount, the steps, the one-sided hint); later sets only say which set it is. */
export function workScript(step: SessionStep, ex: Exercise, setIndex: number): string[] {
  if (setIndex > 0) return [fill(SPEECH.nextSet, { s: setIndex + 1, t: step.sets })];
  const lines = [ex.nameEn, spokenAmount(step), ...ex.steps.map((x) => x.en)];
  if (step.perSide) lines.push(SPEECH.bothSides);
  lines.push(SPEECH.pressStart);
  return lines;
}

/** Said when a rest period begins: how long, and what is coming next. */
export function restScript(restSec: number, next: SessionStep | undefined, ex: Exercise | undefined): string {
  if (!next || !ex) return fill(SPEECH.restOnly, { n: restSec });
  return fill(SPEECH.rest, { n: restSec, name: ex.nameEn, rx: spokenAmount(next) });
}
