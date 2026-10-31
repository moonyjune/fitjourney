import type { Exercise, Side, SidePlan, SideSpec } from './exercises';
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

export type SidePattern = SidePlan['pattern'];

export interface RepEvent {
  /** Milliseconds after the start of the set (including lead-in) at which this event is due. */
  atMs: number;
  kind: 'rep' | 'switch' | 'done';
  /** 1-based move number across the whole set (every move on either side counts). */
  index: number;
  /** The number to say and show: restarts at 1 on the second side (`block`), counts pairs (`alternate`). 0 for
   *  `switch`. */
  spoken: number;
  /** `switch`: the side the next moves are done on (1 = the first side, 2 = the other). */
  side?: 1 | 2;
}

/** Every event of one rep-based set. A move counts as done after `repSec` seconds of work.
 *  One-sided exercises (`perSide`) do `amount` reps on each side:
 *  - `block`: all reps on the first side, a "switch" call and a pause, then all reps on the other side;
 *  - `alternate`: one move per side in turn, a "switch" call after every move; a rep (the number said) is a pair. */
export function repTimeline(amount: number, perSide: boolean, repSec: number, pattern: SidePattern = 'block'): RepEvent[] {
  const total = perSide ? amount * 2 : amount;
  const events: RepEvent[] = [];
  for (let i = 1; i <= total; i++) {
    if (perSide && pattern === 'alternate') {
      const atMs = LEAD_IN_MS + i * repSec * 1000;
      if (i % 2 === 0) events.push({ atMs, kind: 'rep', index: i, spoken: i / 2 });
      if (i < total) events.push({ atMs, kind: 'switch', index: i, spoken: 0, side: i % 2 === 1 ? 2 : 1 });
      continue;
    }
    const secondSide = perSide && i > amount;
    const atMs = LEAD_IN_MS + i * repSec * 1000 + (secondSide ? SWITCH_PAUSE_MS : 0);
    const spoken = secondSide ? i - amount : i;
    events.push({ atMs, kind: 'rep', index: i, spoken });
    if (perSide && i === amount) events.push({ atMs, kind: 'switch', index: i, spoken: 0, side: 2 });
  }
  const last = events[events.length - 1];
  if (last) events.push({ atMs: last.atMs, kind: 'done', index: last.index, spoken: last.kind === 'rep' ? last.spoken : amount });
  return events;
}

/** The rep timeline of a session step, with the exercise's side pattern. */
export function stepTimeline(step: Pick<SessionStep, 'amount' | 'perSide'>, ex: Exercise): RepEvent[] {
  return repTimeline(step.amount, step.perSide, ex.repSec, ex.sides?.pattern ?? 'block');
}

/** Where on the timeline to resume after `movesDone` moves, as `movesDone` of the set's moves (both sides). */
export function movesDone(step: Pick<SessionStep, 'amount' | 'perSide'>, ex: Exercise, count: number, onSecondSide: boolean): number {
  if (!step.perSide) return count;
  if ((ex.sides?.pattern ?? 'block') === 'alternate') return count * 2;
  return onSecondSide ? step.amount + count : count;
}

/** Events with `fromMs < atMs <= toMs`, in order. Calling it with consecutive windows never repeats or skips one. */
export function dueEvents(timeline: RepEvent[], fromMs: number, toMs: number): RepEvent[] {
  return timeline.filter((e) => e.atMs > fromMs && e.atMs <= toMs);
}

/** Where on the timeline to resume so counting carries on after `repsDone` reps (0 = from the very start, lead-in
 *  included). Used when the user stops the auto count, adjusts by hand, and starts it again. */
