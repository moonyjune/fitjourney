import { EXERCISE_BY_ID, prescriptionFor, type ExerciseId, type Level, type Unit } from './exercises';

/** The user's own numbers for an exercise, replacing the level's defaults while it stays at that level. */
export interface StepCustom {
  level: Level;
  sets?: number;
  amount?: number;
  restSec?: number;
}
export type CustomMap = Partial<Record<ExerciseId, StepCustom>>;

export type Tunable = 'sets' | 'amount' | 'restSec';

/** Bounds and step of each adjustable number. */
export function tuneRange(key: Tunable, unit: Unit): { min: number; max: number; step: number } {
  if (key === 'sets') return { min: 1, max: 10, step: 1 };
  if (key === 'restSec') return { min: 0, max: 300, step: 5 };
  return unit === 'seconds' ? { min: 5, max: 600, step: 5 } : { min: 1, max: 100, step: 1 };
}

export function clampTune(key: Tunable, unit: Unit, value: number): number {
  const { min, max } = tuneRange(key, unit);
  return Math.min(max, Math.max(min, Math.round(value)));
}

export interface SessionStep {
  id: ExerciseId;
  level: Level;
  sets: number;
  amount: number;
  unit: Unit;
  perSide: boolean;
  restSec: number;
}

export type SessionPhase = 'work' | 'rest' | 'done';

export interface SessionState {
  steps: SessionStep[];
  /** Position of the set being done (or just done, while resting the pointer already points at the next one). */
  step: number;
  set: number;
  phase: SessionPhase;
  /** Reps counted in the current set (rep-based exercises only). */
  count: number;
  /** Rest length of the rest phase in progress. */
  restSec: number;
  /** Sets finished per step. */
  setsDone: number[];
  /** What each finished set reached (reps, or seconds held), per step. */
  results: number[][];
}

export function buildSteps(items: { id: ExerciseId; level: Level }[], custom: CustomMap = {}): SessionStep[] {
  return items.map(({ id, level }) => {
    const p = prescriptionFor(id, level);
    const c = custom[id]?.level === level ? custom[id] : undefined;
    return {
      id,
      level,
      sets: c?.sets ?? p.sets,
      amount: c?.amount ?? p.amount,
      unit: p.unit,
      perSide: !!p.perSide,
      restSec: c?.restSec ?? EXERCISE_BY_ID[id].restSec,
    };
  });
}

export function startSession(steps: SessionStep[]): SessionState {
  return { steps, step: 0, set: 0, phase: steps.length ? 'work' : 'done', count: 0, restSec: 0, setsDone: steps.map(() => 0), results: steps.map(() => []) };
}

export type SessionAction =
  | { type: 'addRep' }
  | { type: 'removeRep' }
  /** Sets the rep counter to an exact value — used by the timed auto count, which owns the clock. */
  | { type: 'setCount'; count: number }
  /** `done`: what the set reached when it is not the rep counter (the seconds of a hold). */
  | { type: 'finishSet'; done?: number }
  | { type: 'skipRest' }
  /** Changes the current exercise's sets / amount per set / rest for the sets still to come. */
  | { type: 'adjust'; patch: Partial<Pick<SessionStep, Tunable>> }
  /** Lengthens or shortens the rest in progress. */
  | { type: 'adjustRest'; restSec: number };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'addRep':
      return state.phase === 'work' ? { ...state, count: state.count + 1 } : state;
    case 'removeRep':
      return state.phase === 'work' ? { ...state, count: Math.max(0, state.count - 1) } : state;
    case 'setCount':
      return state.phase === 'work' ? { ...state, count: Math.max(0, Math.round(action.count)) } : state;
    case 'finishSet': {
      if (state.phase !== 'work') return state;
      const current = state.steps[state.step];
      const setsDone = state.setsDone.map((n, i) => (i === state.step ? n + 1 : n));
      const results = state.results.map((r, i) => (i === state.step ? [...r, Math.max(0, Math.round(action.done ?? state.count))] : r));
      const lastSet = state.set + 1 >= current.sets;
      const lastStep = state.step + 1 >= state.steps.length;
      if (lastSet && lastStep) return { ...state, setsDone, results, phase: 'done', count: 0 };
      return {
        ...state,
        setsDone,
        results,
        phase: 'rest',
        restSec: current.restSec,
        step: lastSet ? state.step + 1 : state.step,
        set: lastSet ? 0 : state.set + 1,
        count: 0,
      };
    }
    case 'skipRest':
      return state.phase === 'rest' ? { ...state, phase: 'work', restSec: 0 } : state;
    case 'adjust': {
      if (state.phase === 'done') return state;
      const current = state.steps[state.step];
      const next = { ...current };
      for (const key of Object.keys(action.patch) as Tunable[]) {
        const v = action.patch[key];
        if (v !== undefined) next[key] = clampTune(key, current.unit, v);
      }
      // Never fewer sets than the one in progress (or about to start).
      next.sets = Math.max(next.sets, state.set + 1);
      return { ...state, steps: state.steps.map((s, i) => (i === state.step ? next : s)) };
    }
    case 'adjustRest':
      return state.phase === 'rest' ? { ...state, restSec: clampTune('restSec', 'reps', action.restSec) } : state;
    default:
      return state;
  }
}

export function totalSets(steps: SessionStep[]): number {
  return steps.reduce((s, x) => s + x.sets, 0);
}

export function totalSetsDone(state: SessionState): number {
  return state.setsDone.reduce((s, n) => s + n, 0);
}

/** 0..1 across the whole session, for the segmented progress bar. */
export function sessionProgress(state: SessionState): number {
  const total = totalSets(state.steps);
  return total === 0 ? 1 : totalSetsDone(state) / total;
}