export function resumeOffsetMs(timeline: RepEvent[], repsDone: number): number {
  if (repsDone <= 0) return 0;
  const rep = timeline.find((e) => (e.kind === 'rep' || e.kind === 'switch') && e.index === repsDone);
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

/** The language the voice speaks, chosen in the session (not the app language): only the on-screen text follows the
 *  app setting. These phrases are therefore not part of the vi/en UI strings. */
export type SpeechLang = 'vi' | 'en';

export const SPEECH_TEXT = {
  en: {
    setsReps: '{sets} sets of {n} reps.',
    setsRepsSide: '{sets} sets of {n} reps on each side.',
    setsSeconds: '{sets} sets, hold for {n} seconds.',
    blockSides: 'Start with the {first}, then switch to the {second}.',
    alternateSides: 'Alternate sides: {first}, then {second}. One rep is both sides.',
    firstSide: '{side} first.',
    pressStart: 'Press start when you are ready.',
    nextSet: 'Set {s} of {t}.',
    ready: 'Get ready.',
    go: 'Go!',
    switchSides: 'Switch sides.',
    switchTo: 'Switch sides: {side}.',
    rest: 'Rest for {n} seconds. Next up: {name}, {rx}',
    restOnly: 'Rest for {n} seconds.',
    allDone: 'Workout complete. Great job!',
    sample: 'Hello! I will guide your workout.',
  },
  vi: {
    setsReps: '{sets} hiệp, mỗi hiệp {n} lần.',
    setsRepsSide: '{sets} hiệp, mỗi bên {n} lần.',
    setsSeconds: '{sets} hiệp, mỗi hiệp giữ {n} giây.',
    blockSides: 'Bắt đầu với {first}, rồi đổi sang {second}.',
    alternateSides: 'Đổi bên xen kẽ: {first}, rồi {second}. Mỗi lượt hai bên tính một lần.',
    firstSide: '{side} trước.',
    pressStart: 'Bấm bắt đầu khi bạn sẵn sàng.',
    nextSet: 'Hiệp {s} trên {t}.',
    ready: 'Chuẩn bị.',
    go: 'Bắt đầu!',
    switchSides: 'Đổi bên.',
    switchTo: 'Đổi bên: {side}.',
    rest: 'Nghỉ {n} giây. Tiếp theo: {name}, {rx}',
    restOnly: 'Nghỉ {n} giây.',
    allDone: 'Hoàn thành buổi tập. Làm tốt lắm!',
    sample: 'Xin chào! Mình sẽ hướng dẫn bạn tập.',
  },
} as const satisfies Record<SpeechLang, Record<string, string>>;

/** The English phrases (the default voice language). */
export const SPEECH = SPEECH_TEXT.en;

function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

const SIDE_WORD: Record<SpeechLang, Record<Side, string>> = { en: { L: 'left', R: 'right' }, vi: { L: 'trái', R: 'phải' } };

/** The other side of a side spec: right arm + left leg <-> left arm + right leg. */
export function mirrorSide(spec: SideSpec): SideSpec {
  const flip = (s?: Side): Side | undefined => (s ? (s === 'L' ? 'R' : 'L') : undefined);
  return { ...(spec.arm ? { arm: flip(spec.arm) } : {}), ...(spec.leg ? { leg: flip(spec.leg) } : {}) };
}

/** The side spec of side 1 (the plan's first side) or side 2. */
export function sideSpec(plan: SidePlan, side: 1 | 2): SideSpec {
  return side === 1 ? plan.first : mirrorSide(plan.first);
}

/** "right arm and left leg" / "tay phải và chân trái", lower case. */
export function sideWords(spec: SideSpec, lang: SpeechLang = 'en'): string {
  const w = SIDE_WORD[lang];
  const parts: string[] = [];
  if (spec.arm) parts.push(lang === 'vi' ? `tay ${w[spec.arm]}` : `${w[spec.arm]} arm`);
  if (spec.leg) parts.push(lang === 'vi' ? `chân ${w[spec.leg]}` : `${w[spec.leg]} leg`);
  return parts.join(lang === 'vi' ? ' và ' : ' and ');
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Said at "get ready" of a one-sided set: which side goes first. Empty for two-sided exercises. */
export function firstSideLine(step: Pick<SessionStep, 'perSide'>, ex: Exercise, lang: SpeechLang = 'en'): string {
  if (!step.perSide || !ex.sides) return '';
  return fill(SPEECH_TEXT[lang].firstSide, { side: cap(sideWords(ex.sides.first, lang)) });
}

/** Said when the side changes during a set: "Switch sides: left leg." (block) or just "Left arm and right leg."
 *  (alternate, said after every move). */
export function switchLine(ex: Exercise, side: 1 | 2, lang: SpeechLang = 'en'): string {
  if (!ex.sides) return SPEECH_TEXT[lang].switchSides;
  const words = sideWords(sideSpec(ex.sides, side), lang);
  return ex.sides.pattern === 'alternate' ? `${cap(words)}.` : fill(SPEECH_TEXT[lang].switchTo, { side: words });
}

/** How the sides go, for the briefing of a one-sided exercise. */
function sidesLine(ex: Exercise, lang: SpeechLang): string {
  const t = SPEECH_TEXT[lang];
  if (!ex.sides) return '';
  const params = { first: sideWords(ex.sides.first, lang), second: sideWords(mirrorSide(ex.sides.first), lang) };
  return fill(ex.sides.pattern === 'alternate' ? t.alternateSides : t.blockSides, params);
}

/** "3 sets of 8 reps" in words, so the voice reads a sentence instead of "3 × 8". */
export function spokenAmount(step: Pick<SessionStep, 'sets' | 'amount' | 'unit' | 'perSide'>, lang: SpeechLang = 'en'): string {
  const t = SPEECH_TEXT[lang];
  const params = { sets: step.sets, n: step.amount };
  if (step.unit === 'seconds') return fill(t.setsSeconds, params);
  return fill(step.perSide ? t.setsRepsSide : t.setsReps, params);
}

/** What is said, in order, when a set is about to start. The first set of an exercise gets the full briefing (name,
 *  amount, the steps, the one-sided hint); later sets only say which set it is. */
export function workScript(step: SessionStep, ex: Exercise, setIndex: number, lang: SpeechLang = 'en'): string[] {
  const t = SPEECH_TEXT[lang];
  if (setIndex > 0) return [fill(t.nextSet, { s: setIndex + 1, t: step.sets })];
  const lines = [lang === 'vi' ? ex.nameVi : ex.nameEn, spokenAmount(step, lang), ...ex.steps.map((x) => x[lang])];
  if (step.perSide && ex.sides) lines.push(sidesLine(ex, lang));
  lines.push(t.pressStart);
  return lines;
}

/** What is said when a set starts by itself after a rest ("auto start"): the steps were already read during the rest,
 *  so a new exercise only gets its name, amount and side order, and a later set only its number. */
export function introScript(step: SessionStep, ex: Exercise, setIndex: number, lang: SpeechLang = 'en'): string[] {
  const t = SPEECH_TEXT[lang];
  if (setIndex > 0) return [fill(t.nextSet, { s: setIndex + 1, t: step.sets })];
  const lines = [lang === 'vi' ? ex.nameVi : ex.nameEn, spokenAmount(step, lang)];
  if (step.perSide && ex.sides) lines.push(sidesLine(ex, lang));
  return lines;
}

/** Said when a rest period begins: how long, and what is coming next. */
export function restScript(
  restSec: number,
  next: SessionStep | undefined,
  ex: Exercise | undefined,
  lang: SpeechLang = 'en',
  /** Also read the next exercise's steps (auto start: the set will not wait for a briefing). */
  withSteps = false
): string {
  const t = SPEECH_TEXT[lang];
  if (!next || !ex) return fill(t.restOnly, { n: restSec });
  const head = fill(t.rest, { n: restSec, name: lang === 'vi' ? ex.nameVi : ex.nameEn, rx: spokenAmount(next, lang) });
  return withSteps ? [head, ...ex.steps.map((x) => x[lang])].join(' ') : head;
}
